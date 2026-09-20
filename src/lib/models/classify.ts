/**
 * Cheap-model triage for correction routing (§5b gives Luna "concept
 * classification"). One Luna call decides whether a teacher's correction is
 * a small surface tweak or a structural change, and `chooseModel` uses that
 * to keep simple corrections on the cheaper generation model instead of
 * escalating every one of them to Sol.
 *
 * This is a cost optimisation sitting on top of a path that works without
 * it, so it fails OPEN: any error, timeout or unparseable answer returns
 * "complex". Misrouting a structural change to the cheaper model costs a
 * failed correction and a repair cycle; over-spending on a label tweak costs
 * a fraction of a cent.
 */

import { chooseModel } from "./router";

const TIMEOUT_MS = 8000;

const CORRECTION_INSTRUCTION = `A teacher pointed at one element of an interactive HTML
teaching artifact and said what is wrong with it. Decide how much of the
document has to change to satisfy them.

Answer with exactly one word:
- "simple" — wording, a label, a unit, a colour, a numeric range or bound, a
  size, or any other change confined to that element's own attributes or
  text.
- "complex" — layout, structure, added or removed elements, interaction or
  state logic, the physics or maths being modelled, or anything that touches
  more of the document than the element pointed at.

If you are unsure, answer "complex".`;

// Abstract category descriptions scored 2/7 against manual judgement, and
// put the DNA-to-mRNA case — the artifact that prompted this whole check —
// on Sol rather than Astra. Framing it as counting labelled things, with
// worked examples, scores 6/7; the single miss routes a sparse circuit up to
// Sol rather than down, which is the safe direction. Allowing Luna to reason
// made it worse (5/7) and cost 8x the output tokens.
const CONCEPT_INSTRUCTION = `You are sizing an interactive teaching diagram before it is drawn.

Count, roughly, how many SEPARATE LABELLED THINGS the finished diagram must
show at once. Then answer with exactly one word:

- "simple"   - about 8 labelled things or fewer. One diagram, a few parts.
- "standard" - roughly 9 to 20. One diagram with several linked parts, or two
               linked representations such as a diagram plus a graph.
- "dense"    - more than 20, OR any repeated series where each item needs its
               own label (a sequence of bases, a row of particles, a bundle of
               rays, a grid of cells), OR two diagrams that must line up
               position by position.

Worked examples:
- "current divides between branches of a parallel circuit" -> two resistors,
  a battery, a few readouts. About 7 things. -> simple
- "distance-time graph next to velocity-time graph for the same motion" ->
  two graphs, axes, ticks, a marker on each. Around 15 things. -> standard
- "how the DNA template strand is read to build mRNA, base by base" -> one
  label per base on each of three rows, plus strand names. Well over 20, and
  it is a repeated labelled series. -> dense
- "arrangement of particles in solids, liquids and gases side by side" ->
  three panels each full of repeated particles. -> dense

Judge the drawing, not the difficulty of the physics and not the length of
the sentence.`;

/**
 * One cheap Luna judgement. Returns the raw lowercased answer, or null when
 * the call could not be made or understood — every caller decides its own
 * fail-open value, because the cost of guessing wrong differs per job.
 */
async function askLuna(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: chooseModel("classify"),
        // Luna is a reasoning model: a tight token cap is spent on reasoning
        // tokens before any content is emitted, which comes back as an empty
        // string and silently collapses every verdict onto the fail-open
        // value. Turn reasoning off for a one-word judgement and leave
        // headroom for the answer.
        reasoning_effort: "none",
        max_completion_tokens: 32,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const answer: string = data.choices?.[0]?.message?.content ?? "";
    const trimmed = answer.trim().toLowerCase();
    return trimmed || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function classifyCorrection(
  comment: string,
  elementSnippet: string
): Promise<"simple" | "complex"> {
  const answer = await askLuna(`${CORRECTION_INSTRUCTION}

ELEMENT:
${elementSnippet.slice(0, 1000)}

THEY SAID: "${comment.slice(0, 500)}"`);

  return answer?.startsWith("simple") ? "simple" : "complex";
}

export type ConceptComplexity = "simple" | "standard" | "dense";

/**
 * How much has to be drawn to teach this concept, which is what actually
 * predicts whether a cheaper model will produce a legible scene. Measured
 * after a class 9 DNA-to-mRNA artifact came back with colliding labels: the
 * generation default had been set from a benchmark of one sparse concept
 * (a two-resistor circuit) and was never evidence about dense scenes.
 *
 * Fails open to "standard", NOT to the strongest model. The correction
 * classifier can fail open upwards almost for free, but here the strong
 * option is Astra at 2.5x Sol, so a classifier outage must not silently
 * triple the bill.
 */
export async function classifyConcept(
  goal: string,
  classNumber: number
): Promise<ConceptComplexity> {
  const answer = await askLuna(`${CONCEPT_INSTRUCTION}

CLASS: ${classNumber}
THE TEACHER WANTS: "${goal.slice(0, 1000)}"`);

  if (answer?.startsWith("simple")) return "simple";
  if (answer?.startsWith("dense")) return "dense";
  return "standard";
}
