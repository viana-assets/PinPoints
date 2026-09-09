# Dokumentations-Struktur

Diese `docs/`-Ordner ist die Detail-Dokumentation des Projekts, ein Baustein pro Datei.
`CLAUDE.md` im Repo-Root bleibt bewusst schlank: Prozessregeln (wie Vitali arbeitet, wie
Claude ausliefert) + ein kurzer Index hierher. Wer wissen will, **wie ein bestimmter
Baustein funktioniert, wo er im Code liegt und womit er verknüpft ist**, findet das hier,
nicht in `CLAUDE.md`.

## Warum aufgeteilt statt eine große Datei

`CLAUDE.md` ist mit jeder neuen Funktion gewachsen (Stand vor dieser Aufteilung: ~300
Zeilen, ein einziger fortlaufender Text). Das hat zwei Probleme: Claude muss bei jeder
Session die komplette Historie aller Module lesen, auch wenn nur ein einziges Modul
betroffen ist, und Änderungen an einem Modul vermischen sich im Diff mit alten,
unveränderten Abschnitten. Ein Baustein = eine Datei löst beides: gezielt nachlesen,
gezielt aktualisieren.

## Die Dateien

| Datei | Inhalt |
|---|---|
| `architektur.md` | Tech-Stack, Repo-Struktur, Stateverwaltung/Namenskonventionen in `app/page.tsx`, Datenfluss Supabase → State → UI |
| `design-system.md` | „Werkstatt Warm"-Designsystem, Navigationsstruktur, bekannte offene Design-Punkte |
| `konstanten-register.md` | **Register aller festen Wertelisten** (Rollen, Status, Preise, Kartenstile, Berechtigungsschlüssel …): wo sie als benannte Konstante definiert sind und wo sie verwendet werden – siehe Regel unten |
| `berechtigungen-und-rollen.md` | Rollen (Superadmin/Admin/Techniker/Nutzer), Modul-Berechtigungen/Modulverwaltung |
| `kunden-und-karte.md` | Kunden-Modul, Karte, Geocoding, Kartenstile |
| `auftraege-termine-einsatzplanung.md` | Aufträge/Termine-Modul, Mitarbeiter-Zuordnung, Einsatzplanungs-Kalender |
| `auftragsablauf.md` | **Konzept**: Zustände eines Auftrags, was „abschließen" bedeutet, das Auftragsfenster, Änderungen am Datenmodell |
| `termine-kontakt-auftrag-analyse.md` | **Konzept**: wie Kontakt, Termin und Auftrag zusammenhängen – warum es sich unverknüpft anfühlte, was die beiden Reiter unterscheidet, und wie ein Auftrag entsteht |
| `lager-ausbaukonzept.md` | Vorschläge zum Ausbau von Lager und Bestand (Reifensätze, Handelsware, Transporter als Lagerort, Saisongeschäft) mit Reihenfolge – Ideenstand, nichts gebaut |
| `lager.md` | Lager-Modul (Lager, Lagerplätze, Reifen-Einlagerung), QR-Aufkleber am Regal, Einlagerung am Auftrag mit Scan |
| `artikelstammdaten.md` | Artikelstammdaten/Leistungen, Preis-Historie, Zuordnung zu Aufträgen |
| `benachrichtigungen-plan.md` | Terminerinnerung 5 Minuten vorher als Push an den zugeordneten Techniker: Architektur, Zeitgeber, iOS-Grenzen, Datenschutzfrage (geplant, nichts gebaut) |
| `pwa-plan.md` | Ausbau zur PWA: was gebaut ist (Stufe 1+2), was noch offen ist, und die Fragen davor – inklusive der Regel, `FASSUNG` in `public/sw.js` hochzuzählen |
| `roadmap.md` | Bekannte Lücken + priorisierter Fahrplan Richtung professionelles, skalierbares System |
| `architektur-review-2026-08.md` | Vollständige Durchsicht vom 28.08.2026: Sicherheit (RLS/Rechte), Skalierbarkeit (Datenmengen, Ladeschicht), ERP-Fundament, Konsistenz – mit priorisierter Maßnahmenliste |

Jede dieser Dateien nennt die betroffenen DB-Tabellen/Migrationen, die zentralen
Funktionen/Komponenten in `app/page.tsx` bzw. `lib/`, und verweist auf verwandte Dateien
("siehe auch …"), statt Inhalte zu duplizieren.

## Die Konstanten-Regel (wichtig für jede künftige Änderung)

Vitali hat das explizit so gewünscht, deshalb hier festgehalten als verbindliche Regel:

**Ein fester Wertebereich (Status-Label, Rollen-Label, Standard-MwSt.-Satz, Kartenstil-Liste,
Berechtigungsschlüssel, Farb-Palette, …) wird genau EINMAL an einer zentralen Stelle als
benannte Konstante definiert und überall sonst per Name referenziert – nie als literaler
Wert (`"19"`, `"Offen"`, `"Nürnberg"`, …) ein zweites Mal hingeschrieben.**

Konkret: gibt es z. B. ein "Blatt" `Artikelstammdaten`, dann ist die Datenbanktabelle
`public.articles` (+ `article_prices`) dafür die Single Source of Truth – Code liest sie
über `articles`/`articlePrices`-State und den Helfer `currentArticlePrice(...)`, tippt aber
nirgends eine eigene Artikelliste ab. Genauso für rein clientseitige Wertelisten: eine
Konstante wie `ROLE_LABEL` (in `app/page.tsx`) wird an jeder Stelle referenziert, an der
eine Rolle angezeigt wird – nicht an drei Stellen neu als `{ admin: "Admin", … }`
hingeschrieben.

`konstanten-register.md` listet den aktuellen Stand: was schon sauber zentral ist, und was
noch nicht (das sind die ersten Punkte in `roadmap.md`). Bei jeder neuen Konstante bitte
dort eintragen.
