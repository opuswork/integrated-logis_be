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

  async store(file: Express.Multer.File): Promise<{
    imageUrl: string;
    imageStoredName: string;
    imageOriginalName: string;
  }> {
    const imageStoredName = this.buildStoredName(file.originalname);
    const imageOriginalName = file.originalname;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `${BLOB_PREFIX}/${imageStoredName}`,
        file.buffer,
        {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: file.mimetype,
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
    await fs.writeFile(path.join(dir, imageStoredName), file.buffer);
    this.logger.log(`Saved product image locally: ${imageStoredName}`);

    return {
      imageUrl: `${LOCAL_PUBLIC_PREFIX}/${imageStoredName}`,
      imageStoredName,
      imageOriginalName,
    };
  }
}
