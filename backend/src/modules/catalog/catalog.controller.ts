import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  products(@Query() query: ListProductsQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.catalogService.getProductBySlug(slug);
  }

  @Get('categories')
  categories() {
    return this.catalogService.listCategories();
  }

  @Get('collections')
  collections() {
    return this.catalogService.listCollections();
  }

  @Get('collections/:slug')
  collection(@Param('slug') slug: string, @Query() query: ListProductsQueryDto) {
    return this.catalogService.getCollection(slug, query);
  }
}
