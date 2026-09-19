/**
 * Slate artifact base CSS (§5a, §2a). Inlined into the <style> of every
 * generated artifact so §2a's rules are enforced by construction, not by
 * chance. Plain CSS only — no Tailwind, no external stylesheet (§2).
 *
 * What this file does NOT do, because CSS alone can't (each generated
 * artifact must handle these itself):
 *  - `vector-effect="non-scaling-stroke"` on scaled SVG lines/strokes.
 *  - Rendering in-scene text as an HTML overlay (or resizing it against the
 *    actual rendered scale) so it doesn't shrink below `--text-label` when
 *    the scene's viewBox scales down.
 *  - The scene reframe/pan logic when the container falls below
 *    `data-min-aspect` — that's content-specific per artifact.
 */
export const ARTIFACT_BASE_CSS = `
:root {
  /* Colour — high contrast, projection-safe (§2a). Never the only signal:
     pair every colour with shape, label or position in the markup. */
  --ink: #17211f;
  --ink-soft: #3f4a47;
  --paper: #faf8f2;
  --paper-well: #eeece2;
  --accent-blue: #1c4f8c;
  --accent-amber: #8a4a10;
  --accent-violet: #4a3170;
  --correct: #1e6b3a;
  --incorrect: #a02638;

  /* Type scale — handheld default, axis 1 of §2a (<900px) */
  --text-label: 14px;
  --text-body: 16px;
  --text-heading: 20px;
  --text-title: 24px;

  /* Stroke weight — handheld default */
  --stroke: 1.5px;

  /* Touch targets (§2a) */
  --control-min: 48px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
}

/* Axis 1 — size. Above 900px is always projection-safe, unconditionally:
   a laptop driving a projector reports as an ordinary desktop viewport, so
   there is no projector-detection branch anywhere in this file (§2a). This
   floor applies to ALL text, including in-scene axis labels and units. */
@media (min-width: 900px) {
  :root {
    --text-label: 28px;
    --text-body: 28px;
    --text-heading: 40px;
    --text-title: 56px;
    --stroke: 3px;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  /* System stack only — artifacts cannot load webfonts (§2). Manjari is
     builder UI only; Malayalam falls back to whatever the OS ships. */
  font-family: -apple-system, "Noto Sans Malayalam", "Noto Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

body {
  font-size: var(--text-body);
  line-height: 1.4;
}

[data-role="meta"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--paper-well);
  border-bottom: var(--stroke) solid var(--ink);
  font-size: var(--text-label);
  color: var(--ink-soft);
}

[data-role="artifact"] {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Axis 2 — aspect, independent of axis 1 (§2a). Portrait stacks the scene
   above the chrome; landscape puts the scene beside a side rail. */
@media (orientation: landscape) {
  [data-role="artifact"] {
    flex-direction: row;
  }
  [data-role="scene"] {
    flex: 1 1 60%;
    min-width: 0;
  }
  [data-role="chrome"] {
    flex: 0 0 40%;
    max-width: 480px;
    overflow-y: auto;
  }
}

[data-role="scene"] {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
  overflow: hidden;
}

[data-role="scene"] svg {
  width: 100%;
  height: auto;
  display: block;
}

[data-role="chrome"] {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

/* Controls cluster in one region and never need hover to be usable (§2a). */
[data-role="controls"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

[data-control] {
  min-width: var(--control-min);
  min-height: var(--control-min);
  font-size: var(--text-body);
  border: var(--stroke) solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  border-radius: 6px;
  padding: var(--space-xs) var(--space-sm);
}

[data-role="prediction"],
[data-role="reveal"],
[data-role="explanation"] {
  padding: var(--space-md);
  border: var(--stroke) solid var(--ink);
  border-radius: 6px;
  background: var(--paper-well);
}

[data-role="reveal"][hidden] {
  display: none;
}

/* Units, axis labels and tick values (§2d) share the same projection floor
   as body text (§2a). */
[data-text="label"] {
  font-size: var(--text-label);
  fill: var(--ink);
  color: var(--ink);
}
`;
