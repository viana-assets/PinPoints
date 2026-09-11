-- =====================================================================
-- Viana PinPoints – 33: Die vier Räder einzeln (A1)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 02 (tire_storage), 18 (stamp_row/audit_row),
-- 30 (Fahrzeug und Saison am Satz).
--
-- Konzept: docs/lager-ausbaukonzept.md, A1 in der überarbeiteten Fassung.
--
-- DER KERN: Es sind ZWEI verschiedene Aussagen, nicht eine ungenaue und eine genaue.
--
--   Sammelmessung: „Der Satz hat etwa 4 mm."      Eine Zahl, zehn Sekunden.
--   Einzelmessung: „VL 5,2 · VR 5,0 · HL 3,1 …"   Vier Zahlen, eine Minute – und die
--                                                  Grundlage für ein Verkaufsgespräch.
--
-- Beides wird gespeichert, aber NIE gleichzeitig. `erfassungsart` sagt, welche Aussage gilt.
-- Bei `sammel` steht der Wert am Satz und es gibt keine Radzeilen; bei `einzeln` gelten die
-- Radzeilen, und der Satzwert bleibt leer – die Anzeige rechnet ihn aus (das Minimum, denn das
-- schwächste Rad entscheidet). Zwei Zahlen nebeneinander, die dasselbe behaupten, werden sonst
-- irgendwann verschieden, und niemand weiß dann, welche stimmt. Die Datenbank hält das
-- auseinander, nicht die Oberfläche.
--
-- NICHT IMMER VIER RÄDER: `anzahl_raeder` (Standard 4, erlaubt 1–8). Der Fall „zwei
-- weggeworfen, zwei eingelagert" ist real und soll kein Sonderfall im Kopf des Technikers
-- bleiben. Bei Einzelerfassung ist die Position freiwillig – bei einem losen Ersatzrad weiß
-- man sie oft nicht.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Zwei neue Spalten am Satz
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists erfassungsart text not null default 'sammel',
  add column if not exists anzahl_raeder smallint not null default 4;

do $$
begin
  alter table public.tire_storage
    add constraint tire_storage_erfassungsart_gueltig
    check (erfassungsart in ('sammel', 'einzeln'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.tire_storage
    add constraint tire_storage_anzahl_raeder_gueltig
    check (anzahl_raeder between 1 and 8);
exception when duplicate_object then null;
end $$;

-- Bei Einzelerfassung MUSS der Sammelwert leer sein. Das ist die eine Regel, die verhindert,
-- dass zwei Wahrheiten nebeneinander stehen.
do $$
begin
  alter table public.tire_storage
    add constraint tire_storage_kein_doppelter_profilwert
    check (erfassungsart = 'sammel' or profiltiefe_mm is null);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. Die Räder
-- ---------------------------------------------------------------------
create table if not exists public.eingelagerte_raeder (
  id              uuid primary key default gen_random_uuid(),
  tire_storage_id uuid not null references public.tire_storage(id) on delete cascade,
  -- VL/VR/HL/HR – oder null für ein Rad, dessen Platz am Auto niemand mehr weiß.
  position        text,
  reifengroesse   text,
  dot_date        text,
  profiltiefe_mm  numeric(4,1),
  -- stahl / alu / keine (nur Reifen ohne Felge eingelagert)
  felge           text,
  -- Luftdrucksensor verbaut? Beim Wechsel der entscheidende Unterschied im Aufwand.
  sensor          boolean not null default false,
  bemerkung       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

do $$
begin
  alter table public.eingelagerte_raeder
    add constraint eingelagerte_raeder_position_gueltig
    check (position is null or position in ('VL', 'VR', 'HL', 'HR'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.eingelagerte_raeder
    add constraint eingelagerte_raeder_felge_gueltig
    check (felge is null or felge in ('stahl', 'alu', 'keine'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.eingelagerte_raeder
    add constraint eingelagerte_raeder_profil_plausibel
    check (profiltiefe_mm is null or (profiltiefe_mm >= 0 and profiltiefe_mm <= 25));
exception when duplicate_object then null;
end $$;

create index if not exists idx_eingelagerte_raeder_satz on public.eingelagerte_raeder (tire_storage_id);

-- Eine Position gibt es je Satz nur einmal – zwei Räder „vorne links" sind ein Tippfehler,
-- kein Sonderfall. Räder ohne Position bleiben davon unberührt (partieller Index).
create unique index if not exists eingelagerte_raeder_position_eindeutig
  on public.eingelagerte_raeder (tire_storage_id, position)
  where position is not null;

alter table public.eingelagerte_raeder enable row level security;

-- Wie bei der Einlagerung selbst: Wer eingeloggt ist, darf sie verwalten – das ist der
-- Techniker vor Ort, und genau der misst die Räder.
create policy "Eingeloggte Nutzer verwalten eingelagerte Räder" on public.eingelagerte_raeder
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop trigger if exists trg_stamp_row on public.eingelagerte_raeder;
create trigger trg_stamp_row before insert or update on public.eingelagerte_raeder
  for each row execute procedure public.stamp_row();

drop trigger if exists trg_audit_row on public.eingelagerte_raeder;
create trigger trg_audit_row after insert or update or delete on public.eingelagerte_raeder
  for each row execute procedure public.audit_row();

-- ---------------------------------------------------------------------
-- 3. Radzeilen nur bei Einzelerfassung – und nie mehr als Räder da sind
-- ---------------------------------------------------------------------
-- Eine Prüfregel kann nicht in eine andere Tabelle sehen, deshalb ein Trigger. Er sitzt
-- bewusst auf den Rädern und nicht am Satz: Hier entsteht der Widerspruch.
create or replace function public.rad_passt_zum_satz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  art     text;
  grenze  smallint;
  vorhanden int;
begin
  select erfassungsart, anzahl_raeder into art, grenze
    from public.tire_storage where id = new.tire_storage_id;

  if art is null then
    raise exception 'Zu diesem Rad gibt es keine Einlagerung.';
  end if;
  if art <> 'einzeln' then
    raise exception 'Dieser Satz ist auf Sammelmessung eingestellt. Erst auf Einzelerfassung umstellen, dann die Räder eintragen.';
  end if;

  select count(*) into vorhanden
    from public.eingelagerte_raeder
   where tire_storage_id = new.tire_storage_id
     and (tg_op = 'INSERT' or id <> new.id);

  if vorhanden + 1 > grenze then
    raise exception 'Für diesen Satz sind % Räder vorgesehen. Zuerst die Anzahl erhöhen.', grenze;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rad_passt_zum_satz on public.eingelagerte_raeder;
create trigger trg_rad_passt_zum_satz
  before insert or update of tire_storage_id on public.eingelagerte_raeder
  for each row execute function public.rad_passt_zum_satz();

-- Umgekehrt: Zurück auf Sammelmessung geht erst, wenn keine Radzeilen mehr da sind. Sie
-- stillschweigend zu löschen wäre die schlechtere Lösung – eine Minute Messarbeit ist weg,
-- und niemand hat es gesehen.
create or replace function public.satz_erfassungsart_wechsel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anzahl int;
begin
  if new.erfassungsart = 'sammel' and old.erfassungsart = 'einzeln' then
    select count(*) into anzahl from public.eingelagerte_raeder where tire_storage_id = new.id;
    if anzahl > 0 then
      raise exception 'Dieser Satz hat % einzeln erfasste Räder. Bitte zuerst die Radzeilen entfernen.', anzahl;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_satz_erfassungsart_wechsel on public.tire_storage;
create trigger trg_satz_erfassungsart_wechsel
  before update of erfassungsart on public.tire_storage
  for each row execute function public.satz_erfassungsart_wechsel();

comment on table public.eingelagerte_raeder is
  'Die einzelnen Räder eines eingelagerten Satzes (nur bei tire_storage.erfassungsart = einzeln). Siehe docs/lager.md.';
