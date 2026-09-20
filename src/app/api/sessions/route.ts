import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;

/**
 * Past sessions, newest first, for the "recent" control in the builder.
 *
 * Unscoped on purpose: §5a specifies a single hardcoded teacher identity and
 * no auth provider, so there is no user to scope by. Stated plainly — this
 * means anyone who can reach the deployment can list and open every session.
 * That is the spec's trade, not an oversight, and it is the thing to revisit
 * first if this ever serves more than one teacher.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generations")
    .select("id, created_at, concept, language, verification")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    concept: (row.concept as string) ?? "",
    language: (row.language as string) ?? "ml",
    passed: (row.verification as { passed?: boolean } | null)?.passed ?? null,
  }));

  return Response.json({ sessions });
}
