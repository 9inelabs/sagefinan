import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Privileged client using the service role key. Bypasses RLS entirely — every
// caller MUST perform its own role/permission check in application code
// before using this. Never import this from a Client Component; `server-only`
// makes that a build error rather than a leaked key.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
