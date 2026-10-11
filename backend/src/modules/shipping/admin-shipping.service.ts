import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateShippingMethodDto,
  CreateShippingZoneDto,
  UpdateShippingMethodDto,
  UpdateShippingZoneDto,
} from "./dto/admin-shipping.dto";

@Injectable()
export class AdminShippingService {
  constructor(private readonly prisma: PrismaService) {}
  private async change<T extends { id: string }>(
    actorUserId: string,
    action: string,
    entityType: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const result = await operation(tx);
            await tx.auditLog.create({
              data: { actorUserId, action, entityType, entityId: result.id },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2034" && attempt < 2) continue;
          if (error.code === "P2034")
            throw new ConflictException(
              "Shipping configuration changed concurrently. Please retry.",
            );
          if (error.code === "P2002")
            throw new ConflictException(
              "Shipping code already exists in this zone",
            );
        }
        throw error;
      }
    }
  }
  private async checkCountries(
    tx: Prisma.TransactionClient,
    countries: string[],
    id?: string,
  ) {
    const overlap = await tx.shippingZone.findFirst({
      where: {
        active: true,
        countries: { hasSome: countries },
        ...(id ? { id: { not: id } } : {}),
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException(
        "A country is already assigned to another active shipping zone",
      );
  }
  createZone(actor: string, dto: CreateShippingZoneDto) {
    return this.change(
      actor,
      "shipping.zone.create",
      "ShippingZone",
      async (tx) => {
        if (dto.active !== false) await this.checkCountries(tx, dto.countries);
        return tx.shippingZone.create({ data: dto });
      },
    );
  }
  updateZone(actor: string, id: string, dto: UpdateShippingZoneDto) {
    return this.change(
      actor,
      "shipping.zone.update",
      "ShippingZone",
      async (tx) => {
        const existing = await tx.shippingZone.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Shipping zone not found");
        if (dto.active ?? existing.active)
          await this.checkCountries(
            tx,
            dto.countries ?? existing.countries,
            id,
          );
        return tx.shippingZone.update({ where: { id }, data: dto });
      },
    );
  }
  deactivateZone(actor: string, id: string) {
    return this.change(
      actor,
      "shipping.zone.deactivate",
      "ShippingZone",
      async (tx) => {
        if (!(await tx.shippingZone.findUnique({ where: { id } })))
          throw new NotFoundException("Shipping zone not found");
        return tx.shippingZone.update({
          where: { id },
          data: { active: false },
        });
      },
    );
  }
  private estimates(value: {
    estimatedMinDays?: number | null;
    estimatedMaxDays?: number | null;
  }) {
    if (
      value.estimatedMinDays != null &&
      value.estimatedMaxDays != null &&
      value.estimatedMinDays > value.estimatedMaxDays
    )
      throw new BadRequestException(
        "Minimum delivery days cannot exceed maximum delivery days",
      );
  }
  createMethod(actor: string, dto: CreateShippingMethodDto) {
    this.estimates(dto);
    return this.change(
      actor,
      "shipping.method.create",
      "ShippingMethod",
      async (tx) => {
        if (!(await tx.shippingZone.findUnique({ where: { id: dto.zoneId } })))
          throw new NotFoundException("Shipping zone not found");
        return tx.shippingMethod.create({ data: dto });
      },
    );
  }
  updateMethod(actor: string, id: string, dto: UpdateShippingMethodDto) {
    return this.change(
      actor,
      "shipping.method.update",
      "ShippingMethod",
      async (tx) => {
        const existing = await tx.shippingMethod.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Shipping method not found");
        this.estimates({ ...existing, ...dto });
        if (dto.zoneId && dto.zoneId !== existing.zoneId)
          throw new BadRequestException(
            "Create a new method to change its shipping zone",
          );
        return tx.shippingMethod.update({ where: { id }, data: dto });
      },
    );
  }
  deactivateMethod(actor: string, id: string) {
    return this.change(
      actor,
      "shipping.method.deactivate",
      "ShippingMethod",
      async (tx) => {
        if (!(await tx.shippingMethod.findUnique({ where: { id } })))
          throw new NotFoundException("Shipping method not found");
        return tx.shippingMethod.update({
          where: { id },
          data: { active: false },
        });
      },
    );
  }
}
