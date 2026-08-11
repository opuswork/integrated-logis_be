import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const DELIVERY_ACTIONS = [
  'ADMIN_APPROVE',
  'ADMIN_CANCEL_APPROVE',
  'FACTORY_PREPARE',
  'LOADING_NOTICE',
  'FACTORY_SHIP',
  'DELIVERY_COMPLETE',
  'PRINT_COMPLETE',
  'MEMBER_RECEIVE',
  'CANCEL_ORDER',
] as const;

export type DeliveryAction = (typeof DELIVERY_ACTIONS)[number];

export class DeliveryActionDto {
  @ApiProperty({
    enum: DELIVERY_ACTIONS,
    example: 'ADMIN_APPROVE',
  })
  @IsString()
  @IsIn(DELIVERY_ACTIONS)
  action!: DeliveryAction;
}
