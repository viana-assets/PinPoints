-- Migration 50 – Die freie Position
--
-- Braucht Migration 14 (`articles`) und 48 (`articles.einheit`).
--
-- Der Fall aus dem Betrieb: Der Techniker hilft vor Ort bei etwas, das in keinem Artikel
-- steht, und vereinbart einen Preis. Dafür gab es den Artikel „Sonstiges" ohne Preis – nur
-- stand auf der Rechnung dann eben „Sonstiges", und der Kunde wusste nicht, wofür er zahlt.
--
-- Das Feld für den Text gibt es längst: `order_articles.note`, seit Migration 20, und die
-- Rechnung druckt es seit Migration 48 als Zusatzzeile unter der Bezeichnung. Was fehlte, war
-- ZWEIERLEI:
--
--   1. ein Eingabefeld (das ist Programmarbeit, keine Migration), und
--   2. die Unterscheidung, ob der Text die Bezeichnung ERGÄNZT oder ERSETZT.
--
-- Punkt 2 steht hier. Bei „Reifenmontage" ist „Radlager Reifen VR" eine Ergänzung; bei
-- „Sonstiges" wäre „Sonstiges / Hilfe beim Aufbocken" eine Zumutung – dort gehört nur der
-- eingegebene Text hin.
--
-- Bewusst ein HAKEN AM ARTIKEL und keine Erkennung am Namen: „wenn der Artikel Sonstiges
-- heißt" wäre ein Artikelname als Programmlogik und beim ersten Umbenennen falsch. Dieselbe
-- Überlegung wie bei `abrechnungsart` in Migration 46 – ein Artikel trägt selbst, was er
-- bedeutet.

begin;

do $$
begin
  if to_regclass('public.articles') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.articles. Diese Migration gehoert zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geaendert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Der Haken
-- ---------------------------------------------------------------------
alter table public.articles
  add column if not exists freitext boolean not null default false;

comment on column public.articles.freitext is
  'Die Bezeichnung dieser Leistung wird am Auftrag eingegeben (order_articles.note) und ersetzt auf der Rechnung den Artikelnamen. Fuer "Sonstiges" und aehnliche Sammelpositionen.';

-- ---------------------------------------------------------------------
-- Vorbelegung: nichts.
--
-- Die Migration setzt den Haken bei KEINEM Artikel – auch nicht bei einem, der „Sonstiges"
-- heisst. Was hier geraten wuerde, waere falsch geraten: Ein Betrieb kann seine Sammelposition
-- „Diverses", „Zusatzleistung" oder „Nach Aufwand" nennen, und ein anderer hat einen echten
-- Artikel, der zufaellig so heisst.
--
-- Dieselbe Entscheidung wie bei `fragt_einlagerung` in Migration 46 – und dieselbe Bitte:
-- den Haken einmal im Artikelstamm setzen, sonst bleibt „Sonstiges" auf der Rechnung stehen.
--
-- Die Abfrage unten nennt die Kandidaten, damit man weiss, wo man nachsehen muss.
-- ---------------------------------------------------------------------
-- Die Abfrage unter `commit;` zeigt den ganzen Artikelstamm mit Einheit und Haken – dort
-- sieht man auf einen Blick, wo etwas zu setzen ist.
--
-- Als ERGEBNISTABELLE und nicht als Hinweismeldung: Der Supabase-SQL-Editor zeigt `raise
-- notice` überhaupt nicht an. Am 18.09.2026 hat genau das eine halbe Stunde gekostet – ein
-- Skript meldete „3 Beanstandungen" und verschwieg, welche.

commit;

-- ---------------------------------------------------------------------
-- Der Artikelstamm nach dem Lauf. Die Spalte `sieht_aus_wie` ist ein VORSCHLAG, keine
-- Einstellung – gesetzt wird der Haken im Artikelstamm der Anwendung.
-- ---------------------------------------------------------------------
select
  a.article_number                         as nr,
  a.short_name                             as artikel,
  a.einheit,
  case when a.freitext then 'ja' else '-' end as freitext_haken,
  case
    when lower(coalesce(a.short_name, '') || ' ' || coalesce(a.long_name, ''))
         ~ '(sonstig|diverse|zusatzleistung|nach aufwand|pauschal)'
      then '<-- sieht nach einer Sammelposition aus'
    else ''
  end                                      as hinweis
from public.articles a
order by a.article_number;
