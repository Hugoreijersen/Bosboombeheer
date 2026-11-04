-- De Bosboom — 03: Agenda, Dibs, Streeplijst, DeeldeDuit en het schoonmaak-logboek.
-- Draai dit in de Supabase SQL Editor, na 01 en 02. Het kan veilig twee keer gedraaid worden.
--
-- De huisregels staan ook in js/rules.js (de app controleert ze meteen, voor een snelle melding).
-- Hier dwingt de database ze af, zodat ook twee telefoons tegelijk ze niet kunnen omzeilen.
-- Toegang: zoals de rest van de app mag iedereen die ingelogd is alles (één huis, drie bomen,
-- plus een gedeeld kiosk-scherm). Waar dat niet genoeg is (geld!) zijn er extra regels.

create extension if not exists btree_gist;   -- nodig voor "geen overlap"-regels (exclude using gist)

-- Wie ben ik? (de boom van de ingelogde gebruiker; standaardwaarde voor nieuwe rijen)
create or replace function my_resident() returns text
language sql stable security definer set search_path = public as $$
  select resident_id from profiles where id = auth.uid()
$$;

-- =====================================================================
-- 1. Schoonmaak-logboek (voor de statistieken). De app schrijft een rij bij elke "Klaar".
-- =====================================================================
create table if not exists chore_log (
  id         uuid primary key default gen_random_uuid(),
  chore_id   text references chores(id) on delete set null,
  task       text not null,                              -- naam op dat moment
  done_by    text not null references residents(id),
  done_at    date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists chore_log_done_at on chore_log(done_at);

-- =====================================================================
-- 2. Dibs: wasmachine, droger, ... nu of later claimen. Nooit twee claims tegelijk op één ding.
-- =====================================================================
create table if not exists dib_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  icon       text not null default '📦' check (char_length(icon) <= 8),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists dib_claims (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references dib_items(id) on delete cascade,
  resident_id text not null default my_resident() references residents(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  note        text check (note is null or char_length(note) <= 60),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  during      tstzrange generated always as (tstzrange(starts_at, ends_at)) stored,
  constraint dib_tijd check (starts_at < ends_at and ends_at - starts_at <= interval '24 hours'),
  constraint dib_geen_overlap exclude using gist (item_id with =, during with &&)
);
create index if not exists dib_claims_ends on dib_claims(ends_at);

-- =====================================================================
-- 3. Agenda. Een KRING claimt het huis: niets mag ermee overlappen en niemand kan zich aanmelden.
--    Huisavond en activiteit zijn open en mogen naast elkaar bestaan.
-- =====================================================================
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 1 and 60),
  kind       text not null check (kind in ('kring', 'huisavond', 'activiteit')),
  host       text not null default my_resident() references residents(id),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  note       text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  during     tstzrange generated always as (tstzrange(starts_at, ends_at)) stored,
  constraint event_tijd check (starts_at < ends_at and ends_at - starts_at <= interval '3 days'),
  -- Twee kringen tegelijk kan nooit (ook niet als twee mensen precies tegelijk op Opslaan drukken).
  constraint kring_geen_overlap exclude using gist (during with &&) where (kind = 'kring')
);
create index if not exists events_ends on events(ends_at);

-- Een kring naast een huisavond (of andersom) vangt de constraint hierboven niet; dat doet deze trigger.
-- Het slot zorgt dat twee gelijktijdige inzendingen na elkaar gecontroleerd worden.
create or replace function events_check_kring() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('bosboom_events'));
  if exists (select 1 from events e
              where e.id <> new.id and e.during && tstzrange(new.starts_at, new.ends_at)   -- new.during bestaat in een before-trigger nog niet
                and (e.kind = 'kring' or new.kind = 'kring')) then
    raise exception 'huis_geclaimd' using errcode = '23P01';
  end if;
  if new.kind = 'kring' and tg_op = 'UPDATE' then
    delete from event_rsvp where event_id = new.id;   -- een kring heeft geen aanmeldingen
  end if;
  return new;
end $$;

create table if not exists event_rsvp (
  event_id    uuid not null references events(id) on delete cascade,
  resident_id text not null references residents(id),
  status      text not null check (status in ('ja', 'misschien', 'nee')),
  updated_at  timestamptz not null default now(),
  primary key (event_id, resident_id)
);

drop trigger if exists events_kring on events;
create trigger events_kring before insert or update of kind, starts_at, ends_at on events
  for each row execute function events_check_kring();

create or replace function rsvp_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select kind from events where id = new.event_id) = 'kring' then
    raise exception 'kring_niet_aansluiten';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists rsvp_kring on event_rsvp;
create trigger rsvp_kring before insert or update on event_rsvp
  for each row execute function rsvp_check();

-- =====================================================================
-- 4. DeeldeDuit: kosten delen. Bedragen in hele centen.
--    Afgerekende uitgaven zijn alleen-lezen; afrekenen en "betaald" gaan via functies.
-- =====================================================================
create table if not exists settlements (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  description   text not null check (char_length(btrim(description)) between 1 and 80),
  amount_cents  int  not null check (amount_cents between 1 and 1000000),   -- max € 10.000
  kind          text not null default 'betaald' check (kind in ('betaald', 'ontvangen')),
  payer         text not null references residents(id),
  spent_on      date not null default current_date,
  settlement_id uuid references settlements(id) on delete set null,          -- leeg = nog open
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists expenses_open on expenses(settlement_id);
create table if not exists expense_shares (
  expense_id  uuid not null references expenses(id) on delete cascade,
  resident_id text not null references residents(id),
  shares      int  not null default 1 check (shares between 1 and 20),
  primary key (expense_id, resident_id)
);
create table if not exists settlement_transfers (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  from_id       text not null references residents(id),
  to_id         text not null references residents(id),
  amount_cents  int  not null check (amount_cents > 0),
  paid_at       timestamptz,
  paid_by       uuid
);

-- Saldo per bewoner (+ = krijgt terug, − = moet betalen) voor de open lijst of één afrekening.
-- Zelfde rekenregel als rules.balances: naar beneden afronden, de overgebleven centen naar de grootste rest.
create or replace function expense_balances(p_settlement uuid default null)
returns table(resident_id text, balance_cents bigint)
language sql stable set search_path = public as $$
  with e as (
    select x.id, x.amount_cents::bigint as amount, case when x.kind = 'ontvangen' then -1 else 1 end as sign, x.payer
      from expenses x where x.settlement_id is not distinct from p_settlement
  ), s as (
    select sh.expense_id, sh.resident_id, e.amount, e.sign, row_number() over (partition by sh.expense_id order by r.sort) as ord,
           e.amount * sh.shares / sum(sh.shares) over w as base,
           e.amount * sh.shares % sum(sh.shares) over w as rest
      from expense_shares sh join e on e.id = sh.expense_id join residents r on r.id = sh.resident_id
    window w as (partition by sh.expense_id)
  ), p as (
    select resident_id, sign,
           base + case when row_number() over (partition by expense_id order by rest desc, ord)
                            <= amount - sum(base) over (partition by expense_id) then 1 else 0 end as part
      from s
  ), lines as (
    select e.payer as resident_id, e.sign * e.amount as delta from e
     where exists (select 1 from expense_shares x where x.expense_id = e.id)
    union all
    select p.resident_id, -p.sign * p.part from p
  )
  select r.id, coalesce(sum(l.delta), 0)::bigint
    from residents r left join lines l on l.resident_id = r.id
   group by r.id, r.sort order by r.sort;
$$;

-- Afrekenen: alle open uitgaven in één afrekening, met zo min mogelijk overboekingen (zoals rules.settle).
create or replace function settle_expenses() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s uuid; ids text[]; bal bigint[]; i int; j int; d int; c int; amt bigint;
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  perform pg_advisory_xact_lock(hashtext('bosboom_settle'));
  if not exists (select 1 from expenses where settlement_id is null) then raise exception 'niets_af_te_rekenen'; end if;
  insert into settlements default values returning id into s;
  update expenses set settlement_id = s where settlement_id is null;

  select array_agg(b.resident_id order by b.resident_id), array_agg(b.balance_cents order by b.resident_id)
    into ids, bal from expense_balances(s) b where b.balance_cents <> 0;

  -- 1. Precies even groot: één overboeking, beiden klaar.
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    continue when bal[i] >= 0;
    for j in 1 .. array_length(ids, 1) loop
      if bal[j] = -bal[i] then
        insert into settlement_transfers(settlement_id, from_id, to_id, amount_cents) values (s, ids[i], ids[j], bal[j]);
        bal[i] := 0; bal[j] := 0; exit;
      end if;
    end loop;
  end loop;
  -- 2. De rest: grootste schuld naar grootste tegoed.
  loop
    d := null; c := null;
    for i in 1 .. coalesce(array_length(ids, 1), 0) loop
      if bal[i] < 0 and (d is null or bal[i] < bal[d]) then d := i; end if;
      if bal[i] > 0 and (c is null or bal[i] > bal[c]) then c := i; end if;
    end loop;
    exit when d is null or c is null;
    amt := least(-bal[d], bal[c]);
    insert into settlement_transfers(settlement_id, from_id, to_id, amount_cents) values (s, ids[d], ids[c], amt);
    bal[d] := bal[d] + amt; bal[c] := bal[c] - amt;
  end loop;
  return s;
end $$;

create or replace function mark_transfer_paid(p_transfer uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  update settlement_transfers
     set paid_at = case when p_paid then now() end, paid_by = case when p_paid then auth.uid() end
   where id = p_transfer;
  if not found then raise exception 'niet_gevonden'; end if;
end $$;

-- Per ongeluk afgerekend? Terugdraaien kan zolang er nog niets betaald is.
create or replace function undo_settlement(p_settlement uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  if exists (select 1 from settlement_transfers where settlement_id = p_settlement and paid_at is not null) then
    raise exception 'al_betaald';
  end if;
  update expenses set settlement_id = null where settlement_id = p_settlement;
  delete from settlements where id = p_settlement;
end $$;

-- Uitgave opslaan (nieuw of bewerken) samen met wie meedoen, in één keer.
-- p_shares = [{"resident_id": "iep", "shares": 2}, ...]
create or replace function save_expense(p_id uuid, p_description text, p_amount_cents int, p_kind text,
  p_payer text, p_spent_on date, p_shares jsonb) returns uuid
language plpgsql set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then raise exception 'geen_deelnemers'; end if;
  if p_id is null then
    insert into expenses(description, amount_cents, kind, payer, spent_on)
      values (btrim(p_description), p_amount_cents, p_kind, p_payer, coalesce(p_spent_on, current_date))
      returning id into e;
  else
    update expenses set description = btrim(p_description), amount_cents = p_amount_cents, kind = p_kind,
           payer = p_payer, spent_on = coalesce(p_spent_on, spent_on)
     where id = p_id and settlement_id is null returning id into e;
    if e is null then raise exception 'al_afgerekend'; end if;
    delete from expense_shares where expense_id = e;
  end if;
  insert into expense_shares(expense_id, resident_id, shares)
    select e, x->>'resident_id', coalesce((x->>'shares')::int, 1) from jsonb_array_elements(p_shares) x;
  return e;
end $$;

-- =====================================================================
-- 5. Streeplijst. De prijs gaat bij het strepen vast mee, de voorraad loopt automatisch mee.
--    Afrekenen boekt de open strepen als uitgaven in DeeldeDuit.
-- =====================================================================
create table if not exists turf_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  icon        text not null default '🍺' check (char_length(icon) <= 8),
  price_cents int  not null default 0 check (price_cents between 0 and 10000),
  stock       int  check (stock is null or stock between -999 and 100000),   -- leeg = niet bijhouden
  active      boolean not null default true,                                 -- verbergen i.p.v. weggooien
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists turf_settlements (
  id          uuid primary key default gen_random_uuid(),
  payer       text not null references residents(id),
  total_cents int  not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create table if not exists turf_marks (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references turf_items(id),
  resident_id   text not null references residents(id),
  price_cents   int  not null default 0,
  settlement_id uuid references turf_settlements(id) on delete set null,   -- leeg = nog open
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists turf_marks_open on turf_marks(settlement_id);
create index if not exists turf_marks_created on turf_marks(created_at);
alter table expenses add column if not exists turf_settlement_id uuid references turf_settlements(id) on delete cascade;

create or replace function turf_mark_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare it turf_items;
begin
  select * into it from turf_items where id = new.item_id for update;
  if it.id is null or not it.active then raise exception 'item_niet_actief'; end if;
  new.price_cents := it.price_cents;
  new.settlement_id := null;
  new.created_by := auth.uid();
  new.created_at := now();
  if it.stock is not null then update turf_items set stock = greatest(stock - 1, -999) where id = it.id; end if;
  return new;
end $$;
drop trigger if exists turf_mark_fill on turf_marks;
create trigger turf_mark_fill before insert on turf_marks for each row execute function turf_mark_before();

create or replace function turf_mark_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.settlement_id is null then
    update turf_items set stock = stock + 1 where id = old.item_id and stock is not null;
  end if;
  return old;
end $$;
drop trigger if exists turf_mark_undo on turf_marks;
create trigger turf_mark_undo after delete on turf_marks for each row execute function turf_mark_after_delete();

-- Open strepen afrekenen: p_payer kocht de drank. Iedere andere boom krijgt één uitgave voor zijn eigen
-- strepen (p_payer betaalde, alleen die boom doet mee). Zo staat het exact in DeeldeDuit.
create or replace function turf_afrekenen(p_payer text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; r record; e uuid; total int := 0;
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  perform pg_advisory_xact_lock(hashtext('bosboom_turf'));
  if not exists (select 1 from residents where id = p_payer) then raise exception 'niet_gevonden'; end if;
  if not exists (select 1 from turf_marks where settlement_id is null) then raise exception 'niets_af_te_rekenen'; end if;
  insert into turf_settlements(payer) values (p_payer) returning id into t;
  for r in select resident_id, sum(price_cents)::int as cents from turf_marks where settlement_id is null group by resident_id loop
    total := total + r.cents;
    continue when r.resident_id = p_payer or r.cents = 0;
    insert into expenses(description, amount_cents, kind, payer, spent_on, turf_settlement_id)
      values ('Streeplijst', r.cents, 'betaald', p_payer, current_date, t) returning id into e;
    insert into expense_shares(expense_id, resident_id, shares) values (e, r.resident_id, 1);
  end loop;
  update turf_marks set settlement_id = t where settlement_id is null;
  update turf_settlements set total_cents = total where id = t;
  return t;
end $$;

-- =====================================================================
-- 6. Toegang (Row Level Security)
-- =====================================================================
do $$
declare t text;
begin
  -- open voor ingelogde huisgenoten, net als de rest van de app
  foreach t in array array['dib_items','dib_claims','events','event_rsvp','turf_items'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists bosboom_auth on %I;', t);
    execute format('create policy bosboom_auth on %I for all to authenticated using (true) with check (true);', t);
  end loop;
  -- alleen lezen; schrijven gaat via de functies hierboven
  foreach t in array array['settlements','settlement_transfers','turf_settlements'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists bosboom_read on %I;', t);
    execute format('create policy bosboom_read on %I for select to authenticated using (true);', t);
  end loop;
end $$;

-- logboek: lezen en toevoegen (geen geschiedenis herschrijven)
alter table chore_log enable row level security;
drop policy if exists chore_log_read on chore_log;
create policy chore_log_read on chore_log for select to authenticated using (true);
drop policy if exists chore_log_add on chore_log;
create policy chore_log_add on chore_log for insert to authenticated with check (true);

-- uitgaven: alles mag, zolang ze nog open zijn
alter table expenses enable row level security;
drop policy if exists expenses_read on expenses;
create policy expenses_read on expenses for select to authenticated using (true);
drop policy if exists expenses_add on expenses;
create policy expenses_add on expenses for insert to authenticated with check (settlement_id is null and turf_settlement_id is null);
drop policy if exists expenses_edit on expenses;
create policy expenses_edit on expenses for update to authenticated using (settlement_id is null) with check (settlement_id is null);
drop policy if exists expenses_del on expenses;
create policy expenses_del on expenses for delete to authenticated using (settlement_id is null);

alter table expense_shares enable row level security;
drop policy if exists shares_read on expense_shares;
create policy shares_read on expense_shares for select to authenticated using (true);
drop policy if exists shares_write on expense_shares;
create policy shares_write on expense_shares for all to authenticated
  using (exists (select 1 from expenses e where e.id = expense_id and e.settlement_id is null))
  with check (exists (select 1 from expenses e where e.id = expense_id and e.settlement_id is null));

-- strepen: zetten en weghalen zolang ze open zijn; aanpassen niet (prijs ligt vast)
alter table turf_marks enable row level security;
drop policy if exists marks_read on turf_marks;
create policy marks_read on turf_marks for select to authenticated using (true);
drop policy if exists marks_add on turf_marks;
create policy marks_add on turf_marks for insert to authenticated with check (true);
drop policy if exists marks_del on turf_marks;
create policy marks_del on turf_marks for delete to authenticated using (settlement_id is null);

revoke all on function settle_expenses(), mark_transfer_paid(uuid, boolean), undo_settlement(uuid),
  save_expense(uuid, text, int, text, text, date, jsonb), expense_balances(uuid), turf_afrekenen(text), my_resident() from public, anon;
grant execute on function settle_expenses(), mark_transfer_paid(uuid, boolean), undo_settlement(uuid),
  save_expense(uuid, text, int, text, text, date, jsonb), expense_balances(uuid), turf_afrekenen(text), my_resident() to authenticated;

-- =====================================================================
-- 7. Live bijwerken en startdata
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['chore_log','dib_items','dib_claims','events','event_rsvp','turf_items','turf_marks',
                           'turf_settlements','expenses','expense_shares','settlements','settlement_transfers'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
end $$;

insert into dib_items (name, icon, sort)
  select * from (values ('Wasmachine', '🧺', 0), ('Droger', '🌀', 1)) v(name, icon, sort)
   where not exists (select 1 from dib_items);
insert into turf_items (name, icon, price_cents, sort)
  select * from (values ('Bier', '🍺', 80, 0), ('Fris', '🥤', 60, 1)) v(name, icon, price_cents, sort)
   where not exists (select 1 from turf_items);
