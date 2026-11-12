import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnersService } from './partners.service';

const evidenceInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const bulkFileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const fileBody = (field: string, description: string) => ({
  schema: {
    type: 'object',
    required: [field],
    properties: { [field]: { type: 'string', format: 'binary', description } },
  },
});

function assertAdmin(user: AuthUserPayload) {
  if (user.role !== 'admin') {
    throw new ForbiddenException('관리자만 사용할 수 있습니다.');
  }
}

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @ApiOperation({
    summary: '거래처 목록 / 거래처명 검색 (q 있으면 전체 공유 검색)',
  })
  findAll(
    @CurrentUser() user: AuthUserPayload,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('source') source?: string,
  ) {
    // 관리자 + page 지정 → 페이지 응답 { items, total, page, pageSize }
    if (user.role === 'admin' && page !== undefined) {
      return this.partnersService.findPage({
        page: Number(page),
        pageSize: Number(pageSize ?? 50),
        search,
        source,
      });
    }
    return this.partnersService.findAll(user, q);
  }

  @Get('options')
  @ApiOperation({ summary: '등록·수정 폼 추천값 (구분·구분2·중앙)' })
  options() {
    return this.partnersService.options();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '거래처 등록' })
  create(@CurrentUser() user: AuthUserPayload, @Body() dto: CreatePartnerDto) {
    return this.partnersService.create(user, dto);
  }

  @Post('bulk-import/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '거래처 일괄 등록 미리보기 (저장하지 않음, 관리자)',
    description:
      '양식 칸: 거래처명 | 구분 | 구분2 | 중앙 | 담당자 | 휴대폰 | 유선전화 | 주소 | 거래처증거자료(그림). 거래처명+주소가 같은 기존 거래처는 수정으로 판정합니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody('file', '거래처 일괄 등록 엑셀(.xlsx)'))
  @UseInterceptors(bulkFileInterceptor)
  previewBulkImport(
    @CurrentUser() user: AuthUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertAdmin(user);
    return this.partnersService.bulkImport(file, true);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '거래처 일괄 등록 (관리자)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody('file', '거래처 일괄 등록 엑셀(.xlsx)'))
  @UseInterceptors(bulkFileInterceptor)
  bulkImport(
    @CurrentUser() user: AuthUserPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertAdmin(user);
    return this.partnersService.bulkImport(file, false);
  }

  @Patch(':id')
  @ApiOperation({ summary: '거래처 수정' })
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(user, id, dto);
  }

  @Post(':id/evidence')
  @ApiOperation({ summary: '거래처 증거자료(명함·계약서) 이미지 올리기' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody('image', '이미지 (jpg, png, webp, gif, heic)'))
  @UseInterceptors(evidenceInterceptor)
  setEvidence(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.partnersService.setEvidence(user, id, file);
  }

  @Delete(':id/evidence')
  @ApiOperation({ summary: '거래처 증거자료 이미지 지우기' })
  clearEvidence(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.partnersService.clearEvidence(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '거래처 삭제' })
  remove(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.partnersService.remove(user, id);
  }
}
