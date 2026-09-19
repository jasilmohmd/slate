import { createClient } from "@supabase/supabase-js";

// Server-only. The service role key bypasses RLS, which is what we want
// here: `generations` has RLS off entirely (§6 schema, no auth), but
// `storage.objects` has RLS on by default and this app defines no
// policies for it (spec: "no RLS policies, no auth"), so uploads need the
// service role rather than the anon key.
export function createSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
