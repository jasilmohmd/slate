// One-off measurement script (SPEC.md §5b, "Choosing the default generation
// model"). Generates the class 9 parallel-circuits artifact N times on Terra
// and writes each result to disk. Scoring happens in the browser, on the
// real Tier 1 implementation, via the dev-only /measure page — Tier 1 is
// client-side by mandate (AGENTS.md) and §5a forbids adding a headless
// browser to do it here.
//
// Run with:
//   node --env-file=.env.local scripts/measure-terra.mjs
//
// Decision rule (§5b): >=70% first-pass Tier 1 -> set
// SLATE_GENERATION_MODEL=gpt-5.6-terra. Below that, leave Sol.

import { access, mkdir, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";

// The app source uses extension-less relative imports (what TypeScript and
// the Next bundler expect); Node ESM requires the extension. This resolves
// that gap in-process so the script can reuse the real prompt builder
// rather than keeping a second copy of the contract text in sync.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return next(specifier + ".ts", context);
      } catch {
        // fall through to the original specifier
      }
    }
    return next(specifier, context);
  },
});

const { buildGenerationPrompt } = await import("../src/lib/artifact/generationPrompt.ts");

const MODEL = process.env.SLATE_MEASURE_MODEL || "gpt-5.6-terra";
const RUNS = Number(process.env.SLATE_MEASURE_RUNS || 10);
const CONCURRENCY = 2;

// Prices per million tokens (§5b).
const RATES = {
  "gpt-6-astra": { input: 10, output: 50 },
  "gpt-5.6-sol": { input: 4, output: 20 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

// The reference concept, stated the way a teacher would state it — same
// input the app itself would send.
const GOAL =
  "എന്റെ ക്ലാസ്സിന് പാരലൽ സർക്യൂട്ടിലും series സർക്യൂട്ടിലും current എങ്ങനെ വീതിക്കപ്പെടുന്നു എന്ന് മനസിലാകുന്നില്ല";

const OUT_DIR =
  process.env.SLATE_OUT_DIR ||
  "C:/Users/jasil/AppData/Local/Temp/claude/E--Work-Hackathon-Codex-Slate/e05fdfa0-eafd-4217-9f95-338af958b31a/scratchpad/terra-runs";

function stripCodeFence(html) {
  const trimmed = html.trim();
  const fenced = trimmed.match(/^```(?:html)?\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1] : trimmed;
}

const MAX_ATTEMPTS = 4;

function describe(err) {
  const cause = err.cause ? ` (${err.cause.code || err.cause.message})` : "";
  return err.message + cause;
}

async function callOnce(prompt, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }

  return res.json();
}

// Transport-level failures here are infrastructure noise, not a property of
// the model being measured, so they are retried rather than scored as
// misses — counting them would understate the first-pass rate.
async function oneRun(index, prompt, apiKey) {
  const started = Date.now();
  const name = `terra-${String(index).padStart(2, "0")}.html`;

  // Resumable: a partially completed batch should not be paid for twice.
  // Delete the output directory to force a clean re-measurement.
  try {
    await access(`${OUT_DIR}/${name}`);
    console.log(`${name}  already present, skipping`);
    return null;
  } catch {
    // not generated yet
  }

  let data;
  for (let attempt = 1; ; attempt++) {
    try {
      data = await callOnce(prompt, apiKey);
      break;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`run ${index}: ${describe(err)}`);
      console.warn(`run ${index}: attempt ${attempt} failed — ${describe(err)}; retrying`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  const html = stripCodeFence(data.choices?.[0]?.message?.content ?? "");
  if (!html) throw new Error(`run ${index}: empty completion`);

  await writeFile(`${OUT_DIR}/${name}`, html, "utf8");

  const usage = data.usage ?? {};
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${name}  ${(html.length / 1024).toFixed(0)}KB  ${seconds}s  ` +
      `in=${usage.prompt_tokens ?? "?"} out=${usage.completion_tokens ?? "?"} ` +
      `cached=${usage.prompt_tokens_details?.cached_tokens ?? 0}`
  );
  return usage;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  await mkdir(OUT_DIR, { recursive: true });

  const prompt = buildGenerationPrompt({
    goal: GOAL,
    classNumber: 9,
    language: "ml",
    hasImage: false,
  });

  console.log(`model=${MODEL} runs=${RUNS} prompt=${(prompt.length / 1024).toFixed(0)}KB`);
  console.log(`out=${OUT_DIR}\n`);

  const usages = [];
  const failures = [];
  const queue = Array.from({ length: RUNS }, (_, i) => i + 1);

  async function worker() {
    for (;;) {
      const index = queue.shift();
      if (index === undefined) return;
      try {
        const usage = await oneRun(index, prompt, apiKey);
        if (usage) usages.push(usage);
      } catch (err) {
        failures.push(err.message);
        console.error(err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const totals = usages.reduce(
    (acc, u) => ({
      input: acc.input + (u.prompt_tokens ?? 0),
      cached: acc.cached + (u.prompt_tokens_details?.cached_tokens ?? 0),
      output: acc.output + (u.completion_tokens ?? 0),
    }),
    { input: 0, cached: 0, output: 0 }
  );

  const rate = RATES[MODEL];
  const cost = rate
    ? (totals.input / 1e6) * rate.input + (totals.output / 1e6) * rate.output
    : null;

  console.log(`\n${usages.length}/${RUNS} completed, ${failures.length} API failures`);
  console.log(
    `tokens: in=${totals.input} (cached ${totals.cached}) out=${totals.output}` +
      (cost === null ? "" : `  est. cost $${cost.toFixed(2)} (uncached rate)`)
  );
  console.log(`\nNext: open /measure in the dev server and load ${OUT_DIR} to score Tier 1.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
