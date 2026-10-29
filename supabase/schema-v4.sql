-- Apex Ring online, part 4 (run once after schema-v3.sql; safe to run again).
-- Record boards: each driver's longest drift, top speed, biggest air and number of wins, one row per driver.
-- The game sends its own personal records when one improves; the server stamps the time and keeps values sane.

create table if not exists public.stats (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  drift integer not null default 0 check (drift between 0 and 500000),   -- drift points in one drift
  speed real not null default 0 check (speed between 0 and 700),        -- km/h
  air real not null default 0 check (air between 0 and 30),             -- seconds off the ground in one jump
  wins integer not null default 0 check (wins between 0 and 100000),
  updated_at timestamptz not null default now()
);
create index if not exists stats_drift on public.stats (drift desc);
create index if not exists stats_speed on public.stats (speed desc);
create index if not exists stats_air on public.stats (air desc);
create index if not exists stats_wins on public.stats (wins desc);

alter table public.stats enable row level security;
drop policy if exists "records are public" on public.stats;
create policy "records are public" on public.stats for select using (true);
drop policy if exists "post your own records" on public.stats;
create policy "post your own records" on public.stats for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update your own records" on public.stats;
create policy "update your own records" on public.stats for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- only these columns can be written (the id comes from your sign-in, the time from the server)
revoke all on public.stats from anon, authenticated;
grant select on public.stats to anon, authenticated;
grant insert (drift, speed, air, wins) on public.stats to authenticated;
grant update (drift, speed, air, wins) on public.stats to authenticated;

-- the time is always the server's, and a record never goes down
create or replace function public.stats_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.drift := greatest(new.drift, old.drift); new.speed := greatest(new.speed, old.speed);
    new.air := greatest(new.air, old.air); new.wins := greatest(new.wins, old.wins);
  end if;
  return new;
end $$;
drop trigger if exists stats_touch on public.stats;
create trigger stats_touch before insert or update on public.stats for each row execute function public.stats_touch();
