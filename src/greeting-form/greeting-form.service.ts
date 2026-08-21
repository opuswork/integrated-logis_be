import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateGreetingFormDto,
  LinkGreetingToOrderDto,
} from './dto/greeting-form.dto';
import { GreetingImageStorageService } from './greeting-image-storage.service';

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

    const businessCard = dto.businessCard?.trim() || '선택하세요';
    if (businessCard !== '동봉' && businessCard !== '미동봉') {
      throw new BadRequestException('명함 동봉 여부를 선택해 주세요.');
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
    } else {
      const catalogUrl = catalogImageByNumber[dto.greetingNumber];
      if (!catalogUrl) {
        throw new BadRequestException('인사장 번호를 선택해 주세요.');
      }
      // 카탈로그 미리보기 이미지를 저장 경로로 사용 (별도 첨부 없음)
      imageUrl = catalogUrl;
      imageStoredName = `catalog-greeting-${dto.greetingNumber}.jpg`;
      imageOriginalName = `인사장${dto.greetingNumber}번.jpg`;
    }

    return this.prisma.greetingForm.create({
      data: {
        greetingNumber: dto.greetingNumber,
        includeSelf: dto.includeSelf,
        imageUrl,
        imageStoredName,
        imageOriginalName,
        content: dto.content.trim(),
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
}
