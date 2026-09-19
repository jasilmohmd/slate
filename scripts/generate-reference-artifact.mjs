// One-off script (§6 step 2): call Astra once to draft the reference
// artifact. Run with:
//   node --env-file=.env.local scripts/generate-reference-artifact.mjs
// Output is written to the scratchpad for manual review/repair before it
// becomes the checked-in reference — this script is not part of the app.

import { writeFile } from "node:fs/promises";
import { ARTIFACT_BASE_CSS } from "../src/lib/artifact/baseCss.ts";

const MODEL = "gpt-6-astra";

const CONTRACT = `
You are generating ONE self-contained HTML teaching artifact for a teacher
with no coding knowledge. This is the REFERENCE artifact — the structural
template every later generation will copy the shape of. Every rule below is
mandatory; an artifact failing any of them is rejected outright.

CONCEPT: Class 9, Band B (high school). Parallel and series circuits —
resistance sliders, live current redistribution between branches.
LANGUAGE: Malayalam labels and instructional text, with English technical
terms left in English where a teacher would naturally mix them
(e.g. "resistance", "current", "വോൾട്ടേജ്" etc.) — natural Malayalam-English
code-switching as an Indian science teacher actually speaks/writes it, not a
full translation of technical vocabulary.

HARD OUTPUT CONSTRAINTS (§2):
- Single .html file. ALL CSS/JS inlined in <style>/<script> tags. Zero
  external requests: no CDN links, no <link>, no remote fonts, no fetch.
- Must work fully offline, immediately after the network is disabled.
- Usable at 360px width AND projection-safe above 900px, with no manual
  mode switch — the CSS below already implements both regimes; use its
  classes/custom properties, don't invent a parallel styling system.
- Touch targets at least 48x48px.
- No login, no build step.
- Degrade without JS errors on Chrome 80+ (no bleeding-edge syntax; no
  optional chaining assumptions beyond ES2020, keep it conservative).

DUAL VIEWING CONTEXT (§2a):
- Below 900px = handheld phone. Above 900px = projected, ALWAYS, unconditionally
  (never try to detect a projector).
- Above 900px: body text effectively >=28px, headings bigger, strokes >=3px,
  high contrast, never colour-only meaning (pair colour with shape/label),
  controls clustered in one region, nothing hover-only.
- The scene (the circuit diagram, SVG) never reflows internally — it scales
  via viewBox. The chrome (sliders, readouts) reflows freely around it.
- Portrait: scene on top, chrome stacked below. Landscape: scene takes most
  of the width, chrome in a side rail. The provided CSS's
  [data-role="artifact"]/[data-role="scene"]/[data-role="chrome"] rules
  already implement this — use them.
- CRITICAL scaling trap: text labels INSIDE the scaled SVG (resistor values,
  current readouts drawn in the diagram) must NOT be plain <text> elements
  that shrink with the viewBox. Either render them as an HTML overlay
  positioned absolutely over the SVG (outside the SVG's own scaling
  context), or give them a data-text="label" span/text element and
  recompute their pixel font-size in JS against the actual rendered scale
  on resize. Do not let them silently shrink below the 28px floor.
- Give every line/stroke in the SVG the attribute
  vector-effect="non-scaling-stroke" so it stays >=3px regardless of
  viewBox scale.
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
  entirely from the DOM.
- No accounts, no tracking, no analytics, no network calls of any kind. If
  you use localStorage for remembering a prediction, it must work fine when
  empty/unavailable, and nothing is ever transmitted.
- Do not build any anti-cheating measures.

BAND B PROFILE (§3) — this artifact must match:
- Visual density: max two linked representations (here: circuit diagram +
  a live current/voltage readout panel).
- Abstraction: the real model, not just analogy — show Ohm's law and the
  series/parallel current relationships as relationships (I = V/R,
  V = V1+V2 for series, I = I1+I2 for parallel), not derivations.
- Interaction: two simultaneous variables allowed (e.g. two resistance
  sliders), bounded but wide enough to reach interesting edges (e.g. one
  resistor near-zero, one very large) — no free numeric entry, sliders only,
  with visible numeric readout of the current value.
- Failure posture: show the consequence of a wrong prediction first, then
  offer a hint only if asked (don't volunteer it).
- Notation: textbook-matched symbols, units always shown (Ω, A, V).
- MANDATORY prediction commitment point: the student must select/state what
  they expect BEFORE the system reveals the outcome. The reveal element
  must be hidden until the prediction is committed — no way to see the
  answer first.

REQUIRED DOM STRUCTURE (§2d) — every data-role below must appear EXACTLY
ONCE, using these exact attribute names, in this nesting:

<body>
  <header data-role="meta"><!-- class, subject, topic --></header>
  <main data-role="artifact">
    <section data-role="scene"
             data-intrinsic-aspect="<number, e.g. 1.6>"
             data-min-aspect="<number, e.g. 1.2>">
      <!-- the circuit SVG diagram -->
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
  on the scene section.

CSS BASE — you MUST inline this exact CSS (verbatim, do not modify the
custom property names or the data-role selectors) inside a single <style>
tag, then layer any circuit-specific styling (colours already defined as
custom properties, wire/resistor drawing rules, etc.) on top of it in the
same <style> tag:

\`\`\`css
${ARTIFACT_BASE_CSS}
\`\`\`

OUTPUT FORMAT: respond with ONLY the raw HTML document, starting with
<!doctype html> and ending with </html>. No markdown code fences, no
commentary before or after.
`;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set (expected in .env.local)");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: CONTRACT }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const html = data.choices?.[0]?.message?.content;
  if (!html) {
    throw new Error(`No content in response: ${JSON.stringify(data)}`);
  }

  const outPath =
    process.env.SLATE_OUT_PATH ||
    "C:\\Users\\jasil\\AppData\\Local\\Temp\\claude\\E--Work-Hackathon-Codex-Slate\\cbb50083-8778-4128-8bf5-a20610408ce0\\scratchpad\\reference-artifact.raw.html";
  await writeFile(outPath, html, "utf8");
  console.log(`Wrote ${html.length} chars to ${outPath}`);
  console.log(`Usage: ${JSON.stringify(data.usage)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
