-- Rücknahme von Migration 41: zurück auf die Positivliste von Migration 20.
--
-- Danach darf ein Techniker an einem Auftrag wieder ausschließlich Status und Technikernotiz
-- ändern und an den Leistungen gar nichts. Zuerst den Anwendungscode zurückdrehen – sonst
-- bietet die Oberfläche Felder an, die die Datenbank ablehnt, und jede Eingabe endet in einer
-- Fehlermeldung.
--
-- Was bereits von Technikern geändert wurde, bleibt selbstverständlich stehen; diese Rücknahme
-- betrifft nur, was künftig erlaubt ist.

begin;

drop policy if exists "Techniker verwaltet Artikel eigener Auftraege" on public.order_articles;

create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  aenderbar constant text[] := array[
    'status', 'techniker_notiz', 'updated_at', 'updated_by', 'completed_at', 'completed_by'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    if (to_jsonb(old) - aenderbar) is distinct from (to_jsonb(new) - aenderbar) then
      raise exception 'Techniker dürfen an einem Auftrag nur Status und Techniker-Notiz ändern.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

commit;
