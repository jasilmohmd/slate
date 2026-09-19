import { z } from "zod";
import sharp from "sharp";
import { bandFromClass } from "@/lib/band";
import { buildGenerationPrompt } from "@/lib/artifact/generationPrompt";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERATION_MODEL = "gpt-5.6-sol";

const RequestSchema = z.object({
  goal: z.string().trim().min(3, "Say a bit more about what you're teaching.").max(2000),
  classNumber: z.coerce.number().int(),
  language: z.enum(["ml", "en"]),
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
  });

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { goal, classNumber, language } = parsed.data;
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

  const generationId = globalThis.crypto.randomUUID();
  const prompt = buildGenerationPrompt({
    goal,
    classNumber,
    language,
    hasImage: photoBuffer !== null,
  });

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
            model: GENERATION_MODEL,
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

        let photoPath: string | null = null;
        const supabase = createSupabaseServerClient();

        if (photoBuffer) {
          photoPath = `${generationId}/photo.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(photoPath, photoBuffer, { contentType: "image/jpeg" });
          if (uploadError) {
            throw new Error(`Photo upload failed: ${uploadError.message}`);
          }
        }

        const { error: insertError } = await supabase.from("generations").insert({
          id: generationId,
          concept: goal,
          band,
          language,
          record: { goal, classNumber, language, photoPath },
          artifact_html: finalHtml,
          verification: null,
        });
        if (insertError) {
          throw new Error(`Saving generation failed: ${insertError.message}`);
        }

        controller.enqueue(encodeLine({ type: "done", id: generationId, html: finalHtml }));
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
