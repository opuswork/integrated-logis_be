import { Injectable, Logger } from '@nestjs/common';
import { del, put } from '@vercel/blob';
import { execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const BLOB_PREFIX = 'voice_recordings';

@Injectable()
export class VoiceRecordingStorageService {
  private readonly logger = new Logger(VoiceRecordingStorageService.name);

  private localUploadDir() {
    if (process.env.VOICE_UPLOAD_DIR) {
      return process.env.VOICE_UPLOAD_DIR;
    }
    // Local default: fe/public/assets/voice_recordings (Nest cwd = be/)
    return path.join(
      process.cwd(),
      '..',
      'fe',
      'public',
      'assets',
      BLOB_PREFIX,
    );
  }

  /** 브라우저가 mp4(AAC)로 녹음했으면 그대로, 아니면(webm/opus 등) m4a 로 변환한다. */
  async toM4a(buffer: Buffer, mimeType: string | undefined): Promise<Buffer> {
    if (mimeType?.startsWith('audio/mp4') || mimeType === 'audio/x-m4a') {
      return buffer;
    }
    if (!ffmpegPath) {
      throw new Error('ffmpeg binary is not available');
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-'));
    const input = path.join(workDir, 'input');
    const output = path.join(workDir, 'output.m4a');
    try {
      await fs.writeFile(input, buffer);
      await execFileAsync(ffmpegPath, [
        '-y',
        '-i',
        input,
        '-vn',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        output,
      ]);
      return await fs.readFile(output);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  async store(fileName: string, buffer: Buffer): Promise<string> {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`${BLOB_PREFIX}/${fileName}`, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'audio/mp4',
      });
      return blob.url;
    }

    const dir = this.localUploadDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), buffer);
    this.logger.log(`Saved voice recording locally: ${fileName}`);
    return `/assets/${BLOB_PREFIX}/${encodeURIComponent(fileName)}`;
  }

  async read(fileName: string, fileUrl: string): Promise<Buffer> {
    if (/^https?:\/\//.test(fileUrl)) {
      const res = await fetch(fileUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${fileUrl}: ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }
    return fs.readFile(path.join(this.localUploadDir(), fileName));
  }

  async remove(fileName: string, fileUrl: string): Promise<void> {
    if (/^https?:\/\//.test(fileUrl)) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      }
      return;
    }
    await fs.rm(path.join(this.localUploadDir(), fileName), { force: true });
  }
}
