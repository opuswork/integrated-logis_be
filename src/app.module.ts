import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChurchesModule } from './churches/churches.module';
import { GreetingFormModule } from './greeting-form/greeting-form.module';
import { MembersModule } from './members/members.module';
import { OrderItemsModule } from './order-items/order-items.module';
import { OrdersModule } from './orders/orders.module';
import { PostOfficeModule } from './post-office/post-office.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { StockInventoryModule } from './stock-inventory/stock-inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    OrdersModule,
    OrderItemsModule,
    ShipmentsModule,
    StockInventoryModule,
    GreetingFormModule,
    MembersModule,
    ChurchesModule,
    AuthModule,
    PostOfficeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
