-- Rücknahme von Migration 49.
--
-- Nimmt die drei Funktionen auf den Stand von Migration 40/48 zurück und entfernt den
-- Trigger auf `rechnungen`. Bereits ausgestellte Rechnungen bleiben unberührt – sie sind
-- Belege, keine Einstellung.
--
-- ACHTUNG: Danach hakt eine neue Rechnung ihren Auftrag nicht mehr ab. Die Arbeitsliste
-- „Rechnung benötigt" zeigt dann wieder Aufträge, für die längst ein Beleg existiert.

begin;

drop trigger if exists trg_rechnung_am_auftrag on public.rechnungen;
drop function if exists public.rechnung_am_auftrag();

-- Nummernvergabe ohne die Briefkopf-Prüfung (Stand Migration 48).
create or replace function public.vergib_rechnungsnummer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  naechste integer;
  praefix  text;
begin
  if new.nummer is not null and new.nummer > 0 then
    return new;
  end if;
  select b.rechnung_naechste_nummer, b.rechnung_praefix
    into naechste, praefix
    from public.betrieb b where b.id for update;
  if naechste is null then naechste := 1; end if;
  if praefix  is null then praefix  := 'RE'; end if;

  new.nummer := naechste;
  new.nummer_text := praefix || naechste::text;
  update public.betrieb set rechnung_naechste_nummer = naechste + 1 where id;
  return new;
end;
$$;

-- Auftragsstempel ohne die Beleg-Sperre (Stand Migration 40).
create or replace function public.stempel_rechnung()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rechnung_erstellt_am is null then
    if old.rechnung_erstellt_am is not null then
      new.rechnung_erstellt_von := null;
      new.rechnung_nummer := null;
    elsif new.rechnung_nummer is not null then
      raise exception 'Eine Rechnungsnummer ohne Rechnung erstellt ist keine Angabe - erst abhaken, dann die Nummer eintragen.';
    else
      new.rechnung_erstellt_von := null;
    end if;
  elsif old.rechnung_erstellt_am is null then
    new.rechnung_erstellt_am  := now();
    new.rechnung_erstellt_von := (select auth.uid());
  else
    new.rechnung_erstellt_am  := old.rechnung_erstellt_am;
    new.rechnung_erstellt_von := old.rechnung_erstellt_von;
  end if;
  return new;
end;
$$;

commit;
