# Slate

An agentic builder for verified, self-contained interactive teaching material — built for a 6.5-hour solo hackathon. [`SPEC.md`](SPEC.md) is the authoritative spec; this README covers what actually got built.

## The problem

A school teacher with no coding knowledge has textbook photos, board work, and a plain-language sense of what their students are stuck on ("my students don't understand why current splits in a parallel circuit"). Turning that into a good interactive visual normally means either a generic pre-made simulation that doesn't match the syllabus, or nothing at all.

Slate takes the teacher's inputs — a goal in their own words, optionally a photo of a textbook page or the board — and generates a working, verified interactive artifact for that exact concept, in the language and notation the teacher actually uses.

## What a Slate artifact is

Every generated artifact is **one self-contained `.html` file** — no build step, no install, no login, no external requests of any kind once it's downloaded. That single constraint drives almost everything else about the design:

- **It has to survive WhatsApp.** Teachers forward files to students over WhatsApp on low-end Android phones with patchy or no internet. A file that needs a server, an account, or a network connection is useless the moment it leaves the teacher's laptop.
- **It has to work in two completely different contexts with zero configuration.** The same file is projected in class (landscape, 8m viewing distance, teacher narrating) and opened alone on a phone at home (portrait, ~40cm, no teacher, no internet). There's no mode toggle — the artifact detects nothing about its environment except the viewport it's actually given, and both regimes (legibility for size, layout for aspect) are handled by two independent, always-on CSS rules, not a "projector mode" switch.
- **It has to be self-sufficient.** A student alone at home gets the concept explanation, a prediction they commit to *before* seeing the answer, feedback on a wrong prediction, and the reasoning afterward — not just a bare visualization. Nothing is tracked, stored remotely, or phoned home; `localStorage`, if used at all, never leaves the device.

Every artifact follows a fixed DOM contract (`data-role="scene"`, `chrome`, `controls`, `prediction`, `reveal`, `explanation`, etc.) so the verification layer can inspect a known structure instead of guessing at whatever the model produced that run.

## How verification works

Every generated artifact is checked **before the teacher ever sees it** — and the check runs entirely in the browser, never on the server (there's no headless browser anywhere in the deployed service; Render's free tier doesn't have the resources for one).

1. The artifact's raw HTML is parsed and statically checked first: every required `data-role` present exactly once, no external references (`http(s)` URLs, `<link>`, `@import`), under 2MB, and a rough language-match heuristic. A structural failure here skips everything else, since it makes later checks meaningless.
2. If that passes, the artifact is loaded into one hidden, sandboxed `srcdoc` iframe and resized — in place, without reloading — through three target viewports (360×640 phone, 1024×768 projector, 1920×1080 projector). At each size: no uncaught JS errors, every control survives a dispatched event, the prediction-gate actually unlocks after interaction, WCAG contrast, no horizontal overflow, and — at projector sizes only — an ≥28px text floor and an ≥3px stroke floor.
3. A failure is fed back to the model as a named, specific correction request (not a generic "try again"), capped at 3 repair attempts. Whatever the last attempt produces is shown to the teacher and persisted — pass or fail — with the exact failing checks named. Nothing is silently hidden.

The full check list is documented as implemented in [`context/VERIFICATION.md`](context/VERIFICATION.md).

## The band model

One config object, keyed by the class number the teacher enters, drives generation prompt, artifact type, interaction ceiling, and verification tier — not three separate pipelines. Three bands are specified (A: classes 5–7, B: 8–10, C: 11–12); **this build implements Band B only** (see below).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js (TypeScript), one long-running service |
| Styling (builder UI only) | Tailwind CSS + a small stone/chalk palette |
| Generation | OpenAI API — routed per job (§5b) by `src/lib/models/router.ts`: Astra for the one-time reference artifact, Terra for generation (10/10 first-pass Tier 1, measured), Sol for repair/correction escalation and vision, Luna for classification |
| Verification | Sandboxed `srcdoc` iframe, client-side only |
| Data | Supabase Postgres (`generations` table) |
| Files | Supabase Storage (`uploads`, `artifacts` buckets) |
| Images | `sharp`, downscaling uploads before storage and before the vision call |
| Validation | `zod` |
| Hosting | Render free tier, single service, external uptime pinger |

No state management library, component kit, ORM, or auth provider — a single hardcoded teacher identity, no login.

### Environment

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Generation, repair, correction and vision calls |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Postgres + Storage (service role: `storage.objects` has RLS on and this build defines no policies) |
| `SLATE_GENERATION_MODEL` | Optional. Overrides the default generation model (§5b). Unset falls back to `gpt-5.6-sol`; deployments should set `gpt-5.6-terra` per the measurement in [`context/DECISIONS.md`](context/DECISIONS.md). Repair, correction escalation and vision are not affected. |

## What's built vs. what's specified but unbuilt

**Built:** infra + Supabase schema; the fixed CSS base (colour tokens, projection-safe type scale, stroke weights, the two independent viewport regimes); one hand-verified reference artifact (Band B, parallel/series circuits); the generation core (text + photo input, streaming, Band B only); Tier 1 client-side verification with a 3-retry repair loop, surfaced live in the UI; per-job model routing (§5b); correction by pointing — the teacher taps the part of the rendered artifact that is wrong, says what is wrong in plain language, and gets a targeted regeneration that is re-verified before it replaces the current version, with every correction accumulating in the generation record (§2c).

**Specified but cut from this build**, per the spec's own explicit scope discipline for a 6.5-hour build — not attempted, not stubbed:

- **Tier 2 numerical reference checks** and **Tier 3 review flagging** (Bands B/C's mandatory/recommended numerical verification against an independent reference implementation)
- **Multi-artifact export** (explainer + practice set + step-through from one session)
- **Alternatives** (2–3 parallel approaches to the same concept)
- **The cache layer** (`concept + band + language` lookup before generation)
- **Bands A and C** — this build is Band B only; the class selector only offers 8–10
- A library/reopen UI for past generation records (records persist to Supabase, but there's no browsing UI for them in this build)

These remain designed, not demonstrated. Scope discipline over overclaiming.

## Demo language

Malayalam labels with English technical terms left in English, matching how the concept is actually taught — the generation prompt asks for this code-switching explicitly rather than a full translation.
