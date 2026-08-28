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

export class CreateOrderDto {
  @ApiProperty({ example: 'ORD-2026-000001' })
  @IsString()
  orderNumber!: string;

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
