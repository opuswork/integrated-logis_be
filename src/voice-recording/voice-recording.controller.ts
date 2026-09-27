import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { VoiceRecordingService } from './voice-recording.service';

function setAttachment(res: Response, fileName: string, contentType: string) {
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
}

@ApiTags('voice-recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice-recordings')
export class VoiceRecordingController {
  constructor(private readonly voiceRecordingService: VoiceRecordingService) {}

  @Post()
  @ApiOperation({
    summary: '음성 불편·오류 신고 녹음 업로드',
    description: '주문자 성명·중앙은 로그인 사용자 정보로 서버에서 채웁니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        screen: { type: 'string' },
        durationSec: { type: 'integer' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() user: AuthUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('screen') screen?: string,
    @Body('durationSec') durationSec?: string,
  ) {
    return this.voiceRecordingService.create(user, file, {
      screen,
      durationSec,
    });
  }

  @Get()
  @ApiOperation({ summary: '음성 녹음 목록 (최고관리자 전용)' })
  findAll(@CurrentUser() user: AuthUserPayload) {
    return this.voiceRecordingService.findAll(user);
  }

  @Get('download-all')
  @ApiOperation({ summary: '음성 녹음 전체 ZIP 다운로드 (최고관리자 전용)' })
  async downloadAll(
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, buffer } =
      await this.voiceRecordingService.downloadAll(user);
    setAttachment(res, fileName, 'application/zip');
    return new StreamableFile(buffer);
  }

  @Get(':id/download')
  @ApiOperation({ summary: '음성 녹음 단건 다운로드 (최고관리자 전용)' })
  async downloadOne(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, buffer } = await this.voiceRecordingService.downloadOne(
      user,
      id,
    );
    setAttachment(res, fileName, 'audio/mp4');
    return new StreamableFile(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: '음성 녹음 삭제 (최고관리자 전용)' })
  remove(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.voiceRecordingService.remove(user, id);
  }
}
