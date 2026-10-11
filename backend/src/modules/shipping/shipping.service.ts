import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type DbClient = Pick<Prisma.TransactionClient, 'shippingZone'>;

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCountry(
    countryCode: string,
    subtotal: Prisma.Decimal,
    currency: string,
    db: DbClient = this.prisma,
  ) {
    const normalizedCountry = countryCode.trim().toUpperCase();
    const zone = await db.shippingZone.findFirst({
      where: {
        active: true,
        countries: { has: normalizedCountry },
      },
      include: {
        methods: {
          where: { active: true },
          orderBy: [{ price: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!zone) {
      throw new NotFoundException(`Shipping is not configured for ${normalizedCountry}`);
    }

    const methods = zone.methods
      .filter((method) => method.currency === currency)
      .map((method) => {
        const free = method.freeAbove !== null && subtotal.gte(method.freeAbove);
        const effectivePrice = free ? new Prisma.Decimal(0) : method.price;
        return {
          id: method.id,
          code: method.code,
          name: method.name,
          currency: method.currency,
          basePrice: Number(method.price),
          price: Number(effectivePrice),
          free,
          freeAbove: method.freeAbove === null ? null : Number(method.freeAbove),
          estimatedMinDays: method.estimatedMinDays,
          estimatedMaxDays: method.estimatedMaxDays,
        };
      });

    if (!methods.length) {
      throw new BadRequestException(`No ${currency} shipping methods are configured for ${normalizedCountry}`);
    }

    return {
      zone: { id: zone.id, name: zone.name, countryCode: normalizedCountry },
      methods,
    };
  }

  async resolveMethod(
    methodId: string,
    countryCode: string,
    subtotal: Prisma.Decimal,
    currency: string,
    db: DbClient = this.prisma,
  ) {
    const options = await this.listForCountry(countryCode, subtotal, currency, db);
    const method = options.methods.find((candidate) => candidate.id === methodId);
    if (!method) {
      throw new BadRequestException('Selected shipping method is not available for this address');
    }
    return { zone: options.zone, method };
  }
}
