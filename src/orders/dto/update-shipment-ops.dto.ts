import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const SHIPMENT_OPS_ACTIONS = [
  'setShipDate',
  'setPackDept',
  'completePack',
  'completeRelease',
  'finalComplete',
  'finalConfirm',
] as const;

export type ShipmentOpsAction = (typeof SHIPMENT_OPS_ACTIONS)[number];

export class UpdateShipmentOpsDto {
  @ApiProperty({
    enum: SHIPMENT_OPS_ACTIONS,
    description:
      'setShipDate | setPackDept | completePack | completeRelease | finalComplete | finalConfirm',
  })
  @IsIn(SHIPMENT_OPS_ACTIONS)
  action!: ShipmentOpsAction;

  @ApiPropertyOptional({
    description: 'action=setShipDate — YYYY-MM-DD (오늘 이후)',
  })
  @IsOptional()
  @IsString()
  shipDate?: string;

  @ApiPropertyOptional({
    enum: ['FACTORY_PACK', 'SOCK_PACK'],
    description: 'action=setPackDept',
  })
  @IsOptional()
  @IsIn(['FACTORY_PACK', 'SOCK_PACK'])
  packDept?: 'FACTORY_PACK' | 'SOCK_PACK';

  @ApiPropertyOptional({
    description: 'action=completePack — PT 값',
  })
  @IsOptional()
  @IsString()
  packPt?: string;

  @ApiPropertyOptional({
    description: 'action=completePack — 포장완료일 YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  packDate?: string;
}
