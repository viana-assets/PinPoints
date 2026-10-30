-- =====================================================================
-- Rücknahme Migration 112 – Bankregeln, Sammelzuordnung (v185).
--
-- Bricht ab, solange ein Umsatz als Sammelzuordnung zugeordnet ist – erst unter Bank & Kasse „Zuordnung aufheben“.
-- Stellt `fin_bank_zu_konto()` (ohne Kostenstellen) und `fin_bank_aufheben()` aus Migration 91 wieder her und entfernt
-- Regeln, Sammelzuordnung und Schutz-Trigger. Schon gebuchte Kostenstellen bleiben an ihren Buchungen. Zweimal lauffähig.
-- Danach die App auf v184 zurück.
-- =====================================================================

do $$
begin
  if to_regclass('public.fin_bank_teile') is not null
     and exists (select 1 from public.fin_bankumsaetze where status = 'zugeordnet' and zuordnung = 'mehrere') then
    raise exception 'Es gibt noch Sammelzuordnungen – erst unter Finance › Bank & Kasse „Zuordnung aufheben“. Es wurde nichts geändert.';
  end if;
end $$;

create or replace function public.fin_bank_zu_konto(p_umsatz uuid, p_konto integer, p_steuer text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  neu uuid; n integer;
  betrag numeric;
begin
  h := public.fin_bank_umsatz_holen(p_umsatz);
  if p_konto is null then raise exception 'Das Gegenkonto fehlt.'; end if;
  if p_konto = h.sachkonto then raise exception 'Gegenkonto und Bankkonto sind dasselbe.'; end if;
  betrag := abs((h.u).betrag);
  n := public.fin_naechste_nr((h.e).wirtschaftsjahr);
  insert into public.fin_buchungen (jahr, nr, datum, text, beleg, quelle, quelle_id)
  values ((h.e).wirtschaftsjahr, n, (h.u).datum,
          left(coalesce(nullif(btrim(p_text), ''), coalesce((h.u).name, 'Bank') || coalesce(': ' || (h.u).zweck, '')), 200), null, 'bank', (h.u).id)
  returning id into neu;
  perform public.fin_posten_schreiben(neu, (h.e).kontenrahmen, (h.e).besteuerung, (h.e).r13b_empfaenger, (h.e).innergemeinschaftlich,
    jsonb_build_array(jsonb_build_object(
      'soll', case when (h.u).betrag > 0 then h.sachkonto else p_konto end,
      'haben', case when (h.u).betrag > 0 then p_konto else h.sachkonto end,
      'betrag', betrag, 'steuer', nullif(btrim(coalesce(p_steuer, '')), ''))));
  update public.fin_bankumsaetze set status = 'zugeordnet', zuordnung = 'konto', zuordnung_id = null, buchung_id = neu where id = p_umsatz;
  return jsonb_build_object('id', neu, 'nr', n);
end;
$$;
revoke all on function public.fin_bank_zu_konto(uuid, integer, text, text) from public, anon;
grant execute on function public.fin_bank_zu_konto(uuid, integer, text, text) to authenticated;

create or replace function public.fin_bank_aufheben(p_umsatz uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.fin_bankumsaetze%rowtype;
begin
  if not public.darf('finance.bank', 'schreiben') then
    raise exception 'Zuordnen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Bank“ schreiben).';
  end if;
  select * into u from public.fin_bankumsaetze where id = p_umsatz for update;
  if u.id is null then raise exception 'Diesen Umsatz gibt es nicht.'; end if;
  if u.status = 'ignoriert' then
    update public.fin_bankumsaetze set status = 'offen', notiz = null where id = u.id;
    return;
  end if;
  if u.status <> 'zugeordnet' then raise exception 'Dieser Umsatz ist nicht zugeordnet.'; end if;
  perform public.fin_gegenbuchung(u.buchung_id, p_grund, null, null);
  if u.zuordnung = 'rechnung' then
    update public.fin_rechnungen set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null, aktualisiert_am = now()
     where rechnung_id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  elsif u.zuordnung = 'beleg' then
    update public.fin_belege set bezahlt_am = null, bezahlt_art = null, zahlung_buchung_id = null
     where id = u.zuordnung_id and zahlung_buchung_id = u.buchung_id;
  end if;
  -- Den Umsatz setzt der Trigger unten zurück (die Buchung ist jetzt storniert).
end;
$$;

-- Das Entfernen in EINEM Block mit derselben Prüfung (v186 nachgetragen): Führt der SQL-Editor nach der abgelehnten
-- Prüfung oben weiter aus, bleiben die Teile der Sammelzuordnungen trotzdem stehen.
do $$
begin
  if to_regclass('public.fin_bank_teile') is not null then
    if exists (select 1 from public.fin_bankumsaetze where status = 'zugeordnet' and zuordnung = 'mehrere') then
      raise exception 'Es gibt noch Sammelzuordnungen – erst unter Finance › Bank & Kasse „Zuordnung aufheben“. Bankregeln und Teile bleiben.';
    end if;
  end if;
  drop function if exists public.fin_bank_zu_konto(uuid, integer, text, text, text, text);
  drop trigger if exists fin_bank_teile_schutz on public.fin_buchungen;
  drop function if exists public.fin_bank_teile_schutz();
  drop function if exists public.fin_bank_sammeln(uuid, jsonb, integer, text, text);
  drop function if exists public.fin_kost_an_buchung(uuid, text, text, text);
  drop function if exists public.fin_bankregel_loeschen(uuid);
  drop function if exists public.fin_bankregel_speichern(uuid, text, text, text, text, text, integer, text, text, text, text, boolean);
  drop table if exists public.fin_bank_teile;
  drop table if exists public.fin_bankregeln;
  alter table public.fin_bankumsaetze drop constraint if exists fin_bu_zuordnung;
  alter table public.fin_bankumsaetze add constraint fin_bu_zuordnung check (zuordnung is null or zuordnung in ('rechnung', 'beleg', 'konto'));
end $$;

select 'Tabellen fin_bankregeln / fin_bank_teile' as pruefung,
       case when to_regclass('public.fin_bankregeln') is null and to_regclass('public.fin_bank_teile') is null then 'weg' else 'noch da' end as ergebnis
union all
select 'fin_bank_zu_konto wie Migration 91', case when to_regprocedure('public.fin_bank_zu_konto(uuid,integer,text,text)') is not null then 'ja' else 'nein' end;
