"use client";

import { useRef, useState } from "react";
import { runTier1, type CheckResult } from "@/lib/verification/tier1";

type Status = "idle" | "generating" | "verifying" | "repairing" | "done" | "failed" | "error";
type PreviewMode = "phone" | "projector";

const CLASS_OPTIONS = [8, 9, 10];
const MAX_REPAIRS = 3;

// The teacher never sees the artifact source (they do not write code);
// they see plain language about what is happening, then the checks list
// ticking through, which is where the real progress detail lives.
const PROGRESS_COPY: Partial<Record<Status, string>> = {
  generating: "Drafting your material…",
  verifying: "Checking it works…",
  repairing: "Fixing a few things…",
};

async function callGenerate(params: {
  goal: string;
  classNumber: number;
  language: "ml" | "en";
  photo: File | null;
  previousHtml?: string;
  failureSummary?: string;
  generationId?: string;
}): Promise<{ id: string; html: string; photoPath: string | null }> {
  const formData = new FormData();
  formData.set("goal", params.goal);
  formData.set("classNumber", String(params.classNumber));
  formData.set("language", params.language);
  if (params.photo) formData.set("photo", params.photo);
  if (params.previousHtml) formData.set("previousHtml", params.previousHtml);
  if (params.failureSummary) formData.set("failureSummary", params.failureSummary);
  if (params.generationId) formData.set("generationId", params.generationId);

  const res = await fetch("/api/generate", { method: "POST", body: formData });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { id: string; html: string; photoPath: string | null } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === "done") {
        result = { id: msg.id, html: msg.html, photoPath: msg.photoPath ?? null };
      } else if (msg.type === "error") {
        throw new Error(msg.message);
      }
    }
  }

  if (!result) throw new Error("Generation stream ended without a result");
  return result;
}

function buildFailureSummary(checks: CheckResult[]): string {
  return checks
    .filter((c) => !c.passed)
    .map((c) => `- ${c.label}: ${c.detail ?? "failed"}`)
    .join("\n");
}

export default function Home() {
  const [goal, setGoal] = useState("");
  const [classNumber, setClassNumber] = useState(9);
  const [language, setLanguage] = useState<"ml" | "en">("ml");
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [finalHtml, setFinalHtml] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (status === "generating" || status === "verifying" || status === "repairing") return;

    setChecks([]);
    setFinalHtml(null);
    setErrorMessage(null);
    setGenerationId(null);
    setAttempt(0);

    try {
      let html = "";
      let id: string | undefined;
      let photoPath: string | null = null;
      let previousHtml: string | undefined;
      let failureSummary: string | undefined;
      let passed = false;
      let attemptNumber = 0;

      while (true) {
        setStatus(attemptNumber === 0 ? "generating" : "repairing");
        const result = await callGenerate({
          goal,
          classNumber,
          language,
          photo,
          previousHtml,
          failureSummary,
          generationId: id,
        });
        html = result.html;
        id = result.id;
        if (result.photoPath) photoPath = result.photoPath;
        setGenerationId(id);

        setStatus("verifying");
        setChecks([]);
        const verification = await runTier1(html, language, (check) =>
          setChecks((prev) => [...prev, check])
        );
        passed = verification.passed;

        if (passed || attemptNumber >= MAX_REPAIRS) {
          await fetch("/api/persist-generation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              goal,
              classNumber,
              language,
              photoPath,
              artifactHtml: html,
              verification: { passed, attempts: attemptNumber + 1, checks: verification.checks },
            }),
          });
          break;
        }

        attemptNumber += 1;
        setAttempt(attemptNumber);
        previousHtml = html;
        failureSummary = buildFailureSummary(verification.checks);
      }

      setFinalHtml(html);
      setStatus(passed ? "done" : "failed");
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
  const busy = status === "generating" || status === "verifying" || status === "repairing";

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
            disabled={busy || goal.trim().length < 3}
            className="min-h-[48px] rounded-md bg-[var(--frame)] px-6 font-bold text-[var(--stone-deep)] disabled:opacity-50"
          >
            {status === "generating"
              ? "generating…"
              : status === "repairing"
                ? `repairing (${attempt}/${MAX_REPAIRS})…`
                : status === "verifying"
                  ? "checking…"
                  : "generate"}
          </button>
        </div>
      </form>

      {busy && (
        <section className="mt-8">
          <p className="slate-pulse flex items-center gap-2 text-[var(--chalk)]">
            <span aria-hidden="true">✎</span>
            {PROGRESS_COPY[status] ?? "Working…"}
          </p>
        </section>
      )}

      {checks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 border-b border-[var(--frame)] pb-1 text-[var(--chalk-dim)]">
            checks
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {checks.map((c, i) => (
              <li
                key={`${c.id}-${i}`}
                className={c.passed ? "text-[var(--chalk-green)]" : "text-[var(--chalk-rose)]"}
              >
                {c.passed ? "✓" : "✗"} {c.label}
                {!c.passed && c.detail ? ` — ${c.detail}` : ""}
                {!c.passed && status === "repairing" ? " → repairing" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === "error" && <p className="mt-4 text-[var(--chalk-rose)]">{errorMessage}</p>}

      {status === "failed" && (
        <p className="mt-4 text-[var(--chalk-rose)]">
          Still failing verification after {MAX_REPAIRS} repair attempts. Showing the last attempt
          below — check the failures listed above before forwarding this to students.
        </p>
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
