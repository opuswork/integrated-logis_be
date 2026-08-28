import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {
  @ApiPropertyOptional({ example: 'partner@example.com', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email?: string | null;
}
