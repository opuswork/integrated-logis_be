import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { ChatMessageKind } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildChatSenderLabel, isChatParticipantRole } from './chat-presence';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
/** 보존 기간. 지난 메시지는 새 메시지 저장 시 정리합니다. */
const RETENTION_DAYS = 30;

const chatSelect = {
  id: true,
  kind: true,
  body: true,
  senderId: true,
  senderName: true,
  senderLabel: true,
  createdAt: true,
} as const;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private assertParticipant(actor: AuthUserPayload) {
    if (!isChatParticipantRole(actor.role)) {
      throw new ForbiddenException(
        '매장·공장 관리자만 이용할 수 있는 채팅입니다.',
      );
    }
  }

  /** since가 있으면 그 이후 메시지만, 없으면 최근 메시지를 오름차순으로 반환 */
  async findMessages(
    actor: AuthUserPayload,
    options: { since?: number; limit?: number } = {},
  ) {
    this.assertParticipant(actor);

    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    try {
      if (options.since != null && Number.isFinite(options.since)) {
        return await this.prisma.chatMessage.findMany({
          where: { id: { gt: options.since } },
          select: chatSelect,
          orderBy: { id: 'asc' },
          take: limit,
        });
      }

      const recent = await this.prisma.chatMessage.findMany({
        select: chatSelect,
        orderBy: { id: 'desc' },
        take: limit,
      });

      return recent.reverse();
    } catch (error) {
      console.error('chat messages load failed:', error);
      throw new InternalServerErrorException(
        '대화를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async create(actor: AuthUserPayload, dto: CreateChatMessageDto) {
    this.assertParticipant(actor);

    const body = dto.body?.trim() ?? '';
    if (!body) {
      throw new BadRequestException('메시지를 입력해 주세요.');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        username: true,
        fullname: true,
        role: true,
        adminRegion: true,
        canApproveGreeting: true,
      },
    });

    if (!sender) {
      throw new NotFoundException('회원 정보를 찾을 수 없습니다.');
    }

    try {
      const message = await this.prisma.chatMessage.create({
        data: {
          kind: ChatMessageKind.MESSAGE,
          body,
          senderName: sender.fullname?.trim() || sender.username,
          senderLabel: buildChatSenderLabel(sender),
          senderId: sender.id,
        },
        select: chatSelect,
      });

      await this.pruneOldMessages();

      return message;
    } catch (error) {
      console.error('chat message create failed:', error);
      throw new InternalServerErrorException(
        '메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  private async pruneOldMessages() {
    const threshold = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      await this.prisma.chatMessage.deleteMany({
        where: { createdAt: { lt: threshold } },
      });
    } catch (error) {
      console.error('chat prune failed:', error);
    }
  }
}
