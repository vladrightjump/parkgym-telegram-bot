import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client. Bypasses Row Level Security, so it lives only in
// this server-side worker — the service-role key is never shipped to a browser.
//
// Lazily instantiated so importing this module doesn't throw at build time when
// the secret isn't present; the error only surfaces if code actually calls it.
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
