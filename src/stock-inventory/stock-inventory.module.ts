import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProductImageStorageService } from './product-image-storage.service';
import { StockInventoryController } from './stock-inventory.controller';
import { StockInventoryService } from './stock-inventory.service';

@Module({
  imports: [AuthModule],
  controllers: [StockInventoryController],
  providers: [StockInventoryService, ProductImageStorageService],
  exports: [StockInventoryService],
})
export class StockInventoryModule {}
