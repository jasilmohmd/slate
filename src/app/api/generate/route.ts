import { z } from "zod";
import sharp from "sharp";
import { bandFromClass } from "@/lib/band";
import {
  buildCorrectionTask,
  buildGenerationTask,
  buildMessages,
  buildRepairTask,
} from "@/lib/artifact/generationPrompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chooseModel } from "@/lib/models/router";
import { classifyConcept, classifyCorrection } from "@/lib/models/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Correction by pointing (§5 step 3): what the teacher tapped, plus what
// they said about it. Arrives as a JSON string because the rest of this
// endpoint already speaks multipart/form-data (the photo).
const CorrectionSchema = z.object({
  controlId: z.string().max(200).nullable(),
  role: z.string().max(200).nullable(),
  label: z.string().max(200),
  elementSnippet: z.string().max(4000),
  comment: z.string().trim().min(3, "Say a little about what's wrong.").max(1000),
});

const RequestSchema = z.object({
  goal: z.string().trim().min(3, "Say a bit more about what you're teaching.").max(2000),
  classNumber: z.coerce.number().int(),
  language: z.enum(["ml", "en"]),
  previousHtml: z.string().optional(),
  failureSummary: z.string().optional(),
  generationId: z.string().uuid().optional(),
  // Comments from corrections already applied this session, oldest first.
  // Replayed as short placeholders so the thread carries context without
  // re-sending every historical document.
  history: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        return z
          .array(z.object({ label: z.string().max(200), comment: z.string().max(1000) }))
          .max(50)
          .parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid history payload" });
        return z.NEVER;
      }
    }),
  correction: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        return CorrectionSchema.parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid correction payload" });
        return z.NEVER;
      }
    }),
});

function encodeLine(obj: unknown) {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function stripCodeFence(html: string): string {
  const trimmed = html.trim();
  const fenced = trimmed.match(/^```(?:html)?\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1] : trimmed;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = RequestSchema.safeParse({
    goal: formData.get("goal"),
    classNumber: formData.get("classNumber"),
    language: formData.get("language"),
    previousHtml: formData.get("previousHtml") ?? undefined,
    failureSummary: formData.get("failureSummary") ?? undefined,
    generationId: formData.get("generationId") ?? undefined,
    correction: formData.get("correction") ?? undefined,
    history: formData.get("history") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { goal, classNumber, language, previousHtml, failureSummary, correction, history } =
    parsed.data;
  const isCorrection = !!previousHtml && !!correction;
  const isRepair = !isCorrection && !!previousHtml && !!failureSummary;
  // Either kind of follow-up reuses the existing record rather than starting
  // a new one, so the photo is not re-uploaded below.
  const isFollowUp = isCorrection || isRepair;
  const band = bandFromClass(classNumber);
  if (band !== "B") {
    return Response.json(
      { error: "Only classes 8-10 (Band B) are supported in this build." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const photoField = formData.get("photo");
  let photoBuffer: Buffer | null = null;
  if (photoField instanceof File && photoField.size > 0) {
    const original = Buffer.from(await photoField.arrayBuffer());
    // Downscale before storage AND before the vision call (§5a) — one pass
    // serves both.
    photoBuffer = await sharp(original)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  }

  const generationId = parsed.data.generationId ?? globalThis.crypto.randomUUID();
  const shared = { goal, classNumber, language, hasImage: photoBuffer !== null };
  const task = isCorrection
    ? buildCorrectionTask({ ...shared, previousHtml: previousHtml!, correction: correction! })
    : isRepair
      ? buildRepairTask({ ...shared, previousHtml: previousHtml!, failureSummary: failureSummary! })
      : buildGenerationTask(shared);

  // Cheap Luna triage decides whether a correction needs the stronger model
  // (§5b). It fails open to "complex", so a classifier outage costs money,
  // never quality.
  const complexity = isCorrection
    ? await classifyCorrection(correction!.comment, correction!.elementSnippet)
    : null;

  // Only a first generation is triaged. A repair already has its own
  // escalation, and a correction is triaged by its own comment above.
  const conceptComplexity =
    !isCorrection && !isRepair ? await classifyConcept(goal, classNumber) : null;

  const job = isCorrection ? "correction" : isRepair ? "repair" : "generate";
  const model = photoBuffer
    ? chooseModel("vision")
    : chooseModel(job, {
        correctionComplexity: complexity ?? undefined,
        conceptComplexity: conceptComplexity ?? undefined,
      });

  const messages = buildMessages({
    ...shared,
    task,
    history,
    isFollowUp,
    imageDataUrl: photoBuffer
      ? `data:image/jpeg;base64,${photoBuffer.toString("base64")}`
      : null,
  });

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            messages,
          }),
        });

        if (!openaiRes.ok || !openaiRes.body) {
          const text = await openaiRes.text();
          throw new Error(`Generation call failed (${openaiRes.status}): ${text.slice(0, 500)}`);
        }

        const reader = openaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const payload = line.slice("data: ".length);
            if (payload === "[DONE]") continue;
            const json = JSON.parse(payload);
            const delta: string | undefined = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              controller.enqueue(encodeLine({ type: "delta", text: delta }));
            }
          }
        }

        const finalHtml = stripCodeFence(fullText);

        // The photo only needs uploading once per generation (record source
        // of truth); repair calls re-send it purely for vision context.
        let photoPath: string | null = null;
        if (photoBuffer && !isFollowUp) {
          const supabase = createSupabaseServerClient();
          photoPath = `${generationId}/photo.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(photoPath, photoBuffer, { contentType: "image/jpeg" });
          if (uploadError) {
            throw new Error(`Photo upload failed: ${uploadError.message}`);
          }
        }

        controller.enqueue(
          encodeLine({ type: "done", id: generationId, html: finalHtml, photoPath, model, complexity, conceptComplexity })
        );
      } catch (err) {
        controller.enqueue(
          encodeLine({ type: "error", message: err instanceof Error ? err.message : String(err) })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
