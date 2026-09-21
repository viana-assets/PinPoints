# Dokumentations-Struktur

Dieser Ordner ist die Detail-Dokumentation des Projekts, ein Baustein pro Datei.
`CLAUDE.md` im Repo-Wurzelverzeichnis bleibt bewusst schlank: Prozessregeln, gelernte
Fallstricke und ein Index hierher. Wer wissen will, **wie ein bestimmter Baustein
funktioniert, wo er im Code liegt und womit er verknüpft ist**, findet das hier.

Stand: 18.09.2026, Migrationen bis 50.

## Die eine Regel, die den Ordner zusammenhält

**Die Dateien in `docs/` beschreiben den Ist-Zustand. Sie sind keine Wunschlisten.**

Was noch offen ist, was verbessert werden soll und in welcher Reihenfolge, steht an
genau einer Stelle: `fahrplan.md`. Das ist die Lehre aus der Durchsicht vom 18.09.2026 –
vorher gab es drei Dokumente mit je eigener Vorstellung davon, was als Nächstes dran ist
(`roadmap.md`, `architektur-review-2026-08.md`, `lager-ausbaukonzept.md`), und alle drei
waren an verschiedenen Stellen überholt. Eine Funktion galt gleichzeitig als „geplant",
„in Arbeit" und „erledigt", je nachdem, welche Datei man aufschlug. Die drei sind deshalb
gelöscht, ebenso `auftragsablauf.md`, `auftraege-termine-einsatzplanung.md` und
`termine-kontakt-auftrag-analyse.md`, deren Inhalt in `auftraege.md` zusammengeführt ist.
Der alte Wortlaut steht im Git-Verlauf.

Zwei Ausnahmen, die bewusst weiterhin Plan und Ist mischen, weil der Plan dort die
eigentliche Aussage ist: `pwa-plan.md` und `benachrichtigungen-plan.md`. Beide kennzeichnen
je Abschnitt, was gebaut ist und was nicht.

## Die Dateien

| Datei | Inhalt |
|---|---|
| `architektur.md` | Tech-Stack, Repo-Struktur, Datenmodell, Datenfluss Supabase → State → UI, Migrationsstand |
| `design-system.md` | Designsystem „Werkstatt Warm", Navigationsstruktur, Druckausgabe, Tabellenregeln |
| `konstanten-register.md` | Register aller festen Wertelisten: wo sie zentral definiert sind und wo sie verwendet werden |
| `berechtigungen-und-rollen.md` | Rollen, Bereiche, die Verben lesen/schreiben/löschen, RLS und der Löschtrigger |
| `kunden-und-karte.md` | Kunden-Modul, Karte, Geokodierung, Kartenstile, Adressprüfung |
| `auftraege.md` | Aufträge, Termine, Einsatzplanung, Kontakthistorie, Auftragslebenszyklus |
| `lager.md` | Lager, Lagerplätze, Reifen-Einlagerung, QR-Aufkleber, Lagergebühr |
| `artikelstammdaten.md` | Artikel und Leistungen, Preis-Historie, Abrechnungsart, freie Position |
| `rechnungen.md` | Rechnungsstellung: Betriebsdaten, Nummernkreis, Snapshot, A4-Druck, Girocode, Storno |
| `pwa-plan.md` | Ausbau zur PWA: welche Stufe gebaut ist, was offen ist, Service-Worker-Regeln |
| `benachrichtigungen-plan.md` | Terminerinnerung als Push: Architektur, Zeitgeber, iOS-Grenzen, offener Gerätetest |
| `prompt-etikettendrucker.md` | Ansteuerung des Etikettendruckers |
| `fahrplan.md` | **Alles Offene**: Fehler, Aufräumarbeiten, Verbesserungen, neue Funktionen – mit Priorität |

Jede Datei nennt die betroffenen Tabellen und Migrationen, die zentralen Funktionen und
Komponenten, und verweist auf verwandte Dateien, statt Inhalte zu duplizieren.

## Die Konstanten-Regel

**Ein fester Wertebereich** (Status-Label, Rollen-Label, Standard-MwSt.-Satz,
Kartenstil-Liste, Berechtigungsschlüssel, Einheiten, Farb-Palette …) **wird genau EINMAL
an einer zentralen Stelle als benannte Konstante definiert und überall sonst per Name
referenziert** – nie als literaler Wert ein zweites Mal hingeschrieben.

Für Daten, die in der Datenbank leben, gilt dasselbe: gibt es ein „Blatt"
Artikelstammdaten, ist `public.articles` (+ `article_prices`) dafür die einzige Wahrheit.
Der Code liest sie über den `articles`-Bestand und den Helfer `currentArticlePrice(...)`,
tippt aber nirgends eine eigene Artikelliste ab.

`konstanten-register.md` listet den aktuellen Stand. **Bei jeder neuen Konstante dort
nachtragen** – das Register ist zwischen dem 11. und dem 18.09.2026 um rund zwanzig
Einträge zurückgefallen, weil genau das unterblieben ist.

## Wie diese Doku gepflegt wird

1. Eine Funktion wird gebaut → die zuständige Baustein-Datei wird **im selben Zug**
   aktualisiert, nicht später.
2. Ein Punkt aus `fahrplan.md` ist erledigt → er wird dort gestrichen, nicht abgehakt
   liegen gelassen.
3. Ein Dokument beschreibt einen Zustand, den es nicht mehr gibt → es wird korrigiert oder
   gelöscht – der alte Wortlaut bleibt im Git-Verlauf erhalten. Nichts danebenstellen.
