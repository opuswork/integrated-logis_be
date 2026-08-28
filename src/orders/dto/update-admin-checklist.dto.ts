import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const CHECKLIST_ACTIONS = [
  'confirm',
  'worker',
  'workerClear',
  'assignmentReset',
  'payment',
  'greeting',
  'slip',
  'setDeliveryRequestDate',
  'setRequestedShipDate',
  'setStoreRegion',
] as const;

export type ChecklistAction = (typeof CHECKLIST_ACTIONS)[number];

export class UpdateAdminChecklistDto {
  @ApiProperty({
    enum: CHECKLIST_ACTIONS,
    description:
      'confirm | worker | workerClear | assignmentReset | payment | greeting | slip | setDeliveryRequestDate | setRequestedShipDate | setStoreRegion',
  })
  @IsIn(CHECKLIST_ACTIONS)
  action!: ChecklistAction;

  @ApiPropertyOptional({
    enum: ['STORE', 'FACTORY'],
    description: 'action=worker 일 때 필수',
  })
  @IsOptional()
  @IsIn(['STORE', 'FACTORY'])
  packagingWorker?: 'STORE' | 'FACTORY';

  @ApiPropertyOptional({
    enum: ['NAMBU', 'JUNGBU', 'SEOBU'],
    description: 'action=setStoreRegion 일 때 필수',
  })
  @IsOptional()
  @IsIn(['NAMBU', 'JUNGBU', 'SEOBU'])
  storeRegion?: 'NAMBU' | 'JUNGBU' | 'SEOBU';

  @ApiPropertyOptional({
    description: 'payment/greeting/slip: (레거시) true=Y — confirm 액션은 done 없이 확정',
  })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({
    description: '레거시 작성자 필드 — 서버가 로그인 사용자명으로 덮어씀',
  })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({
    description: 'action=setDeliveryRequestDate — 납품요청일 YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @ApiPropertyOptional({
    description:
      'action=setRequestedShipDate — 출고요청일 YYYY-MM-DD (납품요청일 하루 전 이하)',
  })
  @IsOptional()
  @IsString()
  shipDate?: string;
}
