import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ example: 1, description: '소속 주문 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId!: number;

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

export class UpdateOrderItemDto extends PartialType(CreateOrderItemDto) {}

export class ReplaceOrderItemDto {
  @ApiPropertyOptional({ example: 1, description: '소속 주문 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiProperty({ example: '명진1호' })
  @IsString()
  productName!: string;

  @ApiProperty({ example: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber()
  price!: number;
}
