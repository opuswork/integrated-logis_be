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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateShipmentDto,
  ReplaceShipmentDto,
  UpdateShipmentDto,
} from './dto/shipment.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  @ApiOperation({
    summary: '배송 정보 생성',
    description: '주문당 배송 정보는 1건만 생성할 수 있습니다.',
  })
  @ApiCreatedResponse({ description: '생성된 배송 정보' })
  create(@Body() dto: CreateShipmentDto) {
    return this.shipmentsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: '배송 정보 목록',
    description: '전체 배송 또는 orderId 쿼리로 특정 주문 배송만 조회합니다.',
  })
  @ApiQuery({
    name: 'orderId',
    required: false,
    type: Number,
    description: '특정 주문의 배송 정보만 조회',
  })
  @ApiOkResponse({ description: '배송 정보 목록' })
  findAll(@Query('orderId') orderId?: string) {
    const parsed =
      orderId != null && orderId !== '' ? Number(orderId) : undefined;
    return this.shipmentsService.findAll(
      parsed != null && !Number.isNaN(parsed) ? parsed : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '배송 정보 단건 조회' })
  @ApiOkResponse({ description: '배송 정보 상세' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: '배송 정보 전체 수정 (PUT)',
    description: 'fulfillmentType 및 배송 필드를 전체 교체합니다.',
  })
  @ApiOkResponse({ description: '수정된 배송 정보' })
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceShipmentDto,
  ) {
    return this.shipmentsService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '배송 정보 부분 수정 (PATCH)',
    description: '전달된 필드만 부분 수정합니다.',
  })
  @ApiOkResponse({ description: '수정된 배송 정보' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
  ) {
    return this.shipmentsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '배송 정보 삭제' })
  @ApiOkResponse({ description: '삭제된 배송 정보' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentsService.remove(id);
  }
}
