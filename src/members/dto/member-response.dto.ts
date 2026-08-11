import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChurchSummaryDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '서울5' })
  name!: string;

  @ApiProperty({ example: '서울' })
  region!: string;

  @ApiPropertyOptional({ example: '5', nullable: true })
  branchCode!: string | null;

  @ApiProperty({ example: '이영심(총)' })
  assigner!: string;
}

export class MemberPublicDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'hong01' })
  username!: string;

  @ApiProperty({ example: '홍길동' })
  fullname!: string;

  @ApiProperty({ example: '010-1234-5678' })
  phone!: string;

  @ApiPropertyOptional({ example: 'hong@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'MEMBER', enum: ['MEMBER', 'ADMIN', 'FACTORY'] })
  role!: string;

  @ApiPropertyOptional({
    enum: ['JUNGBU', 'NAMBU', 'SEOBU'],
    nullable: true,
    description: '지역 서브 관리자. ADMIN + null = Super admin',
  })
  adminRegion!: 'JUNGBU' | 'NAMBU' | 'SEOBU' | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  churchId!: number | null;

  @ApiPropertyOptional({ type: ChurchSummaryDto, nullable: true })
  church!: ChurchSummaryDto | null;

  @ApiProperty({ example: '2026-01-10T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-10T00:00:00.000Z' })
  updatedAt!: Date;
}

export class MembersListResponseDto {
  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ type: [MemberPublicDto] })
  members!: MemberPublicDto[];
}

export class MemberByUsernameResponseDto {
  @ApiProperty({ type: MemberPublicDto })
  member!: MemberPublicDto;
}
