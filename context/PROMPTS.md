# Prompts

Single source of truth is code, not this file: `src/lib/artifact/generationPrompt.ts`
(`buildGenerationPrompt`). This documents its shape so it doesn't need
re-deriving from a compacted session.

## Structure

A single user message, text content built from two parts, in this order
(static first, so an OpenAI-compatible endpoint's automatic prefix caching
has a chance to hit on repeat calls, per §5b):

1. **Static preamble** (`STATIC_PREAMBLE`, same on every call this build,
   since only Band B exists): the Band B profile (§3), the §2 hard output
   constraints, the §2a dual-viewing rules including the scaling traps, the
   §2b two-audiences rules, the §2d DOM contract, and finally the full
   reference artifact (`REFERENCE_ARTIFACT_HTML` from
   `src/lib/artifact/reference.ts`) with instructions to reuse its shared
   base CSS verbatim and match its DOM/interaction shape. The reference
   artifact is NOT duplicated into this file — it lives in app source only
   (§6).
2. **Per-request suffix**: the class number, the teacher's goal verbatim,
   a language instruction (`ml` = Malayalam labels with English technical
   terms left in English; `en` = plain English), a note when a photo is
   attached, and the output-format instruction (raw HTML only, no fences).

If a photo is attached, it's sent as a second content part
(`image_url` with a base64 `data:image/jpeg` URI) in the same message —
one Sol call does both vision extraction and generation, rather than two
separate calls, since §5b assigns both jobs to Sol anyway.

## Model

`gpt-5.6-sol`, interim default for both generation and vision (see
DECISIONS.md — the Terra-vs-Sol measurement needs Tier 1, which doesn't
exist until step 4).

## Streaming wire format

The `/api/generate` route streams newline-delimited JSON, not raw SSE:
- `{"type":"delta","text":"..."}` — one per OpenAI content delta, for the
  builder UI's live "streaming artifact source" panel.
- `{"type":"done","id":"<generation-id>","html":"<full artifact>"}` — sent
  once, after the OpenAI stream ends and the Supabase insert succeeds. The
  client uses this `html`, not its own concatenation of deltas, as the
  authoritative artifact (avoids any multi-byte UTF-8 chunk-boundary risk
  from manual client-side accumulation).
- `{"type":"error","message":"..."}` — on any failure (OpenAI call,
  Storage upload, or Supabase insert). The HTTP response itself is always
  200 with this streaming body; errors are communicated in-band, not via
  HTTP status, because the response has already started streaming by the
  time most failures can occur.
