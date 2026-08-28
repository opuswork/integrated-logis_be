import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service';

export type AppRole = 'admin' | 'member' | 'factory';
export type AdminRegionCode = 'JUNGBU' | 'NAMBU' | 'SEOBU';

export type JwtPayload = {
  sub: number;
  username: string;
  role: AppRole;
  adminRegion?: AdminRegionCode | null;
  /** Session version; must match User.sessionVersion */
  sv?: number;
};

export type AuthUserPayload = {
  id: number;
  username: string;
  role: AppRole;
  adminRegion: AdminRegionCode | null;
  isSuperAdmin: boolean;
};

export function toAppRole(role: string): AppRole {
  if (role === 'ADMIN' || role === 'admin') {
    return 'admin';
  }
  if (role === 'FACTORY' || role === 'factory') {
    return 'factory';
  }
  return 'member';
}

export function toAdminRegion(
  value: string | null | undefined,
): AdminRegionCode | null {
  if (value === 'JUNGBU' || value === 'NAMBU' || value === 'SEOBU') {
    return value;
  }
  return null;
}

export function isSuperAdminUser(params: {
  role: AppRole | string;
  adminRegion?: AdminRegionCode | null;
}) {
  const role = toAppRole(String(params.role));
  return role === 'admin' && !params.adminRegion;
}

const DUPLICATE_LOGIN_MESSAGE = '중복 로그인을 허용하지 않습니다';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'sanc-logistics-dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, sessionVersion: true },
    });

    const tokenSv = typeof payload.sv === 'number' ? payload.sv : null;
    if (!user || tokenSv === null || user.sessionVersion !== tokenSv) {
      throw new UnauthorizedException(DUPLICATE_LOGIN_MESSAGE);
    }

    const adminRegion = toAdminRegion(payload.adminRegion);
    const role = payload.role;
    return {
      id: payload.sub,
      username: payload.username,
      role,
      adminRegion,
      isSuperAdmin: isSuperAdminUser({ role, adminRegion }),
    };
  }
}
