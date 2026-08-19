import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { DeliveryActionDto } from './dto/delivery-action.dto';
import { UpdateAdminChecklistDto } from './dto/update-admin-checklist.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: '주문 생성',
    description: 'Order, OrderItem[], Shipment를 한 번에 생성할 수 있습니다.',
  })
  @ApiCreatedResponse({ description: '생성된 주문 (items, shipment 포함)' })
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Post('bulk-import')
  @ApiOperation({
    summary: '주문 엑셀 일괄 등록',
    description:
      '주문마스터(06) + 상품상세(07) 양식 .xlsx를 업로드합니다. 연락처로 회원을 매칭합니다.',
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
          description: '주문 일괄등록 Excel 파일',
        },
        skipExisting: {
          type: 'boolean',
          default: true,
          description: 'true면 이미 있는 주문번호는 건너뜁니다',
        },
      },
    },
  })
  @ApiOkResponse({ description: '일괄 등록 결과 요약' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  bulkImport(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUserPayload,
    @Body('skipExisting') skipExisting?: string | boolean,
  ) {
    const skip =
      skipExisting === undefined
        ? true
        : skipExisting === true ||
          skipExisting === 'true' ||
          skipExisting === '1';

    return this.ordersService.bulkImportFromFile(file, user, skip);
  }

  @Get()
  @ApiOperation({ summary: '주문 목록' })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: Number,
    description: '관리자만 사용. 회원이면 본인 주문만 반환',
  })
  @ApiOkResponse({ description: '주문 목록 (items, shipment, user 포함)' })
  findAll(
    @CurrentUser() user: AuthUserPayload,
    @Query('userId') userId?: string,
  ) {
    if (user.role === 'member') {
      return this.ordersService.findAll(user.id);
    }

    const parsed = userId ? Number(userId) : NaN;
    return this.ordersService.findAll(
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get('admin-activities')
  @ApiOperation({ summary: '관리자 액션 알림 목록' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAdminActivities(
    @CurrentUser() user: AuthUserPayload,
    @Query('limit') limit?: string,
  ) {
    if (user.role !== 'admin' && user.role !== 'factory') {
      return [];
    }
    const parsed = limit ? Number(limit) : 50;
    return this.ordersService.listAdminActivities(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '주문 상세' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/admin-checklist')
  @ApiOperation({
    summary: '관리자 주문 체크리스트 저장',
    description:
      'confirm | worker | payment | greeting | slip. 관할 지역 검증 및 readyForShipment 재계산.',
  })
  @ApiOkResponse({ description: '갱신된 주문' })
  updateAdminChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAdminChecklistDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.ordersService.updateAdminChecklist(id, body, user);
  }

  @Patch(':id/delivery-action')
  @ApiOperation({
    summary: '배달 주문 배송 상태 전이',
    description:
      '관리자: ADMIN_APPROVE / ADMIN_CANCEL_APPROVE / LOADING_NOTICE(인수증수령) / PRINT_COMPLETE. 공장: FACTORY_PREPARE(상차완료) / FACTORY_SHIP(배송시작). 회원: MEMBER_RECEIVE(레거시)',
  })
  @ApiOkResponse({ description: '갱신된 주문' })
  applyDeliveryAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DeliveryActionDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.ordersService.applyDeliveryAction(id, body.action, user);
  }

  @Patch(':id/factory-alert')
  @ApiOperation({
    summary: '공장 알림 확인(클리어)',
    description: 'factoryAlert를 null로 지웁니다. 공장/관리자만 가능.',
  })
  @ApiOkResponse({ description: '갱신된 주문' })
  clearFactoryAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.ordersService.clearFactoryAlert(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: '주문 수정' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.ordersService.update(id, updateOrderDto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: '주문 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
