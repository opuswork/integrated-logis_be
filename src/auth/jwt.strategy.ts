import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type AppRole = 'admin' | 'member' | 'factory';
export type AdminRegionCode = 'JUNGBU' | 'NAMBU' | 'SEOBU';

export type JwtPayload = {
  sub: number;
  username: string;
  role: AppRole;
  adminRegion?: AdminRegionCode | null;
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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'sanc-logistics-dev-secret',
    });
  }

  validate(payload: JwtPayload): AuthUserPayload {
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
