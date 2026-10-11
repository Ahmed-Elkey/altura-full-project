import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddWishlistItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  productId!: string;
}
