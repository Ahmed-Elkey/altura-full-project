import { ProductStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ListProductsQueryDto } from './list-products-query.dto';

export class AdminListProductsQueryDto extends ListProductsQueryDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
