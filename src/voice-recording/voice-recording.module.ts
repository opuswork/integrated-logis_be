import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { VoiceRecordingStorageService } from './voice-recording-storage.service';
import { VoiceRecordingController } from './voice-recording.controller';
import { VoiceRecordingService } from './voice-recording.service';

@Module({
  imports: [AuthModule],
  controllers: [VoiceRecordingController],
  providers: [VoiceRecordingService, VoiceRecordingStorageService],
})
export class VoiceRecordingModule {}
