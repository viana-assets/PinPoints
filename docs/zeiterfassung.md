# Zeiterfassung (Stempeluhr)

**Stand: 08.10.2026 (Migration 82, Service Worker v132).** Wunsch Vitali vom 08.10.2026, Entwurf
`entwurf_stempeluhr.html` (Claude outputs) abgenickt. Entschieden per Auswahl: Pause-Knopf, nur
„Zeiten aller“ korrigiert, 2 Jahre Aufbewahrung. Ein Export (Lohn, Steuerberater) ist nicht gebaut –
siehe `fahrplan.md`, E20.

## Was man sieht

- **Stempeluhr** (`components/zeit/StempelKarte.tsx`) ganz oben im Dashboard: „▶ Einstempeln“,
  dann „❚❚ Pause“ / „▶ Weiter“ und „■ Ausstempeln“ (mit Rückfrage – korrigieren kann man es danach
  nicht selbst). Darüber die Arbeitszeit ohne Pausen, sekundengenau, und die Summe der Woche. Ist man
  seit einem früheren Tag eingestempelt, steht dort: Ausstempeln vergessen? Jetzt ausstempeln und im
  Büro Bescheid geben.
- **Die Stoppuhr über der Chat-Blase** (`components/zeit/ZeitBlase.tsx`, v132, Wunsch Vitali): auf
  jeder Seite außer der Zeiterfassung selbst, für jeden mit `zeiterfassung · lesen`. Weiß, solange
  niemand eingestempelt ist; grün mit der Arbeitszeit darüber, solange die Uhr läuft; gelb in der Pause.
  Ein Tipp führt in den Bereich „Zeiterfassung“. Sie steht in derselben Spalte wie die Chat-Blase, eine
  Stufe darüber (auf Seiten mit Karte über Kartenknopf und Chat); ohne Chat-Recht an deren Stelle; bei
  offener Karte am Handy ausgeblendet.
- **Die laufende Anzeige** (`components/zeit/UhrPille.tsx`): am Handy oben rechts auf jeder Seite
  (grün mit der Arbeitszeit, gelb mit der laufenden Pause), am Rechner neben „Zeiterfassung“ in der
  Seitenleiste und im Kopf des Bereichs. Antippen öffnet das Blatt mit der Stempeluhr
  (`StempelBlatt.tsx`) und dem Hinweis zur Mindestpause. Ebene 955 (unter allen Fenstern), das Blatt
  10003.
- **Bereich „Zeiterfassung“** (`components/zeit/ZeitPanel.tsx`, Reiter `zeit`; am Handy unter
  „Weitere“, Gruppe „Team“, oder über die Stoppuhr). Oben in „Tag“ und „Woche“ steht die Stempeluhr
  selbst (seit v132) – ein- und ausstempeln geht also auch hier, nicht nur im Dashboard:
  - *Tag*: die eigenen Schichten eines Tages mit Pausen und Vermerk „korrigiert: Grund“.
  - *Woche*: Summen (Arbeit, Pausen, Tage), Balken Mo–So, Tage mit Hinweisen; ein Tipp öffnet den Tag.
  - *Alle* (nur mit „Zeiten aller · lesen“): Wochentabelle aller Mitarbeiter mit Tages- und
    Wochensummen (am Rechner zusätzlich Pausen), oben rot die offenen Stempelungen. Ein Tipp auf eine
    Zelle öffnet den Tag der Person (`ZeitTagBlatt`); mit „Zeiten aller · schreiben“ dort ändern,
    nachtragen, löschen – immer mit Grund.
- **Hinweise, keine Entscheidungen** (`tagAuswerten()`): „Pause zu kurz“ (mehr als 6 h → 30 Min., mehr
  als 9 h → 45 Min., § 4 ArbZG – gerechnet je Tag, erst nach dem Ausstempeln), „über 10 h“ (§ 3 ArbZG),
  „offen“ (an einem früheren Tag nicht ausgestempelt), „korrigiert“. Eine offene Schicht von einem
  früheren Tag zählt in keiner Summe mit, bis sie korrigiert ist. Nichts wird automatisch gekürzt
  oder beendet.
- **Nur mit Netz.** Stempeln schreibt nicht in den Ausgangskorb: Die Uhrzeit setzt die Datenbank beim
  Eintreffen – eine Stempelung, die erst später ankäme, trüge die falsche Zeit.
- **Uhr des Geräts:** Die Datenbank liefert mit dem Stand ihre Uhrzeit (`zeit_status().jetzt`); die
  laufende Anzeige rechnet den Unterschied heraus (`versatzMs` in `app/_seite/useZeiterfassung.ts`).
- Eine Schicht gehört zu dem Tag, an dem sie begann (auch über Mitternacht). Im Korrekturformular
  heißt ein Ende vor dem Beginn: am Folgetag.

## Rechte

| Zeile | Lesen | Schreiben | Ab Werk |
|---|---|---|---|
| `zeiterfassung` | eigene Zeiten sehen; Stempeluhr, Anzeige und Reiter erscheinen | ein-/ausstempeln, Pause | Admin, Benutzer – **Techniker aus** |
| `zeiterfassung.alle` | Zeiten aller sehen („Alle“) | korrigieren, nachtragen, löschen (mit Grund) | Admin |

Für die Techniker später nur in Admin › Rechte bei „Zeiterfassung“ beide Haken setzen – ohne neue
Fassung. Die eigenen Zeiten kann niemand selbst ändern.

## Datenbank (Migration 82)

- `zeit_schichten` (Beginn, Ende, `korrigiert_am/_von`, `korrektur_grund`); höchstens eine offene je
  Zugang. `zeit_pausen` (höchstens eine offene je Schicht). `zeit_korrekturen` (Vorher, Nachher als
  jsonb, Grund, wer, wann) – bewusst nicht im Änderungsprotokoll, das 36 Monate hielte.
- Lesen per RLS: eigene mit `zeiterfassung · lesen`, alle mit `zeiterfassung.alle · lesen`.
  **Schreiben nur über Funktionen** (`security definer`, Uhrzeit `now()`): `zeit_einstempeln()`,
  `zeit_pause_beginnen()`, `zeit_pause_beenden()`, `zeit_ausstempeln()` (schließt eine laufende Pause
  mit), `zeit_schicht_speichern(id, profil, beginn, ende, pausen, grund)` und
  `zeit_schicht_loeschen(id, grund)`. Diese prüfen: Grund mindestens 3 Zeichen, Ende nach Beginn, nicht
  in der Zukunft, höchstens 24 h, keine Überschneidung mit anderen Schichten der Person, Pausen
  vollständig, innerhalb der Schicht und ohne Überschneidung.
- `zeit_status()` (eigene offene Schicht + Uhrzeit der Datenbank), `zeit_personen()` (wer in „Alle“
  vorkommt: Rollen mit `zeiterfassung · lesen` und jeder mit Schicht; ohne „Zeiten aller“ nur man selbst).
- `zeit_aufraeumen()` nächtlich 03:35 UTC (`pinpoints-zeit-aufraeumen`): Schichten und Korrekturen
  älter als 2 Jahre werden gelöscht.
- „Alle Daten löschen“ (Migration 72) leert die Tabellen mit.

## Code

| Datei | Was |
|---|---|
| `lib/zeiterfassung.ts` | Zählen, Woche, Hinweise, Formular → Zeitpunkte – rein, `tests/zeiterfassung.test.ts` |
| `lib/api/zeiterfassung.ts` | Stand, Schichten der Woche, offene, Personen, Stempeln, Korrigieren |
| `app/_seite/useZeiterfassung.ts` | Stand, Versatz zur Datenbankuhr, Stempeln, Blatt |
| `components/zeit/` | Karte, Anzeige, Blatt, Bereich – `tests/zeitOberflaeche.test.tsx` |

## Datenschutz

Arbeitszeiten sind personenbezogene Daten der Mitarbeiter. Vor dem Start die Mitarbeiter informieren,
wozu die Zeiten erfasst werden und wer sie sieht; die Aufbewahrung (2 Jahre, § 16 Abs. 2 ArbZG) mit
dem Datenschutz bzw. Steuerberater abstimmen. Erfasst werden nur Zeiten – kein Standort, keine Fotos.
Die Hinweise zur Pause und zu 10 Stunden sind Hinweise für Menschen; die App entscheidet nichts über
Personen.
