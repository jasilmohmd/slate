"use client";

import { useEffect, useState } from "react";
import type { CheckResult } from "@/lib/verification/tier1";

export type ActivityStatus =
  | "generating"
  | "verifying"
  | "repairing"
  | "done"
  | "failed"
  | "stopped"
  | "error";

export type Activity = {
  id: string;
  status: ActivityStatus;
  startedAt: number;
  endedAt: number | null;
  checks: CheckResult[];
  attempt: number;
  model: string;
  conceptComplexity: string | null;
  error: string | null;
};

const RUNNING_COPY: Record<string, string> = {
  generating: "Drafting your material…",
  verifying: "Checking it works…",
  repairing: "Fixing a few things…",
};

const DONE_COPY: Record<string, string> = {
  done: "Drafted and checked",
  failed: "Finished, but some checks still fail",
  stopped: "Stopped",
  error: "Something went wrong",
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isRunning(status: ActivityStatus): boolean {
  return status === "generating" || status === "verifying" || status === "repairing";
}

/**
 * The long-running work, rendered as a turn in the transcript rather than a
 * spinner: what is happening, how long it has been going, a way to stop it,
 * and the checks list underneath.
 *
 * The checks list stays the credibility beat (§5c) — it is the one place a
 * teacher sees a failure being named and repaired rather than hidden — so it
 * is one click away while running and stays reachable afterwards.
 */
export function ActivityBlock({
  activity,
  onStop,
  maxRepairs,
}: {
  activity: Activity;
  onStop: () => void;
  maxRepairs: number;
}) {
  const running = isRunning(activity.status);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // One interval, only while running.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const elapsed = formatElapsed((activity.endedAt ?? (running ? now : activity.startedAt)) - activity.startedAt);
  const failedChecks = activity.checks.filter((c) => !c.passed);

  const headline = running
    ? (RUNNING_COPY[activity.status] ?? "Working…")
    : (DONE_COPY[activity.status] ?? "Finished");

  const tone =
    activity.status === "done"
      ? "text-[var(--chalk-green)]"
      : activity.status === "failed" || activity.status === "error"
        ? "text-[var(--chalk-rose)]"
        : "text-[var(--chalk)]";

  return (
    <div className="rounded-lg border border-[var(--frame)] bg-[var(--stone-deep)] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={running ? "slate-pulse" : tone} aria-hidden="true">
          {running ? "⏺" : activity.status === "done" ? "✓" : activity.status === "stopped" ? "■" : "✗"}
        </span>
        <span className={tone}>{headline}</span>
        <span className="text-sm text-[var(--chalk-dim)] tabular-nums">{elapsed}</span>

        {activity.status === "repairing" && (
          <span className="text-sm text-[var(--chalk-dim)]">
            attempt {activity.attempt} of {maxRepairs}
          </span>
        )}

        {running && (
          <button
            type="button"
            onClick={onStop}
            className="ml-auto min-h-[36px] rounded-md border border-[var(--frame)] px-3 text-sm text-[var(--chalk)] hover:bg-[var(--stone)]"
          >
            Stop
          </button>
        )}

        {activity.checks.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className={`${running ? "" : "ml-auto"} min-h-[36px] rounded-md px-2 text-sm text-[var(--chalk-dim)] hover:text-[var(--chalk)]`}
            aria-expanded={expanded}
          >
            {expanded ? "⌃ hide checks" : `⌄ ${failedChecks.length > 0 ? `${failedChecks.length} failing` : "checks"}`}
          </button>
        )}
      </div>

      {activity.error && <p className="mt-2 text-sm text-[var(--chalk-rose)]">{activity.error}</p>}

      {activity.model && !running && (
        <p className="mt-2 text-xs text-[var(--chalk-dim)]">
          {activity.model}
          {activity.conceptComplexity ? ` · ${activity.conceptComplexity} concept` : ""}
        </p>
      )}

      {expanded && activity.checks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-[var(--frame)] pt-3 text-sm">
          {activity.checks.map((check, index) => (
            <li
              key={`${check.id}-${index}`}
              className={check.passed ? "text-[var(--chalk-green)]" : "text-[var(--chalk-rose)]"}
            >
              {check.passed ? "✓" : "✗"} {check.label}
              {!check.passed && check.detail ? ` — ${check.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
