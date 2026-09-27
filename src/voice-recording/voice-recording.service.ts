import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import JSZip from 'jszip';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceRecordingStorageService } from './voice-recording-storage.service';

/** 파일관리(음성 녹음 목록)는 최고관리자 한 명만 사용한다. */
export const TOP_ADMIN_USERNAME = '01044631440';

const MAX_DURATION_SEC = 60 * 60;

function assertTopAdmin(user: AuthUserPayload) {
  if (user.username !== TOP_ADMIN_USERNAME) {
    throw new ForbiddenException('최고관리자만 접근할 수 있습니다.');
  }
}

/** 파일명에 쓸 수 없는 문자·공백 제거 */
function sanitize(value: string) {
  return value.replace(/[\\/:*?"<>|\s]+/g, '').trim();
}

/** KST 기준 YYYYMMDD_HHmmss */
function kstStamp(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}` +
    `_${pad(kst.getUTCHours())}${pad(kst.getUTCMinutes())}${pad(kst.getUTCSeconds())}`
  );
}

@Injectable()
export class VoiceRecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: VoiceRecordingStorageService,
  ) {}

  async create(
    user: AuthUserPayload,
    file: Express.Multer.File | undefined,
    input: { screen?: string; durationSec?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('녹음 파일이 없습니다.');
    }

    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullname: true, church: { select: { name: true } } },
    });
    if (!me) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const ordererName = me.fullname.trim() || user.username;
    const churchName = me.church?.name?.trim() || null;
    const recordedAt = new Date();

    const baseName = [
      sanitize(ordererName) || '이름없음',
      sanitize(churchName ?? '') || '미지정',
      kstStamp(recordedAt),
    ].join('_');
    const fileName = await this.uniqueFileName(baseName);

    const buffer = await this.storage.toM4a(file.buffer, file.mimetype);
    const fileUrl = await this.storage.store(fileName, buffer);

    const duration = Number(input.durationSec);
    return this.prisma.voiceRecording.create({
      data: {
        userId: user.id,
        ordererName,
        churchName,
        screen: input.screen?.trim().slice(0, 100) || '미지정',
        fileName,
        fileUrl,
        mimeType: 'audio/mp4',
        sizeBytes: buffer.length,
        durationSec:
          Number.isFinite(duration) && duration >= 0
            ? Math.min(Math.round(duration), MAX_DURATION_SEC)
            : null,
        recordedAt,
      },
    });
  }

  private async uniqueFileName(baseName: string) {
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? `${baseName}.m4a` : `${baseName}_${n}.m4a`;
      const exists = await this.prisma.voiceRecording.findFirst({
        where: { fileName: candidate },
        select: { id: true },
      });
      if (!exists) {
        return candidate;
      }
    }
  }

  findAll(user: AuthUserPayload) {
    assertTopAdmin(user);
    return this.prisma.voiceRecording.findMany({
      orderBy: { recordedAt: 'desc' },
    });
  }

  async downloadOne(user: AuthUserPayload, id: number) {
    assertTopAdmin(user);
    const row = await this.prisma.voiceRecording.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('녹음 파일을 찾을 수 없습니다.');
    }
    const buffer = await this.storage.read(row.fileName, row.fileUrl);
    return { fileName: row.fileName, buffer };
  }

  async downloadAll(user: AuthUserPayload) {
    assertTopAdmin(user);
    const rows = await this.prisma.voiceRecording.findMany({
      orderBy: { recordedAt: 'asc' },
    });
    const zip = new JSZip();
    for (const row of rows) {
      zip.file(
        row.fileName,
        await this.storage.read(row.fileName, row.fileUrl),
      );
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { fileName: `voice_recordings_${kstStamp(new Date())}.zip`, buffer };
  }

  async remove(user: AuthUserPayload, id: number) {
    assertTopAdmin(user);
    const row = await this.prisma.voiceRecording.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('녹음 파일을 찾을 수 없습니다.');
    }
    await this.storage.remove(row.fileName, row.fileUrl);
    await this.prisma.voiceRecording.delete({ where: { id } });
    return { id };
  }
}
