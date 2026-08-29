import { ChatMessageKind } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** 채팅에 표시할 역할 라벨. 프론트 formatAdminHeaderLabel과 같은 규칙 */
export function buildChatSenderLabel(user: {
  role: string;
  adminRegion?: string | null;
  canApproveGreeting?: boolean;
}) {
  const role = user.role.toUpperCase();

  if (role === 'FACTORY') {
    return user.canApproveGreeting ? '인사장 승인' : '공장관리자';
  }

  if (role === 'ADMIN') {
    const region = user.adminRegion ?? null;
    if (region === 'NAMBU') return '남부매장 관리자';
    if (region === 'JUNGBU') return '중부매장 관리자';
    if (region === 'SEOBU') return '서부매장 관리자';
    return '최고관리자';
  }

  return '회원';
}

/** 채팅 참여 대상 (매장·공장 관리자) */
export function isChatParticipantRole(role: string) {
  const value = role.toUpperCase();
  return value === 'ADMIN' || value === 'FACTORY';
}

/** 같은 사람이 짧은 간격으로 재로그인할 때 접속 알림이 쌓이지 않도록 하는 간격 */
const ANNOUNCE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * 로그인 시 접속 알림을 채팅에 남깁니다.
 * 채팅 기록 실패가 로그인을 막으면 안 되므로 오류는 로그만 남깁니다.
 */
export async function announceLogin(
  prisma: PrismaService,
  user: {
    id: number;
    fullname: string;
    username: string;
    role: string;
    adminRegion?: string | null;
    canApproveGreeting?: boolean;
  },
) {
  if (!isChatParticipantRole(user.role)) {
    return;
  }

  const senderName = user.fullname?.trim() || user.username;
  const senderLabel = buildChatSenderLabel(user);

  try {
    const recent = await prisma.chatMessage.findFirst({
      where: {
        kind: ChatMessageKind.SYSTEM,
        senderId: user.id,
        createdAt: { gt: new Date(Date.now() - ANNOUNCE_COOLDOWN_MS) },
      },
      select: { id: true },
    });

    if (recent) {
      return;
    }

    await prisma.chatMessage.create({
      data: {
        kind: ChatMessageKind.SYSTEM,
        body: `${senderLabel} ${senderName}님 접속하였습니다.`,
        senderName,
        senderLabel,
        senderId: user.id,
      },
    });
  } catch (error) {
    console.error('chat login announce failed:', error);
  }
}
