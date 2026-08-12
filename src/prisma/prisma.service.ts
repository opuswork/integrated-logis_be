import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

import { PrismaClient } from '../generated/prisma/client';

function isLocalDatabaseUrl(connectionString: string) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
}

/**
 * Render/hosted Postgres: node-pg treats sslmode=require as verify-full and
 * rejects the platform cert (P1011). Strip sslmode and disable CA verify.
 */
function buildPoolConfig(connectionString: string): PoolConfig {
  if (isLocalDatabaseUrl(connectionString)) {
    return { connectionString };
  }

  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
    };
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool(buildPoolConfig(connectionString));
    const adapter = new PrismaPg(pool, { disposeExternalPool: true });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
