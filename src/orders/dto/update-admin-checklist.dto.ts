import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const CHECKLIST_ACTIONS = [
  'confirm',
  'worker',
  'payment',
  'greeting',
  'slip',
] as const;

export type ChecklistAction = (typeof CHECKLIST_ACTIONS)[number];

export class UpdateAdminChecklistDto {
  @ApiProperty({
    enum: CHECKLIST_ACTIONS,
    description:
      'confirm | worker | payment | greeting | slip',
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
    description: 'payment/greeting/slip: true=Y, false=N',
  })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({
    description: '결제완료/기표지완료 작성자 (Y 저장 시 필수)',
  })
  @IsOptional()
  @IsString()
  author?: string;
}
