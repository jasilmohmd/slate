"use client";

import { useRef, useState } from "react";

type Status = "idle" | "generating" | "done" | "error";
type PreviewMode = "phone" | "projector";

const CLASS_OPTIONS = [8, 9, 10];

export default function Home() {
  const [goal, setGoal] = useState("");
  const [classNumber, setClassNumber] = useState(9);
  const [language, setLanguage] = useState<"ml" | "en">("ml");
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [streamedText, setStreamedText] = useState("");
  const [finalHtml, setFinalHtml] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (status === "generating") return;

    setStatus("generating");
    setStreamedText("");
    setFinalHtml(null);
    setErrorMessage(null);
    setGenerationId(null);

    const formData = new FormData();
    formData.set("goal", goal);
    formData.set("classNumber", String(classNumber));
    formData.set("language", language);
    if (photo) formData.set("photo", photo);

    try {
      const res = await fetch("/api/generate", { method: "POST", body: formData });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === "delta") {
            setStreamedText((prev) => prev + msg.text);
          } else if (msg.type === "done") {
            setFinalHtml(msg.html);
            setGenerationId(msg.id);
            setStatus("done");
          } else if (msg.type === "error") {
            throw new Error(msg.message);
          }
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function handleDownload() {
    if (!finalHtml) return;
    const blob = new Blob([finalHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slate-${generationId ?? "artifact"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewSize =
    previewMode === "phone" ? { width: 360, height: 640 } : { width: 800, height: 600 };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--chalk)]">Slate</h1>

      <form onSubmit={handleGenerate} className="mt-6 flex flex-col gap-3">
        <label className="text-[var(--chalk-dim)]" htmlFor="goal">
          What are you teaching?
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="എന്റെ ക്ലാസ്സിന് പാരലൽ സർക്യൂട്ടിൽ current എങ്ങനെ വീതിക്കപ്പെടുന്നു എന്ന് മനസിലാകുന്നില്ല..."
          rows={3}
          className="rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] p-3 text-[var(--chalk)] placeholder:text-[var(--chalk-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--frame)]"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[48px] rounded-md border border-[var(--frame)] px-4 text-[var(--chalk)] hover:bg-[var(--stone-deep)]"
          >
            {photo ? photo.name : "add textbook photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />

          <select
            value={classNumber}
            onChange={(e) => setClassNumber(Number(e.target.value))}
            className="min-h-[48px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-3 text-[var(--chalk)]"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                class {c}
              </option>
            ))}
          </select>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "ml" | "en")}
            className="min-h-[48px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-3 text-[var(--chalk)]"
          >
            <option value="ml">ml</option>
            <option value="en">en</option>
          </select>

          <button
            type="submit"
            disabled={status === "generating" || goal.trim().length < 3}
            className="min-h-[48px] rounded-md bg-[var(--frame)] px-6 font-bold text-[var(--stone-deep)] disabled:opacity-50"
          >
            {status === "generating" ? "generating…" : "generate"}
          </button>
        </div>
      </form>

      {(status === "generating" || status === "done" || status === "error") && (
        <section className="mt-8">
          <h2 className="mb-2 border-b border-[var(--frame)] pb-1 text-[var(--chalk-dim)]">
            generation
          </h2>
          <pre className="max-h-64 overflow-auto rounded-md bg-[var(--stone-deep)] p-3 text-xs text-[var(--chalk-dim)]">
            {streamedText || "waiting for the model…"}
          </pre>
          {status === "error" && (
            <p className="mt-2 text-[var(--chalk-rose)]">{errorMessage}</p>
          )}
        </section>
      )}

      {finalHtml && (
        <section className="mt-8">
          <h2 className="mb-2 border-b border-[var(--frame)] pb-1 text-[var(--chalk-dim)]">
            preview
          </h2>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode("phone")}
              className={`min-h-[48px] rounded-md border border-[var(--frame)] px-4 ${
                previewMode === "phone" ? "bg-[var(--frame)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
              }`}
            >
              phone
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("projector")}
              className={`min-h-[48px] rounded-md border border-[var(--frame)] px-4 ${
                previewMode === "projector" ? "bg-[var(--frame)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
              }`}
            >
              projector
            </button>
          </div>

          <div className="overflow-auto rounded-lg border-4 border-[var(--frame)] p-2">
            <iframe
              title="artifact preview"
              srcDoc={finalHtml}
              sandbox="allow-scripts"
              width={previewSize.width}
              height={previewSize.height}
              className="mx-auto block bg-white"
            />
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="mt-4 min-h-[48px] rounded-md bg-[var(--chalk-green)] px-6 font-bold text-[var(--stone-deep)]"
          >
            download
          </button>
        </section>
      )}
    </main>
  );
}
