import {
  BadRequestException,
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PostOfficeService,
  type HolidayGiftConvertOption,
} from './post-office.service';

@ApiTags('post-office')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('post-office')
export class PostOfficeController {
  constructor(private readonly postOfficeService: PostOfficeService) {}

  @Post('holiday-gift-convert')
  @ApiOperation({
    summary: '명절선물 수취인 → 우체국택배 업로드용 .xlsx 변환',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'churchName', 'options'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '명절선물_입력.xlsx',
        },
        ordererName: {
          type: 'string',
          description: '선택. 비우면 엑셀 주문자명은 공란',
        },
        churchName: { type: 'string', description: '중앙 검색값 (필수)' },
        options: {
          type: 'string',
          description:
            'JSON array: [{ productLabel, quantity, paymentType, boxUnit }]',
        },
        // legacy single-option fields
        boxUnit: { type: 'number' },
        paymentType: { type: 'string', enum: ['선불', '착불'] },
        productName: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: '우체국택배_업로드_컨버트.xlsx' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async holidayGiftConvert(
    @UploadedFile() file: Express.Multer.File,
    @Body('ordererName') ordererName: string,
    @Body('churchName') churchName: string,
    @Body('options') optionsRaw: string | undefined,
    @Body('boxUnit') boxUnitRaw: string | number | undefined,
    @Body('paymentType') paymentType: string | undefined,
    @Body('productName') productName: string | undefined,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const options = parseConvertOptions(
      optionsRaw,
      productName,
      paymentType,
      boxUnitRaw,
    );

    const buffer = await this.postOfficeService.convertHolidayGiftList(
      file,
      {
        ordererName: ordererName ?? '',
        churchName: churchName ?? '',
        options,
      },
      user,
    );

    const filename = this.postOfficeService.getOutputFilename();
    const encoded = encodeURIComponent(filename);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="post-office-upload-convert.xlsx"; filename*=UTF-8''${encoded}`,
    );

    return new StreamableFile(buffer);
  }
}

function parseConvertOptions(
  optionsRaw: string | undefined,
  productName: string | undefined,
  paymentType: string | undefined,
  boxUnitRaw: string | number | undefined,
): HolidayGiftConvertOption[] {
  if (optionsRaw?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(optionsRaw);
    } catch {
      throw new BadRequestException('options JSON을 파싱할 수 없습니다.');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new BadRequestException('options는 비어 있지 않은 배열이어야 합니다.');
    }
    return parsed.map((item, index) => {
      const row = item as Record<string, unknown>;
      const label = String(row.productLabel ?? row.productName ?? '').trim();
      const qty = Number(row.quantity ?? 1);
      const pay = String(row.paymentType ?? '선불');
      const box = Number(row.boxUnit);
      if (!label) {
        throw new BadRequestException(
          `options[${index}]: 상품명이 필요합니다.`,
        );
      }
      if (pay !== '선불' && pay !== '착불') {
        throw new BadRequestException(
          `options[${index}]: 선/착은 선불 또는 착불이어야 합니다.`,
        );
      }
      if (!Number.isFinite(box) || box <= 0) {
        throw new BadRequestException(
          `options[${index}]: 박스단위는 1 이상의 숫자여야 합니다.`,
        );
      }
      if (!Number.isFinite(qty) || qty < 1) {
        throw new BadRequestException(
          `options[${index}]: 수량은 1 이상이어야 합니다.`,
        );
      }
      return {
        productLabel: label,
        quantity: Math.trunc(qty),
        paymentType: pay as '선불' | '착불',
        boxUnit: box,
      };
    });
  }

  // Legacy single-option FormData
  const boxUnit = Number(boxUnitRaw);
  if (!Number.isFinite(boxUnit)) {
    throw new BadRequestException('박스단위는 숫자여야 합니다.');
  }
  if (paymentType !== '선불' && paymentType !== '착불') {
    throw new BadRequestException('선/착은 선불 또는 착불이어야 합니다.');
  }
  return [
    {
      productLabel: productName ?? '',
      quantity: 1,
      paymentType,
      boxUnit,
    },
  ];
}
