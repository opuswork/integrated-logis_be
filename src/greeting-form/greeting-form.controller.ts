import {
  Body,
  Controller,
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
import {
  CreateGreetingFormDto,
  LinkGreetingToOrderDto,
} from './dto/greeting-form.dto';
import { GreetingFormService } from './greeting-form.service';

@ApiTags('greeting-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('greeting-forms')
export class GreetingFormController {
  constructor(private readonly greetingFormService: GreetingFormService) {}

  @Post()
  @ApiOperation({ summary: '인사장 저장 / 인사장만 접수' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'greetingNumber',
        'content',
        'quantity',
        'size',
        'receivePlace',
        'linkedToOrder',
      ],
      properties: {
        image: { type: 'string', format: 'binary' },
        greetingNumber: { type: 'string' },
        includeSelf: { type: 'boolean' },
        content: { type: 'string' },
        quantity: { type: 'integer' },
        size: { type: 'string' },
        productName: { type: 'string' },
        receivePlace: { type: 'string' },
        specialNote: { type: 'string' },
        businessCard: { type: 'string' },
        ordererName: { type: 'string' },
        churchName: { type: 'string' },
        phone: { type: 'string' },
        linkedToOrder: { type: 'boolean' },
        submitted: { type: 'boolean' },
        userId: { type: 'integer' },
        orderId: { type: 'integer' },
      },
    },
  })
  @ApiCreatedResponse({ description: '생성된 인사장' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateGreetingFormDto,
  ) {
    return this.greetingFormService.create(dto, file);
  }

  @Get()
  @ApiOperation({ summary: '인사장 목록' })
  @ApiQuery({ name: 'linkedToOrder', required: false, type: Boolean })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: Number,
    description: '관리자만 사용. 회원이면 본인 인사장만 반환',
  })
  @ApiOkResponse({ description: '인사장 목록' })
  findAll(
    @CurrentUser() user: AuthUserPayload,
    @Query('linkedToOrder') linkedToOrder?: string,
    @Query('userId') userId?: string,
  ) {
    const parsedLinked =
      linkedToOrder === undefined
        ? undefined
        : linkedToOrder === 'true' || linkedToOrder === '1';
    if (user.role === 'member') {
      return this.greetingFormService.findAll(parsedLinked, user.id);
    }
    const parsedUserId = userId ? Number(userId) : NaN;
    return this.greetingFormService.findAll(
      parsedLinked,
      Number.isFinite(parsedUserId) ? parsedUserId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '인사장 상세' })
  @ApiOkResponse({ description: '인사장 상세' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.greetingFormService.findOne(id);
  }

  @Patch(':id/link-order')
  @ApiOperation({ summary: '인사장을 주문에 연결' })
  @ApiOkResponse({ description: '연결된 인사장' })
  linkToOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkGreetingToOrderDto,
  ) {
    return this.greetingFormService.linkToOrder(id, dto);
  }
}
