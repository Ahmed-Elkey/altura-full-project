import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CatalogProductRecord, catalogProductInclude, money } from './catalog.types';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: ListProductsQueryDto) {
    const where = this.buildPublicWhere(query);
    const orderBy = this.buildOrderBy(query.sort);
    const skip = (query.page - 1) * query.limit;

    if (query.inStock !== undefined) {
      // Exact sellable availability is quantity - reservedQuantity. Prisma cannot express
      // that cross-column arithmetic in a relation filter, so stock-filtered catalog
      // requests are filtered after hydration. The ALTURA catalog is intentionally
      // small; this preserves correctness once checkout reservations are enabled.
      const all = await this.prisma.product.findMany({
        where,
        include: catalogProductInclude,
        orderBy,
      });
      const filtered = all
        .map((product) => this.toStorefrontProduct(product))
        .filter((product) => product.inStock === query.inStock);
      const total = filtered.length;
      return {
        items: filtered.slice(skip, skip + query.limit),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.max(1, Math.ceil(total / query.limit)),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: catalogProductInclude,
        orderBy,
        skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((product) => this.toStorefrontProduct(product)),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      include: catalogProductInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toStorefrontProduct(product);
  }

  async listCategories() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            products: {
              where: { product: { status: ProductStatus.ACTIVE } },
            },
          },
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parent: category.parent,
      position: category.position,
      productCount: category._count.products,
    }));
  }

  async listCollections() {
    const collections = await this.prisma.collection.findMany({
      where: { status: ProductStatus.ACTIVE },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: {
              where: { product: { status: ProductStatus.ACTIVE } },
            },
          },
        },
      },
    });

    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      heroImageUrl: collection.heroImageUrl,
      position: collection.position,
      productCount: collection._count.products,
    }));
  }

  async getCollection(slug: string, query: ListProductsQueryDto) {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        heroImageUrl: true,
        position: true,
      },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    const products = await this.listProducts({ ...query, collection: slug });
    return { ...collection, products };
  }

  private buildPublicWhere(query: ListProductsQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
    };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { shortDescription: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        {
          variants: {
            some: {
              active: true,
              OR: [
                { colorName: { contains: q, mode: 'insensitive' } },
                { size: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    if (query.category) {
      where.categories = {
        some: { category: { slug: query.category.trim().toLowerCase() } },
      };
    }

    if (query.collection) {
      where.collections = {
        some: {
          collection: {
            slug: query.collection.trim().toLowerCase(),
            status: ProductStatus.ACTIVE,
          },
        },
      };
    }

    const variantFilter: Prisma.ProductVariantWhereInput = { active: true };
    if (query.color) {
      variantFilter.colorName = { equals: query.color.trim(), mode: 'insensitive' };
    }
    if (query.size) {
      variantFilter.size = { equals: query.size.trim(), mode: 'insensitive' };
    }
    if (query.color || query.size) {
      where.variants = { some: variantFilter };
    }

    return where;
  }

  private buildOrderBy(sort: ListProductsQueryDto['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price-asc':
        return [{ basePrice: 'asc' }, { position: 'asc' }];
      case 'price-desc':
        return [{ basePrice: 'desc' }, { position: 'asc' }];
      case 'name-asc':
        return [{ name: 'asc' }];
      case 'newest':
        return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
      default:
        return [{ featured: 'desc' }, { position: 'asc' }, { name: 'asc' }];
    }
  }

  toStorefrontProduct(product: CatalogProductRecord) {
    type ColorwayAccumulator = {
      name: string;
      hex: string | null;
      variants: Array<{
        id: string;
        sku: string;
        size: string;
        price: number;
        compareAtPrice: number | null;
        availableQuantity: number;
        inStock: boolean;
      }>;
    };
    const colorways = new Map<string, ColorwayAccumulator>();

    for (const variant of product.variants.filter((item) => item.active)) {
      const existing: ColorwayAccumulator = colorways.get(variant.colorName) ?? {
        name: variant.colorName,
        hex: variant.colorHex,
        variants: [],
      };
      const availableQuantity = Math.max(
        0,
        (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0),
      );
      existing.variants.push({
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        price: Number(variant.price),
        compareAtPrice: money(variant.compareAtPrice),
        availableQuantity,
        inStock: availableQuantity > 0,
      });
      if (!existing.hex && variant.colorHex) existing.hex = variant.colorHex;
      colorways.set(variant.colorName, existing);
    }

    const colorwayList = [...colorways.values()].map((colorway) => ({
      ...colorway,
      inStock: colorway.variants.some((variant) => variant.inStock),
      images: product.images
        .filter((image) => image.colorName === colorway.name || image.colorName === null)
        .map((image) => ({
          id: image.id,
          url: image.url,
          altText: image.altText,
          view: image.view,
          colorName: image.colorName,
          isPrimary: image.isPrimary,
          position: image.position,
        })),
    }));

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      basePrice: Number(product.basePrice),
      compareAtPrice: money(product.compareAtPrice),
      currency: product.currency,
      fit: product.fit,
      details: product.details,
      materials: product.materials,
      careInstructions: product.careInstructions,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      featured: product.featured,
      position: product.position,
      publishedAt: product.publishedAt,
      categories: product.categories.map(({ category }) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parent: category.parent
          ? { id: category.parent.id, name: category.parent.name, slug: category.parent.slug }
          : null,
      })),
      collections: product.collections
        .filter(({ collection }) => collection.status === ProductStatus.ACTIVE)
        .map(({ collection }) => ({
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
        })),
      colorways: colorwayList,
      colors: colorwayList.map((colorway) => colorway.name),
      sizes: [...new Set(colorwayList.flatMap((colorway) => colorway.variants.map((variant) => variant.size)))],
      inStock: colorwayList.some((colorway) => colorway.inStock),
      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
        view: image.view,
        colorName: image.colorName,
        isPrimary: image.isPrimary,
        position: image.position,
      })),
    };
  }
}
