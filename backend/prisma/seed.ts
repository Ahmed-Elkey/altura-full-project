import { PrismaClient, ProductStatus, UserRole, UserStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scrypt } from 'node:crypto';

const prisma = new PrismaClient();

interface SeedCategory {
  name: string;
  slug: string;
  parent: string | null;
}

interface SeedCollection {
  name: string;
  slug: string;
  description?: string;
}

interface SeedImage {
  color: string;
  view: string;
  url: string;
  position: number;
  isPrimary: boolean;
}

interface SeedProduct {
  slug: string;
  status: 'ACTIVE' | 'DRAFT';
  name: string;
  price: number;
  category: string;
  subcategory: string;
  tone: string;
  description: string;
  fit: string;
  colors: string[];
  sizes: string[];
  features: string[];
  inStock: boolean;
  position: number;
  featured: boolean;
  currency: string;
  colorHex: Record<string, string | null>;
  images: SeedImage[];
  collections: string[];
}

interface CatalogSeed {
  activeProductCount: number;
  activeColorwayCount: number;
  imageCount: number;
  categories: SeedCategory[];
  collections: SeedCollection[];
  products: SeedProduct[];
}

function readCatalog(): CatalogSeed {
  const file = join(process.cwd(), 'prisma', 'data', 'altura-catalog.json');
  return JSON.parse(readFileSync(file, 'utf8')) as CatalogSeed;
}

function categorySlug(name: string): string {
  const special: Record<string, string> = {
    'T-Shirts & Longsleeves': 't-shirts-longsleeves',
    'Tank Tops': 'tank-tops',
  };
  return special[name] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sku(productSlug: string, color: string, size: string): string {
  const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `ALT-${clean(productSlug)}-${clean(color)}-${clean(size)}`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 16_384;
  const r = 8;
  const p = 1;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

async function seedCategories(catalog: CatalogSeed) {
  const roots = catalog.categories.filter((category) => !category.parent);
  const children = catalog.categories.filter((category) => category.parent);

  for (const [index, category] of roots.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { name: category.name, slug: category.slug, position: index },
      update: { name: category.name, position: index, parentId: null },
    });
  }

  for (const [index, category] of children.entries()) {
    const parent = await prisma.category.findUniqueOrThrow({ where: { slug: category.parent! } });
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        slug: category.slug,
        parentId: parent.id,
        position: index,
      },
      update: {
        name: category.name,
        parentId: parent.id,
        position: index,
      },
    });
  }
}

async function seedCollections(catalog: CatalogSeed) {
  for (const [index, collection] of catalog.collections.entries()) {
    await prisma.collection.upsert({
      where: { slug: collection.slug },
      create: {
        name: collection.name,
        slug: collection.slug,
        description: collection.description,
        status: ProductStatus.ACTIVE,
        position: index,
        publishedAt: new Date(),
      },
      update: {
        name: collection.name,
        description: collection.description,
        status: ProductStatus.ACTIVE,
        position: index,
      },
    });
  }
}

async function seedProducts(catalog: CatalogSeed) {
  for (const seed of catalog.products) {
    const status = seed.status === 'ACTIVE' ? ProductStatus.ACTIVE : ProductStatus.DRAFT;
    const currency = (process.env.DEFAULT_CURRENCY ?? seed.currency ?? 'EGP').trim().toUpperCase();
    const product = await prisma.product.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        basePrice: seed.price,
        currency,
        status,
        fit: seed.fit,
        details: { features: seed.features, tone: seed.tone },
        position: seed.position,
        featured: seed.featured,
        publishedAt: status === ProductStatus.ACTIVE ? new Date() : null,
        seoTitle: `${seed.name} | ALTURA`,
        seoDescription: seed.description,
      },
      update: {
        name: seed.name,
        description: seed.description,
        basePrice: seed.price,
        currency,
        status,
        fit: seed.fit,
        details: { features: seed.features, tone: seed.tone },
        position: seed.position,
        featured: seed.featured,
        publishedAt: status === ProductStatus.ACTIVE ? new Date() : null,
        seoTitle: `${seed.name} | ALTURA`,
        seoDescription: seed.description,
      },
    });

    const desiredCategorySlugs = [categorySlug(seed.category), categorySlug(seed.subcategory)];
    const categories = await prisma.category.findMany({
      where: { slug: { in: desiredCategorySlugs } },
      select: { id: true, slug: true },
    });
    // Re-link atomically so concurrent reads never see the product without categories.
    await prisma.$transaction(async (tx) => {
      await tx.productCategory.deleteMany({ where: { productId: product.id } });
      if (categories.length) {
        await tx.productCategory.createMany({
          data: desiredCategorySlugs
            .map((slug, position) => {
              const category = categories.find((candidate) => candidate.slug === slug);
              return category ? { productId: product.id, categoryId: category.id, position } : null;
            })
            .filter((value): value is { productId: string; categoryId: string; position: number } => Boolean(value)),
        });
      }
    });

    const collections = await prisma.collection.findMany({
      where: { slug: { in: seed.collections } },
      select: { id: true, slug: true },
    });
    // Re-link atomically so concurrent reads never see the product without collections.
    await prisma.$transaction(async (tx) => {
      await tx.productCollection.deleteMany({ where: { productId: product.id } });
      if (collections.length) {
        await tx.productCollection.createMany({
          data: seed.collections
            .map((slug, position) => {
              const collection = collections.find((candidate) => candidate.slug === slug);
              return collection ? { productId: product.id, collectionId: collection.id, position } : null;
            })
            .filter((value): value is { productId: string; collectionId: string; position: number } => Boolean(value)),
        });
      }
    });

    for (const image of seed.images) {
      await prisma.productImage.upsert({
        where: { productId_url: { productId: product.id, url: image.url } },
        create: {
          productId: product.id,
          colorName: image.color,
          url: image.url,
          altText: `${seed.name} — ${image.color} — ${image.view}`,
          view: image.view,
          isPrimary: image.isPrimary,
          position: image.position,
        },
        update: {
          colorName: image.color,
          altText: `${seed.name} — ${image.color} — ${image.view}`,
          view: image.view,
          isPrimary: image.isPrimary,
          position: image.position,
        },
      });
    }

    for (const [colorPosition, color] of seed.colors.entries()) {
      for (const [sizePosition, size] of seed.sizes.entries()) {
        const variantSku = sku(seed.slug, color, size);
        const quantity = seed.inStock ? (status === ProductStatus.ACTIVE ? 12 : 6) : 0;
        const variant = await prisma.productVariant.upsert({
          where: { sku: variantSku },
          create: {
            productId: product.id,
            sku: variantSku,
            title: `${color} / ${size}`,
            colorName: color,
            colorHex: seed.colorHex[color] ?? null,
            size,
            price: seed.price,
            currency,
            position: colorPosition * 100 + sizePosition,
            active: true,
          },
          update: {
            productId: product.id,
            title: `${color} / ${size}`,
            colorName: color,
            colorHex: seed.colorHex[color] ?? null,
            size,
            price: seed.price,
            currency,
            position: colorPosition * 100 + sizePosition,
            active: true,
          },
        });

        await prisma.inventory.upsert({
          where: { variantId: variant.id },
          create: {
            variantId: variant.id,
            quantity,
            reservedQuantity: 0,
            lowStockThreshold: 3,
          },
          // Never overwrite live stock on re-seed: existing rows keep their
          // quantity/reservedQuantity so real inventory is never destroyed.
          // Restocks must go through InventoryMovement (reason RESTOCK).
          update: {
            lowStockThreshold: 3,
          },
        });
      }
    }
  }
}


async function seedShippingConfiguration() {
  const country = (process.env.DEFAULT_COUNTRY ?? 'EG').trim().toUpperCase();
  const currency = (process.env.DEFAULT_CURRENCY ?? 'EGP').trim().toUpperCase();
  const freeAbove = Number(process.env.FREE_SHIPPING_THRESHOLD ?? 1500);
  const standardPrice = Number(process.env.STANDARD_SHIPPING_PRICE ?? 12);
  const expressPrice = Number(process.env.EXPRESS_SHIPPING_PRICE ?? 24);

  let zone = await prisma.shippingZone.findFirst({
    where: { name: 'ALTURA Default Market' },
  });

  if (!zone) {
    zone = await prisma.shippingZone.create({
      data: {
        name: 'ALTURA Default Market',
        countries: [country],
        active: true,
      },
    });
  } else {
    // Never overwrite an existing zone configuration: an admin may have
    // customized countries or deactivated the zone. Seed only fills gaps.
    console.log(`Shipping zone "${zone.name}" already exists; leaving its configuration untouched.`);
  }

  await prisma.shippingMethod.upsert({
    where: { zoneId_code: { zoneId: zone.id, code: 'standard' } },
    create: {
      zoneId: zone.id,
      name: 'Standard Shipping',
      code: 'standard',
      price: standardPrice,
      currency,
      freeAbove,
      estimatedMinDays: 3,
      estimatedMaxDays: 7,
      active: true,
    },
    update: {
      name: 'Standard Shipping',
      price: standardPrice,
      currency,
      freeAbove,
      estimatedMinDays: 3,
      estimatedMaxDays: 7,
      active: true,
    },
  });

  await prisma.shippingMethod.upsert({
    where: { zoneId_code: { zoneId: zone.id, code: 'express' } },
    create: {
      zoneId: zone.id,
      name: 'Express Shipping',
      code: 'express',
      price: expressPrice,
      currency,
      freeAbove: null,
      estimatedMinDays: 1,
      estimatedMaxDays: 3,
      active: true,
    },
    update: {
      name: 'Express Shipping',
      price: expressPrice,
      currency,
      freeAbove: null,
      estimatedMinDays: 1,
      estimatedMaxDays: 3,
      active: true,
    },
  });
}

async function seedOptionalAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    });
    console.log(`Admin role ensured for ${email}; existing password was not changed.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      firstName: 'ALTURA',
      lastName: 'Admin',
      wishlist: { create: {} },
    },
  });
  console.log(`Development admin created: ${email}`);
}

async function seedOptionalCustomer() {
  const email = process.env.CUSTOMER_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.CUSTOMER_SEED_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    throw new Error('CUSTOMER_SEED_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: UserRole.CUSTOMER, status: UserStatus.ACTIVE },
    });
    console.log(`Customer role ensured for ${email}; existing password was not changed.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      firstName: 'ALTURA',
      lastName: 'Customer',
      wishlist: { create: {} },
    },
  });
  console.log(`Development customer created: ${email}`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed against NODE_ENV=production.');
  }
  const catalog = readCatalog();
  await seedCategories(catalog);
  await seedCollections(catalog);
  await seedProducts(catalog);
  await seedShippingConfiguration();
  await seedOptionalAdmin();
  await seedOptionalCustomer();

  const [products, activeProducts, variants, images] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    prisma.productVariant.count(),
    prisma.productImage.count(),
  ]);
  console.log(
    `ALTURA seed complete: ${products} products (${activeProducts} active), ${variants} variants, ${images} images.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
