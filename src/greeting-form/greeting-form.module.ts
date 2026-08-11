import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GreetingFormController } from './greeting-form.controller';
import { GreetingFormService } from './greeting-form.service';
import { GreetingImageStorageService } from './greeting-image-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [GreetingFormController],
  providers: [GreetingFormService, GreetingImageStorageService],
  exports: [GreetingFormService, GreetingImageStorageService],
})
export class GreetingFormModule {}
