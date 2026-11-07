import { ForbiddenException } from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import type { PrismaService } from '../prisma/prisma.service';
import { MembersService } from './members.service';

const topAdmin = { username: '01044631440' } as AuthUserPayload;

function setup() {
  const users = [
    {
      id: 1,
      username: '01011112222',
      fullname: '홍길동',
      phone: '010-1111-2222',
      role: 'MEMBER',
      adminRegion: null,
      memberType: 'GWANJANG',
      churchId: 10,
      church: { name: '서울17' },
    },
    {
      id: 2,
      username: 'admin01',
      fullname: '관리자',
      phone: '010-0000-0000',
      role: 'ADMIN',
      adminRegion: null,
      memberType: 'GWANJANG',
      churchId: null,
      church: null,
    },
  ];
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(users),
      update: jest.fn((args: unknown) => args),
    },
    church: {
      findMany: jest.fn().mockResolvedValue([
        { id: 10, name: '서울17' },
        { id: 11, name: '부산남' },
      ]),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new MembersService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('MembersService.bulkUpdate', () => {
  it('only the top admin can use it', async () => {
    const { service } = setup();
    await expect(
      service.bulkUpdate({ rows: [] }, {
        username: 'someone',
      } as AuthUserPayload),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('previews changes, skips unknown ids, rejects unknown 중앙', async () => {
    const { service, prisma } = setup();
    const result = await service.bulkUpdate(
      {
        rows: [
          {
            rowNumber: 2,
            username: '01011112222',
            fullname: '홍길동',
            churchName: '부산남',
            memberType: '총무',
            phone: '01099998888',
          },
          { rowNumber: 3, username: 'nobody', fullname: '없음' },
          { rowNumber: 4, username: '01011112222' },
          { rowNumber: 5, username: 'admin01', fullname: '바꿈' },
        ],
      },
      topAdmin,
    );

    expect(result.dryRun).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual([
      'update',
      'skipped',
      'error', // duplicate id in file
      'skipped', // super admin
    ]);
    expect(result.results[0].changes.map((c) => c.after)).toEqual([
      '부산남',
      '총무',
      '010-9999-8888',
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blank cells keep values; bad 중앙/직분 make the row an error', async () => {
    const { service } = setup();
    const unchanged = await service.bulkUpdate(
      { rows: [{ username: '01011112222', churchName: '서울17' }] },
      topAdmin,
    );
    expect(unchanged.results[0].status).toBe('unchanged');

    const bad = await service.bulkUpdate(
      {
        rows: [
          {
            username: '01011112222',
            churchName: '서울 17',
            memberType: '회장',
          },
        ],
      },
      topAdmin,
    );
    expect(bad.results[0].status).toBe('error');
    expect(bad.results[0].reason).toContain('서울 17');
    expect(bad.results[0].reason).toContain('회장');
  });

  it('applies updates in one transaction when dryRun=false', async () => {
    const { service, prisma } = setup();
    const result = await service.bulkUpdate(
      {
        dryRun: false,
        rows: [{ username: '01011112222', fullname: '홍길순' }],
      },
      topAdmin,
    );
    expect(result.summary.updated).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { fullname: '홍길순' },
    });
  });
});
