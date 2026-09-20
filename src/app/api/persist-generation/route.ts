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
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { id, goal, classNumber, language, photoPath, artifactHtml, verification } = parsed.data;
  const band = bandFromClass(classNumber);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("generations").insert({
    id,
    concept: goal,
    band,
    language,
    record: { goal, classNumber, language, photoPath },
    artifact_html: artifactHtml,
    verification,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id });
}
