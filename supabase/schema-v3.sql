-- Apex Ring online, part 3 (run once after schema-v2.sql). Safe to run again. Tightens what players can see and write:
--  * lap / ghost times always get the server's clock (no backdated or future laps pinned to the weekly boards)
--  * friend codes, "last seen" and invite inboxes are only visible to your friends (through the functions below)
--  * "I'm online" is set by the server's clock, not the player's

-- each player gets a secret invite inbox id; friends learn it through my_friends(), nobody else can read it
alter table public.profiles add column if not exists inbox uuid not null default gen_random_uuid();

-- what anyone can read about a driver: their id and name (the boards need nothing else)
revoke select on public.profiles from anon, authenticated;
grant select (id, name) on public.profiles to anon, authenticated;
-- what a driver can write about themselves
revoke insert, update on public.profiles from authenticated;
grant insert (id, name, friend_code) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- laps and ghosts: only these columns can be written; the dates come from the server
revoke insert on public.laps from authenticated;
grant insert (track, ms, car) on public.laps to authenticated;
revoke insert, update on public.ghosts from authenticated;
grant insert (track, ms, car, data) on public.ghosts to authenticated;
grant update (ms, car, data) on public.ghosts to authenticated;
create or replace function public.ghost_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists ghost_touch on public.ghosts;
create trigger ghost_touch before insert or update on public.ghosts for each row execute function public.ghost_touch();

-- your own profile (friend code + inbox), for this device
create or replace function public.my_profile() returns table (name text, friend_code text, inbox uuid)
language sql security definer set search_path = public stable as $$
  select name, friend_code, inbox from profiles where id = auth.uid();
$$;
-- your friends with their friend code, when they were last seen, and their invite inbox
create or replace function public.my_friends() returns table (id uuid, name text, friend_code text, last_seen timestamptz, inbox uuid)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.friend_code, p.last_seen, p.inbox from friends f join profiles p on p.id = f.friend_id where f.user_id = auth.uid();
$$;
-- "I'm here": the server stamps the time
create or replace function public.touch_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where id = auth.uid();
$$;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.touch_seen() from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.touch_seen() to authenticated;
