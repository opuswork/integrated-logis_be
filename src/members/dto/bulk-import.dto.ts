import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CreateChurchDto } from '../../churches/dto/create-church.dto';

export class BulkCreateChurchesDto {
  @ApiProperty({ type: [CreateChurchDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChurchDto)
  churches!: CreateChurchDto[];

  @ApiPropertyOptional({
    default: true,
    description: 'true면 이미 존재하는 교회명은 건너뜁니다.',
  })
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class BulkImportMemberRowDto {
  @ApiProperty({ example: '서울17', description: 'Church.name (중앙)' })
  @IsString()
  @IsNotEmpty()
  churchName!: string;

  @ApiProperty({ example: '이은미' })
  @IsString()
  @IsNotEmpty()
  fullname!: string;

  @ApiProperty({ example: '010-3032-1440' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'user01030321440' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'pass01030321440' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: 'hong@example.com' })
  @IsOptional()
  @IsString()
  email?: string;
}

export class BulkImportMembersDto {
  @ApiProperty({ type: [BulkImportMemberRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportMemberRowDto)
  members!: BulkImportMemberRowDto[];

  @ApiPropertyOptional({
    default: true,
    description: 'true면 DB에 없는 교회(Church)를 자동 생성합니다.',
  })
  @IsOptional()
  @IsBoolean()
  createMissingChurches?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'true면 이미 존재하는 username은 건너뜁니다.',
  })
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}
