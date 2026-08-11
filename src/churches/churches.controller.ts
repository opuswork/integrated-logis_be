import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ChurchesService } from './churches.service';
import { BulkCreateChurchesDto } from '../members/dto/bulk-import.dto';
import { CreateChurchDto } from './dto/create-church.dto';
import { ChurchDto } from './dto/church-response.dto';

@ApiTags('churches')
@Controller('churches')
export class ChurchesController {
  constructor(private readonly churchesService: ChurchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '교회 등록' })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        church: { $ref: '#/components/schemas/ChurchDto' },
      },
    },
  })
  create(@Body() createChurchDto: CreateChurchDto) {
    return this.churchesService.create(createChurchDto);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '교회 일괄 등록' })
  bulkImport(@Body() dto: BulkCreateChurchesDto) {
    return this.churchesService.bulkCreate(
      dto.churches,
      dto.skipExisting ?? true,
    );
  }

  @Get()
  @ApiOperation({ summary: '교회 목록 조회' })
  @ApiOkResponse({ type: [ChurchDto] })
  findAll() {
    return this.churchesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '교회 단건 조회' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        church: { $ref: '#/components/schemas/ChurchDto' },
      },
    },
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.churchesService.findOne(id);
  }
}
