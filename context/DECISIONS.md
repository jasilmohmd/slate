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

## Step 3 — generation core

- Added the three §5a stack dependencies not yet installed
  (`@supabase/supabase-js`, `sharp`, `zod`) — nothing beyond them. Kept
  using raw `fetch` to the OpenAI endpoint (as in the step-2 script)
  instead of an `openai` SDK dependency.
- Model default is **Sol** (`gpt-5.6-sol`), not Terra, as an interim
  choice — §5b's Terra-vs-Sol decision explicitly requires measuring first-
  pass Tier 1 success over 10 generations, and Tier 1 doesn't exist until
  step 4. Defaulting to Sol now matches §5b's own fallback branch ("<70% →
  Sol default throughout") and avoids blocking step 3 on a step-4
  dependency. Revisit once Tier 1 exists.
- One Sol call handles both vision extraction and generation when a photo
  is attached (multimodal message: text contract + image_url), rather than
  two separate calls — §5b assigns both jobs to Sol anyway, so splitting
  them would only add latency and cost.
- `storage.objects` has RLS on by default and this build defines no
  policies for it (spec: no RLS, no auth), so photo uploads use the
  Supabase **service role key** server-side, never the anon key. The
  `generations` table itself has RLS off entirely, so the same server
  client just uses one set of credentials for both.
- The generation UI restricts the class selector to 8–10 (Band B only) —
  Bands A and C are cut from this build (§6), so the dropdown doesn't offer
  choices the backend would reject.
- Streaming uses a custom newline-delimited-JSON protocol over the
  route's `Response` body, not SSE — see PROMPTS.md for the exact message
  shapes. This is what makes the builder UI's live "streaming artifact
  source" panel work and is also the mechanism the demo plan (§6) relies on
  ("stream it so the wait is watchable").
- Incident: `.env.local` got corrupted mid-step when a value was pasted
  without a newline, merging two `KEY=value` lines into one and making
  `OPENAI_API_KEY`'s loaded value silently wrong (still a 401, but a
  confusing one — the masked key in the error tail matched the *next*
  line's value, e.g. ending in "...supabase.co"). Diagnosed by checking
  byte offsets of `=`/CR/LF in the file rather than printing its content.
  Takeaway: when a `.env` value stops working right after an edit, suspect
  a missing newline before re-checking the credential itself.

## Step 4 — Tier 1 verification + repair loop

- Verification runs entirely client-side (`src/lib/verification/tier1.ts`),
  never on the server — AGENTS.md is explicit about this and there's no
  DOM/browser available in the Next.js API route anyway. This forced a
  real architecture change from step 3: `/api/generate` no longer persists
  to Supabase itself (it can't know the verification outcome, which is
  computed in the browser after the stream ends). Persistence moved to a
  new `/api/persist-generation` route, called once by the client after the
  generate→verify→repair loop settles (pass, or repairs exhausted).
  `/api/generate` also gained a repair mode (`previousHtml` +
  `failureSummary` form fields) so the same route serves both the initial
  generation and every repair attempt.
- Static checks (DOM contract, external refs, size, language) run via
  `DOMParser` on the raw string, not the iframe — they don't need
  rendering, and running them first is cheap insurance before paying for
  three viewport passes. Only the geometry/behaviour checks (JS errors,
  control responsiveness, contrast, projection floors, scene aspect,
  overflow) use the live iframe, resized in place through the three Tier 1
  viewports without reloading — see VERIFICATION.md for the full list.
- Cap is 3 repair attempts (4 generations total: initial + 3 repairs),
  matching §5b ("cap repairs at 3 retries"). Whatever the last attempt
  produces is persisted and shown to the teacher regardless of outcome —
  never hidden — with the specific failing checks named, per §4.
- Real incident (see VERIFICATION.md for the full writeup): the first
  version of the control-dispatch helper used `instanceof
  HTMLSelectElement`/`HTMLInputElement`/`HTMLElement` to decide how to
  exercise each `[data-control]` element inside the verification iframe.
  This fails silently across the iframe/parent realm boundary even with
  `allow-same-origin` — same-origin isn't the same realm — so every
  dispatch was a no-op and `prediction-unlocks` failed on every artifact
  regardless of whether it actually worked. Cost 3 wasted repair calls
  against a real generation before being caught. Fixed with `tagName`
  checks and a bare `.click()` (method calls are realm-agnostic), then
  confirmed against the already-generated "failing" artifact at zero
  additional API cost before re-testing live.

