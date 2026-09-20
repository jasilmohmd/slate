import { REFERENCE_ARTIFACT_HTML } from "./reference";

export type GenerationLanguage = "ml" | "en";

export interface GenerationInput {
  goal: string;
  classNumber: number;
  language: GenerationLanguage;
  hasImage: boolean;
}

const LANGUAGE_INSTRUCTION: Record<GenerationLanguage, string> = {
  ml: `Malayalam labels and instructional text, with English technical terms
left in English where a teacher would naturally mix them (natural
Malayalam-English code-switching as an Indian science teacher actually
speaks/writes it, not a full translation of technical vocabulary).`,
  en: `Plain English throughout.`,
};

// Static across every call (band B only, this build) so it forms a stable
// prefix an OpenAI-compatible endpoint can cache (§5b) — the goal text,
// class and language are appended after it, per request.
const STATIC_PREAMBLE = `
You are generating ONE self-contained HTML teaching artifact for a teacher
with no coding knowledge. Every rule below is mandatory; an artifact
failing any of them is rejected outright.

BAND B PROFILE (§3) — high school, classes 8-10:
- Visual density: max two linked representations (e.g. a diagram plus a
  live readout panel, or a diagram plus a linked graph).
- Abstraction: the real model, not just analogy — show the governing
  relationship (e.g. a formula) as a relationship, not a derivation.
- Interaction: up to two simultaneous variables, sliders with visible
  numeric readouts, bounded but wide enough to reach interesting edges — no
  free numeric entry.
- Failure posture: show the consequence of a wrong prediction first, then
  offer a hint only if asked (don't volunteer it).
- Notation: textbook-matched symbols, units always shown.
- MANDATORY prediction commitment point: the student must select/state what
  they expect BEFORE the system reveals the outcome. The reveal element
  must be hidden until the prediction is committed — no way to see the
  answer first.

HARD OUTPUT CONSTRAINTS (§2):
- Single .html file. ALL CSS/JS inlined in <style>/<script> tags. Zero
  external requests: no CDN links, no <link>, no remote fonts, no fetch.
- Must work fully offline, immediately after the network is disabled.
- Usable at 360px width AND projection-safe above 900px, with no manual
  mode switch.
- Touch targets at least 48x48px.
- No login, no build step.
- Degrade without JS errors on Chrome 80+ (no bleeding-edge syntax; keep it
  conservative — the reference artifact below uses plain var/function
  declarations, no arrow functions or template literals in its own
  <script>, for exactly this reason. Match that style).

DUAL VIEWING CONTEXT (§2a):
- Below 900px = handheld phone. Above 900px = projected, ALWAYS,
  unconditionally (never try to detect a projector).
- Above 900px: body text effectively >=28px, headings bigger, strokes
  >=3px, high contrast, never colour-only meaning (pair colour with
  shape/label), controls clustered in one region, nothing hover-only.
- The scene (the diagram/visualization, SVG) never reflows internally — it
  scales via viewBox. The chrome (sliders, readouts) reflows freely around
  it.
- Portrait: scene on top, chrome stacked below. Landscape: scene takes most
  of the width, chrome in a side rail.
- CRITICAL scaling trap: text labels INSIDE the scaled SVG must NOT be
  plain <text> elements that shrink with the viewBox. Render them as an
  HTML overlay positioned absolutely over the SVG, as the reference
  artifact does with its .overlay spans, tagged data-text="label".
- Give every line/stroke in the SVG the attribute
  vector-effect="non-scaling-stroke" so it stays >=3px regardless of
  viewBox scale.
- LABELS MUST NOT COLLIDE. No overlay label may overlap another label, or
  overlap the element it annotates, at ANY of 360x640, 1024x768 or
  1920x1080. This is checked automatically and is the most common way a
  generated artifact is rejected. Strand names, axis names and row labels
  are the usual offenders: give them their own gutter outside the drawn
  content rather than floating them across it. If a label has nowhere to
  sit without colliding, the scene has too much in it — see the next rule.
- WHEN IT DOES NOT FIT, DRAW LESS. Never solve crowding by shrinking text,
  tightening spacing or stacking labels on top of each other. Reduce what
  is drawn: fewer base pairs, fewer sample points, fewer annotated
  positions. A diagram showing 6 items clearly teaches the concept; one
  showing 12 items illegibly teaches nothing. Keep the scene under about 20
  separate text labels at phone width.
- Do not lock screen orientation; layout must respond live to resize.

TWO AUDIENCES, ONE FILE (§2b):
- Must work for a student completely alone at home with no teacher and no
  internet, forwarded over WhatsApp.
- Must contain: a plain statement of what to try, the actual concept
  explanation (not just the visualization), feedback on an incorrect
  prediction, the reveal + reasoning after the prediction is committed, and
  a minimal header with class/subject/topic.
- Below 900px: full instructional text/explanation/feedback visible. Above
  900px: instructional text collapses to a minimum (teacher is narrating,
  unreadable at distance anyway) but stays present/reachable, never removed
  entirely from the DOM — the reference artifact's <details>/<summary>
  pattern, toggled by a matchMedia('(min-width: 900px)') listener, is
  exactly this and should be reused.
- No accounts, no tracking, no analytics, no network calls of any kind. If
  you use localStorage for remembering a prediction, it must work fine when
  empty/unavailable, and nothing is ever transmitted.
- Do not build any anti-cheating measures.

REQUIRED DOM STRUCTURE (§2d) — every data-role below must appear EXACTLY
ONCE, using these exact attribute names, in this nesting:

<body>
  <header data-role="meta"><!-- class, subject, topic --></header>
  <main data-role="artifact">
    <section data-role="scene"
             data-intrinsic-aspect="<number>"
             data-min-aspect="<number>">
      <!-- the diagram/visualization -->
    </section>
    <section data-role="chrome">
      <div data-role="controls">
        <!-- every interactive input carries data-control="<stable-id>" -->
      </div>
      <div data-role="prediction"><!-- commitment point --></div>
      <div data-role="reveal" hidden><!-- blocked until prediction committed --></div>
      <div data-role="explanation"><!-- self-sufficiency, §2b --></div>
    </section>
  </main>
</body>

Rules:
- data-role="reveal" MUST have the hidden attribute on initial page load.
  Only remove it via JS after the student commits a prediction.
- Every interactive control has a stable data-control identifier.
- Every text node showing a unit, axis label or tick value/readout value
  carries data-text="label".
- data-intrinsic-aspect and data-min-aspect are required numeric attributes
  on the scene section, matching the SVG's actual viewBox aspect ratio.

REFERENCE ARTIFACT — this is a complete, verified example (Band B, class 9,
parallel/series circuits) that already satisfies every rule above. Match
its shape exactly for your new concept: reuse its inline <style> block's
shared base verbatim (the :root custom properties, the two axis media
queries, the [data-role=...] container rules, the [data-control] rule, the
[data-text="label"] rule) and add only new rules specific to your new
concept after it, the same way this reference adds its own circuit-specific
rules after the shared base. Reuse its scene/chrome DOM shape, its
prediction-then-reveal flow, and its <details>-based instructional-density
collapse. Do not invent a different structure.

\`\`\`html
${REFERENCE_ARTIFACT_HTML}
\`\`\`
`;


// Fences are built from plain double-quoted strings so nothing in this file
// needs escaped backticks inside a template literal.
const FENCE_OPEN = "```html";
const FENCE_CLOSE = "```";

export interface CorrectionPointer {
  /** Stable id of the control the teacher pointed at, when they hit one. */
  controlId: string | null;
  /** The §2d section it sits in, used when no control matched. */
  role: string | null;
  /** Human-readable name of what was tapped, as the teacher saw it. */
  label: string;
  elementSnippet: string;
  /** The teacher's own words. */
  comment: string;
}

export interface CorrectionInput extends GenerationInput {
  previousHtml: string;
  correction: CorrectionPointer;
}

export interface RepairInput extends GenerationInput {
  previousHtml: string;
  failureSummary: string;
}

const OUTPUT_FORMAT = `OUTPUT FORMAT: respond with ONLY the raw HTML document, starting with
<!doctype html> and ending with </html>. No markdown code fences, no
commentary before or after.`;

function imageNote(hasImage: boolean, repeated: boolean): string {
  if (!hasImage) return "";
  return repeated
    ? "\nA photo of the teacher's textbook page or board work is attached again. Keep matching its notation."
    : `\nA photo of the teacher's textbook page or board work is attached. Match
its notation, symbols and any given values where relevant to the goal
below.`;
}

// The task blocks below deliberately exclude STATIC_PREAMBLE. It is sent as
// its own leading message (see buildMessages) so it stays a byte-identical
// cacheable prefix across every call in a session, which is what makes §5b's
// prompt-prefix caching pay off turn over turn rather than only on the first
// call.

export function buildGenerationTask(input: GenerationInput): string {
  return `NEW ARTIFACT TO GENERATE:
- Class: ${input.classNumber} (Band B).
- Teacher's stated goal, in their own words: "${input.goal}"
- Language: ${LANGUAGE_INSTRUCTION[input.language]}${imageNote(input.hasImage, false)}

${OUTPUT_FORMAT}`;
}

export function buildRepairTask(input: RepairInput): string {
  return `REPAIR REQUEST — your previous attempt at this same artifact failed
automated verification. Fix EXACTLY the failures listed below and return
the FULL corrected HTML document. Keep everything that wasn't flagged
unchanged.

- Class: ${input.classNumber} (Band B).
- Teacher's stated goal: "${input.goal}"
- Language: ${LANGUAGE_INSTRUCTION[input.language]}${imageNote(input.hasImage, true)}

FAILED CHECKS:
${input.failureSummary}

YOUR PREVIOUS ATTEMPT:
${FENCE_OPEN}
${input.previousHtml}
${FENCE_CLOSE}

${OUTPUT_FORMAT}`;
}

/**
 * Correction by pointing (§5 step 3). Deliberately the same shape as a
 * repair — previous document in, full corrected document out — because
 * there is no diff or patch infrastructure here and partial patches from a
 * model are unreliable. What differs is the instruction: a repair fixes
 * named check failures, a correction interprets one sentence of a teacher's
 * own words about one element, and must leave everything else alone.
 */
export function buildCorrectionTask(input: CorrectionInput): string {
  const pointer = input.correction.controlId
    ? 'the control with data-control="' + input.correction.controlId + '"'
    : input.correction.role
      ? 'the section with data-role="' + input.correction.role + '"'
      : "the element shown below";

  const shownAs = input.correction.label
    ? ' — shown to them as "' + input.correction.label + '"'
    : "";

  return `CORRECTION REQUEST — the teacher previewed your artifact, pointed at one
specific part of it, and said in their own words what is wrong with it.

- Class: ${input.classNumber} (Band B).
- Teacher's original goal: "${input.goal}"
- Language: ${LANGUAGE_INSTRUCTION[input.language]}${imageNote(input.hasImage, true)}

THEY POINTED AT: ${pointer}${shownAs}

${FENCE_OPEN}
${input.correction.elementSnippet}
${FENCE_CLOSE}

THEY SAID: "${input.correction.comment}"

Change ONLY what is needed to address that comment. Leave everything else
exactly as it is — the layout, the other controls, the other text, the
prediction-then-reveal flow, the DOM contract, and the wording of anything
they did not complain about. Do not take the opportunity to improve
unrelated parts. Every rule in the contract above still applies to the
result.

If the comment is ambiguous, make the smallest change that could reasonably
satisfy it rather than a large interpretive rewrite.

CURRENT VERSION OF THE ARTIFACT:
${FENCE_OPEN}
${input.previousHtml}
${FENCE_CLOSE}

${OUTPUT_FORMAT}`;
}

/** Kept whole for one-off scripts that call the API directly. */
export function buildGenerationPrompt(input: GenerationInput): string {
  return `${STATIC_PREAMBLE}

${buildGenerationTask(input)}`;
}

export type ChatContent = string | Array<Record<string, unknown>>;
export type ChatMessage = { role: "user" | "assistant"; content: ChatContent };

/** One already-applied correction, replayed as context rather than in full. */
export interface HistoryEntry {
  label: string;
  comment: string;
}

export interface MessagesInput extends GenerationInput {
  task: string;
  /** Corrections already applied in this session, oldest first. */
  history?: HistoryEntry[];
  /** data: URL for the downscaled photo, attached to the final turn only. */
  imageDataUrl?: string | null;
  /** True once this is a follow-up to an artifact that already exists. */
  isFollowUp: boolean;
}

/**
 * Builds the real OpenAI messages array for a call.
 *
 * Two things matter here. First, STATIC_PREAMBLE is always the whole of the
 * first message and never varies, so the cacheable prefix is byte-identical
 * on every call in a session — a generation, a repair and a correction all
 * share it. Second, earlier turns collapse to short placeholders instead of
 * replaying multi-hundred-KB documents: the model needs the CURRENT document
 * at full fidelity (it is in `task`) plus enough context to know what has
 * already been addressed. That keeps token growth linear in the number and
 * length of comments rather than in the artifact size.
 */
export function buildMessages(input: MessagesInput): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "user", content: STATIC_PREAMBLE },
    {
      role: "user",
      content: `THIS SESSION'S ARTIFACT:
- Class: ${input.classNumber} (Band B).
- Teacher's stated goal, in their own words: "${input.goal}"
- Language: ${LANGUAGE_INSTRUCTION[input.language]}`,
    },
  ];

  if (input.isFollowUp) {
    messages.push({ role: "assistant", content: "[drafted the artifact]" });
  }

  for (const entry of input.history ?? []) {
    messages.push({
      role: "user",
      content: `The teacher pointed at ${entry.label || "part of the artifact"} and said: "${entry.comment}"`,
    });
    messages.push({ role: "assistant", content: `[corrected: ${entry.comment}]` });
  }

  const final: ChatMessage = input.imageDataUrl
    ? {
        role: "user",
        content: [
          { type: "text", text: input.task },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      }
    : { role: "user", content: input.task };

  messages.push(final);
  return messages;
}
