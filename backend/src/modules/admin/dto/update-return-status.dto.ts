import { IsEnum } from 'class-validator';
import { ReturnStatus } from '@prisma/client';

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;
}
