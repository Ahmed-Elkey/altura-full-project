import { IsString, MaxLength, MinLength } from "class-validator";
export class NewsletterTokenDto {
  @IsString() @MinLength(1) @MaxLength(2048) token!: string;
}
