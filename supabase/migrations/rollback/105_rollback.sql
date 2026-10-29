-- =====================================================================
-- Rücknahme von Migration 105. Zweimal lauffähig. Erst die Dateien von v173 wieder hochladen.
-- ACHTUNG:
--   - Chat-Nachrichten mit einer Karte „Bestellung“ oder „Packliste“ verlieren die Karte (der Text bleibt).
--   - Die Namen an Bestellwünschen und „+1“ sind danach weg (die Kennung des Zugangs bleibt).
--   - Noch vorgemerkte Fotodateien (`private.bestell_fotos_weg`) werden nicht mehr abgeräumt; die Ergebnis-
--     tabelle nennt die Zahl. Dann bleibt die Liste stehen: Dateien im Supabase-Dashboard unter Storage ›
--     bestell-fotos entfernen, die Liste mit `delete from private.bestell_fotos_weg` leeren, Rücknahme erneut.
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.orders') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.profiles / public.orders. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- 6. Chat-Karten
update public.chat_nachrichten
   set bezug_art = null, bezug_id = null, bezug_titel = null, bezug_unter = null
 where bezug_art in ('bestellung', 'packliste');
alter table public.chat_nachrichten drop constraint if exists chat_bezug_packliste;
alter table public.chat_nachrichten drop constraint if exists chat_bezug_bekannt;
alter table public.chat_nachrichten add constraint chat_bezug_bekannt
  check (bezug_art is null or bezug_art in ('auftrag', 'kunde', 'platz', 'verkaufsreifen'));

-- 4. Kunde endgültig löschen / zusammenführen: die alten Funktionen zurück unter ihrem Namen.
do $$
begin
  if to_regprocedure('public.kunde_endgueltig_loeschen_grund(uuid)') is not null then
    drop function if exists public.kunde_endgueltig_loeschen(uuid);
    alter function public.kunde_endgueltig_loeschen_grund(uuid) rename to kunde_endgueltig_loeschen;
  end if;
  if to_regprocedure('public.kunden_zusammenfuehren_grund(uuid,uuid)') is not null then
    drop function if exists public.kunden_zusammenfuehren(uuid, uuid);
    alter function public.kunden_zusammenfuehren_grund(uuid, uuid) rename to kunden_zusammenfuehren;
  end if;
end $$;
comment on function public.kunde_endgueltig_loeschen(uuid) is
  'Fahrplan B2 (Migration 56): löscht einen Kunden aus dem Papierkorb endgültig samt Protokoll. Nur Superadmin. Rechnungen bleiben als Beleg.';
revoke all on function public.kunde_endgueltig_loeschen(uuid) from public, anon;
grant execute on function public.kunde_endgueltig_loeschen(uuid) to authenticated;
comment on function public.kunden_zusammenfuehren(uuid, uuid) is
  'Fahrplan E1 (Migration 64): zieht alles von p_weg zu p_behalten um, füllt leere Felder, legt p_weg leer in den Papierkorb. Nur wer Kunden löschen darf.';
revoke all on function public.kunden_zusammenfuehren(uuid, uuid) from public, anon;
grant execute on function public.kunden_zusammenfuehren(uuid, uuid) to authenticated;

-- 5. Auskunft: Stand von Migration 71.
create or replace function public.kunde_auskunft(p_kunde uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ergebnis jsonb;
begin
  -- Prüft Rolle und Laufkundschaft selbst und bricht sonst ab.
  ergebnis := public.kunde_auskunft_grund(p_kunde);
  return ergebnis
    || jsonb_build_object('belege', coalesce((
         select jsonb_agg(jsonb_build_object('auftrag', o.order_number, 'art', b.art, 'beschriftung', b.beschriftung,
                                             'aufgenommen', b.created_at) order by b.created_at, b.id)
           from public.auftrag_belege b join public.orders o on o.id = b.order_id
          where o.customer_id = p_kunde), '[]'::jsonb))
    -- Migration 71
    || jsonb_build_object('reifen_notizen', coalesce((
         select jsonb_agg(jsonb_build_object('eingelagert', t.created_at, 'platz', s.code, 'position', n.pos, 'notiz', n.txt)
                          order by t.created_at, t.id, n.ord)
           from public.tire_storage t
           left join public.storage_slots s on s.id = t.storage_slot_id
           cross join lateral (values (1, 'VL', t.notiz_vl), (2, 'VR', t.notiz_vr), (3, 'HL', t.notiz_hl), (4, 'HR', t.notiz_hr)) as n(ord, pos, txt)
          where t.customer_id = p_kunde and coalesce(btrim(n.txt), '') <> ''), '[]'::jsonb));
end;
$$;
comment on function public.kunde_auskunft(uuid) is
  'Fahrplan E10 (Migration 64), seit Migration 65 mit den Belegen, seit Migration 71 mit den Notizen je Rad. Nur Admin/Superadmin.';
revoke all on function public.kunde_auskunft(uuid) from public, anon;
grant execute on function public.kunde_auskunft(uuid) to authenticated;

-- 3. Aufräumen
select cron.unschedule('pinpoints-bestell-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-bestell-aufraeumen');
drop function if exists public.bestell_aufraeumen(interval);

-- 2. Fotos vormerken
drop trigger if exists trg_bestellwunsch_nachlauf on public.bestellwuensche;
drop trigger if exists trg_bestell_fotos_vor_leeren on public.bestellwuensche;
drop function if exists public.bestellwunsch_nachlauf();
drop function if exists public.bestell_fotos_vor_leeren();
drop function if exists public.bestell_fotos_weg_liste(integer);
drop function if exists public.bestell_fotos_weg_erledigt(text[]);

-- 1. Namen
drop trigger if exists trg_bestellwunsch_wer on public.bestellwuensche;
drop trigger if exists trg_bestellwunsch_plus_wer on public.bestellwunsch_plus;
drop function if exists public.bestellwunsch_wer();
drop function if exists public.bestellwunsch_plus_wer();
alter table public.bestellwuensche drop constraint if exists bw_erstellt_name;
alter table public.bestellwuensche drop column if exists erstellt_name;
alter table public.bestellwunsch_plus drop column if exists name;
drop function if exists public.zugang_anzeigename(uuid);

-- Die Liste nur entfernen, wenn nichts mehr vorgemerkt ist – sonst bleibt sie als Nachweis, welche Dateien
-- im Dashboard zu löschen sind (Inhalt: `select * from private.bestell_fotos_weg`). Danach erneut ausführen.
do $$
begin
  if to_regclass('private.bestell_fotos_weg') is not null then
    if not exists (select 1 from private.bestell_fotos_weg) then
      drop table private.bestell_fotos_weg;
    end if;
  end if;
end $$;

select 'Funktionen zurück auf Stand 104' as pruefung,
       case when to_regprocedure('public.kunde_endgueltig_loeschen_grund(uuid)') is null
             and to_regprocedure('public.kunden_zusammenfuehren_grund(uuid,uuid)') is null
             and to_regprocedure('public.kunde_endgueltig_loeschen(uuid)') is not null
             and to_regprocedure('public.kunden_zusammenfuehren(uuid,uuid)') is not null then 'ja' else 'nein' end as ergebnis
union all
select 'Aufräumen ausgeplant', case when exists (select 1 from cron.job where jobname = 'pinpoints-bestell-aufraeumen') then 'nein' else 'ja' end
union all
-- Ohne Hilfsfunktion (der SQL-Editor behält zwischen zwei Anweisungen nichts): gezählt über query_to_xml,
-- damit ein zweiter Lauf ohne die Tabelle nicht scheitert.
select 'Noch vorgemerkte Fotodateien (von Hand entfernen)',
       case when to_regclass('private.bestell_fotos_weg') is null then '0'
            else (xpath('/row/c/text()', query_to_xml('select count(*) as c from private.bestell_fotos_weg', false, true, '')))[1]::text end;

