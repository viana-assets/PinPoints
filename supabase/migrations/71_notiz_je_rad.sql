-- =====================================================================
-- Migration 71 – Notiz je Rad am eingelagerten Satz (06.10.2026, v115).
--
-- Anlass (Wunsch 06.10.2026): Beim Einlagern steckte in einem Reifen eine Schraube. Das soll am
-- REIFEN stehen – und ein halbes Jahr später im Lager noch nachzulesen sein. Dazu eine Notiz zum
-- ganzen Satz.
--
-- Die Satznotiz gibt es schon (`tire_storage.note`). Eine Bemerkung je Rad gab es bisher nur an
-- den einzeln gemessenen Rädern (`eingelagerte_raeder.bemerkung`, Migration 33) – also nur bei
-- „je Rad messen“, und beim Zurückschalten auf „ein Wert für den Satz“ ging sie mit den Rädern
-- verloren. Deshalb stehen die Notizen je Rad jetzt am SATZ, unabhängig davon, wie gemessen wird:
--
--   notiz_vl, notiz_vr, notiz_hl, notiz_hr   je höchstens 300 Zeichen, leer = keine Notiz
--
-- Vorhandene Bemerkungen an gemessenen Rädern werden übernommen (wo am Satz noch nichts steht).
-- Die Spalte `eingelagerte_raeder.bemerkung` bleibt stehen – die App schreibt sie nicht mehr.
--
-- Die Auskunft nach DSGVO (`kunde_auskunft()`, Migrationen 64/65) nennt die Notizen je Rad
-- zusätzlich als eigenen Abschnitt `reifen_notizen`.
--
-- Reihenfolge: nach 70, SQL zuerst, dann die Dateien von v115.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Spalten
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists notiz_vl text,
  add column if not exists notiz_vr text,
  add column if not exists notiz_hl text,
  add column if not exists notiz_hr text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tire_storage_notiz_je_rad_laenge') then
    alter table public.tire_storage add constraint tire_storage_notiz_je_rad_laenge
      check (coalesce(char_length(notiz_vl), 0) <= 300 and coalesce(char_length(notiz_vr), 0) <= 300
         and coalesce(char_length(notiz_hl), 0) <= 300 and coalesce(char_length(notiz_hr), 0) <= 300);
  end if;
end $$;

comment on column public.tire_storage.notiz_vl is 'Notiz zum Rad vorne links (Migration 71) – unabhängig von erfassungsart.';
comment on column public.tire_storage.notiz_vr is 'Notiz zum Rad vorne rechts (Migration 71).';
comment on column public.tire_storage.notiz_hl is 'Notiz zum Rad hinten links (Migration 71).';
comment on column public.tire_storage.notiz_hr is 'Notiz zum Rad hinten rechts (Migration 71).';

-- ---------------------------------------------------------------------
-- 2. Vorhandene Bemerkungen an gemessenen Rädern übernehmen
--    (nur wo am Satz noch nichts steht – ein zweiter Lauf ändert nichts)
-- ---------------------------------------------------------------------
update public.tire_storage t set
  notiz_vl = coalesce(nullif(btrim(t.notiz_vl), ''), (select left(btrim(r.bemerkung), 300) from public.eingelagerte_raeder r
              where r.tire_storage_id = t.id and r.position = 'VL' and coalesce(btrim(r.bemerkung), '') <> '' limit 1)),
  notiz_vr = coalesce(nullif(btrim(t.notiz_vr), ''), (select left(btrim(r.bemerkung), 300) from public.eingelagerte_raeder r
              where r.tire_storage_id = t.id and r.position = 'VR' and coalesce(btrim(r.bemerkung), '') <> '' limit 1)),
  notiz_hl = coalesce(nullif(btrim(t.notiz_hl), ''), (select left(btrim(r.bemerkung), 300) from public.eingelagerte_raeder r
              where r.tire_storage_id = t.id and r.position = 'HL' and coalesce(btrim(r.bemerkung), '') <> '' limit 1)),
  notiz_hr = coalesce(nullif(btrim(t.notiz_hr), ''), (select left(btrim(r.bemerkung), 300) from public.eingelagerte_raeder r
              where r.tire_storage_id = t.id and r.position = 'HR' and coalesce(btrim(r.bemerkung), '') <> '' limit 1))
 where exists (select 1 from public.eingelagerte_raeder r
                where r.tire_storage_id = t.id and coalesce(btrim(r.bemerkung), '') <> '')
   and (   (t.notiz_vl is null and exists (select 1 from public.eingelagerte_raeder r where r.tire_storage_id = t.id and r.position = 'VL' and coalesce(btrim(r.bemerkung), '') <> ''))
        or (t.notiz_vr is null and exists (select 1 from public.eingelagerte_raeder r where r.tire_storage_id = t.id and r.position = 'VR' and coalesce(btrim(r.bemerkung), '') <> ''))
        or (t.notiz_hl is null and exists (select 1 from public.eingelagerte_raeder r where r.tire_storage_id = t.id and r.position = 'HL' and coalesce(btrim(r.bemerkung), '') <> ''))
        or (t.notiz_hr is null and exists (select 1 from public.eingelagerte_raeder r where r.tire_storage_id = t.id and r.position = 'HR' and coalesce(btrim(r.bemerkung), '') <> '')));

-- ---------------------------------------------------------------------
-- 3. Auskunft nach DSGVO: die Notizen je Rad dazu
-- ---------------------------------------------------------------------
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

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Spalten notiz_vl … notiz_hr' as pruefung,
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'tire_storage'
            and column_name in ('notiz_vl', 'notiz_vr', 'notiz_hl', 'notiz_hr')) = 4)::text as ergebnis
union all
select 'Sätze mit Notiz je Rad',
       (select count(*)::text from public.tire_storage
         where coalesce(notiz_vl, notiz_vr, notiz_hl, notiz_hr) is not null);
