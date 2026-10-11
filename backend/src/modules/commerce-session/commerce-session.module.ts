import { Module } from '@nestjs/common';
import { CommerceSessionController } from './commerce-session.controller';
import { CommerceSessionService } from './commerce-session.service';

@Module({
  controllers: [CommerceSessionController],
  providers: [CommerceSessionService],
  exports: [CommerceSessionService],
})
export class CommerceSessionModule {}
