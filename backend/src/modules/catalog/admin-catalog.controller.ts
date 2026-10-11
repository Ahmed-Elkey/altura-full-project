import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
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

@ApiTags('admin-catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get('products')
  products(@Query() query: AdminListProductsQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:productId')
  product(@Param('productId') productId: string) {
    return this.catalog.getProduct(productId);
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch('products/:productId')
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(productId, dto);
  }

  @Post('products/:productId/archive')
  archiveProduct(@Param('productId') productId: string) {
    return this.catalog.archiveProduct(productId);
  }

  @Post('products/:productId/variants')
  createVariant(@Param('productId') productId: string, @Body() dto: CreateVariantDto) {
    return this.catalog.createVariant(productId, dto);
  }

  @Patch('variants/:variantId')
  updateVariant(@Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.catalog.updateVariant(variantId, dto);
  }

  @Post('variants/:variantId/deactivate')
  deactivateVariant(@Param('variantId') variantId: string) {
    return this.catalog.deactivateVariant(variantId);
  }

  @Post('products/:productId/images')
  createImage(@Param('productId') productId: string, @Body() dto: CreateProductImageDto) {
    return this.catalog.createImage(productId, dto);
  }

  @Patch('images/:imageId')
  updateImage(@Param('imageId') imageId: string, @Body() dto: UpdateProductImageDto) {
    return this.catalog.updateImage(imageId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('images/:imageId')
  async deleteImage(@Param('imageId') imageId: string): Promise<void> {
    await this.catalog.deleteImage(imageId);
  }

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Patch('categories/:categoryId')
  updateCategory(@Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(categoryId, dto);
  }

  @Get('collections')
  collections() {
    return this.catalog.listCollections();
  }

  @Post('collections')
  createCollection(@Body() dto: CreateCollectionDto) {
    return this.catalog.createCollection(dto);
  }

  @Patch('collections/:collectionId')
  updateCollection(@Param('collectionId') collectionId: string, @Body() dto: UpdateCollectionDto) {
    return this.catalog.updateCollection(collectionId, dto);
  }
}
