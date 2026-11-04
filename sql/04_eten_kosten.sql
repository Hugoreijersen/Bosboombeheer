-- De Bosboom — 04: boodschappen van wie kookte, rechtstreeks in DeeldeDuit.
-- Draai na 03. Een uitgave kan bij een kookdag horen (meal_day); per dag en kok is er hooguit één.

alter table expenses add column if not exists meal_day date;
create unique index if not exists expenses_meal_once on expenses(meal_day, payer) where meal_day is not null;
create index if not exists expenses_meal_day on expenses(meal_day);

-- save_expense krijgt er een (optionele) parameter bij. Eerst de oude weg, anders bestaan er twee.
drop function if exists save_expense(uuid, text, int, text, text, date, jsonb);
create or replace function save_expense(p_id uuid, p_description text, p_amount_cents int, p_kind text,
  p_payer text, p_spent_on date, p_shares jsonb, p_meal_day date default null) returns uuid
language plpgsql set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'geen_toegang'; end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then raise exception 'geen_deelnemers'; end if;
  if p_id is null then
    insert into expenses(description, amount_cents, kind, payer, spent_on, meal_day)
      values (btrim(p_description), p_amount_cents, p_kind, p_payer, coalesce(p_spent_on, current_date), p_meal_day)
      returning id into e;
  else
    update expenses set description = btrim(p_description), amount_cents = p_amount_cents, kind = p_kind,
           payer = p_payer, spent_on = coalesce(p_spent_on, spent_on), meal_day = coalesce(p_meal_day, meal_day)
     where id = p_id and settlement_id is null returning id into e;
    if e is null then raise exception 'al_afgerekend'; end if;
    delete from expense_shares where expense_id = e;
  end if;
  insert into expense_shares(expense_id, resident_id, shares)
    select e, x->>'resident_id', coalesce((x->>'shares')::int, 1) from jsonb_array_elements(p_shares) x;
  return e;
end $$;
revoke all on function save_expense(uuid, text, int, text, text, date, jsonb, date) from public, anon;
grant execute on function save_expense(uuid, text, int, text, text, date, jsonb, date) to authenticated;
