-- Apex Ring online: run this once in your Supabase project (Dashboard > SQL Editor > New query > paste > Run).
-- It creates the tables for driver profiles, lap times and friends, with row-level security so each player can only
-- write their own rows. Live "Race with friends" rooms use Supabase Realtime broadcast and need no tables.
-- Safe to run again: everything is "if not exists" / "or replace".

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Driver' check (char_length(name) between 1 and 16),
  friend_code text not null unique check (friend_code ~ '^APX-[A-Z0-9]{4,6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.laps (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  track text not null check (char_length(track) between 1 and 24),
  ms integer not null check (ms between 10000 and 1800000), -- 10 s to 30 min: anything else is a mistake or a cheat
  car text check (char_length(car) <= 24),
  created_at timestamptz not null default now()
);
create index if not exists laps_track_ms on public.laps (track, ms);
create index if not exists laps_user on public.laps (user_id);

create table if not exists public.friends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  primary key (user_id, friend_id)
);

-- each driver's best lap per track, with their name: what the leaderboards read
create or replace view public.leaderboard with (security_invoker = on) as
  select distinct on (l.track, l.user_id) l.track, l.user_id, l.ms, l.car, l.created_at, p.name
  from public.laps l join public.profiles p on p.id = l.user_id
  order by l.track, l.user_id, l.ms;

alter table public.profiles enable row level security;
alter table public.laps enable row level security;
alter table public.friends enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "make your own profile" on public.profiles;
create policy "make your own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "edit your own profile" on public.profiles;
create policy "edit your own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "laps are public" on public.laps;
create policy "laps are public" on public.laps for select using (true);
drop policy if exists "post your own laps" on public.laps;
create policy "post your own laps" on public.laps for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "see your own friends" on public.friends;
create policy "see your own friends" on public.friends for select to authenticated using (user_id = auth.uid());
drop policy if exists "remove a friend" on public.friends;
create policy "remove a friend" on public.friends for delete to authenticated using (user_id = auth.uid());

-- what the public API roles may touch at all (row-level security above then narrows it to each player's own rows)
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.laps, public.leaderboard to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert on public.laps to authenticated;
grant select, delete on public.friends to authenticated;
revoke insert, update, delete on public.profiles, public.laps, public.friends from anon;

-- add a friend by their code: makes the friendship both ways and returns their name
create or replace function public.add_friend(code text) returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid; fname text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, name into fid, fname from profiles where friend_code = upper(trim(code));
  if fid is null then raise exception 'No driver has that code'; end if;
  if fid = auth.uid() then raise exception 'That is your own code'; end if;
  insert into friends (user_id, friend_id) values (auth.uid(), fid) on conflict do nothing;
  insert into friends (user_id, friend_id) values (fid, auth.uid()) on conflict do nothing;
  return fname;
end $$;
revoke all on function public.add_friend(text) from public, anon;
grant execute on function public.add_friend(text) to authenticated;
