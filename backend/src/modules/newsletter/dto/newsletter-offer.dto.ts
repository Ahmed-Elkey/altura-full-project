import { IsInt, IsObject, IsOptional, Min } from "class-validator";
export class NewsletterOfferDto {
  @IsInt() @Min(1) version!: number;
  @IsObject() config!: Record<string, unknown>;
}
export class NewsletterOfferPreviewDto {
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsObject() config!: Record<string, unknown>;
}
