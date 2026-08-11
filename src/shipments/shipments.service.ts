import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateShipmentDto,
  ReplaceShipmentDto,
  UpdateShipmentDto,
} from './dto/shipment.dto';

function toDate(value?: string | null) {
  return value ? new Date(value) : undefined;
}

function mapShipmentFields(
  dto: CreateShipmentDto | ReplaceShipmentDto | UpdateShipmentDto,
) {
  return {
    ...(dto.fulfillmentType !== undefined
      ? { fulfillmentType: dto.fulfillmentType }
      : {}),
    ...(dto.carrier !== undefined ? { carrier: dto.carrier } : {}),
    ...(dto.trackingNumber !== undefined
      ? { trackingNumber: dto.trackingNumber }
      : {}),
    ...(dto.deliveryAddress !== undefined
      ? { deliveryAddress: dto.deliveryAddress }
      : {}),
    ...(dto.estimatedWindow !== undefined
      ? { estimatedWindow: toDate(dto.estimatedWindow) }
      : {}),
    ...(dto.pickupLocation !== undefined
      ? { pickupLocation: dto.pickupLocation }
      : {}),
    ...(dto.pickupTimeSlot !== undefined
      ? { pickupTimeSlot: toDate(dto.pickupTimeSlot) }
      : {}),
    ...(dto.licensePlate !== undefined
      ? { licensePlate: dto.licensePlate }
      : {}),
    ...(dto.shippedAt !== undefined ? { shippedAt: toDate(dto.shippedAt) } : {}),
    ...(dto.deliveredAt !== undefined
      ? { deliveredAt: toDate(dto.deliveredAt) }
      : {}),
  };
}

const shipmentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
    },
  },
} as const;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShipmentDto) {
    await this.assertOrderExists(dto.orderId);

    const existing = await this.prisma.shipment.findUnique({
      where: { orderId: dto.orderId },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        message: `주문(ID: ${dto.orderId})에 이미 배송 정보가 있습니다.`,
      });
    }

    return this.prisma.shipment.create({
      data: {
        orderId: dto.orderId,
        ...mapShipmentFields(dto),
      },
      include: shipmentInclude,
    });
  }

  findAll(orderId?: number) {
    return this.prisma.shipment.findMany({
      where: orderId ? { orderId } : undefined,
      include: shipmentInclude,
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: shipmentInclude,
    });

    if (!shipment) {
      throw new NotFoundException({ message: '배송 정보를 찾을 수 없습니다.' });
    }

    return shipment;
  }

  async replace(id: number, dto: ReplaceShipmentDto) {
    await this.findOne(id);

    if (dto.orderId != null) {
      await this.assertOrderExists(dto.orderId);
      await this.assertOrderAvailableForShipment(dto.orderId, id);
    }

    return this.prisma.shipment.update({
      where: { id },
      data: {
        ...(dto.orderId !== undefined ? { orderId: dto.orderId } : {}),
        fulfillmentType: dto.fulfillmentType,
        carrier: dto.carrier ?? null,
        trackingNumber: dto.trackingNumber ?? null,
        deliveryAddress: dto.deliveryAddress ?? null,
        estimatedWindow: dto.estimatedWindow
          ? new Date(dto.estimatedWindow)
          : null,
        pickupLocation: dto.pickupLocation ?? null,
        pickupTimeSlot: dto.pickupTimeSlot
          ? new Date(dto.pickupTimeSlot)
          : null,
        licensePlate: dto.licensePlate ?? null,
        shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : null,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : null,
      },
      include: shipmentInclude,
    });
  }

  async update(id: number, dto: UpdateShipmentDto) {
    await this.findOne(id);

    if (dto.orderId != null) {
      await this.assertOrderExists(dto.orderId);
      await this.assertOrderAvailableForShipment(dto.orderId, id);
    }

    return this.prisma.shipment.update({
      where: { id },
      data: {
        ...(dto.orderId !== undefined ? { orderId: dto.orderId } : {}),
        ...mapShipmentFields(dto),
      },
      include: shipmentInclude,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.shipment.delete({ where: { id } });
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

  private async assertOrderAvailableForShipment(
    orderId: number,
    currentShipmentId: number,
  ) {
    const existing = await this.prisma.shipment.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (existing && existing.id !== currentShipmentId) {
      throw new ConflictException({
        message: `주문(ID: ${orderId})에 이미 다른 배송 정보가 있습니다.`,
      });
    }
  }
}
