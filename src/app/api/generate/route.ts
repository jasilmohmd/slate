import { z } from "zod";
import sharp from "sharp";
import { bandFromClass } from "@/lib/band";
import { buildGenerationPrompt, buildRepairPrompt } from "@/lib/artifact/generationPrompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chooseModel } from "@/lib/models/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  goal: z.string().trim().min(3, "Say a bit more about what you're teaching.").max(2000),
  classNumber: z.coerce.number().int(),
  language: z.enum(["ml", "en"]),
  previousHtml: z.string().optional(),
  failureSummary: z.string().optional(),
  generationId: z.string().uuid().optional(),
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
  });

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { goal, classNumber, language, previousHtml, failureSummary } = parsed.data;
  const isRepair = !!previousHtml && !!failureSummary;
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
  const prompt = isRepair
    ? buildRepairPrompt({
        goal,
        classNumber,
        language,
        hasImage: photoBuffer !== null,
        previousHtml: previousHtml!,
        failureSummary: failureSummary!,
      })
    : buildGenerationPrompt({
        goal,
        classNumber,
        language,
        hasImage: photoBuffer !== null,
      });

  // A photo rides on the same call that generates the artifact, so that
  // call IS the vision call and must route as one (§5b: never Luna for
  // vision). This matters the moment the generation default is not Sol.
  const model = photoBuffer
    ? chooseModel("vision")
    : chooseModel(isRepair ? "repair" : "generate");

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (photoBuffer) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${photoBuffer.toString("base64")}` },
    });
  }

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
            messages: [{ role: "user", content }],
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
        if (photoBuffer && !isRepair) {
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
          encodeLine({ type: "done", id: generationId, html: finalHtml, photoPath })
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
