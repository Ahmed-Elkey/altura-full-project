import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryReason, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { SetInventoryDto } from './dto/set-inventory.dto';

const inventoryInclude = {
  variant: {
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.InventoryInclude;

type InventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListInventoryQueryDto) {
    const q = query.q?.trim();
    const rows = await this.prisma.inventory.findMany({
      where: q
        ? {
            OR: [
              { variant: { sku: { contains: q, mode: 'insensitive' } } },
              { variant: { colorName: { contains: q, mode: 'insensitive' } } },
              { variant: { size: { contains: q, mode: 'insensitive' } } },
              { variant: { product: { name: { contains: q, mode: 'insensitive' } } } },
              { variant: { product: { slug: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : undefined,
      include: inventoryInclude,
      orderBy: [
        { variant: { product: { position: 'asc' } } },
        { variant: { position: 'asc' } },
      ],
    });

    const mapped = rows.map((row) => this.response(row));
    const filtered =
      query.lowStock === undefined
        ? mapped
        : mapped.filter((row) => row.lowStock === query.lowStock);
    const total = filtered.length;
    const start = (query.page - 1) * query.limit;

    return {
      items: filtered.slice(start, start + query.limit),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async get(variantId: string) {
    const inventory = await this.findByVariant(variantId);
    return this.response(inventory);
  }

  async set(variantId: string, dto: SetInventoryDto) {
    let result: InventoryRecord;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.inventory.findUnique({ where: { variantId } });
      if (!current) throw new NotFoundException('Inventory record not found');
      if (dto.quantity < current.reservedQuantity) {
        throw new ConflictException(
          `Quantity cannot be lower than reserved stock (${current.reservedQuantity})`,
        );
      }

      const delta = dto.quantity - current.quantity;
      const claimed = await tx.inventory.updateMany({
        where: {
          variantId,
          quantity: current.quantity,
          reservedQuantity: current.reservedQuantity,
          updatedAt: current.updatedAt,
        },
        data: {
          quantity: dto.quantity,
          ...(dto.lowStockThreshold !== undefined
            ? { lowStockThreshold: dto.lowStockThreshold }
            : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Inventory changed; reload the SKU and try again');
      }
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            variantId,
            reason: InventoryReason.MANUAL_ADJUSTMENT,
            quantity: delta,
            note: dto.note ?? 'Absolute inventory quantity set by admin',
          },
        });
      }
      return tx.inventory.findUniqueOrThrow({ where: { variantId }, include: inventoryInclude });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Inventory changed; reload the SKU and try again');
      }
      throw error;
    }

    return this.response(result);
  }

  async adjust(variantId: string, dto: AdjustInventoryDto) {
    let result: InventoryRecord;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.inventory.findUnique({ where: { variantId } });
      if (!current) throw new NotFoundException('Inventory record not found');

      const nextQuantity = current.quantity + dto.delta;
      if (nextQuantity < 0) {
        throw new BadRequestException('Inventory quantity cannot become negative');
      }
      if (nextQuantity < current.reservedQuantity) {
        throw new ConflictException(
          `Adjustment would put physical stock below reserved stock (${current.reservedQuantity})`,
        );
      }

      const claimed = await tx.inventory.updateMany({
        where: {
          variantId,
          quantity: current.quantity,
          reservedQuantity: current.reservedQuantity,
          updatedAt: current.updatedAt,
        },
        data: { quantity: nextQuantity },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Inventory changed; reload the SKU and try again');
      }
      await tx.inventoryMovement.create({
        data: {
          variantId,
          reason: dto.reason,
          quantity: dto.delta,
          referenceId: dto.referenceId,
          note: dto.note,
        },
      });
      return tx.inventory.findUniqueOrThrow({ where: { variantId }, include: inventoryInclude });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Inventory changed; reload the SKU and try again');
      }
      throw error;
    }

    return this.response(result);
  }

  async movements(variantId: string) {
    await this.findByVariant(variantId);
    return this.prisma.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Atomically reserves sellable inventory. Designed for Cart/Checkout phases.
   * This uses a database-side predicate to prevent overselling under concurrency.
   */
  async reserve(variantId: string, quantity: number): Promise<void> {
    this.assertPositiveQuantity(quantity);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQuantity" = "reservedQuantity" + ${quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${variantId}
          AND ("quantity" - "reservedQuantity") >= ${quantity}
      `;
      if (changed !== 1) {
        const exists = await tx.inventory.findUnique({ where: { variantId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Inventory record not found');
        throw new ConflictException('Insufficient available inventory');
      }
    });
  }

  async releaseReservation(variantId: string, quantity: number): Promise<void> {
    this.assertPositiveQuantity(quantity);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQuantity" = "reservedQuantity" - ${quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${variantId}
          AND "reservedQuantity" >= ${quantity}
      `;
      if (changed !== 1) {
        throw new ConflictException('Reservation release exceeds reserved inventory');
      }
    });
  }

  /** Converts an existing reservation into a physical sale. */
  async commitReservation(
    variantId: string,
    quantity: number,
    referenceId?: string,
  ): Promise<void> {
    this.assertPositiveQuantity(quantity);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "quantity" = "quantity" - ${quantity},
            "reservedQuantity" = "reservedQuantity" - ${quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${variantId}
          AND "reservedQuantity" >= ${quantity}
          AND "quantity" >= ${quantity}
      `;
      if (changed !== 1) {
        throw new ConflictException('Reserved inventory could not be committed');
      }
      await tx.inventoryMovement.create({
        data: {
          variantId,
          reason: InventoryReason.PURCHASE,
          quantity: -quantity,
          referenceId,
          note: 'Reserved inventory committed to purchase',
        },
      });
    });
  }

  private async findByVariant(variantId: string): Promise<InventoryRecord> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { variantId },
      include: inventoryInclude,
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');
    return inventory;
  }

  private response(row: InventoryRecord) {
    const availableQuantity = Math.max(0, row.quantity - row.reservedQuantity);
    return {
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      colorName: row.variant.colorName,
      size: row.variant.size,
      variantActive: row.variant.active,
      product: row.variant.product,
      quantity: row.quantity,
      reservedQuantity: row.reservedQuantity,
      availableQuantity,
      lowStockThreshold: row.lowStockThreshold,
      lowStock: availableQuantity <= row.lowStockThreshold,
      updatedAt: row.updatedAt,
    };
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
  }
}
