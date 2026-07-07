create table if not exists samples (
  id text primary key,
  title text not null,
  kind text not null check (kind in ('audio', 'video')),
  url text not null,
  original_name text,
  storage_path text,
  content_type text,
  created_at text not null
);

create table if not exists responses (
  id text primary key,
  created_at text not null,
  evaluator text,
  group_name text,
  answers text not null
);
