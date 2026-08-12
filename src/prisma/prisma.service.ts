import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

function isLocalDatabaseUrl(connectionString: string) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
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

    // Prisma 7 + node-pg treats sslmode=require like verify-full.
    // Render Postgres presents a cert Node does not trust by default → P1011.
    const adapter = new PrismaPg({
      connectionString,
      ...(isLocalDatabaseUrl(connectionString)
        ? {}
        : { ssl: { rejectUnauthorized: false } }),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
