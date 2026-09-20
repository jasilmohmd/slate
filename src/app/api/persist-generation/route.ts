import { z } from "zod";
import { bandFromClass } from "@/lib/band";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});

// One pointed-at correction (§2c). The record, not the exported file, is
// the durable source of truth, and it absorbs every correction made so a
// teacher can reopen and re-export later without version drift.
const CorrectionSchema = z.object({
  id: z.string(),
  atRound: z.number().int(),
  controlId: z.string().nullable(),
  role: z.string().nullable(),
  label: z.string(),
  elementSnippet: z.string(),
  comment: z.string(),
  complexity: z.enum(["simple", "complex"]).nullable(),
  model: z.string(),
});

const BodySchema = z.object({
  id: z.string().uuid(),
  goal: z.string().min(1),
  classNumber: z.number().int(),
  language: z.enum(["ml", "en"]),
  photoPath: z.string().nullable(),
  artifactHtml: z.string().min(1),
  verification: z.object({
    passed: z.boolean(),
    attempts: z.number().int(),
    checks: z.array(CheckResultSchema),
  }),
  // The client holds the live session and sends the whole array each time,
  // so this route stays stateless — no read-modify-write race between
  // concurrent correction rounds.
  corrections: z.array(CorrectionSchema).optional(),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { id, goal, classNumber, language, photoPath, artifactHtml, verification, corrections } =
    parsed.data;
  const band = bandFromClass(classNumber);

  const supabase = createSupabaseServerClient();
  // Upsert, not insert: a correction round rewrites the same record rather
  // than creating a new one. artifact_html holds only the latest document
  // (§2c does not version files); the history lives in record.corrections.
  const { error } = await supabase.from("generations").upsert(
    {
      id,
      concept: goal,
      band,
      language,
      record: { goal, classNumber, language, photoPath, corrections: corrections ?? [] },
      artifact_html: artifactHtml,
      verification,
    },
    { onConflict: "id" }
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id });
}
