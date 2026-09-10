-- Rücknahme von 29_push_versand_je_termin.sql.
--
-- Vorher den Anwendungscode zurückdrehen: `app/api/push/senden` schreibt die Spalte `termin`
-- mit, und ohne sie schlägt jeder Versand fehl.
--
-- Achtung: Der alte Schlüssel (Auftrag, Person) verträgt keine zwei Zeilen zu verschiedenen
-- Terminzeitpunkten desselben Auftrags. Gibt es solche – und die gibt es, sobald ein Termin
-- einmal verschoben wurde –, scheitert das Anlegen. Deshalb bleiben nur die jeweils jüngsten.

delete from public.push_versand v
 where exists (
   select 1 from public.push_versand j
    where j.order_id = v.order_id
      and j.profile_id = v.profile_id
      and j.gesendet_am > v.gesendet_am
 );

alter table public.push_versand drop constraint if exists push_versand_einmalig;
alter table public.push_versand
  add constraint push_versand_einmalig unique (order_id, profile_id);
alter table public.push_versand drop column if exists termin;
