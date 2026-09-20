"use client";

import { useEffect, useState } from "react";

export type SessionSummary = {
  id: string;
  createdAt: string;
  concept: string;
  language: string;
  passed: boolean | null;
};

/**
 * A compact way back to past sessions. §5c asks for one screen with no
 * sidebar; a small menu in the header is the closest thing to that which
 * still lets a teacher reopen last week's material (§2c).
 */
export function RecentSessions({
  currentId,
  onOpen,
  onNew,
  disabled,
}: {
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load sessions (${res.status})`);
        const body = (await res.json()) as { sessions: SessionSummary[] };
        if (!cancelled) setSessions(body.sessions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <div className="relative ml-auto flex items-center gap-2">
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="min-h-[40px] rounded-md border border-[var(--frame)] px-3 text-sm text-[var(--chalk)] disabled:opacity-50"
      >
        new
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-expanded={open}
        className="min-h-[40px] rounded-md border border-[var(--frame)] px-3 text-sm text-[var(--chalk)] disabled:opacity-50"
      >
        recent
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-[min(90vw,420px)] rounded-lg border border-[var(--frame)] bg-[var(--stone-deep)] p-2 shadow-lg">
          {error && <p className="p-2 text-sm text-[var(--chalk-rose)]">{error}</p>}
          {!error && sessions === null && <p className="p-2 text-sm text-[var(--chalk-dim)]">Loading…</p>}
          {sessions && sessions.length === 0 && (
            <p className="p-2 text-sm text-[var(--chalk-dim)]">No saved sessions yet.</p>
          )}
          {sessions && sessions.length > 0 && (
            <ul className="max-h-[60vh] overflow-y-auto">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpen(session.id);
                    }}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--stone)] ${
                      session.id === currentId ? "bg-[var(--stone)]" : ""
                    }`}
                  >
                    <span className="line-clamp-2 text-sm text-[var(--chalk)]">{session.concept || "Untitled"}</span>
                    <span className="text-xs text-[var(--chalk-dim)]">
                      {new Date(session.createdAt).toLocaleString()} · {session.language}
                      {session.passed === false ? " · some checks failed" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
