import { IsIn } from 'class-validator';
import { DemoRole } from '../demo-login.service';

export class DemoLoginDto {
  @IsIn(['CUSTOMER', 'ADMIN'])
  role!: DemoRole;
}
