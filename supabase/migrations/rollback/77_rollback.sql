-- Rollback zu Migration 77 (fünf neue Unterrechte).
--
-- Stellt den Stand nach Migration 76 her: Trigger und Funktionen aus 77 weg, die Funktionen
-- aus 74 und den Techniker-Spaltenschutz aus 75 zurück, auf `vehicles` wieder „Bereich kunden
-- schreiben/aendern“ und „Techniker legt Fahrzeug eigener Kunden an“, den Einkaufspreis wieder
-- für alle lesbar. Die fünf Zeilen der Rechtematrix werden entfernt – was dort eingestellt war,
-- geht damit verloren (die App von v124 kennt sie nicht). Zweimal lauffähig.
-- Reihenfolge: zuerst die Dateien von v124 hochladen, dann dieses Skript.

drop trigger if exists trg_position_endpreis_pruefen on public.order_articles;
drop function if exists public.position_endpreis_pruefen();
drop trigger if exists trg_auftrag_storno_pruefen on public.orders;
drop function if exists public.auftrag_storno_pruefen();
drop trigger if exists trg_verkaufsreifen_ek_pruefen on public.verkaufsreifen;
drop function if exists public.verkaufsreifen_ek_pruefen();
drop function if exists public.verkaufsreifen_einkaufspreise();

create or replace function public.restrict_techniker_order_update()
returns trigger
language plpgsql
set search_path = ''
as $f$
declare
  -- Was ein Techniker NICHT anfassen darf. Kurz und stabil gehalten: Es sind genau die
  -- Felder, mit denen man einen Auftrag wegnimmt oder ihm eine andere Identität gibt.
  gesperrt constant text[] := array[
    -- Identität: ein Auftrag, dessen Kunde oder Nummer sich ändert, ist ein anderer Auftrag.
    'id', 'order_number', 'customer_id', 'created_at', 'created_by',
    -- Wegnehmen: Stornieren und Löschen.
    'cancelled_at', 'cancelled_by', 'cancel_reason', 'deleted_at',
    -- Wiedereröffnen ist Admin-Sache (Migration 20); ohne diesen Grund geht es ohnehin nicht.
    'reopen_reason'
  ];
begin
  if coalesce(public.current_user_role(), '') = 'techniker' then
    -- Migration 75: Den Transporter teilt das Büro ein.
    if old.firmenfahrzeug_id is distinct from new.firmenfahrzeug_id then
      raise exception 'Den Transporter teilt das Büro ein.';
    end if;
    -- Verglichen wird nur die gesperrte Teilmenge: Ändert sich dort etwas, ist es abgelehnt.
    -- Alles übrige darf sich ändern, ohne dass es hier aufgezählt werden muss.
    if exists (
      select 1 from unnest(gesperrt) as k
       where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
    ) then
      raise exception 'Techniker dürfen einen Auftrag bearbeiten, aber nicht stornieren, löschen, wiedereröffnen oder einem anderen Kunden zuordnen.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$f$;

create or replace function public.kunde_email_ergaenzen(p_kunde uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  adresse text := lower(btrim(coalesce(p_email, '')));
  bisher text;
begin
  if adresse !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Das ist keine gültige E-Mail-Adresse.';
  end if;
  select c.email into bisher from public.customers c where c.id = p_kunde and c.deleted_at is null;
  if not found then
    raise exception 'Der Kunde wurde nicht gefunden.';
  end if;

  if not public.darf('kunden', 'schreiben') then
    if coalesce(public.current_user_role(), '') <> 'techniker'
       or not public.darf('auftraege.auftrag', 'schreiben')
       or not public.ist_eigener_kunde(p_kunde) then
      raise exception 'Die E-Mail-Adresse dieses Kunden darf hier nicht geändert werden.';
    end if;
    if coalesce(btrim(bisher), '') <> '' then
      raise exception 'Beim Kunden ist schon eine E-Mail-Adresse hinterlegt. Ändern kann sie das Büro im Kundenfenster.';
    end if;
  end if;

  update public.customers set email = adresse where id = p_kunde;
end;
$$;

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

  if not public.darf('kunden', 'schreiben') then
    if coalesce(public.current_user_role(), '') <> 'techniker'
       or not public.darf('auftraege.auftrag', 'schreiben')
       or not public.ist_eigener_kunde(kunde) then
      raise exception 'Die Angaben zu diesem Fahrzeug dürfen hier nicht geändert werden.';
    end if;
  end if;

  update public.vehicles
     set make_model = nullif(btrim(coalesce(p_modell, '')), ''),
         tire_size = nullif(btrim(coalesce(p_reifengroesse, '')), '')
   where id = p_fahrzeug;
end;
$$;

drop policy if exists "Bereich kunden schreiben" on public.vehicles;
create policy "Bereich kunden schreiben" on public.vehicles
  for insert to authenticated with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Bereich kunden aendern" on public.vehicles;
create policy "Bereich kunden aendern" on public.vehicles
  for update to authenticated using (public.darf('kunden', 'schreiben')) with check (public.darf('kunden', 'schreiben'));
drop policy if exists "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles;
create policy "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles
  for insert to authenticated
  with check (
    coalesce(public.current_user_role(), '') = 'techniker'
    and public.darf('auftraege.auftrag', 'schreiben')
    and public.ist_eigener_kunde(customer_id)
  );
drop policy if exists "Bereich fahrzeuge schreiben" on public.vehicles;
drop policy if exists "Bereich fahrzeuge aendern" on public.vehicles;

grant select on public.verkaufsreifen to anon, authenticated;

delete from public.module_permissions
 where module_key in ('auftraege.preis', 'auftraege.storno', 'auftraege.kontakt', 'kunden.fahrzeuge', 'lager.verkauf_ek');

select 'Stand wie nach Migration 76' as pruefung,
       (to_regprocedure('public.auftrag_storno_pruefen()') is null
        and has_column_privilege('authenticated', 'public.verkaufsreifen', 'ek_netto', 'select')
        and not exists (select 1 from public.module_permissions where module_key = 'auftraege.preis'))::text as ergebnis;
