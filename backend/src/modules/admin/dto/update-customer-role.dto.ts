import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateCustomerRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
