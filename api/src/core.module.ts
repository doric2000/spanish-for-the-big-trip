import { Global, Module } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_CONFIG, readConfig, type ApiConfig } from './config.js';

export const SUPABASE = Symbol('SUPABASE');

// Shared by every feature module: settings and one server-side Supabase client.
@Global()
@Module({
  providers: [
    { provide: API_CONFIG, useFactory: () => readConfig(process.env) },
    {
      provide: SUPABASE,
      inject: [API_CONFIG],
      // The secret key bypasses RLS, so this client lives only on the server.
      useFactory: (config: ApiConfig): SupabaseClient =>
        createClient(config.supabaseUrl, config.supabaseSecretKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }),
    },
  ],
  exports: [API_CONFIG, SUPABASE],
})
export class CoreModule {}
