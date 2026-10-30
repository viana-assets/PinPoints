-- =====================================================================
-- Migration 113 – Finance, Stufe E (Teil 2): Zahlungsausgang – Bankdaten der Lieferanten, Zahlungsvorschlag,
-- SEPA-Überweisungsdatei (30.10.2026, v186).
--
-- docs/finance.md Abschnitt 18.
--
--   1. Neues Recht „Finance › Zahlungen“ (`finance.zahlungen`, lesen/schreiben) – Zahlungsdateien nur mit eigenem Recht
--      (Gesamtkonzept „Recht, GoBD und Datensicherheit“). Ab Werk für niemanden außer dem Superadmin.
--   2. Lieferanten bekommen IBAN, BIC, Zahlungsziel und Skonto (Prozent und Tage).
--   3. Zahlaufträge (`fin_zahlauftraege` mit `fin_zahlauftrag_posten`): eine Auswahl fälliger Belege, aus der die App die
--      SEPA-Datei (pain.001) erzeugt. Name und IBAN werden als Kopie festgehalten, damit dieselbe Datei später wieder
--      entsteht. Der Zahlauftrag BUCHT NICHTS und überweist nichts: Die Datei lädt man selbst im Online-Banking hoch und gibt
--      sie dort frei; gebucht wird erst, wenn die Abbuchung auf dem Kontoauszug steht (Bank & Kasse, mit Skonto).
--      Ein Beleg steht in höchstens einem nicht verworfenen Zahlauftrag, solange er offen ist.
--
-- Reihenfolge: nach 112, SQL zuerst, dann v186. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_bank_teile') is null or to_regprocedure('public.fin_bank_sammeln(uuid,jsonb,integer,text,text)') is null then
    raise exception 'Zuerst Migration 112 (Finance: Bankregeln und Sammelzuordnung) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Recht
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
values ('finance.zahlungen', '{}'::text[], '{}'::text[], '{}'::text[])
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Bankdaten und Zahlungsbedingungen der Lieferanten
-- ---------------------------------------------------------------------
alter table public.fin_lieferanten
  add column if not exists iban              text,
  add column if not exists bic               text,
  add column if not exists zahlungsziel_tage integer,
  add column if not exists skonto_prozent    numeric(5,2),
  add column if not exists skonto_tage       integer;
alter table public.fin_lieferanten drop constraint if exists fin_lief_iban;
alter table public.fin_lieferanten add constraint fin_lief_iban check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$');
alter table public.fin_lieferanten drop constraint if exists fin_lief_bic;
alter table public.fin_lieferanten add constraint fin_lief_bic check (bic is null or bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$');
alter table public.fin_lieferanten drop constraint if exists fin_lief_ziel;
alter table public.fin_lieferanten add constraint fin_lief_ziel check (zahlungsziel_tage is null or zahlungsziel_tage between 0 and 365);
-- Skonto: beides oder keins; höchstens 10 % wie FIN_SKONTO_HOECHST (lib/finance/rechnungen.ts) und nicht länger als das Ziel.
alter table public.fin_lieferanten drop constraint if exists fin_lief_skonto;
alter table public.fin_lieferanten add constraint fin_lief_skonto check (
  (skonto_prozent is null) = (skonto_tage is null)
  and (skonto_prozent is null or (skonto_prozent > 0 and skonto_prozent <= 10))
  and (skonto_tage is null or (skonto_tage between 1 and 90 and (zahlungsziel_tage is null or skonto_tage <= zahlungsziel_tage))));
grant insert (iban, bic, zahlungsziel_tage, skonto_prozent, skonto_tage) on public.fin_lieferanten to authenticated;
grant update (iban, bic, zahlungsziel_tage, skonto_prozent, skonto_tage) on public.fin_lieferanten to authenticated;

-- ---------------------------------------------------------------------
-- 3. Zahlaufträge
-- ---------------------------------------------------------------------
create table if not exists public.fin_zahlauftraege (
  id              uuid primary key default gen_random_uuid(),
  bankkonto_id    uuid not null references public.fin_bankkonten (id),
  ausfuehrung     date not null,
  msg_id          text not null unique,
  anzahl          integer not null,
  summe           numeric(14,2) not null,
  status          text not null default 'erstellt',
  verworfen_grund text,
  erstellt_am     timestamptz not null default now(),
  erstellt_von    uuid default auth.uid(),
  constraint fin_za_status check (status in ('erstellt', 'verworfen')),
  constraint fin_za_msgid  check (length(msg_id) between 1 and 35),
  constraint fin_za_grund  check ((status = 'verworfen') = (verworfen_grund is not null))
);
create table if not exists public.fin_zahlauftrag_posten (
  id           uuid primary key default gen_random_uuid(),
  auftrag_id   uuid not null references public.fin_zahlauftraege (id) on delete cascade,
  beleg_id     uuid not null references public.fin_belege (id),
  lieferant_id uuid not null references public.fin_lieferanten (id),
  name         text not null,
  iban         text not null,
  bic          text,
  betrag       numeric(14,2) not null,
  skonto       numeric(14,2) not null default 0,
  zweck        text not null,
  e2e          text not null,
  constraint fin_zap_betrag check (betrag > 0 and skonto >= 0),
  constraint fin_zap_zweck  check (length(zweck) between 1 and 140),
  constraint fin_zap_e2e    check (length(e2e) between 1 and 35),
  unique (auftrag_id, beleg_id)
);
create index if not exists fin_zahlauftrag_posten_beleg on public.fin_zahlauftrag_posten (beleg_id);
comment on table public.fin_zahlauftraege is
  'Migration 113: Zahlungsvorschlag als Auftrag, aus dem die App die SEPA-Datei (pain.001) erzeugt. Bucht nichts. Lesen: finance.zahlungen.';
comment on table public.fin_zahlauftrag_posten is 'Migration 113: ein Beleg je Zeile, Name/IBAN als Kopie.';

alter table public.fin_zahlauftraege enable row level security;
alter table public.fin_zahlauftrag_posten enable row level security;
drop policy if exists "Finance-Zahlaufträge lesen" on public.fin_zahlauftraege;
create policy "Finance-Zahlaufträge lesen" on public.fin_zahlauftraege for select to authenticated using (public.darf('finance.zahlungen', 'lesen'));
drop policy if exists "Finance-Zahlauftragsposten lesen" on public.fin_zahlauftrag_posten;
create policy "Finance-Zahlauftragsposten lesen" on public.fin_zahlauftrag_posten for select to authenticated using (public.darf('finance.zahlungen', 'lesen'));
revoke all on public.fin_zahlauftraege from anon, authenticated;
revoke all on public.fin_zahlauftrag_posten from anon, authenticated;
grant select on public.fin_zahlauftraege to authenticated;
grant select on public.fin_zahlauftrag_posten to authenticated;

-- Anlegen: p_posten = [{ "beleg": "<uuid>", "betrag": 116.62, "skonto": 2.38 }]. Rückgabe { id, msg_id, anzahl, summe }.
create or replace function public.fin_zahlauftrag_anlegen(p_bankkonto uuid, p_ausfuehrung date, p_posten jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bk public.fin_bankkonten;
  z jsonb;
  b public.fin_belege;
  l public.fin_lieferanten;
  v_betrag numeric;
  v_skonto numeric;
  v_offen numeric;
  v_id uuid;
  v_msg text;
  v_summe numeric := 0;
  v_anzahl integer := 0;
  v_zweck text;
begin
  if not public.darf('finance.zahlungen', 'schreiben') then
    raise exception 'Zahlungsdateien erstellen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Zahlungen“ schreiben).';
  end if;
  select * into bk from public.fin_bankkonten where id = p_bankkonto;
  if bk.id is null or not bk.aktiv then raise exception 'Das Bankkonto gibt es nicht oder es ist ausgeblendet.'; end if;
  if bk.iban is null then raise exception 'Das Bankkonto hat keine IBAN – unter Bank & Kasse › Konten & Importe eintragen.'; end if;
  if p_ausfuehrung is null or p_ausfuehrung < current_date or p_ausfuehrung > current_date + 90 then
    raise exception 'Das Ausführungsdatum muss zwischen heute und 90 Tagen in der Zukunft liegen.';
  end if;
  if p_posten is null or jsonb_typeof(p_posten) <> 'array' or jsonb_array_length(p_posten) = 0 then
    raise exception 'Mindestens einen Beleg wählen.';
  end if;
  if jsonb_array_length(p_posten) > 200 then raise exception 'Höchstens 200 Überweisungen in einer Datei.'; end if;
  if (select count(distinct x ->> 'beleg') from jsonb_array_elements(p_posten) x) <> jsonb_array_length(p_posten) then
    raise exception 'Jeder Beleg nur einmal.';
  end if;

  -- Eindeutig und kurz: MR + Zeitstempel + Zufall (höchstens 35 Zeichen, nur Buchstaben und Ziffern).
  v_msg := 'MR' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 8));
  insert into public.fin_zahlauftraege (bankkonto_id, ausfuehrung, msg_id, anzahl, summe)
  values (bk.id, p_ausfuehrung, v_msg, 0, 0) returning id into v_id;

  for z in select * from jsonb_array_elements(p_posten) loop
    v_betrag := round(coalesce((z ->> 'betrag')::numeric, 0), 2);
    v_skonto := round(coalesce((z ->> 'skonto')::numeric, 0), 2);
    if v_betrag <= 0 or v_skonto < 0 then raise exception 'Jede Überweisung braucht einen Betrag größer 0.'; end if;
    select * into b from public.fin_belege where id = (z ->> 'beleg')::uuid for update;
    if b.id is null or b.status <> 'gebucht' then raise exception 'Einer der Belege ist nicht gebucht.'; end if;
    if b.bezahlt_am is not null then raise exception 'Beleg %: schon bezahlt.', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer'); end if;
    select * into l from public.fin_lieferanten where id = b.lieferant_id;
    if l.id is null then raise exception 'Beleg %: ohne Lieferant – keine Überweisung möglich.', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer'); end if;
    if l.iban is null then raise exception 'Lieferant %: keine IBAN eingetragen.', l.name; end if;
    v_offen := b.brutto - public.fin_teilbezahlt('beleg', b.id);
    if v_betrag + v_skonto > v_offen then
      raise exception 'Beleg %: offen sind % €, gewählt sind % € (mit Skonto).', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer'), v_offen, v_betrag + v_skonto;
    end if;
    if v_skonto > round(b.brutto * 0.10, 2) then
      raise exception 'Beleg %: mehr als 10 %% ist kein Skonto.', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer');
    end if;
    if exists (select 1 from public.fin_zahlauftrag_posten p join public.fin_zahlauftraege a on a.id = p.auftrag_id
                where p.beleg_id = b.id and a.status = 'erstellt' and a.id <> v_id) then
      raise exception 'Beleg %: steht schon in einem Zahlauftrag – den erst verwerfen.', coalesce(nullif(b.belegnummer, ''), 'ohne Nummer');
    end if;
    v_zweck := left(coalesce('Rechnung ' || nullif(btrim(b.belegnummer), ''), nullif(btrim(b.text), ''), 'Beleg vom ' || to_char(b.belegdatum, 'DD.MM.YYYY'))
                    || case when v_skonto > 0 then ' abzgl. Skonto ' || replace(to_char(v_skonto, 'FM999999990.00'), '.', ',') else '' end, 140);
    insert into public.fin_zahlauftrag_posten (auftrag_id, beleg_id, lieferant_id, name, iban, bic, betrag, skonto, zweck, e2e)
    values (v_id, b.id, l.id, left(l.name, 70), l.iban, l.bic, v_betrag, v_skonto, v_zweck,
            left('B' || replace(b.id::text, '-', ''), 35));
    v_summe := v_summe + v_betrag;
    v_anzahl := v_anzahl + 1;
  end loop;

  update public.fin_zahlauftraege set anzahl = v_anzahl, summe = v_summe where id = v_id;
  return jsonb_build_object('id', v_id, 'msg_id', v_msg, 'anzahl', v_anzahl, 'summe', v_summe);
end;
$$;

-- Verwerfen: die Datei wurde nicht (oder falsch) hochgeladen – die Belege stehen wieder im Vorschlag.
create or replace function public.fin_zahlauftrag_verwerfen(p_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.zahlungen', 'schreiben') then
    raise exception 'Zahlaufträge verwerfen ist für deine Rolle nicht freigeschaltet (Recht „Finance › Zahlungen“ schreiben).';
  end if;
  if coalesce(btrim(p_grund), '') = '' then raise exception 'Bitte einen Grund angeben.'; end if;
  update public.fin_zahlauftraege set status = 'verworfen', verworfen_grund = left(btrim(p_grund), 200)
   where id = p_id and status = 'erstellt';
  if not found then raise exception 'Diesen Zahlauftrag gibt es nicht (mehr) oder er ist schon verworfen.'; end if;
end;
$$;

revoke all on function public.fin_zahlauftrag_anlegen(uuid, date, jsonb) from public, anon;
revoke all on function public.fin_zahlauftrag_verwerfen(uuid, text) from public, anon;
grant execute on function public.fin_zahlauftrag_anlegen(uuid, date, jsonb) to authenticated;
grant execute on function public.fin_zahlauftrag_verwerfen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Ergebnis
-- ---------------------------------------------------------------------
select 'Recht finance.zahlungen' as pruefung,
       case when exists (select 1 from public.module_permissions where module_key = 'finance.zahlungen') then 'angelegt (nur Superadmin)' else 'FEHLT' end as ergebnis
union all
select 'Lieferanten: Bankdaten und Zahlungsbedingungen',
       (select count(*)::text || ' von 5 Spalten' from information_schema.columns where table_schema = 'public' and table_name = 'fin_lieferanten'
          and column_name in ('iban', 'bic', 'zahlungsziel_tage', 'skonto_prozent', 'skonto_tage'))
union all
select 'Tabellen fin_zahlauftraege / fin_zahlauftrag_posten (RLS)',
       (select string_agg(c.relname || case when c.relrowsecurity then ' RLS an' else ' RLS AUS' end, ', ' order by c.relname)
          from pg_class c where c.oid in (to_regclass('public.fin_zahlauftraege'), to_regclass('public.fin_zahlauftrag_posten')))
union all
select 'Funktionen', (select count(*)::text || ' von 2' from unnest(array['fin_zahlauftrag_anlegen(uuid,date,jsonb)', 'fin_zahlauftrag_verwerfen(uuid,text)']) x
         where to_regprocedure('public.' || x) is not null);
