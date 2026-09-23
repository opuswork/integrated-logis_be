import { Injectable, Logger } from '@nestjs/common';
import { put } from '@vercel/blob';
import { randomInt } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const LOCAL_PUBLIC_PREFIX = '/assets/products/gift_sets';
const BLOB_PREFIX = 'products/gift_sets';

@Injectable()
export class ProductImageStorageService {
  private readonly logger = new Logger(ProductImageStorageService.name);

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
    if (process.env.PRODUCT_UPLOAD_DIR) {
      return process.env.PRODUCT_UPLOAD_DIR;
    }
    // Local default: fe/public/assets/products/gift_sets (Nest cwd = be/)
    return path.join(
      process.cwd(),
      '..',
      'fe',
      'public',
      'assets',
      'products',
      'gift_sets',
    );
  }

  async store(file: Express.Multer.File) {
    return this.storeBuffer(file.buffer, file.originalname, file.mimetype);
  }

  /**
   * 업로드 파일이 아닌 곳(예: 엑셀 셀에서 꺼낸 이미지)에서도 쓸 수 있는 저장 경로.
   */
  async storeBuffer(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<{
    imageUrl: string;
    imageStoredName: string;
    imageOriginalName: string;
  }> {
    const imageStoredName = this.buildStoredName(originalName);

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`${BLOB_PREFIX}/${imageStoredName}`, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: mimetype,
      });
      return {
        imageUrl: blob.url,
        imageStoredName,
        imageOriginalName: originalName,
      };
    }

    const dir = this.localUploadDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, imageStoredName), buffer);
    this.logger.log(`Saved product image locally: ${imageStoredName}`);

    return {
      imageUrl: `${LOCAL_PUBLIC_PREFIX}/${imageStoredName}`,
      imageStoredName,
      imageOriginalName: originalName,
    };
  }
}
