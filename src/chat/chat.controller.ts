import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('messages')
  @ApiOperation({
    summary: '관리자 채팅 메시지 조회',
    description:
      'since를 주면 그 id 이후 메시지만, 없으면 최근 메시지를 반환합니다. 매장·공장 관리자 전용.',
  })
  findMessages(
    @CurrentUser() user: AuthUserPayload,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const sinceId = since != null && since !== '' ? Number(since) : undefined;
    const take = limit != null && limit !== '' ? Number(limit) : undefined;

    return this.chatService.findMessages(user, {
      since: Number.isFinite(sinceId) ? sinceId : undefined,
      limit: Number.isFinite(take) ? take : undefined,
    });
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '관리자 채팅 메시지 전송' })
  create(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.chatService.create(user, dto);
  }
}
