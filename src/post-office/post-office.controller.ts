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
import { PostOfficeService } from './post-office.service';

@ApiTags('post-office')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('post-office')
export class PostOfficeController {
  constructor(private readonly postOfficeService: PostOfficeService) {}

  @Post('holiday-gift-convert')
  @ApiOperation({
    summary: '명절선물 수취인 → 우체국택배 업로드용 .xls 변환',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'boxUnit', 'paymentType', 'productName'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '명절선물_입력.xlsx',
        },
        boxUnit: { type: 'number', example: 5 },
        paymentType: { type: 'string', enum: ['선불', '착불'] },
        productName: { type: 'string', example: '매장) 진3호-1세트' },
      },
    },
  })
  @ApiOkResponse({ description: '우체국택배_업로드_컨버트.xls' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async holidayGiftConvert(
    @UploadedFile() file: Express.Multer.File,
    @Body('boxUnit') boxUnitRaw: string | number,
    @Body('paymentType') paymentType: string,
    @Body('productName') productName: string,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const boxUnit = Number(boxUnitRaw);
    if (!Number.isFinite(boxUnit)) {
      throw new BadRequestException('박스단위는 숫자여야 합니다.');
    }

    if (paymentType !== '선불' && paymentType !== '착불') {
      throw new BadRequestException('선/착은 선불 또는 착불이어야 합니다.');
    }

    const buffer = await this.postOfficeService.convertHolidayGiftList(
      file,
      {
        boxUnit,
        paymentType,
        productName: productName ?? '',
      },
      user,
    );

    // Node HTTP headers must be ASCII. Use ASCII fallback + RFC 5987 filename*.
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
