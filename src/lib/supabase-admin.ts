import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase server env vars are not configured");
    }
    _client = createClient<Database>(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
