-- De Bosboom - login per persoon (Pass 1)

-- Koppeltabel: welke ingelogde gebruiker is welke boom
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  resident_id text unique references residents(id),   -- unique: 1 boom per persoon
  created_at  timestamptz not null default now()
);
alter table profiles enable row level security;

-- Realtime voor profielen (zodat 'geclaimd' direct zichtbaar is)
alter publication supabase_realtime add table profiles;

-- Profielen: iedereen die ingelogd is mag ze zien (wie is welke boom);
-- je mag alleen je eigen profiel aanmaken/wijzigen.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Data-tabellen: van 'iedereen' naar 'alleen ingelogd'.
do $$
declare t text;
begin
  foreach t in array array['residents','meals','day_notes','chores','shopping','recipes','quotes','plans']
  loop
    execute format('drop policy if exists bosboom_open on %I;', t);
    execute format('create policy bosboom_auth on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
