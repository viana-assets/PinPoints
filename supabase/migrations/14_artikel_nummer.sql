-- =====================================================================
-- Viana PinPoints – 14: Artikelnummer für die Artikel-Übersicht
-- Noch auszuführen. Braucht `public.articles` (12).
--
-- Die Artikel-Übersicht (vorher "Artikelstamm" im Admin-Bereich, ab jetzt eigene Kachel
-- "Artikel" – siehe docs/roadmap.md Phase 4) bekommt eine eigene, für Menschen lesbare
-- Artikelnummer als erste Spalte, VOR der Kurzbezeichnung. Die Nummer wird automatisch
-- fortlaufend vergeben (nicht händisch eingebbar), damit sie garantiert eindeutig bleibt.
-- =====================================================================

create sequence if not exists public.article_number_seq;

alter table public.articles add column if not exists article_number int;

-- Bestehende Artikel (Start-Artikelstamm aus Migration 12) bekommen eine Nummer nach
-- Anlage-Reihenfolge (created_at), damit nichts doppelt vergeben wird.
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from public.articles
  where article_number is null
)
update public.articles a set article_number = numbered.rn
from numbered where a.id = numbered.id;

-- Sequenz auf den höchsten bereits vergebenen Wert setzen, damit neu angelegte Artikel
-- nahtlos weiterzählen statt wieder bei 1 anzufangen.
select setval('public.article_number_seq', coalesce((select max(article_number) from public.articles), 0));

alter table public.articles alter column article_number set default nextval('public.article_number_seq');
alter table public.articles alter column article_number set not null;
alter table public.articles add constraint articles_article_number_unique unique (article_number);
