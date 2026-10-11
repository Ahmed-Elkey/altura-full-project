import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordResetMailService } from './password-reset-mail.service';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DemoLoginService } from './demo-login.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DemoLoginService, PasswordRecoveryService, PasswordResetMailService],
  exports: [AuthService, PasswordResetMailService],
})
export class AuthModule {}
