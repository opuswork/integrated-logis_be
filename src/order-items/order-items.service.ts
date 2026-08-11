import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrderItemDto,
  ReplaceOrderItemDto,
  UpdateOrderItemDto,
} from './dto/order-item.dto';

@Injectable()
export class OrderItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderItemDto) {
    await this.assertOrderExists(dto.orderId);

    return this.prisma.orderItem.create({
      data: {
        orderId: dto.orderId,
        productName: dto.productName,
        quantity: dto.quantity ?? 1,
        price: dto.price,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });
  }

  findAll(orderId?: number) {
    return this.prisma.orderItem.findMany({
      where: orderId ? { orderId } : undefined,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException({ message: '주문 상품을 찾을 수 없습니다.' });
    }

    return item;
  }

  async replace(id: number, dto: ReplaceOrderItemDto) {
    await this.findOne(id);

    if (dto.orderId != null) {
      await this.assertOrderExists(dto.orderId);
    }

    return this.prisma.orderItem.update({
      where: { id },
      data: {
        ...(dto.orderId !== undefined ? { orderId: dto.orderId } : {}),
        productName: dto.productName,
        quantity: dto.quantity,
        price: dto.price,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });
  }

  async update(id: number, dto: UpdateOrderItemDto) {
    await this.findOne(id);

    if (dto.orderId != null) {
      await this.assertOrderExists(dto.orderId);
    }

    return this.prisma.orderItem.update({
      where: { id },
      data: {
        ...(dto.orderId !== undefined ? { orderId: dto.orderId } : {}),
        ...(dto.productName !== undefined
          ? { productName: dto.productName }
          : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.orderItem.delete({ where: { id } });
  }

  private async assertOrderExists(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!order) {
      throw new BadRequestException({
        message: `주문(ID: ${orderId})을 찾을 수 없습니다.`,
      });
    }
  }
}
