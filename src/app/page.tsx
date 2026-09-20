"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runTier1, type CheckResult } from "@/lib/verification/tier1";
import { injectSelectionShim } from "@/lib/artifact/selectionShim";

type Status =
  | "idle"
  | "generating"
  | "verifying"
  | "repairing"
  | "correcting"
  | "done"
  | "failed"
  | "error";
type PreviewMode = "phone" | "projector";

/** What the teacher pointed at, as reported by the artifact-side shim. */
type Selection = {
  controlId: string | null;
  role: string | null;
  label: string;
  elementSnippet: string;
};

/** A pointed-at correction, as it is written into the record (§2c). */
type Correction = Selection & {
  id: string;
  atRound: number;
  comment: string;
  complexity: "simple" | "complex" | null;
  model: string;
};

function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function clampNullable(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

const CLASS_OPTIONS = [8, 9, 10];
const MAX_REPAIRS = 3;

// The teacher never sees the artifact source (they do not write code);
// they see plain language about what is happening, then the checks list
// ticking through, which is where the real progress detail lives.
const PROGRESS_COPY: Partial<Record<Status, string>> = {
  generating: "Drafting your material…",
  verifying: "Checking it works…",
  repairing: "Fixing a few things…",
  correcting: "Making that change…",
};

async function callGenerate(params: {
  goal: string;
  classNumber: number;
  language: "ml" | "en";
  photo: File | null;
  previousHtml?: string;
  failureSummary?: string;
  correction?: Selection & { comment: string };
  /** Comments from corrections already applied, oldest first. */
  history?: Array<{ label: string; comment: string }>;
  generationId?: string;
}): Promise<{
  id: string;
  html: string;
  photoPath: string | null;
  model: string;
  complexity: "simple" | "complex" | null;
}> {
  const formData = new FormData();
  formData.set("goal", params.goal);
  formData.set("classNumber", String(params.classNumber));
  formData.set("language", params.language);
  if (params.photo) formData.set("photo", params.photo);
  if (params.previousHtml) formData.set("previousHtml", params.previousHtml);
  if (params.failureSummary) formData.set("failureSummary", params.failureSummary);
  if (params.generationId) formData.set("generationId", params.generationId);
  if (params.correction) formData.set("correction", JSON.stringify(params.correction));
  if (params.history?.length) formData.set("history", JSON.stringify(params.history));

  const res = await fetch("/api/generate", { method: "POST", body: formData });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Awaited<ReturnType<typeof callGenerate>> | null = null;

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
        result = {
          id: msg.id,
          html: msg.html,
          photoPath: msg.photoPath ?? null,
          model: msg.model ?? "",
          complexity: msg.complexity ?? null,
        };
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
  const [selectMode, setSelectMode] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [comment, setComment] = useState("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const sendSelectMode = useCallback((on: boolean) => {
    previewRef.current?.contentWindow?.postMessage({ type: "slate-select-mode", on }, "*");
  }, []);

  // Keep the artifact-side shim in sync with React state; the iframe is the
  // external system here, so this belongs in an effect.
  useEffect(() => {
    sendSelectMode(selectMode);
  }, [selectMode, sendSelectMode]);

  function toggleSelectMode() {
    const next = !selectMode;
    setSelectMode(next);
    if (!next) setSelection(null);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // The preview is sandboxed without allow-same-origin, so its origin is
      // opaque ("null") and cannot be checked. Identity of the source window
      // is the check that actually means something here. Everything inside
      // the payload is model-generated content: clamp it and never treat it
      // as markup.
      if (event.source !== previewRef.current?.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== "slate-select") return;
      setSelection({
        controlId: clampNullable(data.controlId, 200),
        role: clampNullable(data.role, 200),
        label: clampString(data.label, 120),
        elementSnippet: clampString(data.elementSnippet, 400),
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // One verified round: generate (or correct), run Tier 1, and fall into the
  // existing repair loop until it passes or MAX_REPAIRS is spent. Both the
  // first generation and every correction go through this, so a correction
  // can never quietly ship an artifact that breaks the §2d contract.
  async function runVerifiedRound(opts: {
    firstStatus: Status;
    generationId?: string;
    previousHtml?: string;
    correction?: Selection & { comment: string };
    history?: Array<{ label: string; comment: string }>;
  }) {
    let html = "";
    let id = opts.generationId;
    let uploadedPhotoPath: string | null = null;
    let model = "";
    let complexity: "simple" | "complex" | null = null;
    let previousHtml = opts.previousHtml;
    let correction = opts.correction;
    let failureSummary: string | undefined;
    let checks: CheckResult[] = [];
    let passed = false;
    let attemptNumber = 0;

    for (;;) {
      setStatus(attemptNumber === 0 ? opts.firstStatus : "repairing");
      const result = await callGenerate({
        goal,
        classNumber,
        language,
        photo,
        previousHtml,
        failureSummary,
        correction,
        history: opts.history,
        generationId: id,
      });
      html = result.html;
      id = result.id;
      model = result.model;
      if (attemptNumber === 0) complexity = result.complexity;
      if (result.photoPath) uploadedPhotoPath = result.photoPath;
      setGenerationId(id);

      setStatus("verifying");
      setChecks([]);
      const verification = await runTier1(html, language, (check) =>
        setChecks((prev) => [...prev, check])
      );
      checks = verification.checks;
      passed = verification.passed;

      if (passed || attemptNumber >= MAX_REPAIRS) break;

      attemptNumber += 1;
      setAttempt(attemptNumber);
      previousHtml = html;
      failureSummary = buildFailureSummary(checks);
      // A repair is a repair: the pointer has already been applied, and
      // re-sending it would ask for the same change a second time.
      correction = undefined;
    }

    return {
      html,
      id: id as string,
      uploadedPhotoPath,
      model,
      complexity,
      passed,
      attempts: attemptNumber + 1,
      checks,
    };
  }

  async function persistRound(args: {
    id: string;
    html: string;
    passed: boolean;
    attempts: number;
    checks: CheckResult[];
    photoPath: string | null;
    corrections: Correction[];
  }) {
    // A failed save must not look like a failed generation: the artifact is
    // finished, previewable and downloadable either way. But it must not be
    // silent either, or the teacher loses the record without knowing.
    try {
      const res = await fetch("/api/persist-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: args.id,
          goal,
          classNumber,
          language,
          photoPath: args.photoPath,
          artifactHtml: args.html,
          verification: { passed: args.passed, attempts: args.attempts, checks: args.checks },
          corrections: args.corrections,
        }),
      });
      setSaveWarning(
        res.ok ? null : "Could not save this to your library — download it before you close the page."
      );
    } catch {
      setSaveWarning("Could not save this to your library — download it before you close the page.");
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setChecks([]);
    setFinalHtml(null);
    setErrorMessage(null);
    setGenerationId(null);
    setAttempt(0);
    setCorrections([]);
    setSelection(null);
    setComment("");
    setPhotoPath(null);
    setSaveWarning(null);

    try {
      const round = await runVerifiedRound({ firstStatus: "generating" });
      setPhotoPath(round.uploadedPhotoPath);
      await persistRound({
        id: round.id,
        html: round.html,
        passed: round.passed,
        attempts: round.attempts,
        checks: round.checks,
        photoPath: round.uploadedPhotoPath,
        corrections: [],
      });

      setFinalHtml(round.html);
      setSelectMode(false);
      setStatus(round.passed ? "done" : "failed");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  // Correction by pointing (§5 step 3). Unlimited rounds by design — the
  // teacher decides when the material is right — but every round is still
  // verified and still capped at MAX_REPAIRS of automatic repair.
  async function handleCorrection() {
    if (busy || !finalHtml || !selection || !generationId) return;
    const text = comment.trim();
    if (text.length < 3) return;

    const pointer = { ...selection, comment: text };
    setChecks([]);
    setErrorMessage(null);
    setAttempt(0);

    try {
      const round = await runVerifiedRound({
        firstStatus: "correcting",
        generationId,
        previousHtml: finalHtml,
        correction: pointer,
        // Replayed as short placeholders, not whole documents, so a long
        // session's cost grows with the comments rather than the artifact.
        history: corrections.map((c) => ({ label: c.label, comment: c.comment })),
      });

      const next: Correction[] = [
        ...corrections,
        {
          ...selection,
          id: globalThis.crypto.randomUUID(),
          atRound: corrections.length + 1,
          comment: text,
          complexity: round.complexity,
          model: round.model,
        },
      ];
      setCorrections(next);

      await persistRound({
        id: round.id,
        html: round.html,
        passed: round.passed,
        attempts: round.attempts,
        checks: round.checks,
        photoPath,
        corrections: next,
      });

      setFinalHtml(round.html);
      setSelection(null);
      setComment("");
      setSelectMode(false);
      setStatus(round.passed ? "done" : "failed");
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
  const busy =
    status === "generating" ||
    status === "verifying" ||
    status === "repairing" ||
    status === "correcting";

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

      {saveWarning && <p className="mt-4 text-[var(--chalk-rose)]">{saveWarning}</p>}

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

            <button
              type="button"
              onClick={toggleSelectMode}
              className={`min-h-[48px] rounded-md border border-[var(--frame)] px-4 ${
                selectMode ? "bg-[var(--chalk-rose)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
              }`}
            >
              {selectMode ? "done pointing" : "point at what is wrong"}
            </button>
          </div>

          {selectMode && !selection && (
            <p className="mb-3 text-sm text-[var(--chalk-dim)]">
              Tap the part of the material that is wrong.
            </p>
          )}

          {selection && (
            <div className="mb-3 rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] p-3">
              <p className="mb-2 text-sm text-[var(--chalk-dim)]">
                You pointed at{" "}
                <span className="text-[var(--chalk)]">
                  {selection.label || selection.controlId || selection.role || "this part"}
                </span>
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="What is wrong with it? Say it in your own words."
                className="w-full rounded-md border border-[var(--frame)] bg-[var(--stone)] p-2 text-[var(--chalk)] placeholder:text-[var(--chalk-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--frame)]"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCorrection}
                  disabled={busy || comment.trim().length < 3}
                  className="min-h-[48px] rounded-md bg-[var(--frame)] px-5 font-bold text-[var(--stone-deep)] disabled:opacity-50"
                >
                  {status === "correcting" ? "fixing…" : "fix this"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelection(null);
                    setComment("");
                  }}
                  disabled={busy}
                  className="min-h-[48px] rounded-md border border-[var(--frame)] px-5 text-[var(--chalk)] disabled:opacity-50"
                >
                  never mind
                </button>
              </div>
            </div>
          )}

          {corrections.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1 text-sm text-[var(--chalk-dim)]">
              {corrections.map((c) => (
                <li key={c.id}>
                  ✓ {c.label || c.controlId || c.role}: “{c.comment}”
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-auto rounded-lg border-4 border-[var(--frame)] p-2">
            <iframe
              ref={previewRef}
              title="artifact preview"
              onLoad={() => sendSelectMode(selectMode)}
              // The artifact carries a click-reporting shim only in the
              // preview; finalHtml stays pristine for download.
              srcDoc={injectSelectionShim(finalHtml)}
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
