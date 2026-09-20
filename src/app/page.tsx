"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { runTier1, type CheckResult } from "@/lib/verification/tier1";
import { injectSelectionShim } from "@/lib/artifact/selectionShim";
import { ActivityBlock, isRunning, type Activity, type ActivityStatus } from "./_components/ActivityBlock";
import { Composer, type Attachment, type Pointer } from "./_components/Composer";
import { RecentSessions } from "./_components/RecentSessions";
import type { Turn } from "@/lib/session";

type PreviewMode = "phone" | "projector";

/** A teacher's message in the transcript. */
type TeacherTurn = {
  kind: "teacher";
  id: string;
  at: string;
  text: string;
  pointer: Pointer | null;
  attachments: Array<{ url: string; name: string }>;
  turnKind: "goal" | "refine" | "correction";
};

/** The work Slate did in response, shown as a live activity block. */
type ActivityTurn = {
  kind: "activity";
  id: string;
  at: string;
  activity: Activity;
};

type TranscriptItem = TeacherTurn | ActivityTurn;

const MAX_REPAIRS = 3;
const MAX_ATTACHMENTS = 8;

function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function clampNullable(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

async function callGenerate(params: {
  goal: string;
  classNumber: number;
  language: "ml" | "en";
  files: File[];
  previousHtml?: string;
  failureSummary?: string;
  refine?: { comment: string; pointer: Pointer | null };
  history?: Array<{ label?: string; comment: string }>;
  generationId?: string;
  signal: AbortSignal;
}): Promise<{
  id: string;
  html: string;
  photoPaths: string[];
  model: string;
  complexity: "simple" | "complex" | null;
  conceptComplexity: "simple" | "standard" | "dense" | null;
}> {
  const formData = new FormData();
  formData.set("goal", params.goal);
  formData.set("classNumber", String(params.classNumber));
  formData.set("language", params.language);
  for (const file of params.files) formData.append("photo", file);
  if (params.previousHtml) formData.set("previousHtml", params.previousHtml);
  if (params.failureSummary) formData.set("failureSummary", params.failureSummary);
  if (params.generationId) formData.set("generationId", params.generationId);
  if (params.refine) formData.set("refine", JSON.stringify(params.refine));
  if (params.history?.length) formData.set("history", JSON.stringify(params.history));

  const res = await fetch("/api/generate", { method: "POST", body: formData, signal: params.signal });
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
          photoPaths: Array.isArray(msg.photoPaths) ? msg.photoPaths : [],
          model: msg.model ?? "",
          complexity: msg.complexity ?? null,
          conceptComplexity: msg.conceptComplexity ?? null,
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

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export default function Home() {
  const [classNumber, setClassNumber] = useState(9);
  const [language, setLanguage] = useState<"ml" | "en">("ml");
  const [goal, setGoal] = useState("");

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pointer, setPointer] = useState<Pointer | null>(null);

  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [finalHtml, setFinalHtml] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  // Judged once, on the first generation; refinements route on their own
  // comment and must not overwrite it.
  const [conceptComplexity, setConceptComplexity] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const [selectMode, setSelectMode] = useState(false);

  const previewRef = useRef<HTMLIFrameElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = transcript.some((item) => item.kind === "activity" && isRunning(item.activity.status));
  const started = transcript.length > 0;

  // ---- reopening a session -----------------------------------------------

  const [loadingSession, setLoadingSession] = useState(false);

  function resetSession() {
    abortRef.current?.abort();
    for (const a of attachmentsRef.current) URL.revokeObjectURL(a.url);
    setTranscript([]);
    setFinalHtml(null);
    setGenerationId(null);
    setPhotoPaths([]);
    setConceptComplexity(null);
    setGoal("");
    setText("");
    setAttachments([]);
    setPointer(null);
    setSelectMode(false);
    setSaveWarning(null);
    window.history.replaceState(null, "", window.location.pathname);
  }

  // A stored transcript comes back as turns; rebuild the same items the live
  // session would have produced. Results carry no per-check detail (only the
  // outcome was persisted per turn), so their checks list is empty.
  function itemsFromTurns(turns: Turn[]): TranscriptItem[] {
    return turns.map((turn): TranscriptItem => {
      const at = turn.at;
      if (turn.role === "teacher") {
        return {
          kind: "teacher",
          id: turn.id,
          at,
          text: turn.text,
          pointer: turn.pointer ?? null,
          // Stored attachments live in a private bucket; the transcript notes
          // them rather than trying to render them.
          attachments: [],
          turnKind: turn.kind === "goal" || turn.kind === "correction" ? turn.kind : "refine",
        };
      }
      const passed = turn.verification?.passed ?? true;
      const when = Date.parse(at) || Date.now();
      return {
        kind: "activity",
        id: turn.id,
        at,
        activity: {
          id: turn.id,
          status: passed ? "done" : "failed",
          startedAt: when,
          endedAt: when,
          checks: [],
          attempt: Math.max(0, (turn.verification?.attempts ?? 1) - 1),
          model: turn.model ?? "",
          conceptComplexity: turn.complexity ?? null,
          error: null,
        },
      };
    });
  }

  const openSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Could not open session (${res.status})`);
      }
      const session = await res.json();
      abortRef.current?.abort();
      setTranscript(itemsFromTurns(session.turns ?? []));
      setFinalHtml(session.artifactHtml ?? null);
      setGenerationId(session.id);
      setPhotoPaths(session.photoPaths ?? []);
      setConceptComplexity(session.conceptComplexity ?? null);
      setGoal(session.goal ?? "");
      setClassNumber(session.classNumber ?? 9);
      setLanguage(session.language === "en" ? "en" : "ml");
      setText("");
      setAttachments([]);
      setPointer(null);
      setSelectMode(false);
      setSaveWarning(null);
      window.history.replaceState(null, "", `?session=${session.id}`);
    } catch (err) {
      setSaveWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSession(false);
    }
  }, []);

  // Survive a reload: the session id lives in the URL once it exists.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("session");
    if (!id) return;
    // Deferred so the load starts after this render commits rather than
    // setting state from inside the effect body.
    const timer = setTimeout(() => void openSession(id), 0);
    return () => clearTimeout(timer);
  }, [openSession]);

  // ---- attachments -------------------------------------------------------

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = [...list].filter((file) => file.type.startsWith("image/"));
    setAttachments((prev) => {
      const room = Math.max(0, MAX_ATTACHMENTS - prev.length);
      const added = incoming.slice(0, room).map((file) => ({
        id: globalThis.crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  // Object URLs are not garbage-collected with the File; revoke whatever is
  // still pending when the page goes away.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.url);
    };
  }, []);

  // ---- pointing at the preview ------------------------------------------

  const sendSelectMode = useCallback((on: boolean) => {
    previewRef.current?.contentWindow?.postMessage({ type: "slate-select-mode", on }, "*");
  }, []);

  useEffect(() => {
    sendSelectMode(selectMode);
  }, [selectMode, sendSelectMode]);

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
      setPointer({
        controlId: clampNullable(data.controlId, 200),
        role: clampNullable(data.role, 200),
        label: clampString(data.label, 120),
        elementSnippet: clampString(data.elementSnippet, 400),
      });
      // One tap picks one element; the chip in the composer carries it.
      setSelectMode(false);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ---- transcript helpers ------------------------------------------------

  function patchActivity(id: string, patch: Partial<Activity>) {
    setTranscript((prev) =>
      prev.map((item) =>
        item.kind === "activity" && item.id === id
          ? { ...item, activity: { ...item.activity, ...patch } }
          : item
      )
    );
  }

  function appendCheck(id: string, check: CheckResult) {
    setTranscript((prev) =>
      prev.map((item) =>
        item.kind === "activity" && item.id === id
          ? { ...item, activity: { ...item.activity, checks: [...item.activity.checks, check] } }
          : item
      )
    );
  }

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length, busy]);

  // ---- persistence -------------------------------------------------------

  function turnsForRecord(items: TranscriptItem[], paths: string[]) {
    return items.map((item) => {
      if (item.kind === "teacher") {
        return {
          id: item.id,
          at: item.at,
          role: "teacher" as const,
          kind: item.turnKind,
          text: item.text,
          pointer: item.pointer,
          attachments: item.turnKind === "goal" ? paths : [],
        };
      }
      const a = item.activity;
      return {
        id: item.id,
        at: item.at,
        role: "slate" as const,
        kind: "result" as const,
        text: a.status,
        model: a.model || undefined,
        complexity: a.conceptComplexity,
        verification: a.endedAt
          ? { passed: a.status === "done", attempts: a.attempt + 1 }
          : null,
      };
    });
  }

  async function persist(args: {
    id: string;
    goal: string;
    html: string;
    passed: boolean;
    attempts: number;
    checks: CheckResult[];
    items: TranscriptItem[];
    paths: string[];
    conceptComplexity: string | null;
  }) {
    // A failed save must not look like a failed generation: the artifact is
    // finished, previewable and downloadable either way. But it must not be
    // silent either, or the teacher loses the record without knowing.
    const warning = "Could not save this session — download the material before you close the page.";
    try {
      const res = await fetch("/api/persist-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: args.id,
          // Passed in rather than read from state: on the first turn the
          // goal was set moments ago and this closure still sees the old
          // value.
          goal: args.goal,
          classNumber,
          language,
          photoPaths: args.paths,
          conceptComplexity: args.conceptComplexity,
          artifactHtml: args.html,
          verification: { passed: args.passed, attempts: args.attempts, checks: args.checks },
          turns: turnsForRecord(args.items, args.paths),
        }),
      });
      setSaveWarning(res.ok ? null : warning);
    } catch {
      setSaveWarning(warning);
    }
  }

  // ---- the verified round --------------------------------------------------

  // One verified round: generate (or refine), run Tier 1, and fall into the
  // repair loop until it passes or MAX_REPAIRS is spent. Both the first
  // generation and every refinement go through this, so a refinement can
  // never quietly ship an artifact that breaks the §2d contract.
  async function runVerifiedRound(opts: {
    activityId: string;
    sessionGoal: string;
    files: File[];
    previousHtml?: string;
    refine?: { comment: string; pointer: Pointer | null };
    history?: Array<{ label?: string; comment: string }>;
    signal: AbortSignal;
  }) {
    let html = "";
    let id = generationId ?? undefined;
    let uploaded: string[] = [];
    let model = "";
    let conceptComplexity: string | null = null;
    let previousHtml = opts.previousHtml;
    let refine = opts.refine;
    let failureSummary: string | undefined;
    let checks: CheckResult[] = [];
    let passed = false;
    let attemptNumber = 0;

    for (;;) {
      patchActivity(opts.activityId, {
        status: attemptNumber === 0 ? "generating" : "repairing",
        attempt: attemptNumber,
        checks: [],
      });

      const result = await callGenerate({
        goal: opts.sessionGoal,
        classNumber,
        language,
        files: opts.files,
        previousHtml,
        failureSummary,
        refine,
        history: opts.history,
        generationId: id,
        signal: opts.signal,
      });
      html = result.html;
      id = result.id;
      model = result.model;
      if (attemptNumber === 0) conceptComplexity = result.conceptComplexity;
      if (result.photoPaths.length) uploaded = result.photoPaths;
      setGenerationId(id);

      patchActivity(opts.activityId, { status: "verifying", model, conceptComplexity });
      const verification = await runTier1(html, language, (check) =>
        appendCheck(opts.activityId, check)
      );
      checks = verification.checks;
      passed = verification.passed;

      if (opts.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (passed || attemptNumber >= MAX_REPAIRS) break;

      attemptNumber += 1;
      previousHtml = html;
      failureSummary = buildFailureSummary(checks);
      // A repair is a repair: the refinement has already been applied, and
      // re-sending it would ask for the same change a second time.
      refine = undefined;
    }

    return { html, id: id as string, uploaded, model, conceptComplexity, passed, attempts: attemptNumber + 1, checks };
  }

  // ---- send ----------------------------------------------------------------

  async function handleSend() {
    const comment = text.trim();
    if (busy || comment.length < 2) return;

    const isFirst = !finalHtml;
    const sessionGoal = isFirst ? comment : goal;
    if (isFirst) setGoal(comment);

    const now = new Date().toISOString();
    const teacher: TeacherTurn = {
      kind: "teacher",
      id: globalThis.crypto.randomUUID(),
      at: now,
      text: comment,
      pointer: isFirst ? null : pointer,
      attachments: attachments.map((a) => ({ url: a.url, name: a.file.name })),
      turnKind: isFirst ? "goal" : pointer ? "correction" : "refine",
    };
    const activityId = globalThis.crypto.randomUUID();
    const activityTurn: ActivityTurn = {
      kind: "activity",
      id: activityId,
      at: now,
      activity: {
        id: activityId,
        status: "generating",
        startedAt: Date.now(),
        endedAt: null,
        checks: [],
        attempt: 0,
        model: "",
        conceptComplexity: null,
        error: null,
      },
    };

    const history = transcript
      .filter((item): item is TeacherTurn => item.kind === "teacher" && item.turnKind !== "goal")
      .map((item) => ({ label: item.pointer?.label, comment: item.text }));

    const files = attachments.map((a) => a.file);
    const nextItems = [...transcript, teacher, activityTurn];
    setTranscript(nextItems);
    setText("");
    setAttachments([]);
    setPointer(null);
    setSelectMode(false);
    setSaveWarning(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const round = await runVerifiedRound({
        activityId,
        sessionGoal,
        files,
        previousHtml: isFirst ? undefined : (finalHtml ?? undefined),
        refine: isFirst ? undefined : { comment, pointer },
        history,
        signal: controller.signal,
      });

      const paths = round.uploaded.length ? round.uploaded : photoPaths;
      setPhotoPaths(paths);
      const sessionComplexity = round.conceptComplexity ?? conceptComplexity;
      setConceptComplexity(sessionComplexity);
      window.history.replaceState(null, "", `?session=${round.id}`);
      setFinalHtml(round.html);

      const finalStatus: ActivityStatus = round.passed ? "done" : "failed";
      const finished = nextItems.map((item) =>
        item.kind === "activity" && item.id === activityId
          ? {
              ...item,
              activity: {
                ...item.activity,
                status: finalStatus,
                endedAt: Date.now(),
                checks: round.checks,
                attempt: round.attempts - 1,
                model: round.model,
                conceptComplexity: round.conceptComplexity,
              },
            }
          : item
      );
      setTranscript(finished);

      await persist({
        id: round.id,
        goal: sessionGoal,
        html: round.html,
        passed: round.passed,
        attempts: round.attempts,
        checks: round.checks,
        items: finished,
        paths,
        conceptComplexity: sessionComplexity,
      });
    } catch (err) {
      if (isAbort(err) || controller.signal.aborted) {
        // The teacher pressed Stop: nothing is persisted, nothing replaces
        // the current material.
        patchActivity(activityId, { status: "stopped", endedAt: Date.now() });
      } else {
        patchActivity(activityId, {
          status: "error",
          endedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
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
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--frame)] px-4 py-3">
        <Image src="/logo.png" alt="" width={40} height={32} priority className="h-8 w-auto" />
        <h1 className="text-2xl font-bold text-[var(--chalk)]">Slate</h1>
        {goal && <span className="truncate text-sm text-[var(--chalk-dim)]">{goal}</span>}
        <RecentSessions
          currentId={generationId}
          onOpen={(id) => void openSession(id)}
          onNew={resetSession}
          disabled={busy || loadingSession}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Transcript */}
        <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {loadingSession && <p className="slate-pulse text-[var(--chalk-dim)]">Opening session…</p>}

            {transcript.length === 0 && !loadingSession && (
              <div className="mt-12 text-center text-[var(--chalk-dim)]">
                <p className="text-xl text-[var(--chalk)]">What are you teaching?</p>
                <p className="mt-2 text-sm">
                  Say it in your own words. Add a photo of the textbook page or the board if it helps.
                </p>
              </div>
            )}

            {transcript.map((item) =>
              item.kind === "teacher" ? (
                <div key={item.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-[var(--stone-deep)] px-4 py-3 text-[var(--chalk)]">
                    {item.pointer && (
                      <p className="mb-1 text-xs text-[var(--chalk-dim)]">
                        about {item.pointer.label || item.pointer.controlId || item.pointer.role}
                      </p>
                    )}
                    {item.attachments.length > 0 && (
                      <ul className="mb-2 flex flex-wrap gap-2">
                        {item.attachments.map((a) => (
                          <li key={a.url} className="h-14 w-14 overflow-hidden rounded-md border border-[var(--frame)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="whitespace-pre-wrap">{item.text}</p>
                  </div>
                </div>
              ) : (
                <ActivityBlock key={item.id} activity={item.activity} onStop={handleStop} maxRepairs={MAX_REPAIRS} />
              )
            )}

            {saveWarning && <p className="text-sm text-[var(--chalk-rose)]">{saveWarning}</p>}
          </div>
        </div>

        {/* Preview */}
        {finalHtml && (
          <aside className="max-h-[50dvh] shrink-0 overflow-y-auto border-t border-[var(--frame)] p-3 md:max-h-none md:w-[460px] md:border-l md:border-t-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode("phone")}
                className={`min-h-[40px] rounded-md border border-[var(--frame)] px-3 text-sm ${
                  previewMode === "phone" ? "bg-[var(--frame)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
                }`}
              >
                phone
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("projector")}
                className={`min-h-[40px] rounded-md border border-[var(--frame)] px-3 text-sm ${
                  previewMode === "projector" ? "bg-[var(--frame)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
                }`}
              >
                projector
              </button>
              <button
                type="button"
                onClick={() => setSelectMode((on) => !on)}
                disabled={busy}
                className={`min-h-[40px] rounded-md border border-[var(--frame)] px-3 text-sm disabled:opacity-50 ${
                  selectMode ? "bg-[var(--chalk-rose)] text-[var(--stone-deep)]" : "text-[var(--chalk)]"
                }`}
              >
                {selectMode ? "tap something…" : "point at what is wrong"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="ml-auto min-h-[40px] rounded-md bg-[var(--chalk-green)] px-3 text-sm font-bold text-[var(--stone-deep)]"
              >
                download
              </button>
            </div>

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
          </aside>
        )}
      </div>

      <Composer
        text={text}
        onTextChange={setText}
        attachments={attachments}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        pointer={pointer}
        onClearPointer={() => setPointer(null)}
        classNumber={classNumber}
        onClassChange={setClassNumber}
        language={language}
        onLanguageChange={setLanguage}
        onSend={handleSend}
        busy={busy}
        started={started}
      />
    </div>
  );
}
