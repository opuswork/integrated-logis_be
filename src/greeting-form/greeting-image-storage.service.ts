import { Injectable, Logger } from '@nestjs/common';
import { put } from '@vercel/blob';
import { randomInt } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class GreetingImageStorageService {
  private readonly logger = new Logger(GreetingImageStorageService.name);

  private buildStoredName(originalName: string) {
    const ext = path.extname(originalName) || '.jpg';
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    return `${stamp}_${randomInt(100000, 999999)}${ext.toLowerCase()}`;
  }

  private localUploadDir() {
    if (process.env.GREETING_UPLOAD_DIR) {
      return process.env.GREETING_UPLOAD_DIR;
    }
    // Local default: fe/public/assets/greeting_form (Nest cwd = be/)
    return path.join(
      process.cwd(),
      '..',
      'fe',
      'public',
      'assets',
      'greeting_form',
    );
  }

  async store(file: Express.Multer.File): Promise<{
    imageUrl: string;
    imageStoredName: string;
    imageOriginalName: string;
  }> {
    return this.storeBuffer({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  async storeBuffer(input: {
    buffer: Buffer;
    originalName: string;
    mimeType?: string;
  }): Promise<{
    imageUrl: string;
    imageStoredName: string;
    imageOriginalName: string;
  }> {
    const imageStoredName = this.buildStoredName(input.originalName);
    const imageOriginalName = input.originalName;
    const contentType = input.mimeType || this.guessMime(input.originalName);

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `greeting_form/${imageStoredName}`,
        input.buffer,
        {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType,
        },
      );
      return {
        imageUrl: blob.url,
        imageStoredName,
        imageOriginalName,
      };
    }

    const dir = this.localUploadDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, imageStoredName), input.buffer);
    this.logger.log(`Saved greeting image locally: ${imageStoredName}`);

    return {
      imageUrl: `/assets/greeting_form/${imageStoredName}`,
      imageStoredName,
      imageOriginalName,
    };
  }

  private guessMime(originalName: string) {
    const ext = path.extname(originalName).toLowerCase();
    if (ext === '.png') {
      return 'image/png';
    }
    if (ext === '.gif') {
      return 'image/gif';
    }
    if (ext === '.webp') {
      return 'image/webp';
    }
    return 'image/jpeg';
  }
}
