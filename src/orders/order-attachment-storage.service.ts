import { Injectable, Logger } from '@nestjs/common';
import { put } from '@vercel/blob';
import { randomInt } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import { decodeUploadFilename } from '../common/upload-filename';

/** 주문 첨부 파일(사진·PDF·엑셀) 저장 (GreetingImageStorageService와 같은 방식: Blob, 없으면 로컬) */
@Injectable()
export class OrderAttachmentStorageService {
  private readonly logger = new Logger(OrderAttachmentStorageService.name);

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
    if (process.env.ORDER_ATTACHMENT_UPLOAD_DIR) {
      return process.env.ORDER_ATTACHMENT_UPLOAD_DIR;
    }
    // Local default: fe/public/assets/order_attachments (Nest cwd = be/)
    return path.join(
      process.cwd(),
      '..',
      'fe',
      'public',
      'assets',
      'order_attachments',
    );
  }

  async store(file: Express.Multer.File): Promise<{
    imageUrl: string;
    storedName: string;
    originalName: string;
  }> {
    const originalName = decodeUploadFilename(file.originalname);
    const storedName = this.buildStoredName(originalName);

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`order_attachments/${storedName}`, file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: file.mimetype || 'application/octet-stream',
      });
      return { imageUrl: blob.url, storedName, originalName };
    }

    const dir = this.localUploadDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storedName), file.buffer);
    this.logger.log(`Saved order attachment locally: ${storedName}`);

    return {
      imageUrl: `/assets/order_attachments/${storedName}`,
      storedName,
      originalName,
    };
  }
}
