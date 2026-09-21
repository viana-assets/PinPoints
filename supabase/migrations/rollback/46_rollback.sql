-- Rücknahme von Migration 46: zurück auf den Stand von Migration 22.
--
-- Danach gilt wieder: Ein Artikel mit „braucht Lagerplatz" sperrt den Abschluss, solange kein
-- Lagerplatz belegt ist – und ein Auftrag, in dem die Lagergebühr steht (also ein
-- AUSLAGERUNGS-Auftrag), lässt sich damit gar nicht mehr abschließen.
--
-- `abrechnungsart`, `fragt_einlagerung` und `entnahme_order_id` bleiben stehen: Sie stören
-- nicht und werden nur nicht mehr gelesen. Wer die Migration später erneut ausführt, findet
-- seine Einstellungen wieder vor.
--
-- Zuerst den Anwendungscode zurückdrehen.

begin;

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
  if new.status is not distinct from old.status then return new; end if;

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

  if new.status = 'erledigt' then
    select count(*) into offene_einlagerung
      from public.order_articles oa
      join public.articles a on a.id = oa.article_id
     where oa.order_id = new.id and oa.deleted_at is null and a.braucht_lagerplatz
       and not exists (select 1 from public.tire_storage ts where ts.order_id = new.id and ts.removed_at is null);
    if offene_einlagerung > 0 then
      raise exception 'Für diesen Auftrag ist eine Einlagerung vorgesehen, aber kein Lagerplatz belegt. Bitte zuerst einen Lagerplatz zuordnen.';
    end if;
  end if;

  if new.status = 'erledigt' then
    new.completed_at := now(); new.completed_by := wer;
  elsif old.status = 'erledigt' then
    new.completed_at := null; new.completed_by := null;
  end if;

  if new.status = 'storniert' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'Für eine Stornierung wird ein Grund benötigt.';
    end if;
    new.cancelled_at := now(); new.cancelled_by := wer;
  elsif old.status = 'storniert' then
    new.cancelled_at := null; new.cancelled_by := null; new.cancel_reason := null;
  end if;

  return new;
end;
$$;

commit;
