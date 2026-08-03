import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Cliente anónimo — para operaciones de auth (login/register)
    this.client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Cliente con service_role — para operaciones administrativas (gestión de usuarios)
    this.adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Cliente anónimo (auth pública) */
  get supabase(): SupabaseClient {
    return this.client;
  }

  /** Cliente con privilegios de admin (service_role) */
  get admin(): SupabaseClient {
    return this.adminClient;
  }
}
