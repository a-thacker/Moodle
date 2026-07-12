-- ============================================================================
-- Personal Command Center — Migration 001: initial schema
-- ============================================================================
-- Idempotent: safe to re-run in full at any time. Apply in the Supabase SQL
-- editor, or run the numbered files in supabase/migrations/ in order (this
-- file always equals the sum of all migrations).
--
-- Writer/reader split, per docs/PROJECT_HANDOFF.md:
--   * The local Sync Agent writes eClass data using the SERVICE-ROLE key
--     (bypasses RLS; that key lives only on Alden's Mac, never in the Hub).
--   * The Hub (browser, anon key + Supabase Auth session) only reads eClass
--     data, and reads/writes shared-tool tables. RLS enforces who sees what.
--
-- Auth setup done in the dashboard, not in SQL: disable signups, create the
-- two users (Alden, roommate) manually, then insert their profiles rows
-- (migration comment below shows how).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user; the role drives every RLS policy
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('owner', 'roommate'))
);

comment on table public.profiles is
  'Exactly two rows, inserted manually after creating the auth users: '
  'insert into profiles (id, display_name, role) values '
  '(''<alden-auth-uuid>'', ''Alden'', ''owner''), '
  '(''<roommate-auth-uuid>'', ''<name>'', ''roommate'');';

-- True when the calling (authenticated) user is the owner. SECURITY DEFINER
-- so policies can consult profiles without granting direct access to it.
create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- eClass data — written only by the Sync Agent (service role)
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id         bigint primary key,               -- Moodle course id
  shortname  text not null,
  fullname   text not null,
  hidden     boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Full GradeReport.to_dict() payloads. The agent appends a row on the first
-- fetch (baseline) and whenever a diff finds changes — not on every poll —
-- so this stays small while still being a complete grade history.
create table if not exists public.grade_snapshots (
  id         bigint generated always as identity primary key,
  course_id  bigint not null references public.courses (id),
  fetched_at timestamptz not null default now(),
  report     jsonb not null
);

create index if not exists grade_snapshots_course_fetched_idx
  on public.grade_snapshots (course_id, fetched_at desc);

-- One row per detected change (tracker/diff.py GradeChange) — what the
-- Grades widget's "latest changes" feed reads.
create table if not exists public.grade_events (
  id          bigint generated always as identity primary key,
  course_id   bigint not null references public.courses (id),
  kind        text not null check (kind in ('graded', 'changed', 'feedback')),
  item_name   text not null,
  category    text,
  old         text,
  new         text,
  is_total    boolean not null default false,
  detected_at timestamptz not null default now()
);

create index if not exists grade_events_detected_idx
  on public.grade_events (detected_at desc);

-- Upcoming due dates (eclass get_timeline). Agent upserts by Moodle event id
-- and deletes rows that no longer appear, so this mirrors "what's upcoming".
create table if not exists public.timeline_events (
  id          bigint primary key,              -- Moodle calendar event id
  name        text not null,
  due         timestamptz not null,
  module      text,                            -- "assign", "quiz", ...
  course_id   bigint,                          -- site-level events have none
  course_name text,
  url         text,
  overdue     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists timeline_events_due_idx
  on public.timeline_events (due);

-- ---------------------------------------------------------------------------
-- Shared tools — both users, Realtime-powered
-- ---------------------------------------------------------------------------
create table if not exists public.grocery_items (
  id         bigint generated always as identity primary key,
  name       text not null,
  quantity   text,
  added_by   uuid references public.profiles (id),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

-- Realtime for live grocery sync between the two phones. Guarded because
-- re-adding a table to a publication errors.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'grocery_items'
  ) then
    alter publication supabase_realtime add table public.grocery_items;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- No INSERT/UPDATE policies exist for eClass tables: the agent's service-role
-- key bypasses RLS, and browser users must never write grade data.

alter table public.profiles        enable row level security;
alter table public.courses         enable row level security;
alter table public.grade_snapshots enable row level security;
alter table public.grade_events    enable row level security;
alter table public.timeline_events enable row level security;
alter table public.grocery_items   enable row level security;

-- profiles: both users may read names/roles (the grocery list shows
-- "added by"); nobody edits profiles from the browser.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- eClass data: owner-only, read-only.
drop policy if exists courses_owner_select on public.courses;
create policy courses_owner_select on public.courses
  for select to authenticated using (public.is_owner());

drop policy if exists grade_snapshots_owner_select on public.grade_snapshots;
create policy grade_snapshots_owner_select on public.grade_snapshots
  for select to authenticated using (public.is_owner());

drop policy if exists grade_events_owner_select on public.grade_events;
create policy grade_events_owner_select on public.grade_events
  for select to authenticated using (public.is_owner());

drop policy if exists timeline_events_owner_select on public.timeline_events;
create policy timeline_events_owner_select on public.timeline_events
  for select to authenticated using (public.is_owner());

-- grocery list: full access for both users.
drop policy if exists grocery_select on public.grocery_items;
create policy grocery_select on public.grocery_items
  for select to authenticated using (true);

drop policy if exists grocery_insert on public.grocery_items;
create policy grocery_insert on public.grocery_items
  for insert to authenticated with check (true);

drop policy if exists grocery_update on public.grocery_items;
create policy grocery_update on public.grocery_items
  for update to authenticated using (true) with check (true);

drop policy if exists grocery_delete on public.grocery_items;
create policy grocery_delete on public.grocery_items
  for delete to authenticated using (true);
