-- =====================================================================
-- Migration 77 – Fünf neue Unterrechte in der Rechtematrix (08.10.2026, v125).
--
-- Schritt 2 der Überarbeitung vom 08.10.2026 (Vitali: „ja“). Bisher hingen diese Handlungen an
-- einem breiteren Haken oder an einer festen Regel für den Techniker; jetzt hat jede ihren eigenen:
--
--   auftraege.preis      schreiben   Endpreis einer Leistung überschreiben (Sonderpreis)
--                                    – bisher: „Leistungen schreiben“
--   auftraege.storno     schreiben   Aufträge stornieren
--                                    – bisher: „Aufträge schreiben“, für den Techniker fest gesperrt
--   auftraege.kontakt    schreiben   eine fehlende E-Mail des Kunden am Auftrag ergänzen
--                                    – bisher: „Kunden schreiben“, für den Techniker fest erlaubt (74)
--   kunden.fahrzeuge     schreiben   Fahrzeuge anlegen und ändern (Kennzeichen, Modell, Reifengröße)
--                                    – bisher: „Kunden schreiben“, für den Techniker fest erlaubt (73/74)
--   lager.verkauf_ek     lesen,      Einkaufspreise im Reifenverkauf sehen bzw. eintragen
--                        schreiben   – bisher: wer Verkaufsreifen sieht, sah auch den Einkauf
--
-- **Niemand verliert oder gewinnt durch diese Migration ein Recht** – mit einer Ausnahme, die
-- der Zweck ist: Die neuen Zeilen in `module_permissions` werden aus dem übernommen, was in der
-- Datenbank bisher galt (die Zeile, an der die Handlung hing). Nur der Einkaufspreis folgt jetzt
-- „Reifenverkauf schreiben“ statt „Reifenverkauf lesen“ – wer Verkaufsreifen nur sieht (in der
-- Vorgabe der Techniker), sieht den Einkauf nicht mehr.
--
-- Durchgesetzt wird jeweils in der Datenbank:
--   - Endpreis: BEFORE-Trigger auf `order_articles` (`position_endpreis_pruefen()`).
--   - Storno: BEFORE-Trigger auf `orders` (`auftrag_storno_pruefen()`); dazu gibt
--     `restrict_techniker_order_update()` Stornieren und Löschen frei – darüber entscheiden jetzt
--     „Aufträge stornieren“ und „Aufträge löschen“ (Löschen prüft weiter `pruefe_loeschrecht()`).
--   - Kontakt und Fahrzeuge: die Funktionen aus Migration 74 neu; auf `vehicles` ersetzen
--     „Bereich fahrzeuge schreiben/aendern“ die Richtlinien „Bereich kunden schreiben/aendern“ und
--     „Techniker legt Fahrzeug eigener Kunden an“ (73). Der Techniker bleibt auf Kunden seiner
--     Aufträge beschränkt. Löschen bleibt bei „Kunden löschen“.
--   - Einkaufspreis: Spaltenrecht. `ek_netto` ist für angemeldete Nutzer nicht mehr lesbar; die
--     App holt ihn über `verkaufsreifen_einkaufspreise()`, die das Recht prüft. Eintragen prüft ein
--     BEFORE-Trigger (`verkaufsreifen_ek_pruefen()`). **Folge für spätere Migrationen:** Eine neue
--     Spalte an `verkaufsreifen` braucht ein eigenes `grant select (spalte)`, sonst sieht sie
--     niemand (CLAUDE.md, Abschnitt 2).
--
-- Ohne angemeldeten Nutzer (Migrationen, Server mit Service-Schlüssel) greifen die neuen Prüfungen
-- nicht – dort gibt es keine Rolle, nach der man fragen könnte.
--
-- Reihenfolge: nach 76, SQL zuerst, dann die Dateien von v125.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Die neuen Zeilen der Rechtematrix – übernommen aus dem, was bisher galt.
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select 'auftraege.preis', '{}'::text[],
       coalesce((select edit_roles from public.module_permissions where module_key = 'auftraege.leistungen'), array['admin', 'techniker', 'user']),
       '{}'::text[]
on conflict (module_key) do nothing;

insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select 'auftraege.storno', '{}'::text[],
       array_remove(coalesce((select edit_roles from public.module_permissions where module_key = 'auftraege.auftrag'), array['admin', 'user']), 'techniker'),
       '{}'::text[]
on conflict (module_key) do nothing;

insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select 'auftraege.kontakt', '{}'::text[],
       coalesce((select edit_roles from public.module_permissions where module_key = 'auftraege.auftrag'), array['admin', 'techniker', 'user']),
       '{}'::text[]
on conflict (module_key) do nothing;

insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select 'kunden.fahrzeuge', '{}'::text[],
       (select array(select distinct unnest(coalesce((select edit_roles from public.module_permissions where module_key = 'kunden'), array['admin', 'user'])
                                            || array['techniker']) order by 1)),
       '{}'::text[]
on conflict (module_key) do nothing;

insert into public.module_permissions (module_key, read_roles, edit_roles, delete_roles)
select 'lager.verkauf_ek',
       coalesce((select edit_roles from public.module_permissions where module_key = 'lager.verkauf'), array['admin', 'user']),
       coalesce((select edit_roles from public.module_permissions where module_key = 'lager.verkauf'), array['admin', 'user']),
       '{}'::text[]
on conflict (module_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Endpreis überschreiben
-- ---------------------------------------------------------------------
create or replace function public.position_endpreis_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if (tg_op = 'INSERT' and new.endpreis_netto is not null)
     or (tg_op = 'UPDATE' and new.endpreis_netto is distinct from old.endpreis_netto) then
    if not public.darf('auftraege.preis', 'schreiben') then
      raise exception 'Den Endpreis einer Leistung zu ändern ist für diese Rolle nicht freigegeben (Admin › Rechte › Aufträge › Endpreis überschreiben).';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_position_endpreis_pruefen on public.order_articles;
create trigger trg_position_endpreis_pruefen
  before insert or update of endpreis_netto on public.order_articles
  for each row execute procedure public.position_endpreis_pruefen();

-- ---------------------------------------------------------------------
-- 3. Stornieren; der Techniker-Spaltenschutz gibt Stornieren und Löschen frei
-- ---------------------------------------------------------------------
create or replace function public.auftrag_storno_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if new.status = 'storniert' and old.status is distinct from 'storniert'
     and not public.darf('auftraege.storno', 'schreiben') then
    raise exception 'Stornieren ist für diese Rolle nicht freigegeben (Admin › Rechte › Aufträge › Aufträge stornieren).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_auftrag_storno_pruefen on public.orders;
create trigger trg_auftrag_storno_pruefen
  before update of status on public.orders
  for each row execute procedure public.auftrag_storno_pruefen();

-- Wie Migration 75, ohne `cancelled_*`/`cancel_reason`/`deleted_at` in der Sperrliste: Ob der
-- Techniker stornieren oder löschen darf, steht jetzt in der Rechtematrix.
create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    -- Wiedereröffnen ist Admin-Sache (Migration 20); ohne diesen Grund geht es ohnehin nicht.
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    -- Migration 75: Den Transporter teilt das Büro ein.
    if old.firmenfahrzeug_id is distinct from new.firmenfahrzeug_id then
      raise exception 'Den Transporter teilt das Büro ein.';
    end if;
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$f$;

-- ---------------------------------------------------------------------
-- 4. Kontaktdaten am Auftrag (E-Mail) – Migration 74 neu
-- ---------------------------------------------------------------------
create or replace function public.kunde_email_ergaenzen(p_kunde uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  adresse text := lower(btrim(coalesce(p_email, '')));
  bisher text;
  techniker boolean := coalesce(public.current_user_role(), '') = 'techniker';
begin
  if adresse !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Das ist keine gültige E-Mail-Adresse.';
  end if;
  select c.email into bisher from public.customers c where c.id = p_kunde and c.deleted_at is null;
  if not found then
    raise exception 'Der Kunde wurde nicht gefunden.';
  end if;

  if not public.darf('kunden', 'schreiben') then
    if not public.darf('auftraege.kontakt', 'schreiben')
       or (techniker and not public.ist_eigener_kunde(p_kunde))
       or (not techniker and not public.darf('kunden', 'lesen') and not public.ist_eigener_kunde(p_kunde)) then
      raise exception 'Die E-Mail-Adresse dieses Kunden darf hier nicht geändert werden.';
    end if;
    if coalesce(btrim(bisher), '') <> '' then
      raise exception 'Beim Kunden ist schon eine E-Mail-Adresse hinterlegt. Ändern kann sie, wer Kunden bearbeiten darf.';
    end if;
  end if;

  update public.customers set email = adresse where id = p_kunde;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Fahrzeuge anlegen und ändern
-- ---------------------------------------------------------------------
create or replace function public.fahrzeug_angaben_ergaenzen(p_fahrzeug uuid, p_modell text, p_reifengroesse text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kunde uuid;
begin
  select v.customer_id into kunde from public.vehicles v where v.id = p_fahrzeug;
  if not found then
    raise exception 'Das Fahrzeug wurde nicht gefunden.';
  end if;
  if char_length(coalesce(p_modell, '')) > 100 or char_length(coalesce(p_reifengroesse, '')) > 60 then
    raise exception 'Modell oder Reifengröße ist zu lang.';
  end if;
  if not public.darf('kunden.fahrzeuge', 'schreiben')
     or (coalesce(public.current_user_role(), '') = 'techniker' and not public.ist_eigener_kunde(kunde)) then
    raise exception 'Die Angaben zu diesem Fahrzeug dürfen hier nicht geändert werden (Admin › Rechte › Kunden › Fahrzeuge anlegen und ändern).';
  end if;

  update public.vehicles
     set make_model = nullif(btrim(coalesce(p_modell, '')), ''),
         tire_size = nullif(btrim(coalesce(p_reifengroesse, '')), '')
   where id = p_fahrzeug;
end;
$$;

drop policy if exists "Bereich fahrzeuge schreiben" on public.vehicles;
create policy "Bereich fahrzeuge schreiben" on public.vehicles
  for insert to authenticated
  with check (public.darf('kunden.fahrzeuge', 'schreiben')
              and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(customer_id)));
drop policy if exists "Bereich fahrzeuge aendern" on public.vehicles;
create policy "Bereich fahrzeuge aendern" on public.vehicles
  for update to authenticated
  using (public.darf('kunden.fahrzeuge', 'schreiben')
         and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(customer_id)))
  with check (public.darf('kunden.fahrzeuge', 'schreiben')
              and (coalesce(public.current_user_role(), '') <> 'techniker' or public.ist_eigener_kunde(customer_id)));
-- Erst wenn die neuen stehen, die alten weg (eine Lücke dazwischen hieße: niemand legt an).
drop policy if exists "Bereich kunden schreiben" on public.vehicles;
drop policy if exists "Bereich kunden aendern" on public.vehicles;
drop policy if exists "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles;

-- ---------------------------------------------------------------------
-- 6. Einkaufspreise im Reifenverkauf
-- ---------------------------------------------------------------------
create or replace function public.verkaufsreifen_einkaufspreise()
returns table (id uuid, ek_netto numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.ek_netto from public.verkaufsreifen v
   where v.ek_netto is not null
     and public.darf('lager.verkauf_ek', 'lesen') and public.darf('lager.verkauf', 'lesen')
$$;
revoke all on function public.verkaufsreifen_einkaufspreise() from public, anon;
grant execute on function public.verkaufsreifen_einkaufspreise() to authenticated;

create or replace function public.verkaufsreifen_ek_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if ((tg_op = 'INSERT' and new.ek_netto is not null)
      or (tg_op = 'UPDATE' and new.ek_netto is distinct from old.ek_netto))
     and not public.darf('lager.verkauf_ek', 'schreiben') then
    raise exception 'Den Einkaufspreis einzutragen ist für diese Rolle nicht freigegeben (Admin › Rechte › Lager › Einkaufspreise).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_verkaufsreifen_ek_pruefen on public.verkaufsreifen;
create trigger trg_verkaufsreifen_ek_pruefen
  before insert or update of ek_netto on public.verkaufsreifen
  for each row execute procedure public.verkaufsreifen_ek_pruefen();

-- Lesen: alle Spalten außer `ek_netto`. Eine Anweisung, die Spaltenliste aus dem Katalog – so
-- trifft sie jede Spalte, die es heute gibt.
do $$
declare
  spalten text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position) into spalten
    from information_schema.columns
   where table_schema = 'public' and table_name = 'verkaufsreifen' and column_name <> 'ek_netto';
  execute 'revoke select on public.verkaufsreifen from anon, authenticated';
  execute format('grant select (%s) on public.verkaufsreifen to authenticated', spalten);
end $$;

-- Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
select 'Neue Zeilen in der Rechtematrix' as pruefung,
       (select count(*) from public.module_permissions
         where module_key in ('auftraege.preis', 'auftraege.storno', 'auftraege.kontakt', 'kunden.fahrzeuge', 'lager.verkauf_ek'))::text || ' von 5' as ergebnis
union all
select 'Fahrzeug-Richtlinien neu',
       (select string_agg(policyname, ', ' order by policyname) from pg_policies
         where schemaname = 'public' and tablename = 'vehicles' and cmd in ('INSERT', 'UPDATE'))
union all
select 'Einkaufspreis für Angemeldete lesbar (sollte false sein)',
       has_column_privilege('authenticated', 'public.verkaufsreifen', 'ek_netto', 'select')::text
union all
select 'Übrige Spalten lesbar (sollte true sein)',
       has_column_privilege('authenticated', 'public.verkaufsreifen', 'preis_netto', 'select')::text;
