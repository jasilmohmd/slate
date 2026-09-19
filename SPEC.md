# Interactive Teaching Material Agent — Build Spec

Strict product requirements. Build in the order given under **Build Order**. Anything under **Out of Scope** must not be implemented.

---

## 1. Goal

An agentic system that lets a school teacher — with no coding or technical knowledge — produce verified, interactive teaching material from their own inputs (textbook photos, board photos, notes, documents, spoken instructions).

Output is a **single self-contained HTML file** the teacher can open on a projector, or forward to students over WhatsApp, that runs on a low-end Android phone with no internet connection.

The system must adapt its generation behaviour to the class band being taught, and must verify its own output before the teacher ever sees it.

---

## 2. Hard output constraints

Every generated artifact MUST satisfy all of the following. These are not preferences. An artifact failing any of these is rejected and regenerated.

- Single `.html` file. All CSS, JS, fonts, and assets inlined. No CDN references, no external requests at runtime.
- Total size under 2 MB.
- Fully functional with the network disabled after download.
- Renders and is usable at 360 px viewport width AND is projection-safe above 900 px (see §2a).
- Touch-first at small widths: interactive targets minimum 48 × 48 px.
- No login, no account, no build step, no install.
- Text, labels, instructions, and questions in the language the teacher selected, including mixed-language output (e.g. Malayalam labels with English technical terms) when requested.
- Notation and symbols match the teacher's uploaded textbook pages where provided.
- Degrades without JS errors on older mobile browsers (target: Chrome 80+).

---

## 2a. Dual viewing context (mandatory)

Every artifact is used in two contexts, and must handle both with **no teacher configuration, no mode toggle, and no setup step**.

1. **Held in hand** — phone, portrait (~9:16), ~40 cm viewing distance, one person.
2. **Projected** — classroom projector, landscape (4:3 or 16:9), viewed by 40 students from up to 8 m.

These differ along **two independent axes**. Do not collapse them into one breakpoint.

- **Size** determines legibility rules (text size, stroke weight, contrast).
- **Aspect** determines layout (where the scene sits, where controls go).

**Rule: do not attempt to detect a projector.** A laptop driving a projector reports as an ordinary desktop viewport. Treat every viewport above 900 px as projected and render projection-safe unconditionally. There is no downside — close-up viewing of projection-safe content is fine.

### Axis 1 — Size (legibility)

**Below 900 px — handheld.** Touch-first, 48 px minimum targets, one-handed operation.

**Above 900 px — projection-safe (default, always on).**
- Minimum body text 28 px equivalent; headings substantially larger. Applies to **all** text including axis labels, tick values, units and legends — these fail first at distance.
- Minimum stroke weight 3 px on all lines, axes, outlines and vectors. 1 px lines disappear on projection.
- High contrast only. No light grey on white, no thin font weights, no low-saturation fills. Assume a dim bulb and a daylit room.
- Never encode meaning in colour alone. Always pair colour with shape, label, pattern or position.
- Cluster all interactive controls in a single region. The teacher operates a laptop while facing away from the screen.
- No hover-dependent behaviour. Nothing may require mouse-over to be visible or usable.

### Axis 2 — Aspect (layout)

Every artifact must be built as two separable layers:

**The scene** — the SVG/canvas visualization. Declares an intrinsic aspect ratio and a minimum usable aspect. Scales via `viewBox`. Never reflows internally.

**The chrome** — sliders, numeric entry, readouts, linked graphs, prediction prompt, hints. Reflows freely around the scene.

Layout rule:
- **Portrait (aspect < 1):** scene across the top at its natural aspect; chrome stacked beneath.
- **Landscape (aspect ≥ 1):** scene occupies the majority of width; chrome in a side rail.

**Reframe, never squash.** If the container aspect falls below the scene's declared minimum usable aspect, the scene must be reframed — a narrower slice with pan, or a recomposed view — not compressed. Compressing a ray diagram or a trajectory into portrait destroys it.

**Band C multi-representation handling.** Three or more linked representations cannot be legible simultaneously in portrait. Portrait presents them tabbed or stacked with linked state preserved; landscape presents them simultaneously. Same content, different arrangement.

### Scaling traps (must be handled explicitly)

- **Text inside a scaled SVG silently breaks the 28 px floor.** When the scene scales down to fit, in-scene labels shrink proportionally below legibility. Render labels as an HTML overlay outside the scaling context, or recompute font size against the actual rendered scale.
- **Strokes scale too.** Use `vector-effect="non-scaling-stroke"` so a 3 px line stays 3 px regardless of `viewBox` scaling.
- Do not lock orientation. A teacher may rotate the phone at any time; layout must respond live.

### Verification additions

Tier 1 runs the artifact in a sandboxed iframe resized to **three viewports** — 360 × 640 (portrait phone), 1024 × 768 (XGA projector) and 1920 × 1080 — and confirms at each:
- No text element resolves below its band's minimum computed size **after scene scaling is applied**
- No rendered stroke below 3 px at projection sizes
- Contrast ratio at least 4.5:1 for text, 3:1 for graphical elements
- No overflow, clipping or horizontal scroll
- Scene aspect never falls below its declared minimum usable aspect
- No control requires hover to reveal

### Explicitly out of scope
Phone-as-remote for a projected view. It requires a network connection between devices and breaks the single-file offline constraint.

---

## 2b. Two audiences, one file (mandatory)

The same artifact is used by the **teacher in class** (projected, teacher narrates) and by the **student alone** (phone, at home, no teacher, no internet). It is forwarded to students over WhatsApp and re-forwarded between them.

**Design for the student-alone case.** Self-sufficiency is a superset — a self-explaining artifact can still be projected and talked over, but a bare visual aid is useless to a student on their own.

### Every artifact must contain

- A plain statement of what to try, usable with no teacher present
- The concept explanation itself, not only the visualization
- Feedback on an incorrect prediction — nobody is there to correct them
- The reveal and the reasoning after the prediction is committed, so a stuck student is never stranded
- A minimal header: class, subject, topic. These files get forwarded and orphaned files are useless.

### Instructional text density follows the size axis

- **Below 900 px (student, handheld):** full instructional text, explanation and feedback visible.
- **Above 900 px (projected):** instructional text collapses to a minimum — it is unreadable at distance and the teacher is narrating. Content remains present and reachable, not removed.

No new mode. No teacher decision. Reuses the §2a size breakpoint.

### Privacy (non-negotiable)

No accounts, no tracking, no analytics, no telemetry, no server calls. Nothing leaves the device. This material is used by minors; the artifact must be inert with respect to data.

If per-device state is used (e.g. remembering a prediction across sessions), `localStorage` only, never transmitted, and the artifact must work correctly when it is empty or unavailable.

### Accepted trade-off

A self-sufficient file contains its own answers and is therefore spoilable. Self-study value outweighs homework integrity at this level. **Do not build anti-cheating measures.**

### Assume constrained access

Students may share a family phone and open the file once. Do not design flows that require repeated sessions, sequential unlocking, or accumulated progress to be useful.

---

## 2c. Artifact lifecycle and distribution

### The app stores the generation record, not the file

The source of truth is the **generation record**: teacher inputs (photos, documents, notes), stated goal, class/band, language, and every correction made. The HTML artifact is output and must be regenerable from the record at any time.

Do not store exported HTML as the primary object. A teacher who needs to fix a label weeks later must be able to reopen the record, correct by pointing, and re-export — not start over.

### One session, multiple artifacts

A single generation session (one concept, one set of inputs, one set of corrections) can emit **more than one artifact type**:

- the interactive explainer for classroom use
- the practice/revision set for student self-study
- the step-through explainer, where applicable

These are separate exports from one shared source, not versions of one file. Correcting the source and re-exporting updates all of them.

**Do not implement per-file versioning or two parallel "projector" and "student" copies.** Divergence between copies is a maintenance trap: a teacher corrects one and the other silently becomes wrong.

Every exported artifact independently satisfies §2a (responsive across size and aspect) and §2b (self-sufficient for a student alone). The classroom explainer will be opened at home; the revision set will be projected.

### Distribution is out of the app

Export produces a standalone `.html` file. Distribution to students is by ordinary file sharing — WhatsApp, Bluetooth, USB, whatever the school uses.

**Do not build in-app sharing to students.** Student accounts or a server-mediated delivery path would break the offline guarantee, the privacy position in §2b, and the low-end-device requirement — and would rebuild distribution that WhatsApp already handles better.

### Hackathon scope for the library

Minimal: a list of past generation records, reopenable and re-exportable. No folders, no tags, no search, no sharing between teachers, no cloud sync.

---

## 2d. Artifact structure contract (mandatory)

Generated artifacts must follow a fixed DOM contract. The verification layer (§4) inspects a known structure — it must never have to guess where things are. A model-invented structure makes every downstream check unreliable.

### Required structure

```html
<body>
  <header data-role="meta">        <!-- class, subject, topic (§2b) -->
  <main data-role="artifact">
    <section data-role="scene"
             data-intrinsic-aspect="1.6"
             data-min-aspect="1.2">  <!-- the visualization; never reflows internally -->
    <section data-role="chrome">     <!-- controls, readouts, linked graphs -->
      <div data-role="controls">     <!-- all interactive inputs, clustered (§2a) -->
      <div data-role="prediction">   <!-- commitment point (§3) -->
      <div data-role="reveal" hidden><!-- blocked until prediction committed -->
      <div data-role="explanation">  <!-- self-sufficiency (§2b) -->
```

### Rules

- Every `data-role` above must be present exactly once. Missing or duplicated roles are a Tier 1 rejection.
- `data-intrinsic-aspect` and `data-min-aspect` are required on the scene and drive the reframe logic in §2a.
- Interactive controls carry `data-control` with a stable identifier, so correction-by-pointing (§5) can target them.
- `data-role="reveal"` must be `hidden` until the prediction is committed. Tier 1 verifies this on load.
- Text nodes carrying units, axis labels or tick values carry `data-text="label"` so the ≥28 px projection check can find them after scene scaling.

### Reference artifact

Before generating any artifact at scale, build **one complete reference artifact by hand** (or under close steering) that satisfies every rule in §2, §2a, §2b and this section. Recommended: Band B, class 9, parallel and series circuits.

This reference is the structural template. Include it in the generation context and require every subsequent artifact to match its shape. Prose requirements alone produce drift; a worked example does not.

---

## 3. Class band profiles

One config object with a `band` key. Do NOT build three separate pipelines. The generation prompt, permitted artifact types, interaction ceiling, and verification tier all read from this object. The band is derived from the class number the teacher enters.

### Band A — Upper Primary (classes 5–7)

| Parameter | Value |
|---|---|
| Artifact types | interactive manipulable, step-through explainer |
| Visual density | one idea per screen, single focal object, colour-coded, minimal text |
| Abstraction | concrete and analogical only; never show a governing equation |
| Interaction depth | one variable at a time; hard-bounded sliders; snapping drag targets; no free numeric entry |
| Failure posture | guide actively — narrow choices after a wrong attempt, hint immediately |
| Notation | words over symbols; units spelled out |
| Verification tier | automated only |
| Review flag | not required |

### Band B — High School (classes 8–10)

| Parameter | Value |
|---|---|
| Artifact types | manipulable, step-through explainer, practice set with worked solutions |
| Visual density | max two linked representations (diagram + graph, or diagram + readout) |
| Abstraction | real model; analogy used as scaffolding then dropped; equations shown as relationships, not derivations |
| Interaction depth | two simultaneous variables; bounded but wide enough to reach interesting edges |
| Failure posture | show the consequence first, offer a hint only on request |
| Notation | textbook-matched symbols; units always shown |
| Verification tier | automated + numerical reference check where a computable model exists |
| Review flag | descriptive/fact-based content only |

### Band C — Higher Secondary (classes 11–12)

| Parameter | Value |
|---|---|
| Artifact types | all of Band B, plus multi-representation explorers |
| Visual density | three or more linked representations on screen simultaneously — the linking is the pedagogy |
| Abstraction | fully formal; governing equations visible and tied to the visualization; limiting cases and boundary behaviour included |
| Interaction depth | open parameter space; free numeric entry; multiple simultaneous variables; initial conditions may break or degenerate the system |
| Failure posture | no rescue; let the consequence stand; hints available but never volunteered |
| Notation | strict board conventions — sign conventions, significant figures, vector notation |
| Verification tier | automated + **mandatory** numerical reference check for anything with an underlying equation |
| Review flag | anything not numerically verifiable is flagged, with the specific uncertain claims named |

### Cross-band requirement

Every artifact in Bands B and C must contain a **prediction commitment point**: the student states or selects what they expect before the system reveals the outcome. The reveal must be blocked until the prediction is committed. Band A may use a softened version (choose-before-you-see).

---

## 4. Verification layer

Runs on every generated artifact **before** it reaches the teacher. Failures are fed back to the generator for repair, up to 3 attempts, then surfaced with the specific failure named.

**Tier 1 — Automated, client-side (all bands)**

Mechanism: load the generated artifact into a sandboxed iframe via `srcdoc`, resize the iframe to each target viewport in turn, and inspect from the parent via `getComputedStyle` and element geometry.

1. Renders with no uncaught JS errors (inject an error handler into the artifact on load).
2. **Structure contract (§2d)** — every required `data-role` present exactly once, scene carries `data-intrinsic-aspect` and `data-min-aspect`, `data-role="reveal"` is hidden on load. Check this first; a contract failure makes all later checks meaningless.
3. **No external references** — parse the HTML source for any `http(s)` URL, `src`, `href`, `@import` or fetch target pointing off-document. Static analysis, not network simulation. Any hit is a rejection.
4. File size under 2 MB.
5. All interactive controls present and responsive to dispatched events.
6. Output language matches the requested language.

**Tier 2 — Numerical reference check (Bands B and C)**

For any artifact with an underlying computable model, generate an independent reference implementation of the same model and compare outputs across a sampled parameter sweep. Divergence beyond tolerance = rejection.

Applies to, e.g.: projectile motion, SHM, series/parallel circuits, ray optics with lenses, motion graphs, thermodynamic cycles, stoichiometry.

**Tier 3 — Review flag (Band C primarily)**

Content that is not numerically verifiable (reaction mechanisms, descriptive chemistry, biological processes) is generated but marked for teacher review. The flag must name the specific claims the system is least confident about. Do not present flagged content with the same confidence as verified content.

---

## 5. Teacher interaction model

The teacher is not a prompt engineer and will not iterate twenty times.

1. **Input.** Photograph textbook pages or board work, upload notes/documents, and state the goal in plain language ("my students don't understand why current splits in a parallel circuit"). Accept the teacher's own language.
2. **Alternatives.** Generate 2–3 different approaches to the same concept in parallel and let the teacher pick. Choosing is easier than specifying.
3. **Correction by pointing.** The teacher runs the artifact, clicks the part that is wrong, and says what is wrong in plain language ("this label should say X", "slider range too wide", "too fast"). Regenerate only the affected part, not the whole artifact.
4. **Export.** One button. Downloads the single HTML file, ready to forward.

---

## 5a. Stack and cost control

### Stack

| Layer | Choice | Note |
|---|---|---|
| App | Next.js (TypeScript) | UI, generation and verification in one long-running service |
| Styling (app only) | Tailwind CSS | Agentic app interface only — never used in generated materials |
| Generation | OpenAI API — see §5b for model routing | Astra once for the reference artifact; Terra or Sol as default by measurement; Luna auxiliary only |
| Verification | **Sandboxed iframe, client-side** | Artifact loaded via `srcdoc`, resized to each viewport, inspected with `getComputedStyle` |
| Data | Supabase Postgres | Generation records, artifact metadata |
| Files | Supabase Storage | Uploaded textbook/board photos |
| Images | `sharp` | Downscale uploads before storage and before vision calls |
| Validation | `zod` | Band configs and model-returned artifact metadata |
| Hosting | Render free (single service) | 512 MB RAM, 0.1 vCPU — sufficient because no headless browser runs server-side |

**Do not use Playwright or any headless browser in the deployed service.** Render free provides 0.1 vCPU; Chromium rendering three viewports through a 3-retry repair loop is too slow and too memory-hungry there. Verification runs client-side in an iframe instead (§4).

**Do not split frontend and backend across providers.** Splitting frees ~100–150 MB on Render, which is still short of what Chromium needs, while adding CORS, two cold starts and two failure points.

**Do not put generation behind serverless functions.** Long artifact generation against a function timeout is a hard failure. Render's long-running service has no timeout ceiling.

**Do not use Python/FastAPI.** All Tier 2 reference checks are simple arithmetic (kinematics, Ohm's law, lens equation, SHM), and verification already runs in a browser context. Reference implementations belong in JavaScript alongside the artifact state.

Do not add: a state management library, a component kit, an ORM, or an auth provider. Supabase Auth is out of scope — hardcode a single teacher identity.

### Deployment notes

- Render free sleeps after ~15 minutes idle with a slow cold start. Configure an external pinger (cron-job.org or UptimeRobot) against a health endpoint every 10 minutes.
- Open the deployed URL a few minutes before presenting regardless.
- Pre-generate and export the §8 demo artifacts to local disk before presenting. Because artifacts are offline single files by design, a venue network failure is recoverable — open a pre-exported file and continue.

### Optional: Playwright locally only

If batch cache pre-warming is wanted, run Playwright **on a local machine**, not in the deployed service: generate the artifact library locally, verify headlessly, push results to Supabase. Never a production dependency.

### Generated materials: no framework

Materials are plain HTML with inlined CSS and JS. No Tailwind, no build step, no external references (§2).

**Every material must be generated against a fixed inline CSS base.** Do not let the model author styling from scratch per artifact. The base defines:

- colour custom properties (high contrast, projection-safe)
- type scale, including the ≥28 px projection floor
- stroke weight variables (≥3 px at projection sizes)
- the two viewport regimes from §2a
- the scene / chrome layout containers from §2a

This makes the §2a rules enforceable by construction rather than by chance, and makes verification reliable — checks inspect a known structure instead of whatever the model invented that run.

---

## 5b. Model routing and budget

Total API budget: **$50**. Treat it as a hard ceiling. Rates per million tokens, standard processing, context under 272K:

| Model | Input | Output | Approx. cost per artifact |
|---|---|---|---|
| GPT-6 Astra | $10.00 | $50.00 | ~$0.37 |
| GPT-5.6 Sol | $4.00 | $20.00 | ~$0.15 |
| GPT-5.6 Terra | $2.00 | $12.00 | ~$0.08 |
| GPT-5.6 Luna | $0.20 | $1.20 | ~$0.01 |

Assumes ~5k output and ~12k input tokens once the CSS base and reference artifact are in the prompt. All four models: 1.05M context, 128K max output — artifact truncation is not a risk. Keep prompts under 272K to stay on standard rates.

**Sol's $4/$20 is promotional, stated as available at least through 21 November 2026.** Irrelevant to the hackathon; relevant to any cost model presented as a business plan.

### Routing

| Job | Model | Reason |
|---|---|---|
| **Reference artifact (§6 step 2)** | **Astra** | One-time call. Every later generation inherits its structure — highest-leverage spend in the build. |
| Artifact generation (default) | **Terra or Sol — decide by measurement, see below** | |
| Escalation after verification failure | Sol | Astra's 2.5× premium over Sol is not justified for HTML generation |
| Vision — textbook/board photo extraction | Sol | Notation and syllabus errors propagate into everything generated downstream. Never Luna. |
| Translation passes | Luna | |
| Test-case generation (§4 Tier 2) | Luna | |
| Concept classification / cache key derivation | Luna | |

### Choosing the default generation model

Sol costs only ~1.8× Terra, so Terra-first only wins if Terra passes the §2d contract often enough that its repair cycles stay cheap.

**Measure this before committing.** Generate the class 9 parallel-circuits artifact 10 times on Terra and record the first-pass Tier 1 success rate.

- **≥70% first-pass** → Terra default, Sol on escalation.
- **<70%** → Sol default throughout. Failed Terra attempts cost both money and wall-clock time in the repair loop; below that threshold the expected cost per successful artifact converges on Sol's anyway, with worse latency.

**Do not use Luna for artifact generation** under either branch. It misses the §2d contract often enough that repair cycles cost more than starting higher.

**Do not use GPT-5.5.** Terra is comparable at roughly half the cost.

### Budget tactics (implement these, not optional)

1. **Develop against fixtures.** Once 4–5 good artifacts exist, save them to disk and build the verification layer, iframe measurement and UI against those files. Debugging own code must not cost tokens.
2. **Cache the prompt prefix.** The CSS base + reference artifact is a large, identical prefix on every generation call. Place it first, set an explicit cache breakpoint after it. Cached input is roughly 1/10 the standard rate.
3. **Pre-warm the library on Batch/Flex.** Half price. Any bulk pre-generation of common concepts goes through the batch tier, never standard.
4. **Cap repairs at 3 retries.** Financial control as well as a quality one. Run the 10-generation Terra measurement (§5b) before fixing the default model.
5. **Downscale all uploads** before vision calls. Phone textbook photos are 4–8 MB.
6. **Cache by `concept + band + language`** before any generation call. Largest single lever — the same concepts recur across schools.
7. **Rehearse against cached artifacts.** Never regenerate during demo practice.

---

## 5c. UI direction — the Slate builder

The subject is the object the product is named for: the framed writing slate every Indian schoolchild has held. Ground the design there, not in generic dark mode.

The real slate is not near-black — it is a dark, desaturated grey-green stone in a wooden frame, written on in chalk that is warm off-white, never pure white. Coloured chalk is where accent colour comes from.

### Palette

| Token | Hex | Use |
|---|---|---|
| `--stone` | `#2E3A38` | primary surface — the writing face |
| `--stone-deep` | `#1F2927` | recessed panels, input wells |
| `--chalk` | `#EDE8DC` | primary text |
| `--chalk-dim` | `#A8A79C` | secondary text, labels |
| `--frame` | `#8B6B47` | wood frame — borders only, never fills |
| `--chalk-green` | `#A3C48F` | verification pass |
| `--chalk-rose` | `#D99A93` | verification fail |

Do not introduce a terracotta/clay accent or a bright acid accent on near-black. Both are generic tells and neither is in the object.

### Type

**Manjari** throughout — it is designed for Malayalam with matching Latin glyphs, so mixed Malayalam/English labels sit on one baseline without a second family. Sentence case. No all-caps labels, no eyebrow labels above headings.

**Artifacts cannot load fonts** (§2 forbids external references). Generated artifacts must use a system font stack with Malayalam fallbacks, not a webfont. Android and iOS ship Malayalam faces; rely on those.

### Layout

One screen. No nav, no sidebar, no dashboard.

```
┌──────────────────────────────────────────┐
│  Slate                                   │
│                                          │
│  What are you teaching?                  │
│  ┌────────────────────────────────────┐  │
│  │ plain text input                   │  │
│  └────────────────────────────────────┘  │
│  [ add textbook photo ]   class ▾  ml ▾  │
│                                          │
│  ── generation ────────────────────────  │
│  streaming artifact source               │
│                                          │
│  ── checks ────────────────────────────  │
│  ✓ structure   ✓ offline   ✓ 360px       │
│  ✓ 1024×768    ✗ contrast → repairing    │
│                                          │
│  ┌── framed preview ─────────────────┐   │
│  │  [ phone ] [ projector ]          │   │
│  │  live artifact in iframe          │   │
│  └───────────────────────────────────┘   │
│  [ download ]                            │
└──────────────────────────────────────────┘
```

### Where the boldness goes

**The checks list is the memorable element.** It ticks through live as verification runs, and shows a failure being repaired rather than hiding it in a log. Everything else stays quiet. This is both the best UX moment and the credibility beat in the demo — do not bury it.

**The preview is framed**, in `--frame`, echoing the slate's wooden edge. The border encodes something real: what's inside it is the artifact, what's outside is the tool.

**The phone/projector toggle** on the preview resizes the iframe between 360×640 and 1024×768. It demonstrates §2a without a word of explanation and is genuinely useful to a teacher.

### Copy

Plain verbs, sentence case, active voice. "What are you teaching?" not "Enter learning objective." Button says `Download`, and what it produces is a download. Failures state what broke and what the system is doing about it — "Contrast too low at projector size, regenerating" — never a vague apology.

Motion: one moment only, the checks ticking through as they resolve. No entrance animations, no hover transitions on everything.

---

## 6. Build order — 6.5 hour constraint

**Project name: Slate. Demo language: Malayalam with English technical terms.**

Time is the binding constraint. Build only the following, in order. Do not start a step until the previous one runs.

| # | Time | Step |
|---|---|---|
| 0 | 0:00–0:35 | **Deploy a Next.js skeleton to Render immediately.** Configure the uptime pinger. Set up Supabase: one `generations` table and two storage buckets (`uploads`, `artifacts`). Create `AGENTS.md`, the `context/` files below, and a README skeleton. Infra must not be discovered late. |
| 1 | 0:35–1:05 | **Fixed inline CSS base** — colour tokens, type scale (≥28 px projection floor), stroke weights (≥3 px), the two viewport regimes and scene/chrome containers from §2a. |
| 2 | 1:05–2:10 | **Reference artifact, generated with Astra** — Band B, class 9, parallel and series circuits. Malayalam labels with English technical terms. Must satisfy §2, §2a, §2b and §2d in full. This is the structural template and the visual proof. Spend the care here. |
| 3 | 2:10–3:40 | **Generation core** — text + image input → single self-contained HTML artifact, Band B only, reference artifact supplied in context. Persist each generation to Supabase. |
| 4 | 3:40–5:00 | **Tier 1 iframe verification + repair loop** — contract check first, then three viewports (360×640, 1024×768, 1920×1080). 3-retry cap. Surface rejections in the UI, store results in `verification`. |
| 5 | 5:00–6:00 | Final deploy, write the README properly, pre-generate demo artifacts to local disk, rehearse twice. |
| — | 6:00–6:30 | Buffer. |

### Supabase schema (keep it this small)

```sql
create table generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  concept text,
  band text,
  language text,
  record jsonb,       -- teacher inputs, instructions, corrections
  artifact_html text,
  verification jsonb  -- pass/fail per check, rejection log
);
```

Buckets: `uploads` (textbook/board photos), `artifacts` (exported HTML). No RLS policies, no auth, no joins, no additional tables. The `jsonb` columns absorb anything that would otherwise need modelling.

### Repo documentation

Create at step 0. **Update at step boundaries only, never per commit** — at this timescale the ritual costs more than it returns.

**`AGENTS.md`** — a pointer, not a copy of this spec. Duplicating requirements guarantees drift. It states: SPEC.md is authoritative; follow §6 one step at a time; do not build the cut list; do not add dependencies or swap the stack; and the four constraints that get forgotten (single-file no-external-refs artifacts, Manjari is builder-UI only, verification is client-side iframe, §2d contract is mandatory).

**`context/`** — holds what gets lost when a long session compacts:

| File | Contents |
|---|---|
| `DECISIONS.md` | choices made mid-build and why — stops the same question being re-litigated after a context reset |
| `PROMPTS.md` | the generation prompt template, single source of truth |
| `VERIFICATION.md` | the Tier 1 check list exactly as implemented |
| `PROGRESS.md` | one line per completed step, for session recovery |

`DECISIONS.md` and `PROMPTS.md` are the load-bearing two. The reference artifact stays in app source where generation reads it — do not duplicate it into `context/`.

**`README.md`** — skeleton at step 0 (name, one line, stack). Write properly in the 5:00–6:00 window; it is judge-facing and the repo is public. Cover: the problem, what a Slate artifact is and why single-file/offline matters, how verification works, the band model, the stack, and **what is built versus what is specified but unbuilt**. State the cut list honestly — scope discipline reads well; overclaiming does not.

### Cut from scope for this build

Tier 2 numerical reference checks, Tier 3 review flagging, correction by pointing, multi-artifact export, parallel alternatives, the cache layer, and Bands A and C.

These remain in the spec as the described product and should be stated in the pitch as designed-but-unbuilt, not presented as working.

### Demo safety

- Pre-generate and export the demo artifacts to local disk before presenting. Artifacts are offline single files by design, so a venue network failure is recoverable — open a pre-exported file and continue.
- Rehearse against pre-generated artifacts. Do not regenerate live except for one deliberate generation, and stream it so the wait is watchable.

Implement in this sequence. Each stage must work before starting the next.

*(Superseded by the 6.5-hour table in §6 above. Retained as the full product roadmap.)*

1. **Fixed inline CSS base** — colour, type scale, stroke weights, viewport regimes, scene/chrome containers (§5a). Everything downstream generates against this.
2. **Reference artifact** — one hand-built Band B artifact (class 9 parallel/series circuits) satisfying §2, §2a, §2b and §2d in full. Generate with **Astra** (§5b) under close steering. This is the structural template fed into every later generation.
3. **Generation core** — input (text + image) → single self-contained HTML artifact, Band B defaults only, matching the reference structure.
4. **Tier 1 verification + repair loop** — iframe-based three-viewport checks, contract check first, reject and regenerate on failure, 3-retry cap; log rejections and surface them in the UI.
5. **Cache layer** — `concept + band + language` lookup before any generation call.
6. **Band profile config** — A/B/C branching on generation prompt, artifact types, interaction ceiling.
7. **Tier 2 numerical reference check** for Bands B and C.
8. **Language support** — teacher-selected output language including mixed-language labels.
9. **Correction by pointing** — targeted regeneration from the stored generation record, using `data-control` identifiers.
10. **Tier 3 review flagging** for Band C.
11. **Multi-artifact export** — explainer and practice set from one session.
12. **Alternatives** — parallel generation of 2–3 approaches.

---

## 7. Out of scope

Do not build:
- Multi-user collaboration, classrooms, or rosters
- Authentication, accounts, payments
- Student progress tracking or analytics dashboards
- Any server-side dependency in the generated artifact
- 3D rendering unless the concept is genuinely spatial — prefer 2D SVG/canvas for reliability and file size
- Support above class 12

---

## 8. Rehearsed demo concepts

Build and harden these specific artifacts. They are the demo.

- **Band B, class 9 — Parallel and series circuits.** Resistance sliders, live current redistribution.
- **Band B, class 9 — Motion graphs.** Linked distance–time and velocity–time; numerically verifiable.
- **Band C, class 11 — Projectile motion.** Free initial velocity, angle, gravity; linked position/velocity/acceleration graphs; visible governing equations; Tier 2 verification panel shown.
- **Band C, class 12 — Ray optics with lenses.** Strict sign conventions; drag object, live ray diagram and image.

Key demo beat: generate the **same concept** (motion) under Band B and Band C and show the outputs diverge — one slider and one graph versus open parameters, linked representations, visible equations, and numerical verification.
