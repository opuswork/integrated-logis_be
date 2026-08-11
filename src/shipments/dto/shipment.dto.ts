import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { FulfillmentType } from '../../generated/prisma/enums';

export class CreateShipmentDto {
  @ApiProperty({ example: 1, description: '소속 주문 ID (1:1)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId!: number;

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

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {}

export class ReplaceShipmentDto {
  @ApiPropertyOptional({ example: 1, description: '소속 주문 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiProperty({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

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
