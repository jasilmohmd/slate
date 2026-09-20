-- One row per generation session (§2c: one concept, one set of inputs, one
-- set of corrections). A correction round upserts this same row rather than
-- inserting a new one, so artifact_html always holds the LATEST document and
-- the history lives in record.corrections.
--
-- record jsonb:
--   {
--     goal, classNumber, language,
--     photoPaths: ["<id>/1.jpg", ...],        -- was photoPath (singular)
--     photoPath,                              -- kept: first attachment, for
--                                             --   readers written before v3
--     conceptComplexity,                      -- Luna: simple|standard|dense
--     turns: [                                -- the session transcript
--       { id, at,
--         role: "teacher" | "slate",
--         kind: "goal" | "refine" | "correction" | "result",
--         text,
--         pointer: { controlId, role, label, elementSnippet } | null,
--         attachments: ["<id>/1.jpg"],
--         model, complexity,
--         verification: { passed, attempts } }
--     ],
--     corrections: [ ... ]                    -- superseded by turns; still
--                                             --   written and still read for
--                                             --   rows created before v3
--   }
--
-- Additive only, in both directions. Rows written before corrections or turns
-- existed stay valid: GET /api/sessions/[id] synthesises a transcript from
-- corrections[] when turns[] is absent (see src/lib/session.ts), so no
-- migration is needed for the jsonb shape at any point.
create table generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  concept text,
  band text,
  language text,
  record jsonb,
  artifact_html text,
  verification jsonb
);

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false), ('artifacts', 'artifacts', false);

