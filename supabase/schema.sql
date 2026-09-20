-- One row per generation session (§2c: one concept, one set of inputs, one
-- set of corrections). A correction round upserts this same row rather than
-- inserting a new one, so artifact_html always holds the LATEST document and
-- the history lives in record.corrections.
--
-- record jsonb:
--   {
--     goal, classNumber, language, photoPath,
--     corrections: [                          -- append-only, may be absent
--       { id, atRound, controlId, role, label,
--         elementSnippet, comment,
--         complexity,                         -- Luna triage: simple | complex
--         model }                             -- which model handled it
--     ]
--   }
--
-- Additive only — rows written before corrections existed stay valid, so no
-- migration is needed for the jsonb shape itself.
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

