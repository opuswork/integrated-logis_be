import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GreetingFormModule } from '../greeting-form/greeting-form.module';
import { OrderAttachmentStorageService } from './order-attachment-storage.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, GreetingFormModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderAttachmentStorageService],
})
export class OrdersModule {}
