import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PostOfficeController } from './post-office.controller';
import { PostOfficeService } from './post-office.service';

@Module({
  imports: [AuthModule],
  controllers: [PostOfficeController],
  providers: [PostOfficeService],
})
export class PostOfficeModule {}
