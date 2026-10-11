import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  private withOwnerLock<T>(userId: string, task: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      // Serialize defaults for this account across create/update/delete requests.
      const owner = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!owner.length) throw new NotFoundException('User not found');
      return task(tx);
    });
  }

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [
        { isDefaultShipping: 'desc' },
        { isDefaultBilling: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async get(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.withOwnerLock(userId, async (tx) => {
      const [addressCount, shippingDefaultCount, billingDefaultCount] = await Promise.all([
        tx.address.count({ where: { userId } }),
        tx.address.count({ where: { userId, isDefaultShipping: true } }),
        tx.address.count({ where: { userId, isDefaultBilling: true } }),
      ]);

      const isFirstAddress = addressCount === 0;
      const makeShippingDefault =
        dto.isDefaultShipping === true || (dto.isDefaultShipping !== false && shippingDefaultCount === 0);
      const makeBillingDefault =
        dto.isDefaultBilling === true || (dto.isDefaultBilling !== false && billingDefaultCount === 0);

      if (makeShippingDefault) {
        await tx.address.updateMany({
          where: { userId, isDefaultShipping: true },
          data: { isDefaultShipping: false },
        });
      }

      if (makeBillingDefault) {
        await tx.address.updateMany({
          where: { userId, isDefaultBilling: true },
          data: { isDefaultBilling: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: dto.label,
          recipientName: dto.recipientName,
          phone: dto.phone,
          line1: dto.line1,
          line2: dto.line2,
          city: dto.city,
          region: dto.region,
          postalCode: dto.postalCode,
          countryCode: dto.countryCode.toUpperCase(),
          isDefaultShipping: isFirstAddress || makeShippingDefault,
          isDefaultBilling: isFirstAddress || makeBillingDefault,
        },
      });
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    return this.withOwnerLock(userId, async (tx) => {
      const existing = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw new NotFoundException('Address not found');
      if (dto.isDefaultShipping === true) {
        await tx.address.updateMany({
          where: { userId, id: { not: addressId }, isDefaultShipping: true },
          data: { isDefaultShipping: false },
        });
      }

      if (dto.isDefaultBilling === true) {
        await tx.address.updateMany({
          where: { userId, id: { not: addressId }, isDefaultBilling: true },
          data: { isDefaultBilling: false },
        });
      }

      const updated = await tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label || null } : {}),
          ...(dto.recipientName !== undefined ? { recipientName: dto.recipientName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          ...(dto.line1 !== undefined ? { line1: dto.line1 } : {}),
          ...(dto.line2 !== undefined ? { line2: dto.line2 || null } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.region !== undefined ? { region: dto.region || null } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode || null } : {}),
          ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode.toUpperCase() } : {}),
          ...(dto.isDefaultShipping !== undefined
            ? { isDefaultShipping: dto.isDefaultShipping }
            : {}),
          ...(dto.isDefaultBilling !== undefined
            ? { isDefaultBilling: dto.isDefaultBilling }
            : {}),
        },
      });

      if (existing.isDefaultShipping && dto.isDefaultShipping === false) {
        await this.ensureDefaultAfterUnset(tx, userId, addressId, 'shipping');
      }

      if (existing.isDefaultBilling && dto.isDefaultBilling === false) {
        await this.ensureDefaultAfterUnset(tx, userId, addressId, 'billing');
      }

      return updated;
    });
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.withOwnerLock(userId, async (tx) => {
      const existing = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!existing) throw new NotFoundException('Address not found');
      await tx.address.delete({ where: { id: addressId } });

      if (existing.isDefaultShipping) {
        await this.ensureDefaultAfterUnset(tx, userId, addressId, 'shipping');
      }
      if (existing.isDefaultBilling) {
        await this.ensureDefaultAfterUnset(tx, userId, addressId, 'billing');
      }
    });
  }

  private async ensureDefaultAfterUnset(
    tx: Prisma.TransactionClient,
    userId: string,
    excludedAddressId: string,
    type: 'shipping' | 'billing',
  ): Promise<void> {
    const hasDefault = await tx.address.count({
      where:
        type === 'shipping'
          ? { userId, isDefaultShipping: true }
          : { userId, isDefaultBilling: true },
    });
    if (hasDefault > 0) {
      return;
    }

    const fallback = await tx.address.findFirst({
      where: { userId, id: { not: excludedAddressId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!fallback) {
      return;
    }

    await tx.address.update({
      where: { id: fallback.id },
      data:
        type === 'shipping'
          ? { isDefaultShipping: true }
          : { isDefaultBilling: true },
    });
  }
}
