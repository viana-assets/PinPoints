-- =====================================================================
-- Migration 74 – Der Techniker ergänzt am Auftrag die E-Mail des Kunden und Modell/Reifengröße
-- des Fahrzeugs (07.10.2026, v119).
--
-- Befund aus der Durchsicht 07.10.2026 (alles, was der Techniker im Auftrag tut, als Techniker
-- gegen die Datenbank gespielt):
--   - Fehlt beim Kunden die E-Mail-Adresse und ist „Rechnung nötig“ gesetzt, lässt sich der
--     Auftrag nicht abschließen (`pruefe_rechnungsdaten()`, Migration 44/53). Eintragen konnte der
--     Techniker sie nicht – das verlangt „Kunden schreiben“, und die Datenbank lehnte still ab.
--   - Modell und Reifengröße am Fahrzeug konnte er ebenfalls nicht ergänzen, obwohl er sie am Auto
--     abliest. Die Reifengröße braucht der Reifenverkauf für den Vorschlag.
--
-- Entschieden 07.10.2026 (Vitali): beides beheben. Umgesetzt als zwei Funktionen statt als
-- weitere Richtlinien – eine Richtlinie gäbe die ganze Zeile frei (Name, Anschrift, Kennzeichen,
-- Kunde), eine Funktion genau die Felder, um die es geht:
--
--   kunde_email_ergaenzen(kunde, email)
--       wer Kunden schreiben darf: setzt die Adresse;
--       der Techniker: nur bei Kunden seiner Aufträge, nur mit „Aufträge schreiben“ und nur, wenn
--       noch KEINE Adresse hinterlegt ist – eine falsche korrigiert das Büro.
--   fahrzeug_angaben_ergaenzen(fahrzeug, modell, reifengroesse)
--       wer Kunden schreiben darf, oder der Techniker bei Fahrzeugen von Kunden seiner Aufträge
--       (mit „Aufträge schreiben“); ändert nur Marke/Modell und Reifengröße.
--
-- Beides läuft durch die gewohnten Trigger (Protokoll, Stempel) – im Protokoll steht, wer es war.
--
-- Reihenfolge: nach 73, SQL zuerst, dann die Dateien von v119.
-- =====================================================================
begin;

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

comment on function public.kunde_email_ergaenzen(uuid, text) is
  'Migration 74: E-Mail des Kunden setzen. Kunden schreiben – immer; Techniker – nur eigene Kunden und nur, solange keine Adresse hinterlegt ist.';
comment on function public.fahrzeug_angaben_ergaenzen(uuid, text, text) is
  'Migration 74: Marke/Modell und Reifengröße eines Fahrzeugs. Kunden schreiben – immer; Techniker – nur Fahrzeuge eigener Kunden.';

revoke all on function public.kunde_email_ergaenzen(uuid, text) from public, anon;
revoke all on function public.fahrzeug_angaben_ergaenzen(uuid, text, text) from public, anon;
grant execute on function public.kunde_email_ergaenzen(uuid, text) to authenticated;
grant execute on function public.fahrzeug_angaben_ergaenzen(uuid, text, text) to authenticated;

commit;

-- Kontrolle – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen.
select 'Funktion kunde_email_ergaenzen' as pruefung,
       (to_regprocedure('public.kunde_email_ergaenzen(uuid,text)') is not null)::text as ergebnis
union all
select 'Funktion fahrzeug_angaben_ergaenzen',
       (to_regprocedure('public.fahrzeug_angaben_ergaenzen(uuid,text,text)') is not null)::text;
