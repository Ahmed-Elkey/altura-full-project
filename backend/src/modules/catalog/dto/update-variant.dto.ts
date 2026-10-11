import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateVariantDto } from './create-variant.dto';

export class UpdateVariantDto extends PartialType(
  OmitType(CreateVariantDto, ['initialStock', 'lowStockThreshold'] as const),
) {}
