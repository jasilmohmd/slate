# Tier 1 verification

Implemented at `src/lib/verification/tier1.ts`. Runs entirely client-side
(browser only, never on the server — see AGENTS.md) via `runTier1(html,
language, onProgress?)`, called from `src/app/page.tsx`'s generate/verify/
repair loop.

## Order of operations

1. **Static checks** (no iframe needed — `DOMParser` + string analysis on
   the raw HTML). Run first; if `structure` fails, everything else is
   skipped, since a contract failure makes later checks meaningless (§4).
   - `structure` — every §2d `data-role` present exactly once; scene has
     numeric `data-intrinsic-aspect`/`data-min-aspect`; `reveal` carries
     `hidden` in the raw markup.
   - `offline` — regex scan for `https?://`, `<link`, `@import`.
   - `size` — UTF-8 byte length ≤ 2MB.
   - `language` — ratio of Malayalam-range characters (U+0D00–U+0D7F) in
     `body.textContent`; ≥10% required for `ml`, <5% required for `en`.
     A heuristic, not a real language-ID model.
   - `no-hover-only` — heuristic regex scan of `<style>` blocks for
     `:hover` rules that toggle `display`/`visibility`/`opacity`. Static
     analysis only; does not simulate real hover.
2. **Dynamic checks** — one hidden, off-screen iframe
   (`sandbox="allow-scripts allow-same-origin"`, positioned at
   `top:-10000px`) is created once, loaded with the artifact (plus a tiny
   injected `<script>` right after `<head>` that installs a
   `window.__slateErrors` collector before the artifact's own script
   runs), then **resized in place** through the three target viewports
   without reloading — matching §4's mechanism exactly.
   - `no-js-errors` — `window.__slateErrors` is empty after load and after
     exercising every `[data-control]` element once.
   - `prediction-unlocks` — after exercising controls (see below),
     `[data-role="reveal"]` is no longer `hidden`.
   - Per viewport (`360×640`, `1024×768`, `1920×1080`), one aggregated
     check line:
     - `overflow` — `documentElement.scrollWidth <= clientWidth` (all
       three viewports).
     - `scene-aspect` — the rendered SVG still matches its own viewBox
       ratio (within 5%), i.e. the scene is not being squashed, and the
       declared `data-intrinsic-aspect` matches that viewBox (all three
       viewports). See the incident note below — this check previously
       asserted something the spec does not say.
     - `contrast` — WCAG contrast ≥4.5:1, sampled over up to 60 visible
       text-bearing elements, effective background found by walking up
       ancestors to the first non-transparent `background-color` (all
       three viewports).
     - `projection-text` — every `[data-text="label"]` node and
       `body`'s own font-size ≥28px (only checked at ≥900px viewports).
     - `projection-stroke` — every SVG shape's computed `stroke-width`
       ≥3px, or trivially passes if the artifact has no SVG strokes at all
       (only checked at ≥900px viewports).

## Exercising controls

For every `[data-control]` element: `<select>` gets its last non-empty
`<option>` selected + a `change` event; `<input>` gets `input` + `change`
events; everything else (buttons, `<summary>`) gets `.click()`. Tag-name
checks, not `instanceof` — see the incident note below.

## Repair loop

`src/app/page.tsx` calls `/api/generate` (initial), runs `runTier1`; on
failure, re-calls `/api/generate` with `previousHtml` + a plain-text
summary of the named failures (`buildRepairTask` in
`generationPrompt.ts`), up to 3 repair attempts (4 generations total).
Whatever the last attempt produces is persisted via
`/api/persist-generation` regardless of pass/fail, with the full
`{passed, attempts, checks}` record in the `verification` column —
surfaced to the teacher either way, never hidden (§4: "surfaced with the
specific failure named").

## Correction rounds use the same loop

Correction by pointing (§5 step 3) does not get its own, weaker path.
`runVerifiedRound` in `src/app/page.tsx` is shared by the initial
generation and by every correction: the model returns a full document,
`runTier1` runs on it unchanged, and a failure falls into the same
3-attempt repair loop before the result is allowed to replace the current
version. A correction therefore cannot quietly ship an artifact that
breaks the §2d contract.

Corrections themselves are **uncapped**, unlike repairs. A repair is the
system retrying itself and deserves a budget stop; a correction is the
teacher deciding the material is not right yet, and cutting them off at an
arbitrary count would be the wrong party's decision.

One asymmetry worth remembering: a repair that follows a correction does
**not** re-send the correction pointer. The pointed-at change has already
been applied, and re-sending it would ask for it a second time.

## Incident: cross-realm `instanceof`

The first working version of `dispatchOnControls` used
`el instanceof HTMLSelectElement` / `HTMLInputElement` / `HTMLElement` to
decide how to exercise each control. This silently failed for every
control, always: elements from `iframe.contentDocument` belong to the
iframe's own realm, and even with `allow-same-origin`, `instanceof` against
the *parent* window's constructors returns `false` across that boundary —
same-origin does not mean same realm. The result was a checker that never
actually clicked or changed anything, so `prediction-unlocks` failed on
every artifact regardless of whether the artifact was correct. Confirmed
by re-running the fixed (tag-name-based) dispatch against an
already-generated, previously-"failing" artifact with zero new API calls:
it passed immediately. Fixed by switching to `el.tagName` checks and a
bare `el.click()` for everything else — method calls don't care which
realm an element came from. Lesson: never use `instanceof` against a
cross-window/iframe element, even a same-origin one.

## Incident: `scene-aspect` checked the wrong thing entirely

The original `checkSceneAspect` asserted that the scene container's
rendered aspect was **at least** its declared `data-min-aspect`. That
inverts §2a. The spec says (`SPEC.md` line 71) that when the container
aspect falls below the scene's declared minimum, the scene must be
*reframed* — a narrower slice with pan, or a recomposed view — rather than
compressed. Falling below the minimum is the trigger condition, not a
defect, and it happens on every phone in portrait, where the scene sits
above the chrome and is naturally taller than it is wide.

The effect was perverse: the check punished an artifact for declaring an
honest minimum and rewarded one for declaring a dishonestly low one. The
checked-in, hand-verified reference artifact failed it at all three
viewports (actual 0.69 against a declared 1.2), while the only artifact in
the database that had ever recorded a full pass declares
`data-min-aspect="0.65"`.

Found while running the §5b model measurement, because the signal was too
clean to be real: all 10 candidates failed, every failure was
`scene-aspect`, and nothing else ever failed. Confirmed by scoring the
reference artifact through the same harness as a control — it failed
identically, which meant the checker, not the model, was wrong.

Fixed to test what the spec actually forbids: the rendered SVG must still
match its own viewBox ratio (within 5% for sub-pixel rounding), so a
squashed scene is caught, plus §2d's requirement that the declared
`data-intrinsic-aspect` match that viewBox. `data-min-aspect` remains part
of the §2d contract — its presence is still checked in `checkStructure` —
and drives each artifact's own reframe logic, but Tier 1 no longer asserts
against it.

Impact on the measurement: the same 10 Terra artifacts scored **0/10
before the fix and 10/10 after**. Any pass rate quoted for this build
depends on the corrected check.

Lesson: when a verification layer fails everything for one reason, suspect
the verifier before the thing being verified, and keep a known-good
control artifact to score against.
