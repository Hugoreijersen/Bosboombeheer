-- De Bosboom — Mandarijn (bij Berk): of die thuis is, zodat iedereen het ziet (ook het kiosk-scherm).
-- Veilig om vaker te draaien.
alter table residents add column if not exists partner_home boolean not null default false;
