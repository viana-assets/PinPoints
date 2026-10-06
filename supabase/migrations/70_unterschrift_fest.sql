-- =====================================================================
-- Migration 70 – Die Unterschrift eines abgeschlossenen Auftrags steht fest (06.10.2026, v114).
--
-- Anlass (Rückfrage 06.10.2026): Am erledigten Auftrag stand weiter „Neu unterschreiben lassen“.
-- Überschrieben wurde dabei nichts – jede Unterschrift ist eine eigene Zeile, es gilt die jüngste
-- (Migration 65). Aber der Satz auf dem Bild lautet „Arbeiten … ausgeführt, Fahrzeug übernommen“;
-- eine zweite Unterschrift Tage nach dem Abschluss wäre ein schwächerer Beleg als die erste.
--
-- Jetzt gilt für die Art „unterschrift“ (`auftrag_unterschrift_pruefen()`):
--   - Auftrag erledigt und schon unterschrieben: keine weitere Unterschrift, kein Löschen.
--   - Auftrag erledigt, aber noch NICHT unterschrieben: Nachholen geht (der Kunde war nicht da).
--   - Auftrag storniert: keine Unterschrift.
--   - Wiedereröffnen hebt die Sperre auf – dann ist der Auftrag wieder offen.
-- Fotos (vorher, nachher, Schaden) sind nicht betroffen: Sie werden oft erst später aus der
-- Mediathek nachgereicht.
--
-- Löschen beim endgültigen Löschen eines Kunden (Papierkorb, DSGVO) bleibt möglich: Dort sind die
-- Aufträge schon weg, wenn ihre Belege mitgelöscht werden – die Prüfung findet keinen Auftrag mehr.
--
-- Reihenfolge: nach 69, SQL zuerst, dann die Dateien von v114.
-- =====================================================================
begin;

create or replace function public.auftrag_unterschrift_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz  public.auftrag_belege;
  stand text;
  nr    bigint;
begin
  satz := case when tg_op = 'DELETE' then old else new end;
  if satz.art is distinct from 'unterschrift' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select o.status, o.order_number into stand, nr
    from public.orders o where o.id = satz.order_id;
  -- Kein Auftrag mehr (er wird gerade samt Belegen gelöscht): nichts zu prüfen.
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if stand = 'storniert' then
      raise exception 'Auftrag % ist storniert – er wird nicht mehr unterschrieben.', nr;
    end if;
    if stand = 'erledigt' and exists (
         select 1 from public.auftrag_belege b
          where b.order_id = satz.order_id and b.art = 'unterschrift') then
      raise exception 'Auftrag % ist abgeschlossen und schon unterschrieben. Die Unterschrift steht fest – für eine neue den Auftrag erst wiedereröffnen.', nr;
    end if;
    return new;
  end if;

  -- DELETE
  if stand = 'erledigt' then
    raise exception 'Auftrag % ist abgeschlossen – seine Unterschrift lässt sich nicht löschen. Wenn nötig, den Auftrag erst wiedereröffnen.', nr;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_auftrag_unterschrift_pruefen on public.auftrag_belege;
create trigger trg_auftrag_unterschrift_pruefen
  before insert or delete on public.auftrag_belege
  for each row execute procedure public.auftrag_unterschrift_pruefen();

comment on function public.auftrag_unterschrift_pruefen() is
  'Migration 70: Am erledigten Auftrag keine zweite Unterschrift und kein Löschen der Unterschrift; am stornierten keine Unterschrift. Fotos sind frei.';

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Prüffunktion' as pruefung,
       (to_regprocedure('public.auftrag_unterschrift_pruefen()') is not null)::text as ergebnis
union all
select 'Trigger an auftrag_belege',
       (exists (select 1 from pg_trigger where tgname = 'trg_auftrag_unterschrift_pruefen' and not tgisinternal))::text;
