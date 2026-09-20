import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { turnsFromRecord, type SessionRecord } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One saved session, rehydrated for the builder: the inputs, the transcript
 * and the latest artifact. This is what makes §2c's own example work — reopen
 * a record later and keep correcting it — which had been deferred twice.
 *
 * Unscoped, as with the listing; see the note in ../route.ts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Not a session id" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generations")
    .select("id, created_at, concept, language, record, artifact_html, verification")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const record = (data.record ?? {}) as SessionRecord;

  return Response.json({
    id: data.id,
    createdAt: data.created_at,
    concept: data.concept,
    goal: record.goal ?? data.concept ?? "",
    classNumber: record.classNumber ?? 9,
    language: record.language ?? data.language ?? "ml",
    conceptComplexity: record.conceptComplexity ?? null,
    // Pre-v3 rows carry only corrections[]; synthesise a transcript rather
    // than migrating them.
    turns: turnsFromRecord(record, data.created_at as string),
    artifactHtml: data.artifact_html ?? null,
    verification: data.verification ?? null,
  });
}
