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

