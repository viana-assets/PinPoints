-- =====================================================================
-- Viana PinPoints – 22: Einlagerung am Auftrag, Lagerplatzpflicht, QR-Aufkleber
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 02, 03, 12, 15, 19, 20.
--
-- Konzept und Begründung: docs/lager.md, Abschnitt „Einlagerung am Auftrag".
--
-- Bisher kannte das Lager nur zwei Beteiligte: einen Lagerplatz und einen Kunden. Warum die
-- Reifen dort liegen, stand nirgends. Damit ließ sich weder eine Einlagerung abrechnen noch
-- nachvollziehen, welcher Arbeitsgang sie ausgelöst hat – und der Techniker vor Ort hatte
-- keinen Weg, aus einem Auftrag heraus einen Platz zu belegen.
--
-- Drei Änderungen:
--   1. `tire_storage.order_id` – die Einlagerung weiß, aus welchem Auftrag sie stammt.
--   2. `articles.braucht_lagerplatz` – ein Kennzeichen an der LEISTUNG, nicht am Auftrag.
--      Wer „Reifeneinlagerung" in einen Auftrag legt, muss einen Lagerplatz zuordnen. Dass die
--      Regel am Artikel hängt und nicht an einem festen Namen im Code, ist Absicht: kommt
--      morgen „Felgen einlagern" oder „Dachbox" dazu, wird ein Haken gesetzt statt Code
--      geändert. Ein Vergleich auf den Artikelnamen wäre beim ersten Umbenennen still kaputt.
--   3. Der Statuswechsel-Trigger aus Migration 20 lässt keinen Abschluss mehr zu, solange eine
--      solche Leistung im Auftrag steht und kein Lagerplatz belegt ist.
--
-- Für die QR-Aufkleber braucht die Datenbank NICHTS: der Code auf dem Aufkleber enthält die
-- ohnehin vorhandene `storage_slots.id`. Eine zweite Kennung wäre eine zweite Wahrheit, die
-- man synchron halten müsste. Der Aufkleber ist auch kein Geheimnis – wer den Link öffnet,
-- sieht ohne Anmeldung nichts, dafür sorgt die Row-Level-Security unverändert.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/22_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Auftragsbezug der Einlagerung
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists order_id uuid references public.orders(id) on delete set null;

-- `on delete set null` und nicht `cascade`: verschwindet der Auftrag, sollen die Reifen NICHT
-- aus dem Lager verschwinden. Sie liegen weiterhin im Regal – nur die Herkunft ist dann
-- unbekannt. Seit Migration 19 werden Aufträge ohnehin nur markiert statt gelöscht, das hier
-- ist die Absicherung für den Fall, dass doch einmal hart gelöscht wird.

create index if not exists idx_tire_storage_order_id on public.tire_storage (order_id);

-- ---------------------------------------------------------------------
-- 2. Kennzeichen an der Leistung
-- ---------------------------------------------------------------------
alter table public.articles
  add column if not exists braucht_lagerplatz boolean not null default false;

comment on column public.articles.braucht_lagerplatz is
  'Leistung, bei der etwas ins Lager geht: Auftrag ist erst abschließbar, wenn ein Lagerplatz belegt ist.';

-- Bequemlichkeit für den Start: eine bereits vorhandene Leistung, die erkennbar eine
-- Einlagerung ist, bekommt den Haken gleich mit. Bewusst nur als Starthilfe – ab hier wird der
-- Haken in den Artikelstammdaten gepflegt, die Datenbank rät nicht weiter mit.
update public.articles
   set braucht_lagerplatz = true
 where braucht_lagerplatz = false
   and (short_name ilike '%einlager%' or long_name ilike '%einlager%');

-- ---------------------------------------------------------------------
-- 3. Kein Abschluss ohne Lagerplatz
-- ---------------------------------------------------------------------
-- Ersetzt die Funktion aus Migration 20 vollständig (die Datei dort bleibt unangetastet).
-- Neu ist allein der Block „Einlagerung"; alles andere ist unverändert übernommen, damit hier
-- die ganze Regel an einer Stelle lesbar bleibt statt über zwei Dateien verteilt.
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  wer uuid := (select auth.uid());
  rolle text := coalesce(public.current_user_role(), '');
  offene_einlagerung int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status, new.status) in (
       ('offen', 'in_arbeit'), ('offen', 'erledigt'), ('offen', 'storniert'),
       ('in_arbeit', 'offen'), ('in_arbeit', 'erledigt'), ('in_arbeit', 'storniert')
     ) then
    null;
  elsif old.status in ('erledigt', 'storniert') and new.status in ('offen', 'in_arbeit') then
    if rolle not in ('admin', 'superadmin') then
      raise exception 'Nur Admin oder Superadmin dürfen einen abgeschlossenen oder stornierten Auftrag wiedereröffnen.';
    end if;
    if coalesce(btrim(new.reopen_reason), '') = '' then
      raise exception 'Zum Wiedereröffnen wird eine Begründung benötigt.';
    end if;
  else
    raise exception 'Dieser Statuswechsel ist nicht vorgesehen (% → %).', old.status, new.status;
  end if;

  -- Einlagerung (Migration 22): steht eine Leistung mit `braucht_lagerplatz` im Auftrag, muss
  -- vor dem Abschluss ein Lagerplatz belegt sein. Nur beim Abschluss geprüft, nicht beim
  -- Stornieren – ein stornierter Auftrag wurde ja gerade NICHT ausgeführt.
  if new.status = 'erledigt' then
    select count(*) into offene_einlagerung
      from public.order_articles oa
      join public.articles a on a.id = oa.article_id
     where oa.order_id = new.id
       and oa.deleted_at is null
       and a.braucht_lagerplatz
       and not exists (
         select 1 from public.tire_storage ts
          where ts.order_id = new.id
            and ts.removed_at is null
       );
    if offene_einlagerung > 0 then
      raise exception 'Für diesen Auftrag ist eine Einlagerung vorgesehen, aber kein Lagerplatz belegt. Bitte zuerst einen Lagerplatz zuordnen.';
    end if;
  end if;

  if new.status = 'erledigt' then
    new.completed_at := now();
    new.completed_by := wer;
  elsif old.status = 'erledigt' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'storniert' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Für eine Stornierung wird ein Grund benötigt.';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := wer;
  elsif old.status = 'storniert' then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;

  return new;
end;
$$;

-- Der Trigger selbst aus Migration 20 bleibt bestehen und zeigt jetzt auf die neue Fassung.

-- ---------------------------------------------------------------------
-- 4. Techniker dürfen die Einlagerung setzen
-- ---------------------------------------------------------------------
-- Der Spaltenschutz aus Migration 15/18 betrifft `orders`, nicht `tire_storage`. Für die
-- Einlagerung gilt weiterhin die Rechteregel aus Migration 16 (`action.lager.reifen_zuordnen`).
-- Hier wird nur sichergestellt, dass die Zeile auch dann geschrieben werden darf, wenn sie
-- einen Auftragsbezug trägt – die Spalte ist Teil derselben Zeile und braucht keine eigene
-- Regel. Dieser Abschnitt steht bewusst als Hinweis da, damit niemand später danach sucht.
