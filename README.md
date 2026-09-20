# Slate

## Overview

Slate turns a teacher's plain-language description of what their students are stuck on into a working, verified, interactive teaching artifact — a single self-contained HTML file they can project in class and forward to students over WhatsApp.

The teacher types the problem in their own words ("my students don't understand why current splits in a parallel circuit"), optionally attaches a photo of the textbook page or their board work, and gets back a finished interactive visual for that exact concept, in the language and notation they actually use. Every artifact is machine-checked against a strict contract before the teacher ever sees it, and anything the teacher doesn't like can be corrected by **pointing at it and saying what's wrong in plain language**.

[`SPEC.md`](SPEC.md) is the authoritative specification. This README covers what was actually built.

## Problem Statement

A school teacher with no coding knowledge has textbook photos, board work, and a clear sense of exactly where their students are losing the thread. Turning that into a good interactive visual normally leaves them two options: a generic pre-made simulation that doesn't match their syllabus, notation or language — or nothing at all.

The constraints that make this hard are not the generation itself:

- **The file has to survive WhatsApp.** Teachers forward material to students on low-end Android phones with patchy or no internet. Anything needing a server, an account, or a network connection is useless the moment it leaves the teacher's laptop.
- **One file, two completely different contexts, zero configuration.** The same artifact is projected in class (landscape, 8m viewing distance, teacher narrating) and opened alone on a phone at home (portrait, ~40cm, no teacher, no internet).
- **It has to be self-sufficient.** A student working alone needs the concept explanation, a prediction they commit to before seeing the answer, feedback when they're wrong, and the reasoning afterwards — not just a bare visualization.
- **A teacher cannot debug a broken artifact.** If the generated file has a script error, unreadable projected text, or a diagram squashed on a phone, the teacher has no way to know before they are standing in front of a class. Unverified generation is worse than useless here.

## Solution

Slate is an agentic pipeline, not a single prompt.

1. **Generate.** The teacher's goal, class and language are sent with a fixed contract preamble and one hand-verified reference artifact, so every generation inherits a known-good structure instead of inventing one.
2. **Verify, in the teacher's own browser.** The artifact is loaded into a hidden sandboxed iframe and checked against the DOM contract, offline-safety, script errors, contrast, overflow, projection legibility, label collisions and scene crowding at three real viewports. Verification never runs on the server — there is no headless browser anywhere in the deployed service.
3. **Repair automatically.** A failure is fed back as a named, specific correction ("projection text below 28px"), not a generic retry. Capped at 3 attempts.
4. **Refine by talking.** The builder is a chat. The teacher says what should change — or taps the part of the preview that is wrong first, then says it — and Slate regenerates, re-verifies the result, and only then replaces the current version. Any number of rounds.
5. **Persist the record, not just the file.** The generation record — inputs plus every correction made — is the durable source of truth, so a session can be re-exported without version drift.

Model choice is per job and per concept. A cheap model first judges how much has to be drawn — a two-resistor circuit is not a twelve-base transcription diagram — and routes generation to the cheapest model that can draw it legibly. Refinements are triaged the same way.

## Features

* **Plain-language input** — a goal in the teacher's own words, plus an optional textbook or blackboard photo, read by a vision model to match notation and given values.
* **Self-contained artifacts** — one HTML file, all CSS and JS inlined, zero external requests, works fully offline immediately after download. No build step, no login, no tracking.
* **Dual-context rendering** — legibility and layout are handled by two independent, always-on CSS regimes, not a "projector mode" switch. The scene scales by viewBox and never reflows internally; the controls reflow freely around it.
* **Prediction before reveal** — the student must commit to what they expect before the answer is reachable; the reveal is hidden in the DOM until then.
* **Automated verification with a live checklist** — the teacher watches named checks tick through (structure, offline, contrast, 360×640, 1024×768, 1920×1080) rather than a spinner. Failures are named, never hidden.
* **A chat, not a form** — a bottom composer like every AI product: the first message generates, every later one refines. Attach several photos, each a thumbnail with an ×. Point at the wrong element and it becomes a chip on your next message.
* **Long work you can watch and stop** — an activity block with elapsed time, the checks list one click away, and a Stop that cancels the model call, not just the request.
* **Sessions that persist** — reopen last week's material from "recent", or just reload; the conversation and the preview come back.
* **Dynamic model routing** — a cheap model sizes each concept (simple / standard / dense) and each refinement (simple / complex); the stronger, costlier models handle only what needs them.
* **Non-technical builder UI** — no source code is shown at any point. Progress is plain language and a checklist.

## Tech Stack

* *Frontend:* Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS v4 with a stone/chalk palette. No state-management library and no component kit.
* *Backend:* Next.js route handlers on one long-running Node service — `/api/generate` (streaming NDJSON, abortable), `/api/persist-generation`, `/api/sessions` and `/api/sessions/[id]` (reopen), `/api/health`. No separate backend service.
* *Database:* Supabase Postgres — a single `generations` table; inputs, corrections and the verification result live in `jsonb` columns.
* *APIs / Services:* OpenAI API, called over plain `fetch` with no SDK dependency, routed per job by [`src/lib/models/router.ts`](src/lib/models/router.ts). Supabase Storage for uploaded photos.
* *Hosting / Deployment:* Render free tier, a single web service defined by [`render.yaml`](render.yaml), with an external uptime pinger.
* *Other Tools:* `zod` for input validation, `sharp` for downscaling uploads before storage and before the vision call. Verification is hand-written against the DOM and `getComputedStyle` — no test framework and no headless browser, because verification must run in the teacher's real browser.

## Codex / OpenAI Usage

*This section describes only what the repository itself evidences.*

**OpenAI models are the product's engine, not just a build aid.** Slate's entire output is generated through the OpenAI API, with a per-job routing table (`SPEC.md` §5b) implemented in [`src/lib/models/router.ts`](src/lib/models/router.ts):

| Job | Model | Why |
|---|---|---|
| Reference artifact (one-time) | GPT-6 Astra | Every later generation inherits its structure — the highest-leverage call in the build. |
| Artifact generation | Terra / Sol / Astra | Routed by Luna's judgement of how much the concept needs drawn. Terra's 10/10 benchmark was one sparse concept; a dense transcription diagram came back with colliding labels on it, so density now decides. |
| Repair after a failed check | GPT-5.6 Sol | Astra's premium is not justified for HTML repair. |
| Refinement / correction | Terra or Sol | Routed by Luna's triage of the teacher's comment. |
| Vision (textbook/board photo) | GPT-5.6 Sol | Notation errors propagate into everything downstream; never routed to the cheap model. |
| Classification | GPT-5.6 Luna | Two cheap calls: how much a concept needs drawn, and whether a refinement is a surface tweak or a structural change. |

**AI-assisted implementation.** Per the `Co-Authored-By` trailers in the git history, the code was written with Claude Code as a coding agent — Claude Sonnet 5 for the original 6.5-hour hackathon build (steps 0–5) and Claude Opus 5 for the v2 work (correction by pointing, model routing, session memory). The repository carries an [`AGENTS.md`](AGENTS.md) with the standing constraints every agent session must follow, and [`context/`](context/) holds the running decision log, prompt documentation, verification notes and progress log those sessions worked from.

**What AI actually accomplished here, concretely:**

* *Code generation* — the full pipeline: prompt construction, streaming route handlers, the client-side verification layer, the repair loop and the correction flow.
* *Debugging* — three silent, high-impact bugs found and fixed by agent sessions: a cross-realm `instanceof` check that made the verifier never actually exercise any control; a verification rule that contradicted the spec and failed every honest artifact, including the hand-verified reference; and that rule's own replacement, which parsed nothing and passed everything until a calibration run noticed. All written up in [`context/VERIFICATION.md`](context/VERIFICATION.md).
* *Testing and measurement* — the 10-generation model benchmark, the classifier agreement check and the multi-turn token-cost measurement were scripted and run rather than estimated.
* *Documentation* — this README and the `context/` logs.

## Demo

### Live Demo

https://slate-7kfo.onrender.com

Note: the service runs on Render's free tier and sleeps when idle, so the first request after a quiet period takes a few seconds to wake.

### Demo / Pitch Video

<!-- TODO: add demo/pitch video link -->

## Screenshots

<!-- TODO: add screenshots of the builder, the live checks list, and the correction panel -->

Two verified artifacts produced by the pipeline are checked in and open directly in a browser with no setup:

* [`demo/parallel-series-circuits.html`](demo/parallel-series-circuits.html) — class 9, current in series and parallel circuits
* [`demo/motion-graphs.html`](demo/motion-graphs.html) — class 9, distance-time vs velocity-time graphs

## How to Run Locally

```bash
git clone https://github.com/jasilmohmd/slate.git
cd slate
corepack pnpm install
corepack pnpm dev
```

This project uses **pnpm** (pinned via `packageManager` in `package.json`), not npm.

Create a `.env.local` before starting:

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | Generation, repair, correction and vision calls |
| `SUPABASE_URL` | yes | Postgres and Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | `storage.objects` has RLS on and this build defines no policies, so uploads use the service role key server-side — never the anon key, never the browser |
| `SLATE_GENERATION_MODEL` | no | Overrides the default generation model. Unset falls back to `gpt-5.6-sol`; set `gpt-5.6-terra` per the measurement in [`context/DECISIONS.md`](context/DECISIONS.md). Repair, correction escalation and vision are unaffected. |

Apply [`supabase/schema.sql`](supabase/schema.sql) to a fresh Supabase project to create the `generations` table and the `uploads` / `artifacts` buckets.

## Additional Notes

### The band model

One config object, keyed by the class number the teacher enters, drives the generation prompt, artifact type, interaction ceiling and verification tier — not three separate pipelines. Three bands are specified (A: classes 5–7, B: 8–10, C: 11–12). **This build implements Band B only**; the class selector offers 8–10 and rejects anything else.

### Specified but deliberately not built

Cut under the hackathon's own scope discipline — not attempted, not stubbed, not faked:

* **Tier 2 numerical reference checks** and **Tier 3 review flagging** — verifying an artifact's physics or maths against an independent reference implementation.
* **Multi-artifact export** — explainer plus practice set plus step-through from one session.
* **Alternatives** — 2–3 parallel approaches to the same concept.
* **The cache layer** — `concept + band + language` lookup before generation. The single largest cost lever, per the spec.
* **Bands A and C.**
* **Auth and per-teacher scoping** — the spec specifies one hardcoded teacher identity and no auth provider, so every saved session is readable by anyone who can reach the deployment. The first thing to change if this ever serves more than one teacher.

### Known limitations

* The language check is a character-range heuristic, not real language identification.
* The hover-only check is a static scan of `<style>` blocks; it does not simulate hover.
* Verification covers structure, safety and legibility, including label collisions and crowding. **It does not verify that the physics or maths is correct** — that is Tier 2, which is unbuilt. Artifacts should be reviewed by the teacher before use.
* The visual-quality thresholds were calibrated on a dozen artifacts across two concepts. Real, but narrow; expect them to need adjusting as more concepts are generated.
* Reopened sessions show each round's outcome and model, not its full checks list; stored photos are not rendered back into the transcript.
* Free-tier hosting sleeps when idle.

### Verification honesty

Whatever the final attempt produces is shown to the teacher and persisted **whether it passed or failed**, with the exact failing checks named in the UI. A failing artifact is never silently hidden, and never presented as if it passed.
