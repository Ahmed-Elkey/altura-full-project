import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { CatalogProductRecord, catalogProductInclude, money } from './catalog.types';
import { AdminListProductsQueryDto } from './dto/admin-list-products-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
  ) {}

  async listProducts(query: AdminListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
      ];
    }
    if (query.category) {
      where.categories = { some: { category: { slug: query.category.toLowerCase() } } };
    }
    if (query.collection) {
      where.collections = { some: { collection: { slug: query.collection.toLowerCase() } } };
    }
    if (query.color || query.size || query.inStock !== undefined) {
      const variantFilter: Prisma.ProductVariantWhereInput = {};
      if (query.color) variantFilter.colorName = { equals: query.color, mode: 'insensitive' };
      if (query.size) variantFilter.size = { equals: query.size, mode: 'insensitive' };
      if (query.inStock === true) variantFilter.inventory = { is: { quantity: { gt: 0 } } };
      if (query.inStock === false) variantFilter.inventory = { is: { quantity: 0 } };
      where.variants = { some: variantFilter };
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy = this.orderBy(query.sort);
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
      items: items.map((item) => this.toAdminProduct(item)),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getProduct(productId: string) {
    const product = await this.findProduct(productId);
    return this.toAdminProduct(product);
  }

  async createProduct(dto: CreateProductDto) {
    const categoryIds = await this.resolveCategoryIds(dto.categorySlugs);
    const collectionIds = await this.resolveCollectionIds(dto.collectionSlugs);
    const status = dto.status ?? ProductStatus.DRAFT;
    const currency = (dto.currency ?? 'EGP').toUpperCase();

    try {
      const product = await this.prisma.product.create({
        data: {
          slug: dto.slug.toLowerCase(),
          name: dto.name,
          shortDescription: dto.shortDescription,
          description: dto.description,
          basePrice: new Prisma.Decimal(dto.basePrice),
          compareAtPrice:
            dto.compareAtPrice === undefined ? undefined : new Prisma.Decimal(dto.compareAtPrice),
          currency,
          status,
          fit: dto.fit,
          details: dto.details as Prisma.InputJsonValue | undefined,
          materials: dto.materials as Prisma.InputJsonValue | undefined,
          careInstructions: dto.careInstructions as Prisma.InputJsonValue | undefined,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
          position: dto.position ?? 0,
          featured: dto.featured ?? false,
          publishedAt: status === ProductStatus.ACTIVE ? new Date() : null,
          categories: {
            create: categoryIds.map((categoryId, index) => ({ categoryId, position: index })),
          },
          collections: {
            create: collectionIds.map((collectionId, index) => ({ collectionId, position: index })),
          },
        },
        include: catalogProductInclude,
      });
      return this.toAdminProduct(product);
    } catch (error) {
      this.rethrowPrismaConflict(error, 'Product slug already exists');
    }
  }

  async updateProduct(productId: string, dto: UpdateProductDto) {
    await this.ensureProduct(productId);
    const categoryIds =
      dto.categorySlugs === undefined ? undefined : await this.resolveCategoryIds(dto.categorySlugs);
    const collectionIds =
      dto.collectionSlugs === undefined
        ? undefined
        : await this.resolveCollectionIds(dto.collectionSlugs);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(dto.slug !== undefined ? { slug: dto.slug.toLowerCase() } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.shortDescription !== undefined
              ? { shortDescription: dto.shortDescription || null }
              : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.basePrice !== undefined
              ? { basePrice: new Prisma.Decimal(dto.basePrice) }
              : {}),
            ...(dto.compareAtPrice !== undefined
              ? { compareAtPrice: new Prisma.Decimal(dto.compareAtPrice) }
              : {}),
            ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
            ...(dto.status !== undefined
              ? {
                  status: dto.status,
                  publishedAt:
                    dto.status === ProductStatus.ACTIVE ? new Date() : null,
                }
              : {}),
            ...(dto.fit !== undefined ? { fit: dto.fit || null } : {}),
            ...(dto.details !== undefined
              ? { details: dto.details as Prisma.InputJsonValue }
              : {}),
            ...(dto.materials !== undefined
              ? { materials: dto.materials as Prisma.InputJsonValue }
              : {}),
            ...(dto.careInstructions !== undefined
              ? { careInstructions: dto.careInstructions as Prisma.InputJsonValue }
              : {}),
            ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle || null } : {}),
            ...(dto.seoDescription !== undefined
              ? { seoDescription: dto.seoDescription || null }
              : {}),
            ...(dto.position !== undefined ? { position: dto.position } : {}),
            ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
          },
        });

        if (categoryIds !== undefined) {
          await tx.productCategory.deleteMany({ where: { productId } });
          if (categoryIds.length) {
            await tx.productCategory.createMany({
              data: categoryIds.map((categoryId, index) => ({
                productId,
                categoryId,
                position: index,
              })),
            });
          }
        }

        if (collectionIds !== undefined) {
          await tx.productCollection.deleteMany({ where: { productId } });
          if (collectionIds.length) {
            await tx.productCollection.createMany({
              data: collectionIds.map((collectionId, index) => ({
                productId,
                collectionId,
                position: index,
              })),
            });
          }
        }
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'Product slug already exists');
    }

    return this.getProduct(productId);
  }

  async archiveProduct(productId: string) {
    await this.ensureProduct(productId);
    await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED, publishedAt: null },
    });
    return this.getProduct(productId);
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    await this.ensureProduct(productId);
    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          sku: dto.sku.trim().toUpperCase(),
          title: dto.title,
          colorName: dto.colorName,
          colorHex: dto.colorHex,
          size: dto.size,
          price: new Prisma.Decimal(dto.price),
          compareAtPrice:
            dto.compareAtPrice === undefined ? undefined : new Prisma.Decimal(dto.compareAtPrice),
          currency: (dto.currency ?? 'EGP').toUpperCase(),
          weightGrams: dto.weightGrams,
          position: dto.position ?? 0,
          active: dto.active ?? true,
          inventory: {
            create: {
              quantity: dto.initialStock ?? 0,
              lowStockThreshold: dto.lowStockThreshold ?? 3,
            },
          },
        },
        include: { inventory: true },
      });

      if ((dto.initialStock ?? 0) > 0) {
        await this.prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            reason: 'RESTOCK',
            quantity: dto.initialStock ?? 0,
            note: 'Initial stock on variant creation',
          },
        });
      }

      return this.variantResponse(variant);
    } catch (error) {
      this.rethrowPrismaConflict(error, 'SKU or product/color/size combination already exists');
    }
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    await this.ensureVariant(variantId);
    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku.trim().toUpperCase() } : {}),
          ...(dto.title !== undefined ? { title: dto.title || null } : {}),
          ...(dto.colorName !== undefined ? { colorName: dto.colorName } : {}),
          ...(dto.colorHex !== undefined ? { colorHex: dto.colorHex || null } : {}),
          ...(dto.size !== undefined ? { size: dto.size } : {}),
          ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
          ...(dto.compareAtPrice !== undefined
            ? { compareAtPrice: new Prisma.Decimal(dto.compareAtPrice) }
            : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
          ...(dto.weightGrams !== undefined ? { weightGrams: dto.weightGrams } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        include: { inventory: true },
      });
      return this.variantResponse(variant);
    } catch (error) {
      this.rethrowPrismaConflict(error, 'SKU or product/color/size combination already exists');
    }
  }

  async deactivateVariant(variantId: string) {
    await this.ensureVariant(variantId);
    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { active: false },
      include: { inventory: true },
    });
    return this.variantResponse(variant);
  }

  async createImage(productId: string, dto: CreateProductImageDto) {
    await this.ensureProduct(productId);
    if (dto.variantId) await this.assertVariantBelongsToProduct(dto.variantId, productId);

    try {
      return await this.prisma.productImage.create({
        data: {
          productId,
          variantId: dto.variantId,
          colorName: dto.colorName,
          url: dto.url,
          altText: dto.altText,
          view: dto.view,
          isPrimary: dto.isPrimary ?? false,
          position: dto.position ?? 0,
        },
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'This image URL is already attached to the product');
    }
  }

  async updateImage(imageId: string, dto: UpdateProductImageDto) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Product image not found');
    if (dto.variantId) await this.assertVariantBelongsToProduct(dto.variantId, image.productId);

    try {
      return await this.prisma.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.url !== undefined ? { url: dto.url } : {}),
          ...(dto.altText !== undefined ? { altText: dto.altText || null } : {}),
          ...(dto.view !== undefined ? { view: dto.view || null } : {}),
          ...(dto.colorName !== undefined ? { colorName: dto.colorName || null } : {}),
          ...(dto.variantId !== undefined ? { variantId: dto.variantId || null } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'This image URL is already attached to the product');
    }
  }

  async deleteImage(imageId: string): Promise<void> {
    const exists = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Product image not found');
    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  async listCategories() {
    return this.prisma.category.findMany({
      include: { parent: true, children: true, _count: { select: { products: true } } },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const parentId = dto.parentSlug ? await this.resolveParentId(dto.parentSlug) : null;
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          description: dto.description,
          parentId,
          position: dto.position ?? 0,
        },
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'Category slug already exists');
    }
  }

  async updateCategory(categoryId: string, dto: UpdateCategoryDto) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const existing = await tx.category.findUnique({ where: { id: categoryId } });
          if (!existing) throw new NotFoundException('Category not found');
          let parentId: string | null | undefined;
          if (dto.parentSlug !== undefined) {
            if (!dto.parentSlug) parentId = null;
            else {
              const parent = await tx.category.findUnique({ where: { slug: dto.parentSlug } });
              if (!parent) throw new BadRequestException('Parent category not found');
              parentId = parent.id;
              const visited = new Set<string>([categoryId]);
              let ancestor: typeof parent | null = parent;
              while (ancestor) {
                if (visited.has(ancestor.id)) throw new BadRequestException('Category parent would create a cycle');
                visited.add(ancestor.id);
                ancestor = ancestor.parentId ? await tx.category.findUnique({ where: { id: ancestor.parentId } }) : null;
              }
            }
          }
          return tx.category.update({ where: { id: categoryId }, data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug.toLowerCase() } : {}),
            ...(dto.description !== undefined ? { description: dto.description || null } : {}),
            ...(parentId !== undefined ? { parentId } : {}),
            ...(dto.position !== undefined ? { position: dto.position } : {}),
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw new ConflictException('Category tree changed concurrently. Please retry.');
        }
        this.rethrowPrismaConflict(error, 'Category slug already exists');
      }
    }
  }

  async listCollections() {
    return this.prisma.collection.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async createCollection(dto: CreateCollectionDto) {
    const status = dto.status ?? ProductStatus.DRAFT;
    try {
      return await this.prisma.collection.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          description: dto.description,
          heroImageUrl: dto.heroImageUrl,
          status,
          position: dto.position ?? 0,
          publishedAt: status === ProductStatus.ACTIVE ? new Date() : null,
        },
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'Collection slug already exists');
    }
  }

  async updateCollection(collectionId: string, dto: UpdateCollectionDto) {
    const existing = await this.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new NotFoundException('Collection not found');
    try {
      return await this.prisma.collection.update({
        where: { id: collectionId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug.toLowerCase() } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
          ...(dto.heroImageUrl !== undefined ? { heroImageUrl: dto.heroImageUrl || null } : {}),
          ...(dto.status !== undefined
            ? {
                status: dto.status,
                publishedAt: dto.status === ProductStatus.ACTIVE ? new Date() : null,
              }
            : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });
    } catch (error) {
      this.rethrowPrismaConflict(error, 'Collection slug already exists');
    }
  }

  private async findProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: catalogProductInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async ensureProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
  }

  private async ensureVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!variant) throw new NotFoundException('Product variant not found');
  }

  private async assertVariantBelongsToProduct(variantId: string, productId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!variant) throw new BadRequestException('Variant does not belong to this product');
  }

  private async resolveCategoryIds(slugs: string[] | undefined): Promise<string[]> {
    if (!slugs?.length) return [];
    const normalized = [...new Set(slugs.map((slug) => slug.trim().toLowerCase()))];
    const categories = await this.prisma.category.findMany({
      where: { slug: { in: normalized } },
      select: { id: true, slug: true },
    });
    if (categories.length !== normalized.length) {
      const found = new Set(categories.map((category) => category.slug));
      throw new BadRequestException(
        `Unknown categories: ${normalized.filter((slug) => !found.has(slug)).join(', ')}`,
      );
    }
    return normalized.map((slug) => categories.find((category) => category.slug === slug)!.id);
  }

  private async resolveCollectionIds(slugs: string[] | undefined): Promise<string[]> {
    if (!slugs?.length) return [];
    const normalized = [...new Set(slugs.map((slug) => slug.trim().toLowerCase()))];
    const collections = await this.prisma.collection.findMany({
      where: { slug: { in: normalized } },
      select: { id: true, slug: true },
    });
    if (collections.length !== normalized.length) {
      const found = new Set(collections.map((collection) => collection.slug));
      throw new BadRequestException(
        `Unknown collections: ${normalized.filter((slug) => !found.has(slug)).join(', ')}`,
      );
    }
    return normalized.map((slug) => collections.find((collection) => collection.slug === slug)!.id);
  }

  private async resolveParentId(slug: string): Promise<string> {
    const parent = await this.prisma.category.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException(`Parent category '${slug}' does not exist`);
    return parent.id;
  }

  private toAdminProduct(product: CatalogProductRecord) {
    const storefront = this.catalogService.toStorefrontProduct(product);
    return {
      ...storefront,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      variants: product.variants.map((variant) => this.variantResponse(variant)),
    };
  }

  private variantResponse(variant: {
    id: string;
    productId: string;
    sku: string;
    title: string | null;
    colorName: string;
    colorHex: string | null;
    size: string;
    price: Prisma.Decimal;
    compareAtPrice: Prisma.Decimal | null;
    currency: string;
    weightGrams: number | null;
    position: number;
    active: boolean;
    inventory?: { quantity: number; reservedQuantity: number; lowStockThreshold: number } | null;
  }) {
    const availableQuantity = Math.max(
      0,
      (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0),
    );
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      title: variant.title,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      size: variant.size,
      price: Number(variant.price),
      compareAtPrice: money(variant.compareAtPrice),
      currency: variant.currency,
      weightGrams: variant.weightGrams,
      position: variant.position,
      active: variant.active,
      inventory: variant.inventory
        ? {
            quantity: variant.inventory.quantity,
            reservedQuantity: variant.inventory.reservedQuantity,
            availableQuantity,
            lowStockThreshold: variant.inventory.lowStockThreshold,
          }
        : null,
    };
  }

  private orderBy(sort: AdminListProductsQueryDto['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price-asc': return [{ basePrice: 'asc' }, { position: 'asc' }];
      case 'price-desc': return [{ basePrice: 'desc' }, { position: 'asc' }];
      case 'name-asc': return [{ name: 'asc' }];
      case 'newest': return [{ createdAt: 'desc' }];
      default: return [{ featured: 'desc' }, { position: 'asc' }, { name: 'asc' }];
    }
  }

  private rethrowPrismaConflict(error: unknown, message: string): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
