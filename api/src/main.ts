import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Local values (Supabase URL, secret key, ALLOW_DRAFT_UNITS) live in api/.env, which Git ignores.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
// Not a top-level await: on Vercel, app.listen is taken over by the platform and the
// module must finish loading, or every request waits until the 60 s timeout.
bootstrap().catch((error: unknown) => {
  console.error('API failed to start', error);
  process.exit(1);
});
