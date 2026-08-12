import { defineConfig, env } from 'prisma/config';

// Local: load .env if dotenv is installed. Render injects env vars — do not require .env in git.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config');
} catch {
  // dotenv may be unavailable during early tooling; platform env is enough
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
