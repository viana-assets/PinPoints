-- =====================================================================
-- Migration 110 – Finance, Stufe D (Teil 1): Personenkonten – Debitoren und Kreditoren (30.10.2026, v184).
--
-- docs/finance.md Abschnitt 16, Entscheidung 3 vom 30.10.2026: ein Debitor je Kunde mit Rechnung (auch je
-- Unterdebitor einer Kundengruppe), die Laufkundschaft (und Rechnungen ohne Kunde) auf einem Sammeldebitor.
--
--   1. `fin_personenkonten`: Debitoren 10000–69999 (Nummer = Kundennummer + DATEV-Debitorbasis wie im Export des
--      Rechnungsbuchs, Migration 59), der Sammeldebitor (Admin › Betrieb › DATEV, Vorgabe 69999) für Laufkundschaft und
--      Rechnungen ohne Kundennummer, Kreditoren 70000–99999 (je Lieferant). Angelegt werden sie von selbst, sobald
--      eine Buchung sie braucht – von Hand gibt es nichts zu pflegen.
--   2. `fin_buchungszeilen.personenkonto`: Die Forderungs- bzw. Verbindlichkeitszeile einer Rechnung, einer
--      Zahlung, eines Skontos oder eines Belegs trägt das Personenkonto (Nebenbuch). Gebucht bleibt auf dem
--      Sammelkonto (1400/1600 bzw. 1200/3300) – Summen, Bilanz, Steuer und alle bisherigen Funktionen bleiben
--      wie sie sind. Ein Trigger setzt das Personenkonto beim Schreiben jeder Zeile; die vorhandenen Zeilen werden
--      hier einmal nachgetragen (nur die neue Spalte, sonst ändert sich keine Buchung).
--   3. `fin_personenkonten_stand(jahr)`: alle Personenkonten mit Name, Kundennummer, Anschrift und Saldo aus den
--      Vorjahren – für Finance › Buchungen › Personen und den DATEV-Export (Konto statt Sammelkonto).
--
-- Kein Personenbezug in der neuen Tabelle außer dem Verweis auf Kunde bzw. Lieferant (Name und Anschrift
-- kommen beim Lesen aus dem Kundenstamm). Kunden mit echter Rechnung lassen sich nicht endgültig löschen
-- (Migration 56); geht ein Kunde doch, bleibt das Personenkonto mit seinen Buchungen ohne Namen stehen.
-- Reihenfolge: nach 109, SQL zuerst, dann v184. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
  if to_regclass('public.fin_abgehakt') is null or to_regclass('public.fin_lieferanten') is null then
    raise exception 'Zuerst Migration 109 (Finance: Splitt, Abhaken) ausführen. Es wurde nichts geändert.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Personenkonten
-- ---------------------------------------------------------------------
create table if not exists public.fin_personenkonten (
  nummer       integer primary key,
  art          text not null,
  customer_id  uuid references public.customers (id) on delete set null,
  lieferant_id uuid references public.fin_lieferanten (id) on delete set null,
  sammel       boolean not null default false,
  erstellt_am  timestamptz not null default now(),
  constraint fin_pk_art check (art in ('debitor', 'kreditor')),
  constraint fin_pk_bereich check ((art = 'debitor' and nummer between 10000 and 69999) or (art = 'kreditor' and nummer between 70000 and 99999)),
  constraint fin_pk_bezug check ((art = 'debitor' and lieferant_id is null) or (art = 'kreditor' and customer_id is null and not sammel))
);
create index if not exists fin_pk_kunde on public.fin_personenkonten (customer_id) where customer_id is not null;
create unique index if not exists fin_pk_lieferant on public.fin_personenkonten (lieferant_id) where lieferant_id is not null;
create unique index if not exists fin_pk_ein_sammel on public.fin_personenkonten (sammel) where sammel;
alter table public.fin_personenkonten enable row level security;
drop policy if exists "Finance-Personenkonten lesen" on public.fin_personenkonten;
create policy "Finance-Personenkonten lesen" on public.fin_personenkonten for select to authenticated using (public.darf('finance.buchen', 'lesen'));
revoke all on public.fin_personenkonten from anon, authenticated;
grant select on public.fin_personenkonten to authenticated;
comment on table public.fin_personenkonten is
  'Migration 110: Debitoren (10000–69999, Kundennummer + DATEV-Basis; Sammeldebitor aus betrieb) und Kreditoren (70000–99999, je Lieferant). Angelegt von fin_debitor()/fin_kreditor(). docs/finance.md Abschnitt 16.';

alter table public.fin_buchungszeilen add column if not exists personenkonto integer references public.fin_personenkonten (nummer);
create index if not exists fin_zeilen_personenkonto on public.fin_buchungszeilen (personenkonto) where personenkonto is not null;
comment on column public.fin_buchungszeilen.personenkonto is
  'Migration 110: Debitor bzw. Kreditor der Forderungs-/Verbindlichkeitszeile (Nebenbuch; gebucht ist auf dem Sammelkonto).';

-- Der Debitor zu einer Rechnung – angelegt, wenn es ihn noch nicht gibt. Dieselbe Regel wie der DATEV-Export des
-- Rechnungsbuchs (`debitorFuer()` in lib/datev.ts, Migration 59), damit die Kanzlei dieselben Nummern sieht:
-- Debitor = Kundennummer + `betrieb.datev_debitor_basis`; ohne Kundennummer der Sammeldebitor
-- `betrieb.datev_sammeldebitor` (Vorgabe 69999). Neu nach Entscheidung 3: Die Laufkundschaft geht ebenfalls auf den
-- Sammeldebitor. Liegt die Nummer außerhalb 10000–69999, ebenfalls der Sammeldebitor.
create or replace function public.fin_debitor(p_kunde uuid, p_kundennummer integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  lauf boolean := false;
  basis integer;
  sammel_nr integer;
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('fin_personenkonten'));
  select coalesce(b.datev_debitor_basis, 0), coalesce(b.datev_sammeldebitor, 69999) into basis, sammel_nr from public.betrieb b limit 1;
  basis := coalesce(basis, 0);
  sammel_nr := coalesce(sammel_nr, 69999);
  if p_kunde is not null then
    select coalesce(c.laufkundschaft, false) into lauf from public.customers c where c.id = p_kunde;
  end if;
  n := case when p_kundennummer is not null and not coalesce(lauf, false) then p_kundennummer + basis end;
  if n is null or n not between 10000 and 69999 or n = sammel_nr then
    select nummer into n from public.fin_personenkonten where sammel;
    if n is null then
      n := case when sammel_nr between 10000 and 69999 then sammel_nr else 69999 end;
      insert into public.fin_personenkonten (nummer, art, sammel) values (n, 'debitor', true) on conflict (nummer) do nothing;
    end if;
    return n;
  end if;
  insert into public.fin_personenkonten (nummer, art, customer_id) values (n, 'debitor', p_kunde) on conflict (nummer) do nothing;
  return n;
end;
$$;

-- Der Kreditor eines Lieferanten (70000 aufwärts). Ohne Lieferant: keiner.
create or replace function public.fin_kreditor(p_lieferant uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_lieferant is null or not exists (select 1 from public.fin_lieferanten where id = p_lieferant) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('fin_personenkonten'));
  select nummer into n from public.fin_personenkonten where lieferant_id = p_lieferant;
  if n is not null then return n; end if;
  select coalesce(max(nummer) + 1, 70000) into n from public.fin_personenkonten where art = 'kreditor';
  if n > 99999 then raise exception 'Die Kreditorennummern (70000–99999) sind aufgebraucht.'; end if;
  insert into public.fin_personenkonten (nummer, art, lieferant_id) values (n, 'kreditor', p_lieferant);
  return n;
end;
$$;

-- Das Personenkonto einer Buchungszeile: nur Forderungs- und Verbindlichkeitszeilen von Buchungen, die aus einer
-- Rechnung, einer Zahlung, einem Skonto oder einem Beleg kommen (die Quelle sagt, welche Rechnung bzw. welcher
-- Beleg). Alles andere (von Hand, Bank ohne Zuordnung, Abschluss, Vortrag): keins.
create or replace function public.fin_personenkonto_fuer(p_buchung uuid, p_konto integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  kat text;
  kunde uuid;
  knr integer;
  lief uuid;
begin
  select bu.quelle, bu.quelle_id, bu.jahr into b from public.fin_buchungen bu where bu.id = p_buchung;
  if b.quelle_id is null or b.quelle not in ('rechnung', 'zahlung', 'skonto', 'beleg') then return null; end if;
  select k.kategorie into kat
    from public.fin_konten k join public.fin_einstellungen e on e.kontenrahmen = k.kontenrahmen and e.wirtschaftsjahr = b.jahr
   where k.nummer = p_konto;
  if kat = 'forderung' then
    -- Die Rechnung selbst oder (Storno) die Stornorechnung – beide tragen denselben Kunden.
    select r.customer_id, r.kundennummer into kunde, knr from public.rechnungen r where r.id = b.quelle_id;
    if not found then return null; end if;
    return public.fin_debitor(kunde, knr);
  elsif kat = 'verbindlichkeit' then
    select bl.lieferant_id into lief from public.fin_belege bl where bl.id = b.quelle_id;
    if not found then return null; end if;
    return public.fin_kreditor(lief);
  end if;
  return null;
end;
$$;

-- Beim Schreiben jeder Buchungszeile. Wirft nie – ein Personenkonto darf keine Buchung verhindern.
create or replace function public.fin_zeile_personenkonto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.personenkonto is null then
    begin
      new.personenkonto := public.fin_personenkonto_fuer(new.buchung_id, new.konto);
    exception when others then
      new.personenkonto := null;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fin_zeile_personenkonto on public.fin_buchungszeilen;
create trigger trg_fin_zeile_personenkonto before insert on public.fin_buchungszeilen
  for each row execute function public.fin_zeile_personenkonto();

-- Die vorhandenen Zeilen einmal nachtragen (nur die neue Spalte).
update public.fin_buchungszeilen z set personenkonto = public.fin_personenkonto_fuer(z.buchung_id, z.konto)
 where z.personenkonto is null
   and exists (select 1 from public.fin_buchungen b where b.id = z.buchung_id and b.quelle in ('rechnung', 'zahlung', 'skonto', 'beleg') and b.quelle_id is not null);

-- ---------------------------------------------------------------------
-- 2. Lesen: Personenkonten mit Name und Saldo aus den Vorjahren
-- ---------------------------------------------------------------------
create or replace function public.fin_personenkonten_stand(p_jahr integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.darf('finance.buchen', 'lesen') then
    raise exception 'Finance › Buchungen ist für deine Rolle nicht freigeschaltet.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'nummer', p.nummer, 'art', p.art, 'sammel', p.sammel,
             'name', case when p.sammel then 'Sammeldebitor Laufkundschaft'
                          when p.art = 'kreditor' then coalesce(l.name, 'Lieferant gelöscht')
                          else coalesce(nullif(btrim(c.company), ''), nullif(btrim(c.name), ''), 'Kunde gelöscht') end,
             'kundennummer', c.kundennummer, 'customer_id', p.customer_id, 'lieferant_id', p.lieferant_id,
             'anschrift', case when p.art = 'debitor' and not p.sammel then nullif(btrim(c.address), '') end,
             'ust_id', l.ust_id,
             'vortrag', coalesce((select sum(case z.seite when 'S' then z.betrag else -z.betrag end)
                                    from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
                                   where z.personenkonto = p.nummer and b.jahr < p_jahr), 0))
             order by p.nummer)
      from public.fin_personenkonten p
      left join public.customers c on c.id = p.customer_id
      left join public.fin_lieferanten l on l.id = p.lieferant_id), '[]'::jsonb);
end;
$$;

revoke all on function public.fin_debitor(uuid, integer) from public, anon, authenticated;
revoke all on function public.fin_kreditor(uuid) from public, anon, authenticated;
revoke all on function public.fin_personenkonto_fuer(uuid, integer) from public, anon, authenticated;
revoke all on function public.fin_zeile_personenkonto() from public, anon, authenticated;
revoke all on function public.fin_personenkonten_stand(integer) from public, anon;
grant execute on function public.fin_personenkonten_stand(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Ergebnis
-- ---------------------------------------------------------------------
select 'Tabelle fin_personenkonten (RLS)' as pruefung,
       coalesce((select case when c.relrowsecurity then 'da, RLS an' else 'da, RLS AUS' end from pg_class c where c.oid = to_regclass('public.fin_personenkonten')), 'fehlt') as ergebnis
union all
select 'Spalte fin_buchungszeilen.personenkonto',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_buchungszeilen' and column_name = 'personenkonto')
            then 'da' else 'fehlt' end
union all
select 'Trigger an fin_buchungszeilen', case when exists (select 1 from pg_trigger where tgname = 'trg_fin_zeile_personenkonto') then 'ja' else 'nein' end
union all
select 'Debitoren / Kreditoren', (select count(*) filter (where art = 'debitor')::text || ' / ' || count(*) filter (where art = 'kreditor')::text from public.fin_personenkonten)
union all
select 'Zeilen mit Personenkonto', (select count(*)::text from public.fin_buchungszeilen where personenkonto is not null)
union all
select 'Forderungs-/Verbindlichkeitszeilen aus Rechnung/Beleg ohne Personenkonto',
       (select count(*)::text from public.fin_buchungszeilen z join public.fin_buchungen b on b.id = z.buchung_id
          join public.fin_einstellungen e on e.wirtschaftsjahr = b.jahr
          join public.fin_konten k on k.kontenrahmen = e.kontenrahmen and k.nummer = z.konto
         where z.personenkonto is null and k.kategorie in ('forderung', 'verbindlichkeit')
           and b.quelle in ('rechnung', 'zahlung', 'skonto', 'beleg') and b.quelle_id is not null);
