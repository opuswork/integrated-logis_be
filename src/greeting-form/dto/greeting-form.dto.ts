import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

function toInt(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseInt(String(value), 10);
}

export class CreateGreetingFormDto {
  @IsString()
  @MinLength(1)
  greetingNumber!: string;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeSelf!: boolean;

  @IsString()
  @MinLength(1)
  content!: string;

  @Transform(({ value }) => toInt(value))
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  size!: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsString()
  @MinLength(1)
  receivePlace!: string;

  @IsOptional()
  @IsString()
  specialNote?: string;

  @IsOptional()
  @IsString()
  businessCard?: string;

  @IsOptional()
  @IsString()
  ordererName?: string;

  @IsOptional()
  @IsString()
  churchName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  linkedToOrder!: boolean;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  @IsOptional()
  submitted?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value ? toInt(value) : undefined))
  @IsInt()
  userId?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? toInt(value) : undefined))
  @IsInt()
  orderId?: number;
}

export class LinkGreetingToOrderDto {
  @IsInt()
  orderId!: number;
}
