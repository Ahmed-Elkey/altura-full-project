import { NewsletterModule } from '../newsletter/newsletter.module';
import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PaymentsModule, NewsletterModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
