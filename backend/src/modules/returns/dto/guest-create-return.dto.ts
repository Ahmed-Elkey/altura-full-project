import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { CreateReturnDto } from './create-return.dto';

export class GuestCreateReturnDto extends CreateReturnDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
