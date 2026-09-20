# Prompts

Single source of truth is code, not this file: `src/lib/artifact/generationPrompt.ts`.
This documents its shape so it doesn't need re-deriving from a compacted
session.

## Structure

Calls send a real OpenAI `messages` array, **not** one flattened user
message. That changed in v2 step 8; anything describing a single
concatenated string is out of date.

```
[ user      STATIC_PREAMBLE                    <- identical on every call
  user      this session's goal/class/language
  assistant "[drafted the artifact]"           <- only on a follow-up
  user      "The teacher pointed at X and said: ..."   <- per past correction
  assistant "[corrected: ...]"                          <- per past correction
  user      <task block, carrying the CURRENT document> ]
```

Two properties are deliberate:

1. **`STATIC_PREAMBLE` is the whole of the first message and never varies**,
   so the cacheable prefix is byte-identical across generation, repair and
   correction — which is what makes §5b's prompt-prefix caching pay off turn
   over turn rather than only on the first call. Nothing per-request is
   appended to it.
2. **Earlier turns collapse to short placeholders**, not replayed documents.
   The model needs the *current* document at full fidelity (it is inside the
   task block) plus enough context to know what has already been addressed.
   Token growth is therefore linear in the number and length of comments,
   not in artifact size.

There is no server-side session store. The thread is reconstructed per call
from the corrections the client already holds and sends as `history`.

### What is in `STATIC_PREAMBLE`

Same on every call this build, since only Band B exists: the Band B profile
(§3), the §2 hard output constraints, the §2a dual-viewing rules including
the scaling traps, the §2b two-audiences rules, the §2d DOM contract, and
finally the full reference artifact (`REFERENCE_ARTIFACT_HTML` from
`src/lib/artifact/reference.ts`) with instructions to reuse its shared base
CSS verbatim and match its DOM and interaction shape. The reference artifact
is NOT duplicated into this file — it lives in app source only (§6).

### Task blocks

Three, all returning a full document rather than a patch. `buildMessages`
assembles whichever one applies into the final user turn.

- **`buildGenerationTask`** — class number, the teacher's goal verbatim, the
  language instruction (`ml` = Malayalam labels with English technical terms
  left in English; `en` = plain English), a note when a photo is attached,
  and the output-format instruction (raw HTML only, no fences).
- **`buildRepairTask`** — the same, plus the named Tier 1 failures and the
  previous document. Fixes exactly what was flagged.
- **`buildRefineTask`** — a chat turn asking for a change, with an
  **optional** pointer. Correction by pointing (§5 step 3) is the pointer
  case, not a separate task: when present it carries the element the
  teacher tapped (addressed by its `data-control`, falling back to its
  `data-role`), the label they saw and the element's own markup. Always
  carries their words verbatim and the current document. Its instruction is
  stronger than a repair's: change only what was asked for, leave layout,
  other controls, other text and the wording of anything unmentioned exactly
  as it is, and prefer the smallest change when the request is ambiguous.

Refinements are full-document-in, full-document-out on purpose. There is no
diff or patch infrastructure in this codebase, and partial patches from a
model are unreliable.

`buildGenerationPrompt` still exists as `STATIC_PREAMBLE` + the generation
task flattened into one string. It is kept only for one-off scripts that
call the API directly (`scripts/measure-terra.mjs`), not for the app.

## Photos

Photos (up to 8 per turn) are sent as `image_url` content parts with base64
`data:image/jpeg` URIs, attached to the **final turn only**, never to the
preamble. One call does both vision extraction and generation rather than
two separate calls, and that call routes as `vision` (§5b: never Luna),
which matters now that the generation default is not Sol.

## Models

Routed per job by `src/lib/models/router.ts` — see `DECISIONS.md`.

- **Generation** is triaged first by `classifyConcept` (Luna): how many
  separate labelled things the diagram must show. simple →
  `SLATE_GENERATION_MODEL` (Terra), standard → Sol, dense → Astra. Fails
  open to Sol. The prompt is framed as counting, with worked examples; it
  scores 6/7 against manual judgement, the miss erring upward.
- **Repair** and **vision** are Sol.
- **Refinement** is Terra or Sol by `classifyCorrection` (Luna).

The v3 contract also tells the model the rules the new Tier 1 checks
enforce — labels must not collide at any viewport, and when it does not
fit, draw less (fewer elements, never smaller text).

The classification call sets `reasoning_effort: "none"` and leaves token
headroom. Luna is a reasoning model: with a tight `max_completion_tokens`
the whole budget is spent on reasoning tokens, `finish_reason` comes back
`"length"`, `content` is an empty string, and the fail-open path then reads
that as "complex" every single time.

## Streaming wire format

`/api/generate` streams newline-delimited JSON, not raw SSE:

- `{"type":"delta","text":"..."}` — one per OpenAI content delta. The builder
  UI no longer renders these (v2 step 1 removed the source panel); the
  stream is still drained, which also keeps the connection alive through
  proxies during a long generation.
- `{"type":"done","id":..,"html":..,"photoPaths":[..],"model":..,"complexity":..,"conceptComplexity":..}`
  — sent once, after the OpenAI stream ends. The client uses this `html`,
  not its own concatenation of deltas, as the authoritative artifact (avoids
  any multi-byte UTF-8 chunk-boundary risk from manual client-side
  accumulation). `model`, `complexity` and `conceptComplexity` are
  recorded on the turn in `record.turns[]`.
- `{"type":"error","message":"..."}` — on any failure. The HTTP response is
  always 200 with this streaming body; errors are communicated in-band, not
  via HTTP status, because the response has already started streaming by the
  time most failures can occur. An abort (the teacher pressing Stop) is
  not reported as an error: the client's `AbortSignal` is passed through to
  the upstream OpenAI fetch, so the model call is cancelled rather than left
  running.

Persistence is a separate call (`/api/persist-generation`), made by the
client once the generate/verify/repair cycle settles.
