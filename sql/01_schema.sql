-- De Bosboom — database schema (v1)
-- Draai dit in de Supabase SQL Editor.

-- 1. Bewoners (3 vaste: Iep, Berk, Eik)
create table if not exists residents (
  id         text primary key,          -- 'iep' | 'berk' | 'eik'
  name       text not null,
  tree       text not null,             -- svg-vorm
  color      text not null,             -- css var
  sort       int  not null,
  is_home    boolean not null default true,
  away_label text not null default ''
);

-- 2. Eten per dag per bewoner
create table if not exists meals (
  day         date not null,
  resident_id text not null references residents(id) on delete cascade,
  status      text not null default '',  -- 'eet' | 'kookt' | 'niet' | ''
  guests      int  not null default 0,
  primary key (day, resident_id)
);

-- 3. Opmerkingen bij het eten (per dag, met auteur)
create table if not exists day_notes (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  author     text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

-- 4. Schoonmaakrooster (vaste set taken, niet toevoegen/verwijderen in app)
create table if not exists chores (
  id        text primary key,           -- 'wc' | 'keuken' | 'hal' | 'badkamer'
  task      text not null,
  ritme     text not null,              -- 'wekelijks' | '2-wekelijks' | 'maandelijks'
  who       text not null,
  last_done date not null,
  sort      int  not null
);

-- 5. Boodschappenlijst
create table if not exists shopping (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6. Recepten
create table if not exists recipes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  time_min    int,
  ingredients text[] not null default '{}',
  steps       text not null default '',
  created_at  timestamptz not null default now()
);

-- 7. Quotes
create table if not exists quotes (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  author     text not null default '',
  created_at timestamptz not null default now()
);

-- 8. Weekendplannen (per dag per bewoner, vrije tekst)
create table if not exists plans (
  day         date not null,
  resident_id text not null references residents(id) on delete cascade,
  text        text not null default '',
  primary key (day, resident_id)
);

-- Realtime aanzetten: elk apparaat ziet wijzigingen meteen
alter publication supabase_realtime add table residents, meals, day_notes, chores, shopping, recipes, quotes, plans;

-- Seed: de drie bomen
insert into residents (id, name, tree, color, sort, is_home, away_label) values
  ('iep','Iep','iep','var(--iep)',0,true,''),
  ('berk','Berk','berk','var(--berk)',1,false,'bij ouders'),
  ('eik','Eik','eik','var(--eik)',2,true,'')
on conflict (id) do nothing;

-- Seed: schoonmaaktaken
insert into chores (id, task, ritme, who, last_done, sort) values
  ('wc','WC','wekelijks','Eik','2026-10-08',0),
  ('keuken','Keuken','2-wekelijks','Iep','2026-09-30',1),
  ('hal','Hal','2-wekelijks','Berk','2026-10-06',2),
  ('badkamer','Badkamer','maandelijks','Iep','2026-09-22',3)
on conflict (id) do nothing;

-- Seed: één recept + twee quotes om mee te starten
insert into recipes (title, time_min, ingredients, steps) values
  ('Pasta pesto', 20,
   array['300 g pasta','1 pot groene pesto','150 g kerstomaatjes','1 bol mozzarella','handje pijnboompitten'],
   E'1. Kook de pasta beetgaar.\n2. Halveer de tomaatjes, scheur de mozzarella.\n3. Meng pasta met pesto, roer tomaat en mozzarella erdoor.\n4. Rooster de pijnboompitten en strooi erover.');

insert into quotes (text, author) values
  ('Wie het laatst lacht, doet de afwas.','Berk'),
  ('Een boom groeit niet in één dag.','Iep');
