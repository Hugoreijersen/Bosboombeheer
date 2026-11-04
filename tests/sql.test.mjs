import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'fs';
// Test van de SQL op een echte Postgres in Node (PGlite). Draaien:
//   npm i --no-save @electric-sql/pglite && node tests/sql.test.mjs
const R=new URL('../sql/', import.meta.url).pathname;
const db=new PGlite({extensions:{btree_gist}});
await db.exec(`
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create role authenticated; create role anon;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on functions to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
create publication supabase_realtime;
insert into auth.users values ('00000000-0000-0000-0000-000000000001');`);
for(const f of ['01_schema.sql','02_auth_and_policies.sql','03_huispot_features.sql','03_huispot_features.sql']) { await db.exec(fs.readFileSync(R+f,'utf8')); console.log('ran',f); }
await db.exec(`insert into profiles values ('00000000-0000-0000-0000-000000000001','iep');`);
const as=async(sql,params)=>{ await db.exec(`begin; set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
  try{ const r=await db.query(sql,params); await db.exec('commit'); return r.rows; } catch(e){ await db.exec('rollback'); return 'ERR '+e.message; } };
const show=async(l,sql,p)=>console.log(l.padEnd(34),JSON.stringify(await as(sql,p)));
// agenda
await show('kring',`insert into events(title,kind,starts_at,ends_at) values ('Kring van Iep','kring','2026-11-08 19:00+01','2026-11-09 01:00+01') returning host`);
await show('huisavond tijdens kring',`insert into events(title,kind,starts_at,ends_at) values ('x','huisavond','2026-11-08 20:00+01','2026-11-08 22:00+01')`);
await show('huisavond na kring',`insert into events(title,kind,starts_at,ends_at) values ('Na','huisavond','2026-11-09 01:00+01','2026-11-09 03:00+01') returning id`);
await show('2e kring overlap',`insert into events(title,kind,starts_at,ends_at) values ('k2','kring','2026-11-08 23:00+01','2026-11-09 00:30+01')`);
await show('kring tijdens huisavond',`insert into events(title,kind,starts_at,ends_at) values ('k3','kring','2026-11-09 02:00+01','2026-11-09 04:00+01')`);
await show('rsvp op kring',`insert into event_rsvp select id,'berk','ja' from events where kind='kring'`);
await show('rsvp op huisavond',`insert into event_rsvp select id,'berk','ja' from events where title='Na' returning status`);
// dibs
await show('dib 1',`insert into dib_claims(item_id,starts_at,ends_at) select id,'2026-11-08 10:00+01','2026-11-08 12:00+01' from dib_items where name='Wasmachine' returning resident_id`);
await show('dib overlap',`insert into dib_claims(item_id,starts_at,ends_at) select id,'2026-11-08 11:00+01','2026-11-08 13:00+01' from dib_items where name='Wasmachine'`);
await show('dib aansluitend',`insert into dib_claims(item_id,starts_at,ends_at) select id,'2026-11-08 12:00+01','2026-11-08 13:00+01' from dib_items where name='Wasmachine' returning id`);
await show('dib droger zelfde tijd',`insert into dib_claims(item_id,starts_at,ends_at) select id,'2026-11-08 11:00+01','2026-11-08 13:00+01' from dib_items where name='Droger' returning id`);
// deeldeduit
const sh=JSON.stringify([{resident_id:'iep',shares:1},{resident_id:'berk',shares:1},{resident_id:'eik',shares:1}]);
await show('save expense',`select save_expense(null,'AH',1000,'betaald','iep','2026-11-03',$1::jsonb)`,[sh]);
await show('save expense 2',`select save_expense(null,'Pizza',2400,'betaald','eik','2026-11-03',$1::jsonb)`,[JSON.stringify([{resident_id:'eik',shares:2},{resident_id:'iep',shares:1}])]);
await show('balances',`select * from expense_balances()`);
// turf
await db.exec(`update turf_items set stock=5 where name='Bier'`);
await show('streep',`insert into turf_marks(item_id,resident_id,price_cents) select id,'berk',1 from turf_items where name='Bier' returning price_cents`);
await show('streep 2',`insert into turf_marks(item_id,resident_id) select id,'eik' from turf_items where name='Fris' returning price_cents`);
await show('stock',`select name,stock from turf_items order by sort`);
await show('streep update verboden',`update turf_marks set price_cents=0 returning id`);
await show('turf afrekenen',`select turf_afrekenen('iep') is not null as ok`);
await show('balances na turf',`select * from expense_balances()`);
await show('settle',`select settle_expenses() is not null as ok`);
await show('transfers',`select from_id,to_id,amount_cents from settlement_transfers order by amount_cents`);
await show('edit settled (rls)',`update expenses set amount_cents=1 returning id`);
await show('delete settled (rls)',`delete from expenses returning id`);
await show('insert settled transfer',`insert into settlement_transfers(settlement_id,from_id,to_id,amount_cents) select id,'iep','berk',5 from settlements`);
await show('paid',`select mark_transfer_paid(id,true) from settlement_transfers limit 1`);
await show('undo after paid',`select undo_settlement(id) from settlements`);
await show('chore log add',`insert into chore_log(chore_id,task,done_by) values ('wc','WC','eik') returning done_by`);
await show('chore log delete',`delete from chore_log returning id`);
