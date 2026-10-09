# Zeiterfassung (Stempeluhr)

**Stand: 09.10.2026 (Migration 85, Service Worker v138).** Wunsch Vitali vom 08.10.2026, Entwurf
`entwurf_stempeluhr.html` (Claude outputs) abgenickt. Entschieden per Auswahl: Pause-Knopf, nur
„Zeiten aller“ korrigiert, 2 Jahre Aufbewahrung. Seit v136 (Fahrplan E20, Auswahl Vitali): Monat,
Urlaub als Eintrag, Korrekturen sichtbar, Export als CSV und Arbeitszeitnachweis zum Drucken. Seit
v138 (Migration 85, Wunsch Vitali 09.10.2026): „Für heute fertig?“ nach dem letzten Auftrag mit 30 Minuten
Heimfahrt und die Stempel-Erinnerung per Push – Abschnitt „Feierabend, Heimfahrt, Erinnerung“.

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
  selbst (seit v132) – ein- und ausstempeln geht also auch hier, nicht nur im Dashboard. Am
  Rechner steht sie seit v133 links, Tag bzw. Woche rechts daneben:
  - *Tag*: die eigenen Schichten eines Tages mit Pausen und Vermerk „korrigiert: Grund“.
  - *Woche*: Summen (Arbeit, Pausen, Tage), Balken Mo–So, Tage mit Hinweisen; ein Tipp öffnet den Tag.
  - *Alle* (nur mit „Zeiten aller · lesen“): Wochentabelle aller Mitarbeiter mit Tages- und
    Wochensummen (am Rechner zusätzlich Pausen), oben rot die offenen Stempelungen. Ein Tipp auf eine
    Zelle öffnet den Tag der Person (`ZeitTagBlatt`); mit „Zeiten aller · schreiben“ dort ändern,
    nachtragen, löschen – immer mit Grund.
- **Monat** (v136): Summen (Arbeit, Pausen, Urlaub, Arbeitstage), die Tage mit Eintrag, „CSV (Excel)“
  und „Nachweis drucken / PDF“. In *Alle* schaltet „Woche | Monat“ um; der Monat zeigt je Person Tage,
  Arbeit, Pausen, Urlaub, Summe und die Zahl der Tage mit Hinweis; ein Tipp öffnet den Monat der Person
  (Blatt) mit eigenem Export, ein Tipp auf einen Tag dort den Tag. Oben „CSV“ und „Nachweise drucken“
  für alle auf einmal und – mit „Zeiten aller · schreiben“ – „Urlaub eintragen“.
- **Urlaub** (Migration 83, v136): eintragen und entfernen nur mit „Zeiten aller · schreiben“, immer
  mit Grund (`UrlaubBlatt`, aus *Alle › Monat*, dem Monat der Person oder dem Tag einer Person).
  Eingetragen werden die Werktage Mo–Fr im Zeitraum; ganzer Tag 8 h, halber 4 h oder eigene Stunden.
  Feiertage kennt die App nicht – liegt einer im Zeitraum, nimmt man ihn danach mit „Entfernen“ heraus.
  Urlaub zählt in Monat, Export und Nachweis mit, in der Woche als eigene Summe, in der Wochentabelle
  aller als „U“. **Krankheit gibt es bewusst nicht**: Das wären Gesundheitsdaten (Art. 9 DSGVO), erst
  nach Rücksprache mit dem Datenschutz.
- **Korrekturen** (v136): Im eigenen Tag und im Tag einer Person steht unter „Korrekturen“, wer wann
  was geändert hat und warum (Vorher → Nachher, auch Urlaub). Gelesen wird nach derselben Regel wie die
  Zeiten: die eigenen oder, mit „Zeiten aller“, alle.
- **Export** (v136): *CSV* – eine Zeile je Person und Tag mit Eintrag (Datum, Wochentag, Beginn, Ende,
  Pausen, Arbeitszeit als h:mm und als Dezimalstunden mit Komma, Urlaub, Hinweise), danach eine
  Summenzeile; Semikolon, UTF-8 mit BOM – Excel öffnet sie richtig (`monatCsv()`). *Nachweis* – eine
  A4-Seite je Person mit allen Tagen des Monats, Summen und zwei Unterschriftszeilen (`ZeitNachweis`),
  gedruckt aus dem Fenster wie die Rechnung; am iPhone über Teilen → als PDF sichern. Offene Schichten
  vergangener Tage zählen auch hier erst nach der Korrektur.
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

## Feierabend, Heimfahrt, Erinnerung (Migration 85, v138)

- **„Für heute fertig?“** Wer eingestempelt ist und einen Auftrag erledigt, nach dem für ihn heute
  keiner mehr offen oder in Arbeit ist (`letzterAuftragHeute()`), bekommt die Frage
  (`components/zeit/FeierabendFrage.tsx`, Ebene 10002 über dem Auftragsfenster):
  - **„Ja, Feierabend“** – stempelt aus und schreibt **30 Minuten Heimfahrt** gut
    (`ZEIT_HEIMFAHRT_MINUTEN`, `zeit_feierabend()`). Die Datenbank prüft selbst: eingestempelt, heute ein
    eigener Auftrag erledigt, keiner mehr offen, heute noch keine Heimfahrt – sonst nennt sie den Grund.
  - **„Noch nicht“** – nichts passiert, die Stempeluhr läuft; ausstempeln dann selbst, **ohne**
    Heimfahrt (die Zeit bis dahin ist gestempelt).
- **Die Heimfahrt zählt zur Arbeitszeit** (sie wird vergütet) und steht überall zusätzlich als
  „davon Heimfahrt“: an der Schicht („+ 0:30 h Heimfahrt gutgeschrieben“), in Tag, Woche und Monat,
  im Monat mit Anzahl („davon Heimfahrt · 3×“), in der Monatstabelle aller (Spalte „Heimf.“), im
  Nachweis (Spalte „davon Heimf.“) und in der CSV (Spalte „davon Heimfahrt (Std.)“, Summe mit „n×
  Heimfahrt“). So sieht man, wie oft sie gutgeschrieben wurde.
- **Korrigieren** mit „Zeiten aller · schreiben“: im Korrekturformular „Heimfahrt gutschreiben“ an
  oder aus, mit Grund (`zeit_heimfahrt_setzen()`); die Korrektur heißt „Heimfahrt 0:30 h
  gutgeschrieben“ bzw. „… entfernt“.
- **Stempel-Erinnerung per Push** (im Minutentakt, `lib/stempelErinnerung.ts`):
  - **„Einstempeln nicht vergessen“** 30 Minuten vor dem ersten eigenen Termin des Tages, wenn die
    Person nicht eingestempelt ist.
  - **„Ausstempeln vergessen?“** 30 Minuten nach dem geplanten Ende des letzten eigenen Termins (ohne
    Endzeit: Beginn + 30 Minuten), wenn sie noch eingestempelt ist **und** dieser Auftrag nicht
    erledigt ist. Antippen öffnet die Stempeluhr (`/?stempeluhr=1`).
  - Termine mit Uhrzeit, nicht storniert, mit zugeteiltem Mitarbeiter mit Konto; nur, wer stempeln darf;
    je Art einmal am Tag; verpasste werden höchstens eine Stunde lang nachgeholt.
  - In den **Einstellungen** je Person abschaltbar („Stempel-Erinnerung“, erscheint nur mit Stempelrecht).

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

## Datenbank (Migration 83)

- `zeit_abwesenheiten` (Person, Tag, `art` – heute nur `urlaub`, Minuten 1–720, Notiz = Grund, wer); je
  Person und Tag höchstens eine Zeile. Lesen wie die Schichten, Schreiben nur über
  `zeit_urlaub_setzen(person, von, bis, minuten, grund)` und `zeit_urlaub_loeschen(person, von, bis, grund)`
  (höchstens zwei Monate auf einmal). Jede Änderung steht mit Vorher/Nachher in `zeit_korrekturen`
  (`schicht_id` leer, `{"art": "urlaub", "tag", "minuten"}`).
- `zeit_aufraeumen()` löscht auch den Urlaub nach 2 Jahren.

## Datenbank (Migration 85)

- `zeit_schichten.heimfahrt_minuten` (0–120, Vorgabe 0). `zeit_schicht_json()` gibt sie mit aus –
  Vorher/Nachher jeder Korrektur zeigt sie.
- `zeit_feierabend()` – ausstempeln mit Heimfahrt, mit den Prüfungen oben (Tag = Kalendertag in
  Nürnberg). `zeit_heimfahrt_setzen(schicht, minuten, grund)` – Korrektur, nur „Zeiten aller ·
  schreiben“; gleicher Wert schreibt nichts.
- `user_settings.stempel_erinnerung_aktiv` (Vorgabe an); `push_stempel_erinnerung` (Person, Tag, Art –
  Schlüssel für „einmal je Tag“; nur der Versand, RLS ohne Richtlinie; älter als 30 Tage räumt der
  Versand ab).

## Code

| Datei | Was |
|---|---|
| `lib/zeiterfassung.ts` | Zählen, Woche, Hinweise, Formular → Zeitpunkte – rein, `tests/zeiterfassung.test.ts` |
| `lib/api/zeiterfassung.ts` | Stand, Schichten der Woche, offene, Personen, Stempeln, Korrigieren |
| `app/_seite/useZeiterfassung.ts` | Stand, Versatz zur Datenbankuhr, Stempeln, Blatt |
| `components/zeit/` | Karte, Anzeige, Blatt, Bereich – `tests/zeitOberflaeche.test.tsx` |
| `components/zeit/ZeitMonat.tsx`, `ZeitNachweis.tsx`, `UrlaubBlatt.tsx` | Monat, Nachweis zum Drucken, Urlaub (v136) |
| `lib/download.ts` | Datei speichern (CSV) |
| `components/zeit/FeierabendFrage.tsx` | „Für heute fertig?“ nach dem letzten Auftrag (v138) |
| `lib/stempelErinnerung.ts`, `lib/stempelErinnerungVersand.ts` | Stempel-Erinnerung: Regeln (rein, `tests/stempelErinnerung.test.ts`) und Versand im Minutentakt |

## Datenschutz

Arbeitszeiten sind personenbezogene Daten der Mitarbeiter. Vor dem Start die Mitarbeiter informieren,
wozu die Zeiten erfasst werden und wer sie sieht; die Aufbewahrung (2 Jahre, § 16 Abs. 2 ArbZG) mit
dem Datenschutz bzw. Steuerberater abstimmen. Erfasst werden nur Zeiten – kein Standort, keine Fotos.
Die Hinweise zur Pause und zu 10 Stunden sind Hinweise für Menschen; die App entscheidet nichts über
Personen. Urlaub ist ein personenbezogenes Datum wie die Zeiten (gleiche Regeln, gleiche 2 Jahre);
Krankheit wird bewusst nicht erfasst (Art. 9 DSGVO). Der Export enthält Namen und Zeiten – nur an
Lohnbüro oder Steuerberater weitergeben, nicht offen ablegen.

Die Heimfahrt ist eine Vergütungsregel des Betriebs; ob und wie sie arbeits- oder steuerrechtlich zu
behandeln ist (Arbeitszeit, Fahrtzeit), klären Steuerberater bzw. Lohnbüro. Die Stempel-Erinnerung
liest dafür Termine und Stempelstand – keine neuen Daten, kein Standort; jeder kann sie abschalten.
