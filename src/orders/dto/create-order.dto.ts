import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { FulfillmentType, OrderStatus } from '../../generated/prisma/enums';

export class CreateOrderItemDto {
  @ApiProperty({ example: '명진1호' })
  @IsString()
  productName!: string;

  @ApiPropertyOptional({ example: 300, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber()
  price!: number;
}

export class CreateShipmentDto {
  @ApiPropertyOptional({ enum: FulfillmentType, default: 'PARCEL' })
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType;

  @ApiPropertyOptional({ example: 'Sanc-Trucking-04' })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({ example: 'TRK-2026-0001' })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ example: '서울시 강남구 테헤란로 123' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: '2026-01-15T09:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  estimatedWindow?: string;

  @ApiPropertyOptional({ example: '일동 물류센터' })
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional({ example: '2026-01-15T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  pickupTimeSlot?: string;

  @ApiPropertyOptional({ example: '12가3456' })
  @IsOptional()
  @IsString()
  licensePlate?: string;

  @ApiPropertyOptional({ example: '2026-01-14T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional({ example: '2026-01-15T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deliveredAt?: string;
}

export class OrdererProfileDto {
  @ApiProperty({ example: '홍길동' })
  @IsString()
  fullname!: string;

  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  churchId?: number;
}

export class CreateOrderDto {
  /**
   * 표시용 주문번호. 보통은 서버가 채번하므로 보내지 않는다.
   * 엑셀 일괄등록처럼 번호가 이미 정해진 경우에만 실어 보낸다.
   */
  @ApiPropertyOptional({ example: 'SYN0123456789' })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  /** 분할 주문 형제가 공유하는 키. 없으면 서버가 새로 발급한다 */
  @ApiPropertyOptional({ example: 'SYN0123456789' })
  @IsOptional()
  @IsString()
  orderGroupKey?: string;

  /** 분할 순번 (1부터) */
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  splitIndex?: number;

  /** 이번 접수로 만들어지는 형제 개수. 1이면 접미사를 붙이지 않는다 */
  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  splitCount?: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: 120000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalAmount?: number;

  @ApiPropertyOptional({ example: '개별택배' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '아이스박스 동봉',
    description: '제품주문서 특이사항 (출고·포장관리 표시)',
  })
  @IsOptional()
  @IsString()
  extraNote?: string;

  @ApiPropertyOptional({
    type: OrdererProfileDto,
    description:
      '관리자 대리작성 시 주문자 정보. 연락처로 기존 회원을 찾고 없으면 계정을 생성해 주문 소유자로 연결합니다.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrdererProfileDto)
  ordererProfile?: OrdererProfileDto;

  @ApiPropertyOptional({ type: [CreateOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];

  @ApiPropertyOptional({ type: CreateShipmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateShipmentDto)
  shipment?: CreateShipmentDto;
}
