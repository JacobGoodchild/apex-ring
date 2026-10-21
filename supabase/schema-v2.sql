-- Apex Ring online, part 2 (run once after schema.sql: SQL Editor > New query > paste > Run). Safe to run again.
-- Adds: online ghost laps, "last seen" for the friends-online dot, and gives every nameless driver a Racer#### name.

-- 1. ghost laps: each driver's best recorded lap per track, so others can race it
create table if not exists public.ghosts (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  track text not null check (char_length(track) between 1 and 24),
  ms integer not null check (ms between 10000 and 1800000),
  car text check (char_length(car) <= 24),
  data text not null check (char_length(data) <= 40000), -- the lap as a compact text code (~2-6 KB)
  updated_at timestamptz not null default now(),
  primary key (user_id, track)
);
alter table public.ghosts enable row level security;
drop policy if exists "ghosts are public" on public.ghosts;
create policy "ghosts are public" on public.ghosts for select using (true);
drop policy if exists "upload your own ghost" on public.ghosts;
create policy "upload your own ghost" on public.ghosts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "replace your own ghost" on public.ghosts;
create policy "replace your own ghost" on public.ghosts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.ghosts to anon, authenticated;
grant insert, update on public.ghosts to authenticated;
revoke delete, truncate, references, trigger on public.ghosts from anon, authenticated;
revoke insert, update on public.ghosts from anon;

-- 2. "last seen" so friends can see who's online
alter table public.profiles add column if not exists last_seen timestamptz;

-- 3. names: Racer + 4 digits instead of "Driver"
alter table public.profiles alter column name set default 'Racer';
update public.profiles set name = 'Racer' || (1000 + floor(random() * 9000))::int where name in ('Driver', 'Racer');
