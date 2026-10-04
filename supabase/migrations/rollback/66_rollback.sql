-- Rollback zu Migration 66 (Rechnung anderswo erstellt).
--
-- Stellt `stempel_rechnung()` aus Migration 49 und `pruefe_auftrag_loeschen()` aus Migration 62
-- wieder her und entfernt die Sperre gegen eine zweite Rechnung und die Spalte `rechnung_extern`.
-- Ein Auftrag, der als anderswo abgerechnet vermerkt war, behält seinen Haken und seine Nummer –
-- nur die Herkunft geht verloren (die Oberfläche von v108 kennt sie nicht).
-- Reihenfolge: zuerst die Dateien von v108 hochladen (die von v109 lesen die Spalte), dann dieses Skript.
begin;

drop trigger if exists trg_pruefe_rechnung_nicht_anderswo on public.rechnungen;
drop function if exists public.pruefe_rechnung_nicht_anderswo();

create or replace function public.stempel_rechnung()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  beleg text;
begin
  if new.rechnung_erstellt_am is null then
    if old.rechnung_erstellt_am is not null then
      select r.nummer_text into beleg
        from public.rechnungen r
       where r.order_id = old.id
         and r.art = 'rechnung'
         and r.storniert_durch is null
       limit 1;
      if beleg is not null then
        raise exception 'Zu diesem Auftrag gibt es die Rechnung %. Der Haken lässt sich nicht zurücknehmen - eine Rechnung wird storniert, nicht abgehakt.', beleg;
      end if;
      -- Zurückgenommen: die Nummer fällt mit weg.
      new.rechnung_erstellt_von := null;
      new.rechnung_nummer := null;
    elsif new.rechnung_nummer is not null then
      -- Eine Nummer ohne Haken einfach stillschweigend wegzuwerfen wäre schlimmer als ein
      -- Fehler: Der Nutzer hat sie eingetippt, sieht sie verschwinden und weiß nicht, warum.
      raise exception 'Eine Rechnungsnummer ohne Rechnung erstellt ist keine Angabe - erst abhaken, dann die Nummer eintragen.';
    else
      new.rechnung_erstellt_von := null;
    end if;
  elsif old.rechnung_erstellt_am is null then
    new.rechnung_erstellt_am  := now();
    new.rechnung_erstellt_von := (select auth.uid());
  else
    -- Schon abgehakt und bleibt es: Datum und Person sind unantastbar, nur die Nummer darf
    -- noch nachgetragen oder berichtigt werden.
    new.rechnung_erstellt_am  := old.rechnung_erstellt_am;
    new.rechnung_erstellt_von := old.rechnung_erstellt_von;
  end if;
  return new;
end;
$$;

create or replace function public.pruefe_auftrag_loeschen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nummer text;
  auftrag public.orders;
begin
  -- Weitergabe aus einem anderen Trigger (Kunde in den Papierkorb, Fremdschlüssel beim
  -- endgültigen Löschen): nicht hier entscheiden, siehe Kopf.
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    -- Nur der Schritt „wird gelöscht" interessiert, nicht jede Änderung.
    if not (old.deleted_at is null and new.deleted_at is not null) then
      return new;
    end if;
    auftrag := new;
  else
    auftrag := old;
  end if;

  select r.nummer_text into nummer
    from public.rechnungen r
   where r.order_id = auftrag.id
   order by r.nummer desc
   limit 1;
  -- Beim Soft-Delete zählt auch eine Rechnungsnummer aus dem ERP (Migration 40). Beim
  -- endgültigen Löschen nur echte Rechnungszeilen: Das Testkunden-Löschen (Migration 60) räumt
  -- seine Rechnungen vorher selbst ab, die Nummer am Auftrag bleibt dabei stehen.
  if nummer is null and tg_op = 'UPDATE' then
    nummer := auftrag.rechnung_nummer;
  end if;

  if nummer is not null then
    raise exception 'Dieser Auftrag ist abgerechnet (Rechnung %) und wird nicht gelöscht – über ihn findet man die Rechnung.', nummer;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

alter table public.orders drop column if exists rechnung_extern;

commit;

select 'Spalte rechnung_extern entfernt' as pruefung,
       (not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'orders' and column_name = 'rechnung_extern'))::text as ergebnis
union all
select 'Sperre gegen zweite Rechnung entfernt',
       (not exists (select 1 from pg_trigger where tgname = 'trg_pruefe_rechnung_nicht_anderswo'))::text;
