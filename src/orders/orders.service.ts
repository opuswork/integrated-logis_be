import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { GreetingImageStorageService } from '../greeting-form/greeting-image-storage.service';
import {
  AdminActivityAction,
  AdminRegion,
  FulfillmentType,
  OrderStatus,
  PackDept,
  PackagingWorker,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrderDto,
  CreateShipmentDto,
} from './dto/create-order.dto';
import type { DeliveryAction } from './dto/delivery-action.dto';
import type { UpdateAdminChecklistDto } from './dto/update-admin-checklist.dto';
import type { UpdateShipmentOpsDto } from './dto/update-shipment-ops.dto';
import {
  buildOrderNotes,
  estimatedWindowIso,
  isPlaceholderOrderNumber,
  normalizePhoneDigits,
  parseMasterGreetingField,
  parseOrderBulkWorkbook,
  resolveImportStatus,
  type ParsedDetailRow,
  type ParsedGreetingRow,
} from './order-bulk-import';
import { UpdateOrderDto } from './dto/update-order.dto';

const orderInclude = {
  items: true,
  shipment: true,
  greetingForms: {
    select: {
      id: true,
      linkedToOrder: true,
      greetingNumber: true,
      includeSelf: true,
      businessCard: true,
      specialNote: true,
      imageUrl: true,
      content: true,
      quantity: true,
      size: true,
      productName: true,
      receivePlace: true,
      orderId: true,
    },
  },
  user: {
    select: {
      id: true,
      username: true,
      fullname: true,
      phone: true,
      churchId: true,
      church: {
        select: {
          id: true,
          name: true,
          region: true,
          branchCode: true,
          assigner: true,
        },
      },
    },
  },
} as const;

function toDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function parseStoreRegionFromNotes(
  notes: string | null | undefined,
): AdminRegion | null {
  if (!notes) {
    return null;
  }
  if (/주문작업지역:[^/]*남부|지부매장:[^/]*남부/.test(notes)) {
    return AdminRegion.NAMBU;
  }
  if (/주문작업지역:[^/]*중부|지부매장:[^/]*중부/.test(notes)) {
    return AdminRegion.JUNGBU;
  }
  if (/주문작업지역:[^/]*서부|지부매장:[^/]*서부/.test(notes)) {
    return AdminRegion.SEOBU;
  }
  return null;
}

function regionLabel(region: AdminRegion | null | undefined) {
  if (region === AdminRegion.NAMBU) {
    return '남부';
  }
  if (region === AdminRegion.JUNGBU) {
    return '중부';
  }
  if (region === AdminRegion.SEOBU) {
    return '서부';
  }
  return '최고';
}

function formatActivityTimestamp(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}시 ${String(date.getMinutes()).padStart(2, '0')}분 ${String(date.getSeconds()).padStart(2, '0')}초`;
}

function mapShipmentInput(shipment: CreateShipmentDto) {
  return {
    fulfillmentType: shipment.fulfillmentType,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    deliveryAddress: shipment.deliveryAddress,
    estimatedWindow: toDate(shipment.estimatedWindow),
    pickupLocation: shipment.pickupLocation,
    pickupTimeSlot: toDate(shipment.pickupTimeSlot),
    licensePlate: shipment.licensePlate,
    shippedAt: toDate(shipment.shippedAt),
    deliveredAt: toDate(shipment.deliveredAt),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly greetingImages: GreetingImageStorageService,
  ) {}

  create(createOrderDto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.deductStockForItems(tx, createOrderDto.items ?? []);

      return tx.order.create({
        data: {
          orderNumber: createOrderDto.orderNumber,
          userId: createOrderDto.userId,
          status: createOrderDto.status,
          totalAmount: createOrderDto.totalAmount,
          notes: createOrderDto.notes,
          storeRegion: parseStoreRegionFromNotes(createOrderDto.notes),
          items: createOrderDto.items?.length
            ? {
                create: createOrderDto.items.map((item) => ({
                  productName: item.productName,
                  quantity: item.quantity ?? 1,
                  price: item.price,
                })),
              }
            : undefined,
          shipment: createOrderDto.shipment
            ? { create: mapShipmentInput(createOrderDto.shipment) }
            : undefined,
        },
        include: orderInclude,
      });
    });
  }

  /**
   * Decrements StockInventory.stock for catalog products that track stock
   * (null stock = unlimited, skip). Throws if remaining stock is insufficient.
   */
  private async deductStockForItems(
    tx: Prisma.TransactionClient | PrismaService,
    items: Array<{ productName: string; quantity?: number }>,
  ) {
    const qtyByName = new Map<string, number>();

    for (const item of items) {
      const productName = item.productName?.trim();
      if (!productName) {
        continue;
      }
      const quantity = item.quantity ?? 1;
      if (quantity <= 0) {
        continue;
      }
      qtyByName.set(
        productName,
        (qtyByName.get(productName) ?? 0) + quantity,
      );
    }

    for (const [productName, quantity] of qtyByName) {
      const catalog = await tx.stockInventory.findFirst({
        where: { productName },
        select: { id: true, stock: true, productName: true },
      });

      if (!catalog || catalog.stock === null) {
        continue;
      }

      if (catalog.stock < quantity) {
        throw new BadRequestException(
          `"${productName}" 재고가 부족합니다. (남은 재고: ${catalog.stock}개, 요청: ${quantity}개)`,
        );
      }

      await tx.stockInventory.update({
        where: { id: catalog.id },
        data: { stock: catalog.stock - quantity },
      });
    }
  }

  /** Restores catalog stock for tracked products (null stock = unlimited, skip). */
  private async restoreStockForItems(
    tx: Prisma.TransactionClient | PrismaService,
    items: Array<{ productName: string; quantity?: number | null }>,
  ) {
    const qtyByName = new Map<string, number>();

    for (const item of items) {
      const productName = item.productName?.trim();
      if (!productName) {
        continue;
      }
      const quantity = item.quantity ?? 1;
      if (quantity <= 0) {
        continue;
      }
      qtyByName.set(
        productName,
        (qtyByName.get(productName) ?? 0) + quantity,
      );
    }

    for (const [productName, quantity] of qtyByName) {
      const catalog = await tx.stockInventory.findFirst({
        where: { productName },
        select: { id: true, stock: true },
      });

      if (!catalog || catalog.stock === null) {
        continue;
      }

      await tx.stockInventory.update({
        where: { id: catalog.id },
        data: { stock: catalog.stock + quantity },
      });
    }
  }

  private shouldNotifyFactoryOnEdit(status: OrderStatus) {
    return (
      status === OrderStatus.WAITING_FOR_SHIPMENT ||
      status === OrderStatus.PREPARED ||
      status === OrderStatus.LOAD_NOTIFIED
    );
  }

  private canCancelOrderStatus(status: OrderStatus) {
    return this.canEditOrderStatus(status);
  }

  findAll(userId?: number, opts?: { readyForShipment?: boolean }) {
    return this.prisma.order.findMany({
      where: {
        ...(userId !== undefined ? { userId } : {}),
        ...(opts?.readyForShipment === true
          ? { readyForShipment: true }
          : {}),
      },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException({ error: 'Not found' });
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException({ error: 'Not found' });
    }

    return order;
  }

  async update(
    id: number,
    updateOrderDto: UpdateOrderDto,
    actor?: AuthUserPayload,
  ) {
    const existing = await this.findOne(id);
    if (!this.canEditOrderStatus(existing.status)) {
      throw new BadRequestException(
        '배송중 이후 주문은 수정할 수 없습니다.',
      );
    }

    if (actor) {
      const isAdmin = actor.role === 'admin';
      const isOwner = actor.id === existing.userId;
      if (!isAdmin && !isOwner) {
        throw new ForbiddenException('본인 또는 관리자만 주문을 수정할 수 있습니다.');
      }
    }

    const {
      orderNumber,
      userId,
      status,
      totalAmount,
      notes,
      items,
      shipment,
    } = updateOrderDto;

    const notifyFactory = this.shouldNotifyFactoryOnEdit(existing.status);

    return this.prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await this.restoreStockForItems(tx, existing.items);
        await this.deductStockForItems(tx, items);
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        if (items.length > 0) {
          await tx.orderItem.createMany({
            data: items.map((item) => ({
              orderId: id,
              productName: item.productName,
              quantity: item.quantity ?? 1,
              price: item.price,
            })),
          });
        }
      }

      if (shipment !== undefined) {
        const shipmentData = mapShipmentInput(shipment);
        if (existing.shipment) {
          await tx.shipment.update({
            where: { orderId: id },
            data: shipmentData,
          });
        } else {
          await tx.shipment.create({
            data: {
              orderId: id,
              ...shipmentData,
            },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: {
          ...(orderNumber !== undefined ? { orderNumber } : {}),
          ...(userId !== undefined ? { userId } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(totalAmount !== undefined ? { totalAmount } : {}),
          ...(notes !== undefined
            ? {
                notes,
                storeRegion: parseStoreRegionFromNotes(notes),
              }
            : {}),
          ...(notifyFactory
            ? { factoryAlert: '주문서 변경요청발생!' }
            : {}),
        },
        include: orderInclude,
      });
    });
  }

  /** 배송중 이전만 주문 내용 수정 가능 */
  private canEditOrderStatus(status: OrderStatus) {
    return (
      status === OrderStatus.PLACED ||
      status === OrderStatus.WAITING_FOR_SHIPMENT ||
      status === OrderStatus.PREPARED ||
      status === OrderStatus.LOAD_NOTIFIED
    );
  }

  private assertCanMutateOrderRegion(
    order: { storeRegion: AdminRegion | null },
    actor: AuthUserPayload,
  ) {
    if (actor.role === 'admin' && actor.isSuperAdmin) {
      return;
    }
    if (actor.role === 'factory') {
      return;
    }
    if (actor.role === 'admin' && actor.adminRegion) {
      if (order.storeRegion && order.storeRegion !== actor.adminRegion) {
        throw new ForbiddenException(
          '관할 지역이 아닌 주문은 수정할 수 없습니다.',
        );
      }
      return;
    }
    throw new ForbiddenException('이 주문을 수정할 권한이 없습니다.');
  }

  private computeReadyForShipment(order: {
    packagingWorker: PackagingWorker | null;
    orderConfirmedAt: Date | null;
    paymentDone: boolean;
    paymentAuthor: string | null;
    greetingDone: boolean;
    slipDone: boolean;
    slipAuthor: string | null;
    greetingForms?: { id: number }[];
    shipment?: { fulfillmentType: FulfillmentType } | null;
  }) {
    const workerOk = order.packagingWorker != null;
    const confirmOk = order.orderConfirmedAt != null;
    const paymentOk =
      order.paymentDone === true &&
      !!order.paymentAuthor?.trim();
    const needsGreeting = (order.greetingForms?.length ?? 0) > 0;
    const greetingOk = !needsGreeting || order.greetingDone === true;
    const needsSlip =
      order.shipment?.fulfillmentType === FulfillmentType.PARCEL;
    const slipOk =
      !needsSlip ||
      (order.slipDone === true && !!order.slipAuthor?.trim());
    return workerOk && confirmOk && paymentOk && greetingOk && slipOk;
  }

  private async logAdminActivity(params: {
    actor: AuthUserPayload;
    actorName: string;
    action: AdminActivityAction;
    orderId: number;
    orderNumber: string;
    summary: string;
  }) {
    await this.prisma.adminActivity.create({
      data: {
        actorUserId: params.actor.id,
        actorName: params.actorName,
        actorRegion: params.actor.adminRegion,
        action: params.action,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        summary: params.summary,
      },
    });
  }

  private async resolveActorDisplayName(actor: AuthUserPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        fullname: true,
        username: true,
        canApproveGreeting: true,
      },
    });
    const username = user?.username ?? actor.username;
    return {
      name: user?.fullname?.trim() || username || actor.username,
      username,
      canApproveGreeting:
        user?.canApproveGreeting === true || username === '01029647088',
    };
  }

  private assertStaffActor(actor: AuthUserPayload) {
    if (actor.role !== 'admin' && actor.role !== 'factory') {
      throw new ForbiddenException(
        '관리자(매장·공장)만 처리할 수 있습니다.',
      );
    }
  }

  listAdminActivities(limit = 50) {
    return this.prisma.adminActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async updateAdminChecklist(
    id: number,
    dto: UpdateAdminChecklistDto,
    actor: AuthUserPayload,
  ) {
    const order = await this.findOne(id);
    const { name: actorName, canApproveGreeting } =
      await this.resolveActorDisplayName(actor);
    const regionPrefix = `${regionLabel(actor.adminRegion)}매장 관리자`;
    const now = new Date();

    if (dto.action === 'greeting') {
      if (actor.role !== 'factory' || !canApproveGreeting) {
        throw new ForbiddenException(
          '인사장완료는 Factory-G(01029647088) 계정만 확인할 수 있습니다.',
        );
      }
    } else {
      this.assertStaffActor(actor);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('취소된 주문은 수정할 수 없습니다.');
    }

    const data: Prisma.OrderUpdateInput = {};
    let activityAction: AdminActivityAction;
    let summarySuffix: string;

    if (dto.action === 'confirm') {
      if (order.orderConfirmedAt) {
        throw new BadRequestException('이미 주문확인이 완료되었습니다.');
      }
      data.orderConfirmedAt = now;
      data.orderConfirmedBy = actorName;
      if (
        order.status === OrderStatus.PLACED ||
        order.status === OrderStatus.WAITING_FOR_SHIPMENT
      ) {
        data.status = OrderStatus.WAITING_FOR_SHIPMENT;
      }
      activityAction = AdminActivityAction.ORDER_CONFIRM;
      summarySuffix = '주문확인 클릭';
    } else if (dto.action === 'worker') {
      if (!dto.packagingWorker) {
        throw new BadRequestException('작업자(매장/공장)를 선택해 주세요.');
      }
      data.packagingWorker = dto.packagingWorker;
      activityAction = AdminActivityAction.WORKER_SAVE;
      summarySuffix = `작업자 ${dto.packagingWorker === 'STORE' ? '매장' : '공장'} 저장`;
    } else if (dto.action === 'payment') {
      if (order.paymentDone) {
        throw new BadRequestException('이미 결제완료가 확인되었습니다.');
      }
      data.paymentDone = true;
      data.paymentAuthor = actorName;
      activityAction = AdminActivityAction.PAYMENT_SAVE;
      summarySuffix = `결제완료 확인 (${actorName})`;
    } else if (dto.action === 'greeting') {
      if (order.greetingDone) {
        throw new BadRequestException('이미 인사장완료가 확인되었습니다.');
      }
      // Factory-G confirm = Y
      data.greetingDone = true;
      activityAction = AdminActivityAction.GREETING_SAVE;
      summarySuffix = '인사장완료 확인';
    } else if (dto.action === 'slip') {
      if (order.shipment?.fulfillmentType !== FulfillmentType.PARCEL) {
        throw new BadRequestException(
          '기표지완료는 택배 주문에만 적용됩니다.',
        );
      }
      if (order.slipDone) {
        throw new BadRequestException('이미 기표지완료가 확인되었습니다.');
      }
      data.slipDone = true;
      data.slipAuthor = actorName;
      activityAction = AdminActivityAction.SLIP_SAVE;
      summarySuffix = `기표지완료 확인 (${actorName})`;
    } else {
      throw new BadRequestException('지원하지 않는 액션입니다.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: orderInclude,
    });

    const readyForShipment = this.computeReadyForShipment(updated);
    const finalOrder =
      updated.readyForShipment === readyForShipment
        ? updated
        : await this.prisma.order.update({
            where: { id },
            data: { readyForShipment },
            include: orderInclude,
          });

    const actorLabel =
      actor.role === 'factory'
        ? `Factory-G ${actorName}님`
        : `${regionPrefix} ${actorName}님`;
    await this.logAdminActivity({
      actor,
      actorName,
      action: activityAction,
      orderId: id,
      orderNumber: order.orderNumber,
      summary: `${actorLabel}: 주문관리/${order.orderNumber}-${summarySuffix} [${formatActivityTimestamp(now)}]`,
    });

    return finalOrder;
  }

  private startOfTodayLocal() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private parseDateOnly(value: string, label: string) {
    const trimmed = value?.trim();
    if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
    }
    const date = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} 형식이 올바르지 않습니다.`);
    }
    return date;
  }

  private isParcelOrder(order: {
    shipment?: { fulfillmentType: FulfillmentType } | null;
  }) {
    return order.shipment?.fulfillmentType === FulfillmentType.PARCEL;
  }

  async updateShipmentOps(
    id: number,
    dto: UpdateShipmentOpsDto,
    actor: AuthUserPayload,
  ) {
    const order = await this.findOne(id);
    if (!order.readyForShipment) {
      throw new BadRequestException(
        '체크리스트가 완료되지 않은 주문입니다.',
      );
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('취소된 주문은 수정할 수 없습니다.');
    }

    const { name: actorName } = await this.resolveActorDisplayName(actor);
    const regionPrefix = `${regionLabel(actor.adminRegion)}매장 관리자`;
    const now = new Date();
    const data: Prisma.OrderUpdateInput = {};
    let activityAction: AdminActivityAction;
    let summarySuffix: string;
    const parcel = this.isParcelOrder(order);

    if (dto.action === 'setShipDate') {
      this.assertStaffActor(actor);
      if (!dto.shipDate) {
        throw new BadRequestException('출고요청일을 선택해 주세요.');
      }
      const shipDate = this.parseDateOnly(dto.shipDate, '출고요청일');
      if (shipDate < this.startOfTodayLocal()) {
        throw new BadRequestException(
          '출고요청일은 오늘 이후만 선택할 수 있습니다.',
        );
      }
      data.requestedShipDate = shipDate;
      activityAction = AdminActivityAction.SHIP_DATE_SAVE;
      summarySuffix = `출고요청일 ${dto.shipDate} 저장`;
    } else if (dto.action === 'setPackDept') {
      this.assertStaffActor(actor);
      if (!dto.packDept) {
        throw new BadRequestException('포장구분을 선택해 주세요.');
      }
      if (order.packDone) {
        throw new BadRequestException('이미 포장완료된 주문입니다.');
      }
      data.packDept =
        dto.packDept === 'SOCK_PACK'
          ? PackDept.SOCK_PACK
          : PackDept.FACTORY_PACK;
      data.storagePlace =
        dto.packDept === 'SOCK_PACK' ? '양말' : '공장';
      activityAction = AdminActivityAction.PACK_DEPT_SAVE;
      summarySuffix = `포장구분 ${dto.packDept === 'SOCK_PACK' ? '양말부포장' : '공장포장'} 저장`;
    } else if (dto.action === 'completePack') {
      this.assertStaffActor(actor);
      if (!order.packDept) {
        throw new BadRequestException('포장구분을 먼저 저장해 주세요.');
      }
      if (order.packDone) {
        throw new BadRequestException('이미 포장완료된 주문입니다.');
      }
      const pt = dto.packPt?.trim();
      if (!pt) {
        throw new BadRequestException('PT를 입력해 주세요.');
      }
      if (!dto.packDate) {
        throw new BadRequestException('포장완료일을 입력해 주세요.');
      }
      const packDate = this.parseDateOnly(dto.packDate, '포장완료일');
      data.packPt = pt;
      data.packDate = packDate;
      data.packDone = true;
      if (!order.storagePlace) {
        data.storagePlace =
          order.packDept === PackDept.SOCK_PACK ? '양말' : '공장';
      }
      activityAction = AdminActivityAction.PACK_COMPLETE;
      summarySuffix = `포장완료 PT=${pt} / ${dto.packDate}`;
    } else if (dto.action === 'completeRelease') {
      this.assertStaffActor(actor);
      if (!order.packDone) {
        throw new BadRequestException(
          '포장이 완료되지 않아 출고완료할 수 없습니다.',
        );
      }
      if (order.releaseDone) {
        throw new BadRequestException('이미 출고완료된 주문입니다.');
      }
      data.releaseDone = true;
      data.releaseDoneAt = now;
      if (parcel) {
        // 택배: 발송대기 + 최종완료 활성 (최종확인은 아직 미완료)
        data.status = OrderStatus.PREPARED;
      }
      // 상차: 상태 유지, 배송관리에서 최종완료만 활성화
      activityAction = AdminActivityAction.RELEASE_COMPLETE;
      summarySuffix = parcel
        ? '출고완료 → 발송대기'
        : '출고완료 (상차)';
    } else if (dto.action === 'finalComplete') {
      this.assertStaffActor(actor);
      if (!order.releaseDone) {
        throw new BadRequestException(
          '출고완료 후에만 최종완료할 수 있습니다.',
        );
      }
      if (order.finalCompleteDone) {
        throw new BadRequestException('이미 최종완료된 주문입니다.');
      }
      data.finalCompleteDone = true;
      data.status = OrderStatus.SHIPPING;
      if (!parcel) {
        // 상차: 최종확인도 함께 완료
        data.finalConfirmDone = true;
      }
      activityAction = AdminActivityAction.FINAL_COMPLETE;
      summarySuffix = '최종완료 → 발송완료';
    } else if (dto.action === 'finalConfirm') {
      this.assertStaffActor(actor);
      if (!parcel) {
        throw new BadRequestException('상차 주문은 최종확인이 없습니다.');
      }
      if (!order.finalCompleteDone) {
        throw new BadRequestException(
          '배송관리 최종완료 후에만 최종확인할 수 있습니다.',
        );
      }
      if (order.finalConfirmDone) {
        throw new BadRequestException('이미 최종확인된 주문입니다.');
      }
      data.finalConfirmDone = true;
      activityAction = AdminActivityAction.FINAL_CONFIRM;
      summarySuffix = '최종확인 완료';
    } else {
      throw new BadRequestException('지원하지 않는 액션입니다.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: orderInclude,
    });

    const actorLabel =
      actor.role === 'factory'
        ? `공장관리자 ${actorName}님`
        : `${regionPrefix} ${actorName}님`;
    await this.logAdminActivity({
      actor,
      actorName,
      action: activityAction,
      orderId: id,
      orderNumber: order.orderNumber,
      summary: `${actorLabel}: 배송·출고/${order.orderNumber}-${summarySuffix} [${formatActivityTimestamp(now)}]`,
    });

    return updated;
  }

  async clearFactoryAlert(id: number, actor: AuthUserPayload) {
    if (actor.role !== 'factory' && actor.role !== 'admin') {
      throw new ForbiddenException(
        '관리자(매장·공장)만 처리할 수 있습니다.',
      );
    }
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: { factoryAlert: null },
      include: orderInclude,
    });
  }

  async applyDeliveryAction(
    id: number,
    action: DeliveryAction,
    actor: AuthUserPayload,
  ) {
    const order = await this.findOne(id);
    const isAdmin = actor.role === 'admin';
    const isFactory = actor.role === 'factory';
    const isOwner = actor.id === order.userId;

    if (action === 'MEMBER_RECEIVE') {
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException(
          '본인 또는 관리자만 상품수령할 수 있습니다.',
        );
      }
      if (order.status !== OrderStatus.SHIPPING) {
        throw new BadRequestException(
          '상품수령은 발송중 상태에서만 가능합니다.',
        );
      }
      return this.prisma.order.update({
        where: { id },
        data: { status: OrderStatus.RECEIVED },
        include: orderInclude,
      });
    }

    // 회원(본인) 또는 관리자: 배송중 이전 주문서 취소
    if (action === 'CANCEL_ORDER') {
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException(
          '본인 또는 관리자만 주문서를 취소할 수 있습니다.',
        );
      }
      if (!this.canCancelOrderStatus(order.status)) {
        throw new BadRequestException(
          '주문서 취소는 배송중 이전 상태에서만 가능합니다.',
        );
      }
      return this.prisma.$transaction(async (tx) => {
        await this.restoreStockForItems(tx, order.items);
        return tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.CANCELLED,
            factoryAlert: '주문서 변경요청발생!',
          },
          include: orderInclude,
        });
      });
    }

    // 공장: 상차완료 → 발송대기(PREPARED)
    if (action === 'FACTORY_PREPARE') {
      if (!isFactory) {
        throw new ForbiddenException(
          '공장 관리자만 상차완료할 수 있습니다.',
        );
      }
      if (order.status !== OrderStatus.WAITING_FOR_SHIPMENT) {
        throw new BadRequestException(
          '관리자 승인(출고대기) 상태에서만 상차완료 처리할 수 있습니다.',
        );
      }
      return this.prisma.order.update({
        where: { id },
        data: { status: OrderStatus.PREPARED },
        include: orderInclude,
      });
    }

    // 공장: 배송시작 → 배송중(+ shippedAt)
    if (action === 'FACTORY_SHIP') {
      if (!isFactory) {
        throw new ForbiddenException(
          '공장 관리자만 배송시작할 수 있습니다.',
        );
      }
      const canShip =
        order.status === OrderStatus.PREPARED ||
        order.status === OrderStatus.LOAD_NOTIFIED;
      if (!canShip) {
        throw new BadRequestException(
          '발송대기(상차완료) 상태에서만 배송시작할 수 있습니다.',
        );
      }
      const now = new Date();
      return this.prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.SHIPPING,
          shipment: order.shipment
            ? { update: { shippedAt: order.shipment.shippedAt ?? now } }
            : {
                create: {
                  fulfillmentType: 'PARCEL',
                  shippedAt: now,
                },
              },
        },
        include: orderInclude,
      });
    }

    if (!isAdmin) {
      throw new ForbiddenException('관리자만 처리할 수 있습니다.');
    }

    switch (action) {
      case 'ADMIN_APPROVE': {
        if (order.status !== OrderStatus.PLACED) {
          throw new BadRequestException(
            '관리자 승인은 접수완료 상태에서만 가능합니다.',
          );
        }
        return this.prisma.order.update({
          where: { id },
          data: { status: OrderStatus.WAITING_FOR_SHIPMENT },
          include: orderInclude,
        });
      }
      case 'ADMIN_CANCEL_APPROVE': {
        const canCancel =
          order.status === OrderStatus.WAITING_FOR_SHIPMENT ||
          order.status === OrderStatus.PREPARED ||
          order.status === OrderStatus.LOAD_NOTIFIED;
        if (!canCancel) {
          throw new BadRequestException(
            '승인 취소는 배송 시작 전(접수완료·발송대기)에서만 가능합니다.',
          );
        }
        return this.prisma.order.update({
          where: { id },
          data: {
            status: OrderStatus.PLACED,
            factoryAlert: '주문서 변경요청발생!',
          },
          include: orderInclude,
        });
      }
      // 관리자 인수증 수령 → 배송완료
      case 'LOADING_NOTICE': {
        if (order.status !== OrderStatus.SHIPPING) {
          throw new BadRequestException(
            '배송중 상태에서만 인수증 수령 처리할 수 있습니다.',
          );
        }
        const now = new Date();
        return this.prisma.order.update({
          where: { id },
          data: {
            status: OrderStatus.RECEIVED,
            shipment: order.shipment
              ? {
                  update: {
                    shippedAt: order.shipment.shippedAt ?? now,
                    deliveredAt: order.shipment.deliveredAt ?? now,
                  },
                }
              : {
                  create: {
                    fulfillmentType: 'PARCEL',
                    shippedAt: now,
                    deliveredAt: now,
                  },
                },
          },
          include: orderInclude,
        });
      }
      case 'DELIVERY_COMPLETE': {
        if (order.status !== OrderStatus.RECEIVED) {
          throw new BadRequestException(
            '배송완료는 인수증 수령(배송완료) 상태에서만 가능합니다.',
          );
        }
        if (order.shipment?.deliveredAt) {
          return order;
        }
        const now = new Date();
        return this.prisma.order.update({
          where: { id },
          data: {
            shipment: order.shipment
              ? { update: { deliveredAt: now } }
              : {
                  create: {
                    fulfillmentType: 'PARCEL',
                    deliveredAt: now,
                  },
                },
          },
          include: orderInclude,
        });
      }
      case 'PRINT_COMPLETE': {
        if (order.status === OrderStatus.PRINTING_COMPLETE) {
          return order;
        }
        if (
          order.status !== OrderStatus.RECEIVED ||
          !order.shipment?.deliveredAt
        ) {
          throw new BadRequestException(
            '출력완료는 인수증 수령(배송완료) 후 가능합니다.',
          );
        }
        return this.prisma.order.update({
          where: { id },
          data: { status: OrderStatus.PRINTING_COMPLETE },
          include: orderInclude,
        });
      }
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  remove(id: number) {
    return this.prisma.order.delete({ where: { id } });
  }

  async bulkImportFromFile(
    file: Express.Multer.File | undefined,
    actor: AuthUserPayload,
    skipExisting = true,
  ) {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('관리자만 주문 엑셀 일괄 등록을 할 수 있습니다.');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'Excel 파일을 업로드해 주세요.',
      });
    }

    let parsed: Awaited<ReturnType<typeof parseOrderBulkWorkbook>>;
    try {
      parsed = await parseOrderBulkWorkbook(file.buffer);
    } catch (error) {
      throw new BadRequestException({
        message:
          error instanceof Error
            ? error.message
            : '엑셀 파일을 읽지 못했습니다.',
      });
    }

    if (parsed.masters.length === 0) {
      throw new BadRequestException({
        message: '가져올 주문마스터 행이 없습니다.',
      });
    }

    const detailsByOrder = new Map<string, ParsedDetailRow[]>();
    for (const detail of parsed.details) {
      // Keep blank keys so empty master 주문번호 can attach unnumbered detail rows.
      const key = detail.orderNumber.trim();
      const list = detailsByOrder.get(key) ?? [];
      list.push(detail);
      detailsByOrder.set(key, list);
    }

    const greetingsByOrder = new Map<string, ParsedGreetingRow[]>();
    for (const greeting of parsed.greetings) {
      const key = greeting.orderNumber.trim();
      const list = greetingsByOrder.get(key) ?? [];
      list.push(greeting);
      greetingsByOrder.set(key, list);
    }

    const members = await this.prisma.user.findMany({
      where: { role: 'MEMBER' },
      select: { id: true, phone: true, fullname: true },
    });
    const membersByPhone = new Map<string, Array<{ id: number; fullname: string }>>();
    for (const member of members) {
      const key = normalizePhoneDigits(member.phone);
      if (!key) {
        continue;
      }
      const list = membersByPhone.get(key) ?? [];
      list.push({ id: member.id, fullname: member.fullname });
      membersByPhone.set(key, list);
    }

    const summary = {
      requested: parsed.masters.length,
      created: 0,
      skipped: 0,
      failed: 0,
    };
    const createdOrderNumbers: string[] = [];
    const skippedOrderNumbers: string[] = [];
    const failures: Array<{ orderNumber?: string; reason: string }> = [];
    const usedOrderNumbers = new Set<string>();

    const allocateOrderNumber = async (preferred?: string) => {
      if (preferred && !isPlaceholderOrderNumber(preferred)) {
        return preferred.trim();
      }
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = `ORD-${new Date().getFullYear()}-${String(Date.now() + attempt + summary.created * 17)
          .slice(-6)
          .padStart(6, '0')}`;
        if (usedOrderNumbers.has(candidate)) {
          continue;
        }
        const existing = await this.prisma.order.findUnique({
          where: { orderNumber: candidate },
          select: { id: true },
        });
        if (!existing) {
          usedOrderNumbers.add(candidate);
          return candidate;
        }
      }
      throw new Error('주문번호를 자동 발급하지 못했습니다. 다시 시도해 주세요.');
    };

    for (const master of parsed.masters) {
      const originalOrderNumber = master.orderNumber.trim();
      let orderNumber = '';
      try {
        if (
          master.remark.includes('업로드 시 이 샘플 행을 삭제') &&
          master.ordererName.trim() === '홍길동'
        ) {
          summary.skipped += 1;
          skippedOrderNumbers.push(originalOrderNumber || '(샘플)');
          continue;
        }

        if (!master.phone.trim()) {
          throw new Error('연락처가 필요합니다.');
        }
        if (!master.ordererName.trim()) {
          throw new Error('(주문자)성명이 필요합니다.');
        }
        if (!master.orderType.trim()) {
          throw new Error('주문구분이 필요합니다.');
        }
        if (!master.orderDate.trim()) {
          throw new Error('주문일자가 필요합니다.');
        }
        if (!master.churchName.trim()) {
          throw new Error('중앙이 필요합니다.');
        }

        const orderType = master.orderType.trim();
        const isDelivery = orderType.includes('배달');
        const isParcel = orderType.includes('택배') || orderType === '택배';
        if (isParcel && !master.parcelShipDate && !isDelivery) {
          throw new Error('택배 주문은 택배발송일이 필요합니다.');
        }
        if (isDelivery && !master.deliveryDateTime) {
          throw new Error('배달 주문은 배달일시가 필요합니다.');
        }

        const phoneKey = normalizePhoneDigits(master.phone);
        const matched = membersByPhone.get(phoneKey) ?? [];
        if (matched.length === 0) {
          throw new Error(
            `연락처 ${master.phone} 에 해당하는 회원을 찾을 수 없습니다.`,
          );
        }
        if (matched.length > 1) {
          throw new Error(
            `연락처 ${master.phone} 에 해당하는 회원이 ${matched.length}명입니다. 연락처를 확인하세요.`,
          );
        }
        const userId = matched[0].id;

        orderNumber = await allocateOrderNumber(originalOrderNumber);

        const existing = await this.prisma.order.findUnique({
          where: { orderNumber },
          select: { id: true },
        });
        if (existing) {
          if (skipExisting) {
            summary.skipped += 1;
            skippedOrderNumbers.push(orderNumber);
            continue;
          }
          throw new Error(`주문번호 ${orderNumber} 가 이미 존재합니다.`);
        }
        usedOrderNumbers.add(orderNumber);

        // Link details by original sheet order number (including ORD-UPLOAD sample keys)
        let resolvedItems = (detailsByOrder.get(originalOrderNumber) ?? [])
          .slice()
          .sort((a, b) => a.seq - b.seq);

        if (
          resolvedItems.length === 0 &&
          isPlaceholderOrderNumber(originalOrderNumber)
        ) {
          const unnumbered = detailsByOrder.get('') ?? [];
          if (unnumbered.length > 0) {
            resolvedItems = unnumbered.slice().sort((a, b) => a.seq - b.seq);
            detailsByOrder.set('', []);
          }
        }

        if (resolvedItems.length === 0) {
          throw new Error(
            `주문번호 ${originalOrderNumber || '(비어 있음)'} 에 연결된 상품상세가 없습니다.`,
          );
        }

        const resolvedStatus =
          resolveImportStatus(master.orderStatusLabel) ?? {
            status: 'PLACED' as const,
          };
        const status = resolvedStatus.status as OrderStatus;
        const now = new Date();

        const notes = buildOrderNotes(master, resolvedItems);
        const totalAmount = resolvedItems.reduce(
          (sum, item) => sum + item.quantity * (item.unitPrice || 0),
          0,
        );

        const deliveryAddress = master.senderAddress.trim() || undefined;
        const carrier = master.clientContactName.trim() || undefined;
        const window = estimatedWindowIso(master, isDelivery);

        const masterGreeting = parseMasterGreetingField(master.greetingNumber);
        const includeSelfFromMaster =
          masterGreeting.includeSelf ||
          master.greetingSelf === '유' ||
          master.greetingSelf === '자체';
        let orderGreetings = (
          greetingsByOrder.get(originalOrderNumber) ?? []
        ).slice();
        if (
          orderGreetings.length === 0 &&
          isPlaceholderOrderNumber(originalOrderNumber)
        ) {
          const unnumbered = greetingsByOrder.get('') ?? [];
          if (unnumbered.length > 0) {
            orderGreetings = unnumbered.slice();
            greetingsByOrder.set('', []);
          }
        }

        if (masterGreeting.numbers.length > 0 && orderGreetings.length === 0) {
          throw new Error(
            `인사장번호 ${master.greetingNumber} 이(가) 있어 08_인사장_데이터 시트에 해당 주문 행이 필요합니다.`,
          );
        }

        for (const greeting of orderGreetings) {
          if (!/^[1-4]$/.test(greeting.greetingNumber)) {
            throw new Error(
              `08시트 행 ${greeting.rowIndex}: 인사장번호는 1~4 여야 합니다.`,
            );
          }
          if (!greeting.content.trim()) {
            throw new Error(
              `08시트 행 ${greeting.rowIndex}: 인사장내용이 필요합니다.`,
            );
          }
          if (!greeting.receivePlace.trim()) {
            throw new Error(
              `08시트 행 ${greeting.rowIndex}: 받을곳이 필요합니다.`,
            );
          }
        }

        await this.deductStockForItems(
          this.prisma,
          resolvedItems.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
          })),
        );

        const createdOrder = await this.prisma.order.create({
          data: {
            orderNumber,
            userId,
            status,
            totalAmount,
            notes,
            items: {
              create: resolvedItems.map((item) => ({
                productName: item.productName,
                quantity: item.quantity,
                price: item.unitPrice || 0,
              })),
            },
            shipment: {
              create: {
                fulfillmentType: isDelivery
                  ? FulfillmentType.PICKUP
                  : FulfillmentType.PARCEL,
                carrier,
                deliveryAddress,
                estimatedWindow: window ? new Date(window) : undefined,
                ...(resolvedStatus.shippedAt ? { shippedAt: now } : {}),
                ...(resolvedStatus.deliveredAt ? { deliveredAt: now } : {}),
              },
            },
          },
        });

        for (const greeting of orderGreetings) {
          const includeSelf =
            greeting.includeSelf || includeSelfFromMaster;

          let imageUrl = '';
          let imageStoredName = 'excel-import-pending';
          let imageOriginalName = 'excel-import-pending.png';

          if (greeting.imageBuffer?.length) {
            const ext = (greeting.imageExtension || 'jpeg').replace(
              /^\./,
              '',
            );
            const stored = await this.greetingImages.storeBuffer({
              buffer: greeting.imageBuffer,
              originalName: `excel-greeting-${greeting.greetingNumber}.${ext}`,
              mimeType:
                ext === 'png'
                  ? 'image/png'
                  : ext === 'gif'
                    ? 'image/gif'
                    : ext === 'webp'
                      ? 'image/webp'
                      : 'image/jpeg',
            });
            imageUrl = stored.imageUrl;
            imageStoredName = stored.imageStoredName;
            imageOriginalName = stored.imageOriginalName;
          }

          await this.prisma.greetingForm.create({
            data: {
              greetingNumber: greeting.greetingNumber,
              includeSelf,
              imageUrl,
              imageStoredName,
              imageOriginalName,
              content: greeting.content.trim(),
              quantity: greeting.quantity,
              size: greeting.size || '8칸',
              productName:
                greeting.productName.trim() ||
                resolvedItems[0]?.productName ||
                null,
              receivePlace: greeting.receivePlace.trim(),
              specialNote: greeting.specialNote.trim() || null,
              businessCard: greeting.businessCard || '미동봉',
              ordererName:
                greeting.ordererName.trim() || master.ordererName.trim(),
              churchName:
                greeting.churchName.trim() || master.churchName.trim(),
              phone: greeting.phone.trim() || master.phone.trim(),
              linkedToOrder: true,
              submitted: true,
              orderId: createdOrder.id,
              userId,
            },
          });
        }

        summary.created += 1;
        createdOrderNumbers.push(orderNumber);
      } catch (error) {
        summary.failed += 1;
        failures.push({
          orderNumber: orderNumber || undefined,
          reason:
            error instanceof Error
              ? `행 ${master.rowIndex}: ${error.message}`
              : `행 ${master.rowIndex}: 알 수 없는 오류`,
        });
      }
    }

    return {
      ...summary,
      createdOrderNumbers,
      skippedOrderNumbers,
      failures,
    };
  }
}
