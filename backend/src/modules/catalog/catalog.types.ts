import { Prisma } from '@prisma/client';

export const catalogProductInclude = {
  variants: {
    orderBy: [{ position: 'asc' }, { colorName: 'asc' }, { size: 'asc' }],
    include: { inventory: true },
  },
  images: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  },
  categories: {
    include: {
      category: {
        include: { parent: true },
      },
    },
    orderBy: { position: 'asc' },
  },
  collections: {
    include: { collection: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.ProductInclude;

export type CatalogProductRecord = Prisma.ProductGetPayload<{
  include: typeof catalogProductInclude;
}>;

export function money(value: Prisma.Decimal | number | null): number | null {
  if (value === null) return null;
  return Number(value);
}
