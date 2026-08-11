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
  CreateOrderItemDto,
  ReplaceOrderItemDto,
  UpdateOrderItemDto,
} from './dto/order-item.dto';
import { OrderItemsService } from './order-items.service';

@ApiTags('order-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('order-items')
export class OrderItemsController {
  constructor(private readonly orderItemsService: OrderItemsService) {}

  @Post()
  @ApiOperation({
    summary: '주문 상품 생성',
    description: '특정 주문(orderId)에 OrderItem을 추가합니다.',
  })
  @ApiCreatedResponse({ description: '생성된 주문 상품' })
  create(@Body() dto: CreateOrderItemDto) {
    return this.orderItemsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: '주문 상품 목록',
    description: '전체 상품 또는 orderId 쿼리로 특정 주문 상품만 조회합니다.',
  })
  @ApiQuery({
    name: 'orderId',
    required: false,
    type: Number,
    description: '특정 주문의 상품만 조회',
  })
  @ApiOkResponse({ description: '주문 상품 목록' })
  findAll(@Query('orderId') orderId?: string) {
    const parsed =
      orderId != null && orderId !== '' ? Number(orderId) : undefined;
    return this.orderItemsService.findAll(
      parsed != null && !Number.isNaN(parsed) ? parsed : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '주문 상품 단건 조회' })
  @ApiOkResponse({ description: '주문 상품 상세' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orderItemsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: '주문 상품 전체 수정 (PUT)',
    description: 'productName, quantity, price를 모두 교체합니다.',
  })
  @ApiOkResponse({ description: '수정된 주문 상품' })
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceOrderItemDto,
  ) {
    return this.orderItemsService.replace(id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '주문 상품 부분 수정 (PATCH)',
    description: '전달된 필드만 부분 수정합니다.',
  })
  @ApiOkResponse({ description: '수정된 주문 상품' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.orderItemsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '주문 상품 삭제' })
  @ApiOkResponse({ description: '삭제된 주문 상품' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.orderItemsService.remove(id);
  }
}
