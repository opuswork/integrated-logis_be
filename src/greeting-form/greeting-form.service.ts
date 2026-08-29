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
}
