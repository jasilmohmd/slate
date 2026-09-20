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

const INSTRUCTION = `A teacher pointed at one element of an interactive HTML
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

export async function classifyCorrection(
  comment: string,
  elementSnippet: string
): Promise<"simple" | "complex"> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "complex";

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
        // string and silently classifies everything "complex". Turn reasoning
        // off for a one-word judgement and leave headroom for the answer.
        reasoning_effort: "none",
        max_completion_tokens: 32,
        messages: [
          {
            role: "user",
            content: `${INSTRUCTION}

ELEMENT:
${elementSnippet.slice(0, 1000)}

THEY SAID: "${comment.slice(0, 500)}"`,
          },
        ],
      }),
    });

    if (!res.ok) return "complex";

    const data = await res.json();
    const answer: string = data.choices?.[0]?.message?.content ?? "";
    return answer.trim().toLowerCase().startsWith("simple") ? "simple" : "complex";
  } catch {
    return "complex";
  } finally {
    clearTimeout(timer);
  }
}
