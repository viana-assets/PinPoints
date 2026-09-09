# Auftragsablauf (Konzept, 29.08.2026)

**✅ Umgesetzt am 29.08.2026** – Migration 20, `components/auftraege/AuftragModal.tsx` (neu) und
die davon berührten Panels. Dieses Blatt beschreibt weiterhin das Warum; was tatsächlich gebaut
wurde, steht am Ende unter „Stand der Umsetzung".

## Warum überhaupt

Der Status eines Auftrags ist heute ein Auswahlfeld mit drei erlaubten Werten. Er beschreibt
nichts, was das System durchsetzt, und löst nichts aus: man kann beliebig zwischen „Offen",
„In Arbeit" und „Erledigt" hin- und herspringen, und ein erledigter Auftrag bleibt in jeder
Hinsicht so veränderbar wie ein offener. Damit ist „Erledigt" eine Behauptung, keine Tatsache.

Für den Alltag ist das lästig. Für die geplante Rechnungsstellung (`roadmap.md`, Phase 5) ist es
ein Blocker: eine Rechnung braucht einen Zeitpunkt, ab dem feststeht, was geleistet wurde. Der
Preis-Schnappschuss in `order_articles` (Migration 12) war genau dafür gedacht – es fehlt bisher
nur der Moment, in dem er verbindlich wird.

Dazu kommt eine Lücke, die im Alltag draußen weh tut: **ein Auftrag zeigt auf keinen Wagen.**
Fahrzeuge hängen am Kunden, nicht am Auftrag. Bei einem Kunden mit zwei Autos muss der Techniker
vor Ort nachfragen, um welches es geht – bei einem Reifenservice die eigentlich zentrale Angabe.

## Die Zustände

Bewusst schlank gehalten (Entscheidung von Vitali, 29.08.2026). Erweitern geht später jederzeit;
ein Zustand mehr kostet in jeder Liste und jedem Filter Platz.

| Zustand | Bedeutung |
|---|---|
| **Offen** | Angelegt, ggf. terminiert und Mitarbeitern zugeordnet. Alles änderbar. |
| **In Arbeit** | Der Einsatz läuft. Alles änderbar. |
| **Erledigt** | Vor Ort fertig. **Positionen eingefroren.** |
| **Storniert** | Kommt nicht zustande. Positionen eingefroren, Grund hinterlegt. |

## Die Übergänge

Der springende Punkt: **Zustände werden nicht ausgewählt, sie sind das Ergebnis einer Handlung.**
Aus dem Auswahlfeld in der Tabelle wird ein farbiges Kennzeichen zum Ansehen; gehandelt wird im
Auftragsfenster über benannte Schaltflächen.

```
Offen ──"Arbeit beginnen"──▶ In Arbeit ──"Auftrag abschließen"──▶ Erledigt
  │                              │                                    │
  │                              │                          "Wiedereröffnen"
  └──"Auftrag abschließen"───────┘                          (nur Admin, mit Grund)
  │                              │                                    │
  └──"Stornieren"───────────────┴──────▶ Storniert ◀─────────────────┘
```

- **Offen → Erledigt** ist erlaubt, ohne Umweg über „In Arbeit". Ein kurzer Reifenwechsel wird
  in der Praxis nicht erst gestartet und dann abgeschlossen, sondern nach getaner Arbeit in einem
  Zug erfasst. Wer den Zwischenschritt will, benutzt ihn.
- **Erledigt → In Arbeit** ist kein Klick, sondern eine **Wiedereröffnung**: nur Admin oder
  Superadmin, nur mit Begründung, und sie landet im Änderungsprotokoll (Migration 18).
- **Techniker** dürfen Zustände vorwärts bewegen (das ist ihre Arbeit) und niemals
  wiedereröffnen – das ergibt sich automatisch daraus, dass sie nicht Admin sind.

## Was „abschließen" bedeutet

Drei Dinge, sonst ist es nur ein Wort:

1. **Die Positionen werden eingefroren.** Leistungen, Mengen und Rabatte eines erledigten oder
   stornierten Auftrags lassen sich nicht mehr anlegen, ändern oder entfernen. Durchgesetzt wird
   das in der **Datenbank**, nicht in der Oberfläche – wie bei den Modul-Berechtigungen seit
   Migration 16, und aus demselben Grund: eine ausgeblendete Schaltfläche ist keine Zusicherung.
2. **Es wird festgehalten, wer wann abgeschlossen hat** (`completed_at`, `completed_by`), gesetzt
   von der Datenbank selbst, nicht vom Client.
3. **Der Auftrag verlässt die Arbeitsliste.** Er bleibt über den Zeitraum-Schalter erreichbar
   (siehe `auftraege-termine-einsatzplanung.md`), steht aber nicht mehr im Weg.

## Das Auftragsfenster

Klick auf eine Auftragszeile – im Aufträge-Tab, in der Einsatzplanung und im Kundendetail –
öffnet dasselbe Fenster. Es ersetzt das bisherige Leistungen-Popover ersatzlos: ein 440 Pixel
breites Überblendfenster mit waagerechtem Rollbalken ist der falsche Ort, um Positionen zu
erfassen.

```
┌──────────────────────────────────────────────────────────────┐
│ Auftrag 2026-0143            [Offen]                     [×] │
├──────────────────────────────────────────────────────────────┤
│ Daniel Hartman · Rednitzstr. 18, 90449 Nürnberg   [Navi][Tel]│
│ Fahrzeug:  N-AB 1234 · VW Golf · 205/55 R16                  │
│ Termin:    3.9.2026, 15:00      Mitarbeiter: Paul, Roman     │
├──────────────────────────────────────────────────────────────┤
│ Leistungen                                                   │
│  Artikel              Menge  Rabatt  Einzel     Summe        │
│  Reifenwechsel mobil    1      0 %   49,00 €   49,00 €   [×] │
│  Reifenwuchten          4      0 %    9,00 €   36,00 €   [×] │
│  [+ Leistung hinzufügen]                                     │
│                              Netto 85,00 · MwSt 16,15        │
│                                        Brutto 101,15 €       │
├──────────────────────────────────────────────────────────────┤
│ Notiz des Technikers …                                       │
├──────────────────────────────────────────────────────────────┤
│ [Stornieren]              [Arbeit beginnen] [Auftrag abschl.] │
└──────────────────────────────────────────────────────────────┘
```

Genau der Fall, um den es Vitali ging: der Kunde will vor Ort zusätzlich wuchten lassen. Auftrag
öffnen, Leistung hinzufügen, abschließen. Danach steht fest, was abgerechnet wird.

Bei einem erledigten Auftrag zeigt der Fuß statt der Handlungen den Hinweis „Abgeschlossen am
… von …" und – für Admins – „Wiedereröffnen".

## Änderungen am Datenmodell (Migration 20)

| Feld | Zweck |
|---|---|
| `order_number` | Fortlaufende, für Menschen lesbare Auftragsnummer. Gleiches Muster wie `articles.article_number` (Migration 14): Sequenz als Vorbelegung, eindeutig. Ohne sie lässt sich weder eine Rechnung noch ein Telefonat mit dem Kunden eindeutig führen. |
| `vehicle_id` | Verweis auf `vehicles`, `on delete set null`. Auswahl im Auftragsfenster aus den Fahrzeugen dieses Kunden. |
| `status` | Constraint um `'storniert'` erweitert. |
| `completed_at` / `completed_by` | Wer hat wann abgeschlossen. Von der Datenbank gesetzt. |
| `cancelled_at` / `cancelled_by` / `cancel_reason` | Dasselbe für die Stornierung. |
| `reopen_reason` | Begründung der letzten Wiedereröffnung. Die vollständige Historie steht ohnehin im `audit_log`. |

Dazu zwei Trigger:

- **`enforce_order_status_transition`** auf `orders`: lässt nur die oben abgebildeten Übergänge
  zu, setzt `completed_at`/`completed_by` bzw. die Storno-Felder selbst und verlangt für eine
  Wiedereröffnung Admin-Rolle und eine Begründung.
- **`freeze_order_articles`** auf `order_articles`: lehnt jedes Anlegen, Ändern und Entfernen ab,
  solange der zugehörige Auftrag erledigt oder storniert ist.

**Achtung beim Umsetzen** – leicht zu übersehen: der Spaltenschutz für Techniker aus Migration
15/18 arbeitet mit einer Positivliste (`status`, `techniker_notiz`, `updated_at`, `updated_by`).
Sobald der Übergangs-Trigger zusätzlich `completed_at` und `completed_by` setzt, müssen diese
beiden Felder mit in die Liste, sonst lehnt der Spaltenschutz jeden Abschluss durch einen
Techniker ab.

## Weitere Änderungen

- **Termin-Titel**: Beim Anlegen wird der Titel mit „Termin – ‹Kundenname›" vorbelegt und bleibt
  überschreibbar. Heute heißen alle Termine schlicht „Termin".
- **Statusfilter** im Aufträge-Tab um „Storniert" ergänzen.
- **`openArtMenu`/`artMenuFor`** und die Popover-Verdrahtung in `app/page.tsx` entfallen.

## Bewusst nicht Teil davon

Ein vollwertiges Field-Service-System hält beim Abschluss außerdem fest: erfasste Arbeitszeit,
Fotos (Reifenzustand vorher/nachher) und eine Unterschrift des Kunden als Abnahme. Das ist der
sinnvolle nächste Ausbauschritt, aber nicht dieser – wichtig ist nur, dass das Datenmodell
jetzt nicht dagegen arbeitet. Tut es nicht: alle drei hängen am Auftrag und lassen sich später
ergänzen, ohne das Hier gebaute anzufassen.

Ebenfalls offen bleibt die Rückrichtung zu einem Kalender (siehe die Google-Diskussion) sowie
die Rechnungsstellung selbst. Diese Überarbeitung ist deren erste Hälfte: sie schafft den
Zeitpunkt, ab dem feststeht, was abgerechnet wird.

---

## Stand der Umsetzung (29.08.2026)

Alles oben Beschriebene ist gebaut. Was beim Umsetzen dazukam oder auffiel:

- **Die Wechselwirkung mit dem Soft-Delete war schärfer als gedacht.** Die Kettenwirkung aus
  Migration 19 setzt beim Löschen eines Auftrags `deleted_at` auf dessen Positionen – und wäre
  am neuen Einfrier-Trigger gescheitert, sobald der Auftrag abgeschlossen war. Ein erledigter
  Auftrag hätte sich also nicht mehr löschen lassen. Der Trigger lässt eine Änderung deshalb
  durch, wenn sich **ausschließlich** `deleted_at` ändert. Die Reihenfolge stimmt dabei von
  selbst: `trg_freeze_order_articles` läuft vor `trg_stamp_row` (Trigger feuern alphabetisch),
  sieht also noch die unveränderten Zeitstempel.
- **Techniker können abschließen, aber nicht stornieren** – und das ganz ohne eigene Prüfung.
  Die Positivliste des Spaltenschutzes enthält `completed_at`/`completed_by`, aber nicht die
  Storno-Felder; der Versuch scheitert damit an einer Regel, die ohnehin schon da war.
- **Der Titel wird an drei Stellen vorbelegt** (Aufträge-Modal, Kundendetail, Kontakt-Popup auf
  der Karte) und zusätzlich zentral in `addOrder()` aufgefangen, falls er leer bleibt. Lieber
  eine Rückfallebene zu viel, als dass es daran hängt, ob jede Maske daran gedacht hat.
- **Die Auftragsnummer steht jetzt in der Tabelle**, in der Auftragszeile im Kundendetail und
  im Kopf des Auftragsfensters – und in der Löschabfrage, wo vorher der Titel stand. Bei lauter
  Aufträgen namens „Termin" war das keine brauchbare Rückfrage.
- **Nicht gebaut, bewusst**: die Rückwärtsbewegung „In Arbeit → Offen" gibt es in der Datenbank,
  aber keinen Knopf dafür. Sie wäre eine vierte Schaltfläche im Fuß für einen seltenen Fall;
  wer sie braucht, meldet sich.

## Nachtrag 29.08.2026: wie ein Auftrag entsteht

Migration 20 hat geregelt, was mit einem Auftrag *passiert*. Offen blieb, wie er *entsteht* –
und genau dort lag der nächste Bruch (ausführlich: `termine-kontakt-auftrag-analyse.md`).

Es gibt jetzt genau **drei** Wege, und alle drei führen durch dieselbe Maske:

| Von wo | Kunde | Maske |
|---|---|---|
| Reiter „Aufträge" → „Neuer Auftrag" | wird ausgewählt | `OrderModal`, danach `AuftragModal` |
| Karten-Popup → „+ Auftrag anlegen" | steht fest | direkt `AuftragModal` |
| Kundenfenster → „Aufträge & Termine" | steht fest | `AddOrderInline` |

Ein Zwischenformular gibt es nur dort, wo der Kunde noch fehlt. Steht er fest, wird die Zeile
sofort angelegt und gleich das vollständige Auftragsfenster geöffnet – Leistungen hängen an
einer Auftrags-Id, ein Formular ohne gespeicherte Zeile könnte sie gar nicht anbieten. Ein
frisch angelegter Auftrag zeigt dort „Verwerfen" statt des Papierkorbs.

Zwei Regeln gelten überall:

1. **Ein neu angelegter Auftrag ist immer „offen".** Das Status-Auswahlfeld im Anlegeformular
   ist entfallen. Es widersprach dem Grundsatz dieses Dokuments – Zustände werden nicht
   ausgewählt, sondern durch Handlungen erreicht – und hätte beim Anlegen als „erledigt" einen
   Abschluss ohne Zeitstempel und ohne Person erzeugt, also genau die Behauptung, die Migration
   20 abschaffen sollte.
2. **Nach dem Anlegen öffnet sich das Auftragsfenster.** Ein frischer Auftrag hat weder Fahrzeug
   noch Leistungen. Wer ihn erst in der Liste wiederfinden muss, trägt beides erfahrungsgemäß
   nicht nach – und dann steht am Monatsende ein Auftrag ohne Positionen da, aus dem sich keine
   Rechnung bauen lässt.

**Was ein Auftrag nicht mehr ist**: ein Nebenprodukt der Kontakterfassung. Bis hierher legte der
grüne Knopf auf der Karte („Kontaktiert speichern") bei gesetztem Haken im Hintergrund einen
Auftrag an – ohne Fahrzeug, ohne Mitarbeiter, ohne Leistungen, mit dem Titel „Termin – ‹Kunde›".
Und umgekehrt setzte jede so entstandene Auftragsanlage `last_contact` und damit die
Wiedervorlage-Uhr zurück, auch wenn gar kein Gespräch stattgefunden hatte. Kontakt bestätigen und
Auftrag anlegen sind seither zwei Schaltflächen, die nichts voneinander wissen.

## Nachtrag 29.08.2026: Einlagerung als Abschlussbedingung (Migration 22)

Zum Abschluss gehört seither eine dritte Bedingung neben den bisherigen: enthält der Auftrag
eine Leistung mit dem Kennzeichen `articles.braucht_lagerplatz`, muss ein Lagerplatz belegt
sein. Geprüft wird das im erweiterten `enforce_order_status_transition()` – also in der
Datenbank, nicht in der Oberfläche.

Das folgt derselben Linie wie der Rest dieses Dokuments: ein „Erledigt", das die Oberfläche
zwar verhindert, die Datenbank aber zulässt, ist eine Bitte und keine Zusicherung. Das
Auftragsfenster zeigt den fehlenden Platz an und bietet Auswahl und Scan an – aber die Regel
steht darunter.

Beim **Stornieren** wird nicht geprüft: ein stornierter Auftrag wurde gerade nicht ausgeführt.

Der Einlagerungs-Block im Auftragsfenster erscheint auch ohne Pflicht, solange eine Einlagerung
vorhanden ist. Sonst verschwände sie beim Entfernen der Leistung aus dem Blick, obwohl die
Reifen weiter im Regal liegen. Einzelheiten: `lager.md`.

## Nachtrag 29.08.2026: ein Fenster, ein Speicherpunkt

Das Auftragsfenster hatte drei verschiedene Speicherverhalten nebeneinander:

| Angabe | Wurde geschrieben |
|---|---|
| Fahrzeug | sofort beim Umschalten |
| Mitarbeiter | sofort beim Anhaken |
| Technikernotiz | beim Verlassen des Feldes |
| Titel, Datum, Uhrzeit, Beschreibung | über einen eigenen Knopf mitten im Fenster |

Man konnte also nicht sagen, was schon in der Datenbank stand und was noch nicht – und ein
versehentlicher Klick auf einen Mitarbeiter war sofort eine Änderung, die im Änderungsprotokoll
landete.

**Jetzt gilt: alles in diesem Fenster ist zuerst ein Entwurf.** Sobald sich etwas unterscheidet,
erscheint oben neben dem Schließen-Kreuz ein oranger Knopf **Speichern**; danach steht dort für
gut zwei Sekunden ein grüner Haken. Der Knopf erscheint nur, wenn es etwas zu speichern gibt –
ein dauerhaft sichtbarer, meist wirkungsloser Knopf sagt nichts über den Zustand aus.

Warum oben und nicht im Fuß: der Fuß trägt die Zustandswechsel („Auftrag abschließen",
„Stornieren"). Ein Speichern-Knopf daneben lädt dazu ein, versehentlich abzuschließen, wenn man
nur die Uhrzeit ändern wollte.

**Ausgenommen bleiben die Leistungen.** Jede Position ist eine eigene Zeile mit eigenem
Hinzufügen- und Löschknopf, und die Datenbank friert sie beim Abschluss ein (Migration 20). Sie
in denselben Entwurf zu ziehen hieße, Mengen und Rabatte im Browser zu halten, bis jemand
speichert – mehr Risiko als Gewinn. Dasselbe gilt für die Einlagerung: ein Lagerplatz wird beim
Zuordnen belegt, nicht auf Verdacht.

**Schließen mit ungespeicherten Änderungen** fragt einmal nach (Zurück / Verwerfen / Speichern
und schließen), statt sie stillschweigend zu verwerfen – auch beim Klick neben das Fenster.
Bewusst als Zeile im Fenster und nicht als Browser-Dialog: der blockiert die Seite und sieht auf
jedem Gerät anders aus.

Das Schließen-Kreuz ist außerdem größer geworden (38 px, auf dem Handy 44 px – die übliche
Mindestgröße für eine Fingerfläche). Vorher war es ein schmaler Sekundärknopf und mobil kaum zu
treffen.

## Nachtrag 04.09.2026: eine Maske, nicht vier

Beim Durchgehen der Oberfläche fiel auf, dass für „einen Auftrag anlegen" inzwischen **vier
verschiedene Masken** existierten – jede an einer anderen Stelle entstanden, jede etwas anders,
und **keine einzige außer dem Auftragsfenster konnte Leistungen erfassen**:

| Wo | Was sie war |
|---|---|
| Reiter „Aufträge" → Neuer Auftrag | `OrderModal` mit Kunde, Titel, Datum, Uhrzeit, Mitarbeiter |
| Kundenfenster → Aufträge & Termine | `AddOrderInline`, aufklappbar, mit Titel, Datum, Uhrzeit, Notiz, Mitarbeiter |
| Neuer Kunde → „Gleich einen Auftrag anlegen" | eigener Block im Kundenformular |
| Karten-Popup | legte an und öffnete das Auftragsfenster (seit 29.08.2026 der richtige Weg) |

Wer einen Auftrag über einen der ersten drei Wege anlegte, musste ihn danach noch einmal
öffnen, um Fahrzeug und Leistungen einzutragen. Genau das sollte der Umbau vom 29.08. abstellen
– er hat nur einen von vier Wegen erwischt.

**Jetzt gilt überall dasselbe:** Zeile mit sinnvollen Vorgaben anlegen, vollständiges
Auftragsfenster öffnen. Unterschiedlich ist allein, woher der Kunde kommt:

| Von wo | Kunde | Zwischenschritt |
|---|---|---|
| Reiter „Aufträge" | wird ausgewählt | `OrderModal` – **nur noch die Kundenauswahl** |
| Karten-Popup | steht fest | keiner |
| Kundenfenster | steht fest | keiner |
| Neuer Kunde (Ankreuzfeld) | wird gerade angelegt | keiner |

`AddOrderInline` ist damit ersatzlos entfallen; `OrderModal` ist von fünf Feldern auf eines
geschrumpft. Ein Auftragsformular, das keine Leistungen kann, ist kein zweiter Weg zum Ziel –
es ist ein Umweg, an dessen Ende man von vorn anfängt.
