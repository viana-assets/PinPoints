-- Rücknahme von 30_einlagerung_fahrzeug_und_saison.sql.
--
-- ZUERST den Anwendungscode zurückdrehen: Die Oberfläche schreibt `vehicle_id` und `saison`
-- mit, und sie liest `vehicles.stored_tire_storage_id` nicht mehr.
--
-- Was verloren geht: die Zuordnung Satz → Fahrzeug und die Saison. Der alte Rückweg am
-- Fahrzeug wird zwar wiederhergestellt, aber leer – er lässt sich aus `vehicle_id` befüllen,
-- solange die Spalte noch existiert. Deshalb steht die Übernahme hier VOR dem Löschen.

alter table public.vehicles add column if not exists stored_tire_storage_id uuid references public.tire_storage(id) on delete set null;

update public.vehicles v
   set stored_tire_storage_id = ts.id
  from public.tire_storage ts
 where ts.vehicle_id = v.id
   and ts.removed_at is null;

drop trigger if exists trg_einlagerung_vollstaendig on public.orders;
drop function if exists public.einlagerung_vollstaendig();

drop trigger if exists trg_tire_storage_fahrzeug_passt on public.tire_storage;
drop function if exists public.tire_storage_fahrzeug_passt();

alter table public.tire_storage drop constraint if exists tire_storage_saison_gueltig;
drop index if exists public.idx_tire_storage_saison;
drop index if exists public.idx_tire_storage_vehicle;

alter table public.tire_storage drop column if exists saison;
alter table public.tire_storage drop column if exists vehicle_id;
