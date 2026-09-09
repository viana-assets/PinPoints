# Analyse: Kontakt, Termin und Auftrag – wie es heute zusammenhängt (29.08.2026)

Ausgangspunkt ist die Beobachtung aus dem Betrieb: *"Wenn ich über die Karte auf den grünen
Knopf gehe und den Haken 'Termin' setze, lege ich zwar einen Termin an, daraus wird aber kein
Auftrag. Das ist nicht verknüpft."*

Diese Datei hält den Ist-Zustand fest, benennt die Ursachen und beschreibt den Zielzustand.
Sie ist die Grundlage für den Umbau; die Umsetzung wird in `auftragsablauf.md` fortgeschrieben.

---

## 1. Was heute tatsächlich passiert

Der grüne Knopf legt sehr wohl einen Auftrag an. Der Weg ist:

```
Popup „✔ Kontaktiert speichern"
  └─ markContacted(id, kontaktDatum, terminDatum, terminZeit, beschreibung)
       ├─ markCustomerContacted()  → customers.status = 'kontaktiert', last_contact,
       │                             + Zeile in contact_history
       └─ wenn Haken gesetzt:
          insertOrder({ title: terminTitel(kunde), status: 'offen',
                        orderDate, time, description })
```

Es entsteht also eine echte Zeile in `orders`. Die Verknüpfung ist im Code vorhanden.
**Trotzdem hat die Beobachtung recht** – nur liegt die Ursache woanders als vermutet.

---

## 2. Sechs Ursachen, warum es sich unverknüpft anfühlt

### 2.1 Der erzeugte Auftrag ist eine leere Hülle

Angelegt werden nur Titel, Datum, Uhrzeit, Beschreibung. Es fehlt alles, was einen Auftrag
zum Auftrag macht: **kein Fahrzeug, kein Mitarbeiter, keine Leistungen, keine Artikel.** Der
Titel lautet wörtlich „Termin – ‹Kunde›". In der Auftragsliste steht damit eine Zeile, die
sich in jeder Hinsicht wie ein Termin liest und wie ein Termin verhält. Der Eindruck „das ist
kein Auftrag" ist inhaltlich korrekt, auch wenn technisch eine Auftragszeile existiert.

### 2.2 Reiter „Termine" und Reiter „Aufträge" zeigen dieselbe Datenmenge

`apptRows` in `app/page.tsx` läuft über **alle** Aufträge aller aktiven Kunden – ohne jeden
Filter, der einen Termin von einem Auftrag unterscheiden würde. `AuftraegePanel` listet
ebenfalls alle Aufträge. Zwei Reiter, eine Datenquelle, zwei Darstellungen.

Das ist kein Versehen der Oberfläche, sondern folgt aus dem Datenmodell: seit Migration 07
gilt „ein Termin ist ein Auftrag mit Uhrzeit". Nur ist `order_date` in der Tabelle
`not null default current_date` – **jeder** Auftrag hat also zwingend ein Datum. Das einzige
Feld, das überhaupt unterscheiden könnte, ist `time`, und das wertet keiner der beiden Reiter
aus. Es gibt im Datenbestand schlicht kein Merkmal „das hier ist nur ein Termin".

### 2.3 Aus dem Reiter „Termine" führt kein Weg zum Auftrag

Ein Klick auf eine Terminzeile ruft `openDetail(cust.id)` auf und öffnet damit das
**Kundenfenster** – nicht den Auftrag. Das Auftragsfenster (`AuftragModal`), in dem Fahrzeug,
Leistungen, Mitarbeiter und der Abschluss stehen, ist ausschließlich aus dem Reiter „Aufträge"
erreichbar.

Das ist die stärkste Einzelursache für den Eindruck „nicht verknüpft": genau der Bildschirm,
der nach dem gerade angelegten Ding benannt ist, hat keinen Weg dorthin.

### 2.4 Kontakt bestätigen und Auftrag anlegen sind eine untrennbare Aktion

Der grüne Knopf schreibt **immer** einen Kontakt: `status = 'kontaktiert'`, `last_contact` und
eine Zeile in `contact_history`. Der Termin ist nur ein Anhängsel per Haken.

Damit ist einer der beiden Fälle immer verfälscht:

- Nur telefoniert, kein Termin → funktioniert.
- Termin/Auftrag vereinbaren, ohne dass ein Anruf stattfand (z. B. Kunde stand vor Ort, kam
  über das Kontaktformular, Anschlussauftrag aus einem laufenden) → geht nicht, ohne den
  Kunden fälschlich als „kontaktiert" zu markieren und die Wiedervorlage-Uhr zurückzusetzen.

Der Wiedervorlage-Zeitraum aus den Einstellungen hängt direkt an `last_contact`. Ein falsch
gesetzter Kontakt verschiebt also, wann der Kunde wieder rot wird.

### 2.5 Das Feld „Kontaktiert am" ist mit dem *letzten* Kontakt vorbelegt, nicht mit heute

An beiden Stellen steht `cust.last_contact || todayStr()` – im Karten-Popup
(`app/page.tsx`) und im Kundenfenster (`components/kunden/DetailModal.tsx`).

Bei einem Kunden, der zuletzt im März kontaktiert wurde, bietet das Formular also **März** an.
Wer nicht aufpasst, speichert den heutigen Anruf mit einem halben Jahr Rückdatierung. Das ist
ein echter Fehler, kein Konzeptthema.

### 2.6 Dieselbe Maske existiert zweimal, in zwei verschiedenen Techniken

Das Kontaktformular gibt es doppelt:

| Ort | Technik |
|---|---|
| Karten-Popup | Zeichenkette in `div.innerHTML`, Handler über `document.getElementById` |
| Kundenfenster | React-Komponente mit `useState` |

Beide rufen dasselbe `markContacted()` auf, aber Aufbau, Vorbelegung und Beschriftung werden
getrennt gepflegt. Jede Änderung am Konzept muss zweimal gemacht werden, und wer eine Stelle
vergisst, merkt es nicht. Die Popup-Variante umgeht zusätzlich React vollständig – sie ist der
letzte Rest der Bauweise, die die App vor der Sanierung durchgehend hatte.

### 2.7 Anhang: die Tabelle `appointments` existiert noch

Seit Migration 07 schreibt und liest die App sie nicht mehr; die Daten wurden damals nach
`orders` übernommen. Die Tabelle blieb absichtlich stehen. Migration 16 hat ihr sogar noch
Rechte-Regeln verpasst. Sie ist heute toter Ballast und eine Fehlerquelle für jeden, der
später ins Schema schaut und sie für die Wahrheit hält.

---

## 3. Zielbild

### 3.1 Der grüne Knopf wird zu zwei getrennten Aktionen

```
        ┌─────────────────────────────┐
        │  Kunde im Karten-Popup      │
        └──────────────┬──────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  ✔ Kontakt bestätigen        + Auftrag anlegen
  ───────────────────         ──────────────────
  Ein Feld: Datum,            Kunde ist gesetzt.
  vorbelegt mit HEUTE,        Datum/Uhrzeit, Fahrzeug,
  überschreibbar.             was zu tun ist, Mitarbeiter.
                              → echter Auftrag,
  Schreibt last_contact         zugleich der Termin
  + contact_history
```

Kein Haken mehr, keine Vermischung. Wer beides braucht, macht beides – das ist ein Klick mehr
und dafür jederzeit nachvollziehbar.

### 3.2 Die beiden Reiter bekommen unterschiedliche Aufgaben

| Reiter | Aufgabe | Zeigt |
|---|---|---|
| **Termine** | Schnellsicht: *wann bin ich wo?* | Datum/Uhrzeit, Kunde, Adresse, Mitarbeiter, Navigation, Anrufen – schlanke Liste, chronologisch |
| **Aufträge** | Detailsicht: *was ist zu tun, was kostet es, ist es fertig?* | Volle Tabelle mit Filtern über Status, Mitarbeiter, Kunde; Auftragsfenster mit Leistungen und Abschluss |

Dieselben Daten, zwei Tiefen – aber **beide führen ins selbe Auftragsfenster**. Ein Klick auf
eine Terminzeile öffnet ab dem Umbau den Auftrag, nicht mehr den Kunden. Der Kunde bleibt über
eine eigene Schaltfläche in der Zeile erreichbar.

---

## 4. Was das für den Datenbestand heißt

Nichts. Kein neues Feld, keine Migration.

Es ist verlockend, ein Kennzeichen `ist_termin` einzuführen. Das wäre ein Fehler: es wäre ein
Zustand, der zusätzlich zu Datum und Uhrzeit gepflegt werden müsste und mit ihnen auseinander-
laufen kann. Die Unterscheidung „Termin oder Auftrag" ist keine Eigenschaft der Daten, sondern
eine Frage der Betrachtung – und gehört deshalb in die Oberfläche, nicht in die Tabelle.

Die einzige offene Schemafrage ist die tote Tabelle `appointments` (Abschnitt 2.7).

---

## 5. Stand der Umsetzung (29.08.2026)

Alles aus Abschnitt 3 ist umgesetzt.

| Befund | Erledigt durch |
|---|---|
| 2.1 leere Hülle | Auftrag entsteht nur noch über das Auftragsformular; direkt danach öffnet sich das Auftragsfenster für Fahrzeug und Leistungen |
| 2.2 zwei Reiter, eine Datenmenge | bleibt eine Datenmenge – bewusst; die Reiter unterscheiden sich jetzt in der Tiefe, nicht in der Quelle |
| 2.3 kein Weg vom Termin zum Auftrag | Klick auf eine Terminzeile öffnet das Auftragsfenster; Kunde über eine eigene Schaltfläche |
| 2.4 Kontakt und Auftrag verschmolzen | zwei getrennte Schaltflächen im Karten-Popup; `markContacted()` schreibt nur noch den Kontakt |
| 2.5 falsches Vorgabedatum | „Kontaktiert am" ist mit heute vorbelegt, an beiden Stellen |
| 2.6 dieselbe Maske doppelt | das Kontaktformular ist auf ein einziges Datumsfeld geschrumpft; die Terminfelder gab es doppelt und gibt es nirgends mehr |
| 2.7 tote Tabelle | `21_appointments_entfernen.sql` |

Zwei Dinge sind über die Analyse hinaus dazugekommen, weil sie an derselben Stelle lagen:

- **Das Status-Auswahlfeld im Anlegeformular ist weg.** Man konnte einen Auftrag direkt als
  „Erledigt" anlegen – das widersprach Migration 20, wo Zustände durch Handlungen erreicht
  werden, und hätte ohnehin keinen Abschluss-Zeitstempel erzeugt. Ein neuer Auftrag ist immer
  „offen".
- **Auch der Weg über den Reiter „Aufträge" öffnet nach dem Anlegen das Auftragsfenster.** Ein
  frisch angelegter Auftrag ist nie fertig; wer ihn erst in der Liste wiedersuchen muss, trägt
  Fahrzeug und Leistungen oft gar nicht nach.

### Was bewusst NICHT gemacht wurde

Kein Kennzeichen `ist_termin`, keine Trennung von Termin und Auftrag im Datenbestand (siehe
Abschnitt 4). Und die Terminliste filtert weiterhin nicht auf „hat eine Uhrzeit": ein Auftrag
ohne Uhrzeit ist ein Termin, dessen Uhrzeit noch offen ist, und der gehört in die Planung –
nicht aus ihr heraus.

---

## 6. Nachtrag 29.08.2026: ein Fenster statt zwei

Der erste Wurf schaltete zwischen Karten-Popup und Auftragsfenster ein kleines Anlegeformular
(Titel, Datum, Uhrzeit, Mitarbeiter). Es sollte den Auftrag erzeugen, danach ging das
vollständige Fenster auf. In der Praxis las sich das als „abgespeckte Version": man klickt
„Auftrag anlegen" und bekommt zunächst weniger, als man erwartet hat.

**Jetzt legt „+ Auftrag anlegen" die Zeile sofort an** – mit dem Titel „Termin – ‹Kunde›",
heutigem Datum und Zustand „offen" – und öffnet direkt das vollständige Auftragsfenster. Dort
sind Titel, Datum, Uhrzeit, Fahrzeug, Mitarbeiter, Leistungen und Notiz ohnehin alle änderbar,
das Zwischenformular hat also nichts angeboten, was danach nicht auch dort stand.

**Warum nicht umgekehrt – ein volles Formular, das erst beim Absenden schreibt?** Weil
Leistungen und Positionen an einer Auftrags-Id hängen (`order_articles.order_id`). Ohne
gespeicherte Zeile gibt es nichts, woran sie hängen könnten – ein Formular ohne Schreibvorgang
könnte genau den Teil nicht anbieten, um den es beim „vollen Fenster" geht.

Der Preis: wer versehentlich klickt, hat eine Auftragszeile erzeugt. Dagegen steht im Fenster
eines frisch angelegten Auftrags **„Verwerfen"** statt des Papierkorbs, ohne Rückfrage – etwas,
das man vor einer Sekunde selbst erzeugt hat, löscht man nicht, man nimmt es zurück. Und wer
das Fenster einfach schließt, verliert nichts: der Auftrag ist offen und steht in beiden
Reitern.

### Ein Fehler, der dabei ans Licht kam

`neuLaden()` rief `queryClient.invalidateQueries()` mit vorangestelltem `void` auf – das
Versprechen wurde also verworfen. Jedes `await refreshOrders()` kehrte damit sofort zurück,
während die Abfrage noch lief. Solange nur Listen neu gezeichnet wurden, fiel das nie auf.
Beim direkten Öffnen eines frisch angelegten Auftrags schon: die Zeile stand in der Datenbank,
im Zwischenspeicher aber noch nicht, das Fenster fand nichts und blieb zu. `neuLaden()` gibt
das Versprechen jetzt zurück, `refreshOrders()` wartet es ab. Wer den Rückgabewert ignoriert,
bekommt wie bisher ein „nebenher".

Das Anlegeformular gibt es weiterhin – aber nur noch im Reiter „Aufträge", wo der Kunde erst
ausgewählt werden muss. Auch dort öffnet sich danach das Auftragsfenster.
