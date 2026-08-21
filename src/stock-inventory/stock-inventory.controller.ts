import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateStockInventoryDto,
  ReplaceStockInventoryDto,
  UpdateStockInventoryDto,
} from './dto/stock-inventory.dto';
import { StockInventoryService } from './stock-inventory.service';

const imageUploadInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

@ApiTags('stock-inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock-inventory')
export class StockInventoryController {
  constructor(
    private readonly stockInventoryService: StockInventoryService,
  ) {}

  @Post()
  @ApiOperation({ summary: '재고/상품 단건 등록 (이미지 선택)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'code',
        'productName',
        'unit',
        'effectiveDate',
        'priceOver500man',
        'priceOver100man',
        'wholesalePrice',
        'associatePrice',
        'category',
      ],
      properties: {
        image: { type: 'string', format: 'binary' },
        code: { type: 'string' },
        imageUrl: { type: 'string' },
        productName: { type: 'string' },
        spec: { type: 'string' },
        unit: { type: 'integer' },
        stock: {
          type: 'integer',
          nullable: true,
          description: '창고 재고 (비우면 무제한)',
        },
        stockMax: {
          type: 'integer',
          nullable: true,
          description: '기준/최대 재고 (UI 현재/최대 표시)',
        },
        effectiveDate: { type: 'string' },
        priceOver500man: { type: 'number' },
        priceOver100man: { type: 'number' },
        wholesalePrice: { type: 'number' },
        associatePrice: { type: 'number' },
        category: { type: 'string' },
        openStock: {
          type: 'boolean',
          description: '고객 공개 여부',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: '생성된 상품' })
  @UseInterceptors(imageUploadInterceptor)
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateStockInventoryDto,
  ) {
    return this.stockInventoryService.create(dto, file);
  }

  @Post('bulk-import')
  @ApiOperation({
    summary: '재고/상품 Excel 일괄 등록',
    description:
      '.xlsx / .csv 파일을 업로드합니다. 헤더: 코드, 사진(선택), 품명, 규격, 단위, 적용일자, 500만원이상 할인가, 100만원이상 할인가, 도매, 준회원, 구분',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel/CSV 파일',
        },
        skipExisting: {
          type: 'boolean',
          default: true,
          description: 'true면 이미 있는 코드는 건너뜁니다',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  bulkImport(
    @UploadedFile() file: Express.Multer.File,
    @Body('skipExisting') skipExisting?: string | boolean,
  ) {
    const skip =
      skipExisting === undefined
        ? true
        : skipExisting === true ||
          skipExisting === 'true' ||
          skipExisting === '1';

    return this.stockInventoryService.bulkImportFromFile(file, skip);
  }

  @Get('status')
  @ApiOperation({ summary: '재고 현황 대시보드 (지표·품목·변동 이력)' })
  @ApiOkResponse({ description: '재고 현황 집계' })
  getStatus() {
    return this.stockInventoryService.getStatus();
  }

  @Get()
  @ApiOperation({ summary: '재고/상품 목록' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: '품명/코드/규격 검색',
  })
  @ApiQuery({
    name: 'openOnly',
    required: false,
    type: Boolean,
    description: 'true면 고객 공개 상품만 반환',
  })
  @ApiOkResponse({ description: '상품 목록' })
  findAll(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    const onlyOpen =
      openOnly === 'true' || openOnly === '1' || openOnly === 'yes';
    return this.stockInventoryService.findAll(category, keyword, onlyOpen);
  }

  @Get(':id')
  @ApiOperation({ summary: '재고/상품 단건 조회' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.stockInventoryService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '재고/상품 전체 수정 (PUT, 이미지 선택)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(imageUploadInterceptor)
  replace(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ReplaceStockInventoryDto,
  ) {
    return this.stockInventoryService.replace(id, dto, file);
  }

  @Patch(':id')
  @ApiOperation({ summary: '재고/상품 부분 수정 (PATCH, 이미지 선택)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(imageUploadInterceptor)
  update(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UpdateStockInventoryDto,
  ) {
    return this.stockInventoryService.update(id, dto, file);
  }

  @Delete(':id')
  @ApiOperation({ summary: '재고/상품 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.stockInventoryService.remove(id);
  }
}
