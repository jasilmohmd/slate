# Decisions

## Step 1 — artifact base CSS

- Light "paper/ink" palette for generated artifacts, not the builder's dark
  stone/chalk theme. §5c's stone/chalk palette is scoped to "the Slate
  builder" UI; a light background reads better under §2a's "assume a dim
  bulb and a daylit room" — dark backgrounds wash out under ambient light on
  a projector, light backgrounds don't.
- Axis 1 (size) and axis 2 (aspect) are implemented as two independent media
  queries — `(min-width: 900px)` for type scale/stroke, `(orientation:
  landscape)` for scene/chrome layout — so they can never collapse into one
  breakpoint by accident, per §2a's explicit warning.
- The base CSS supplies tokens and the scene/chrome flex containers only. It
  deliberately does not implement the scene reframe/pan algorithm or the
  in-scene label HTML-overlay technique — both are content-specific and
  belong to each artifact's own markup/JS (starting with the step 2
  reference artifact).
- Model codename → API model ID mapping (confirmed by user, screenshot of
  their OpenAI model picker): Astra = `gpt-6-astra`, Sol = `gpt-5.6-sol`,
  Terra = `gpt-5.6-terra`, Luna = `gpt-5.6-luna`.
- Accent colours were picked conservatively dark against the light paper
  background to keep margin above the 4.5:1 text contrast floor; exact
  contrast ratios are validated by Tier 1 iframe verification in step 4, not
  hand-computed here.

## Step 2 — reference artifact

- Generated once with Astra (`gpt-6-astra`) via a one-off script
  (`scripts/generate-reference-artifact.mjs`, not part of the app), embedding
  the step-1 base CSS and the full §2/§2a/§2b/§2d contract text in the
  prompt. Cost: ~11.4k total tokens (~$0.42), within the ~$0.37 estimate.
- Manually verified in-browser (not just read) at 360×640, 1024×768 and
  1920×1080 using `getComputedStyle`/`getBoundingClientRect` — the same
  method Tier 1 will use in step 4 — before treating it as final. Found and
  fixed one real bug: the base CSS's `@media (orientation: landscape)` rule
  let `align-items: stretch` (flexbox's default) stretch the scene section
  to match the chrome column's height, leaving a large dead white area
  below the diagram at wide viewports. Fixed by adding
  `align-items: flex-start` to that rule — patched in both
  `src/lib/artifact/baseCss.ts` (source of truth for future generations)
  and by hand in the already-generated reference artifact's inlined
  `<style>`.
- Confirmed programmatically (via DOM queries, not text grep — grepping the
  raw HTML overcounts because CSS attribute selectors like
  `[data-role="scene"]` also match the string): every §2d `data-role`
  appears exactly once, `reveal` is hidden on load, contrast ratios for
  every colour pair are ≥5.5:1, every `data-text="label"` node is ≥28px at
  ≥900px width, touch targets are exactly 48px at <900px, no horizontal
  overflow at any of the three viewports, and there are zero external
  references in the file (29.7KB, well under the 2MB cap).
- The instructional-density collapse required by §2b (full text below
  900px, collapsed-but-reachable above it) is implemented with native
  `<details>`/`<summary>` toggled via a `matchMedia('(min-width: 900px)')`
  listener — collapsed content stays in the DOM and is one click away,
  which satisfies "present and reachable, not removed" without inventing
  new markup beyond the §2d contract.
- Checked in at `src/lib/artifact/reference.ts` (not `context/`, per §6) as
  a template-literal export, generated from the verified HTML by
  `scripts/embed-reference-artifact.mjs` (also not part of the app) to
  avoid manual-transcription errors; round-trip-verified byte-for-byte
  against the source file before committing.

