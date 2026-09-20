"use client";

// DEV-ONLY scoring harness for the §5b generation-model measurement. Not
// linked from the builder and not part of the teacher-facing product.
//
// Tier 1 runs in a browser by mandate (AGENTS.md), and §5a forbids adding a
// headless browser, so the measurement is two halves: scripts/measure-terra.mjs
// generates the candidates to disk, and this page scores them here with the
// real, unmodified runTier1 — no reimplementation that could drift from what
// the builder actually enforces.

import { useState } from "react";
import { runTier1, type CheckResult } from "@/lib/verification/tier1";

type Row = {
  name: string;
  passed: boolean;
  failed: CheckResult[];
};

export default function Measure() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [language, setLanguage] = useState<"ml" | "en">("ml");
  const [baseUrl, setBaseUrl] = useState("/terra-runs");
  const [count, setCount] = useState(10);

  // Convenience for a scripted batch: the generator writes terra-NN.html,
  // so point this at a directory served over http (e.g. copied under
  // public/) instead of picking ten files by hand.
  async function handleUrls(baseUrl: string, count: number) {
    setRunning(true);
    setRows([]);

    for (let i = 1; i <= count; i++) {
      const name = `terra-${String(i).padStart(2, "0")}.html`;
      try {
        const res = await fetch(`${baseUrl.replace(/[/]$/, "")}/${name}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const result = await runTier1(html, language);
        setRows((prev) => [
          ...prev,
          { name, passed: result.passed, failed: result.checks.filter((c) => !c.passed) },
        ]);
      } catch (err) {
        setRows((prev) => [
          ...prev,
          {
            name,
            passed: false,
            failed: [
              {
                id: "load",
                label: "could not load",
                passed: false,
                detail: err instanceof Error ? err.message : String(err),
              },
            ],
          },
        ]);
      }
    }

    setRunning(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setRunning(true);
    setRows([]);

    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    for (const file of sorted) {
      const html = await file.text();
      const result = await runTier1(html, language);
      setRows((prev) => [
        ...prev,
        { name: file.name, passed: result.passed, failed: result.checks.filter((c) => !c.passed) },
      ]);
    }

    setRunning(false);
  }

  const scored = rows.length;
  const passes = rows.filter((r) => r.passed).length;
  const rate = scored > 0 ? (passes / scored) * 100 : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Tier 1 batch scoring (dev only)</h1>
      <p className="mt-2 text-sm text-[var(--chalk-dim)]">
        Load the generated candidates. §5b decision rule: ≥70% first-pass → make that model the
        generation default via SLATE_GENERATION_MODEL.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => handleUrls(baseUrl, count)}
          className="min-h-[48px] rounded-md border border-[var(--frame)] px-4 disabled:opacity-50"
        >
          score from URL
        </button>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="min-h-[48px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-3"
        />
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="min-h-[48px] w-20 rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-3"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".html,text/html"
          multiple
          disabled={running}
          onChange={(e) => handleFiles(e.target.files)}
          className="text-sm"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as "ml" | "en")}
          className="min-h-[48px] rounded-md border border-[var(--frame)] bg-[var(--stone-deep)] px-3"
        >
          <option value="ml">ml</option>
          <option value="en">en</option>
        </select>
      </div>

      {scored > 0 && (
        <p className="mt-6 text-lg">
          first-pass rate:{" "}
          <strong className={rate >= 70 ? "text-[var(--chalk-green)]" : "text-[var(--chalk-rose)]"}>
            {passes}/{scored} ({rate.toFixed(0)}%)
          </strong>
          {running ? " — scoring…" : ""}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.name}>
            <span className={row.passed ? "text-[var(--chalk-green)]" : "text-[var(--chalk-rose)]"}>
              {row.passed ? "✓" : "✗"} {row.name}
            </span>
            {row.failed.length > 0 && (
              <ul className="ml-6 text-[var(--chalk-dim)]">
                {row.failed.map((c, i) => (
                  <li key={`${c.id}-${i}`}>
                    {c.label} — {c.detail ?? "failed"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
