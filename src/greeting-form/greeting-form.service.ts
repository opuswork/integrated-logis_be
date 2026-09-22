import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { AdminActivityAction } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateGreetingFormDto,
  LinkGreetingToOrderDto,
} from './dto/greeting-form.dto';
import { GreetingImageStorageService } from './greeting-image-storage.service';

/** orders.service의 관리자 활동 로그와 같은 시각 표기 */
function formatActivityTimestamp(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}시 ${String(date.getMinutes()).padStart(2, '0')}분 ${String(date.getSeconds()).padStart(2, '0')}초`;
}

@Injectable()
export class GreetingFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: GreetingImageStorageService,
  ) {}

  async create(dto: CreateGreetingFormDto, file?: Express.Multer.File) {
    if (dto.linkedToOrder && !dto.productName?.trim()) {
      throw new BadRequestException(
        '제품주문 연계 인사장은 제품명이 필요합니다.',
      );
    }

    const businessCardRaw = dto.businessCard?.trim() || '';
    const businessCard =
      businessCardRaw === '동봉'
        ? '동봉'
        : businessCardRaw === '미동봉'
          ? '미동봉'
          : '미동봉';
    const greetingNumber = dto.greetingNumber?.trim() ?? '';
    const hasCatalog = ['1', '2', '3', '4'].includes(greetingNumber);
    const includeSelf = dto.includeSelf === true;
    const includeCard = businessCard === '동봉';

    if (!hasCatalog && !includeSelf && !includeCard) {
      throw new BadRequestException(
        '인사장번호, 자체, 명함 중 하나 이상을 선택해 주세요.',
      );
    }
    if (hasCatalog && !dto.content?.trim()) {
      throw new BadRequestException('인사장내용을 입력해 주세요.');
    }

    const catalogImageByNumber: Record<string, string> = {
      '1': '/assets/greeting_form/images/인사장1번.jpg',
      '2': '/assets/greeting_form/images/인사장2번.jpg',
      '3': '/assets/greeting_form/images/인사장3번.jpg',
      '4': '/assets/greeting_form/images/인사장4번.jpg',
    };

    let imageUrl: string;
    let imageStoredName: string;
    let imageOriginalName: string;

    if (file) {
      const stored = await this.imageStorage.store(file);
      imageUrl = stored.imageUrl;
      imageStoredName = stored.imageStoredName;
      imageOriginalName = stored.imageOriginalName;
    } else if (hasCatalog) {
      const catalogUrl = catalogImageByNumber[greetingNumber];
      imageUrl = catalogUrl;
      imageStoredName = `catalog-greeting-${greetingNumber}.jpg`;
      imageOriginalName = `인사장${greetingNumber}번.jpg`;
    } else {
      imageUrl = '';
      imageStoredName = '';
      imageOriginalName = '';
    }

    return this.prisma.greetingForm.create({
      data: {
        greetingNumber: hasCatalog ? greetingNumber : '',
        includeSelf,
        imageUrl,
        imageStoredName,
        imageOriginalName,
        content: dto.content?.trim() ?? '',
        quantity: dto.quantity,
        size: dto.size,
        productName: dto.linkedToOrder ? dto.productName?.trim() || null : null,
        receivePlace: dto.receivePlace.trim(),
        specialNote: dto.specialNote?.trim() || null,
        businessCard,
        ordererName: dto.ordererName?.trim() || null,
        churchName: dto.churchName?.trim() || null,
        phone: dto.phone?.trim() || null,
        linkedToOrder: dto.linkedToOrder,
        submitted: dto.submitted ?? !dto.linkedToOrder,
        userId: dto.userId,
        orderId: dto.orderId,
      },
    });
  }

  findAll(linkedToOrder?: boolean, userId?: number) {
    return this.prisma.greetingForm.findMany({
      where: {
        ...(typeof linkedToOrder === 'boolean' ? { linkedToOrder } : {}),
        ...(userId !== undefined ? { userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, orderNumber: true } },
        user: { select: { id: true, fullname: true, phone: true } },
      },
    });
  }

  async findOne(id: number) {
    const row = await this.prisma.greetingForm.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderNumber: true } },
        user: { select: { id: true, fullname: true, phone: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('인사장 데이터를 찾을 수 없습니다.');
    }
    return row;
  }

  async linkToOrder(id: number, dto: LinkGreetingToOrderDto) {
    await this.findOne(id);
    return this.prisma.greetingForm.update({
      where: { id },
      data: {
        orderId: dto.orderId,
        linkedToOrder: true,
        submitted: true,
      },
    });
  }

  /**
   * 인사장관리 "완료": 공장 계정(인사장 승인 + 공장관리자)만.
   * 제품주문 연계 건이면 해당 주문의 인사장완료(greetingDone)도 함께 Y.
   * readyForShipment는 주문 목록 조회 시 healReadyForShipmentFlags가 보정한다.
   */
  async complete(id: number, actor: AuthUserPayload) {
    if (actor.role !== 'factory') {
      throw new ForbiddenException(
        '인사장 완료는 공장 계정만 처리할 수 있습니다.',
      );
    }
    const form = await this.prisma.greetingForm.findUnique({
      where: { id },
      include: {
        order: {
          select: { id: true, orderNumber: true, greetingDone: true },
        },
      },
    });
    if (!form) {
      throw new NotFoundException('인사장을 찾을 수 없습니다.');
    }
    if (form.completedAt) {
      return form;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { fullname: true, username: true },
    });
    const actorName =
      user?.fullname?.trim() || user?.username || actor.username;
    const now = new Date();
    const linkedOrder =
      form.linkedToOrder && form.order && !form.order.greetingDone
        ? form.order
        : null;

    const [updated] = await this.prisma.$transaction([
      this.prisma.greetingForm.update({
        where: { id },
        data: { completedAt: now, completedBy: actorName },
        include: {
          order: {
            select: { id: true, orderNumber: true, greetingDone: true },
          },
        },
      }),
      ...(linkedOrder
        ? [
            this.prisma.order.update({
              where: { id: linkedOrder.id },
              data: { greetingDone: true },
            }),
            this.prisma.adminActivity.create({
              data: {
                actorUserId: actor.id,
                actorName,
                actorRegion: actor.adminRegion,
                action: AdminActivityAction.GREETING_SAVE,
                orderId: linkedOrder.id,
                orderNumber: linkedOrder.orderNumber,
                summary: `공장 ${actorName}님: 인사장관리/${linkedOrder.orderNumber}-인사장완료 확인 (인사장 #${id} 완료) [${formatActivityTimestamp(now)}]`,
              },
            }),
          ]
        : []),
    ]);
    return updated;
  }
}
