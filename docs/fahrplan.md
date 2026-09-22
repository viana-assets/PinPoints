# Fahrplan

Alles, was offen ist – an genau einer Stelle. Diese Datei ersetzt die früheren
`roadmap.md`, `architektur-review-2026-08.md`, `lager-ausbaukonzept.md` und
`termine-kontakt-auftrag-analyse.md`. Die vier sind gelöscht; was von ihnen noch gilt,
steht hier oder in der jeweiligen Baustein-Doku. Wer den alten Wortlaut braucht, findet
ihn im Git-Verlauf des Repositorys.

Grundlage: vollständige Durchsicht des Projekts am 18.09.2026 (alle 50 Migrationen, der
gesamte Code unter `app/`, `components/`, `lib/`, `public/`, `tests/`, alle Dokumente).

**Regel:** Ist ein Punkt erledigt, wird er hier gestrichen – nicht abgehakt stehen
gelassen. Sonst entsteht wieder das, was am 18.09.2026 aufgeräumt wurde.

---

## Zuletzt erledigt

* **22.09.2026 – Auftrag aus dem Kalender.** Klick in eine freie Stelle des Stundenrasters →
  Kundenauswahl mit vorbelegtem Termin → vollständiges Auftragsfenster. Kein fünftes Formular;
  Einzelheiten in `docs/auftraege.md`, Abschnitt 3.
* **22.09.2026 – „Auf dem Handy anrufen".** Am Rechner klicken, auf dem iPhone telefonieren
  (`/api/push/anruf`). Einzelheiten in `docs/benachrichtigungen-plan.md`, letzter Abschnitt.
  Steht und fällt mit F2 (Gerätetest der Push-Zustellung).

---

## A. Sofort – kostet im Betrieb bereits Geld oder erzeugt falsche Belege

Abschnitt A ist am 21.09.2026 abgearbeitet: die vier Punkte, die hier standen (Auslagern im
Auftragsfenster ohne Gebühr, der ungeprüft bestätigbare Auslagern-Dialog ohne gültigen Preis,
das doppelt gepflegte Fahrzeug am Auftrag, `todayStr()` in UTC statt Ortszeit) sind behoben –
Details dazu stehen in `auftraege.md`, `lager.md` und `architektur.md`, nicht mehr hier. Nach
der Reihenfolge in Abschnitt G ist der nächste, dringendste offene Punkt **F2** (Gerätetest der
Terminerinnerung bei gesperrtem Bildschirm/Fokusmodus „Fahren") – zehn Minuten Aufwand, die
klären, ob die Push-Erinnerung im Alltag überhaupt ankommt.

---

## B. Sicherheit, Recht, Datenschutz

### B1. Das Protokoll wächst unbegrenzt und enthält personenbezogene Daten

`audit_log` speichert vollständige Zeilenstände als jsonb – also auch Name, Adresse,
Telefonnummern, E-Mail und Koordinaten, und zwar dauerhaft. Migration 36 sagt das selbst:
es ist die einzige Tabelle, die nie kleiner wird. Die 90 Tage in der Oberfläche sind ein
Anzeigefilter, keine Aufbewahrungsregel.

Ein gelöschter Kunde bleibt damit über sein Änderungsprotokoll unbegrenzt einsehbar. Für
ein DSGVO-Löschkonzept fehlt beides: eine Frist und ein Weg, sie umzusetzen.

*Zu entscheiden:* Aufbewahrungsfrist festlegen (z. B. 24 Monate), danach die
personenbezogenen Felder in alten Einträgen anonymisieren statt die Zeile zu löschen –
die Nachvollziehbarkeit „wer hat wann was geändert" bleibt dann erhalten.
Aufwand: mittel. Vorher fachlich/rechtlich klären, nicht einfach bauen.

### B2. Kein Löschkonzept für Kunden

Kunden werden nur als gelöscht markiert (`deleted_at`). Es gibt keinen Weg, einen Kunden
auf Wunsch tatsächlich zu entfernen, und keine Ansicht, die zeigt, seit wann etwas als
gelöscht markiert ist. Für eine Auskunfts- oder Löschanfrage nach DSGVO gibt es damit
heute keinen bedienbaren Ablauf.

*Vorschlag:* erst die kleine Stufe – Papierkorb-Ansicht mit Löschdatum. Die endgültige
Löschung danach entscheiden, zusammen mit B1. Aufwand: klein (Stufe 1).

### B3. Geokodierung: Drosselung wirkt nur je Serverinstanz

`app/api/geocode/route.ts` und `app/api/adresse-suchen/route.ts` bremsen über eine
Modulvariable. Bei mehreren gleichzeitigen Vercel-Instanzen greift das nicht, und ein
angemeldeter Nutzer kann die Route in einer Schleife aufrufen. Im Ernstfall sperrt der
kostenlose Dienst die Firma aus.

*Behebung:* einfache Zählung je Nutzer und Zeitfenster in einer Tabelle. Aufwand: klein
bis mittel.

### B4. CSP erlaubt weiterhin `unsafe-inline`

`next.config.mjs` setzt `script-src 'self' 'unsafe-inline'`. Sauber wäre eine
Nonce-Lösung über `proxy.ts`. Fremde Skript-Hosts sind bereits ausgeschlossen, das Risiko
ist daher gering – aber der Punkt steht seit Phase 8 offen. Aufwand: klein bis mittel.

### B5. Geprüft und **kein** Befund – bitte nicht „reparieren"

Bei der Durchsicht sind drei Dinge aufgefallen, die nach einer Lücke aussehen und keine
sind. Sie stehen hier, damit sie niemand in guter Absicht kaputtmacht:

- **Die DELETE-Richtlinien in Migration 42 prüfen `lesen`, nicht `loeschen`.** Das ist
  Absicht. Eine Richtlinie, die die Zeile wegfiltert, lässt den Trigger gar nicht erst
  laufen – dann steht wieder „0 Zeilen gelöscht" ohne ein Wort dazu. Die eigentliche
  Entscheidung trifft der BEFORE-Trigger `pruefe_loeschrecht()`, der auf allen zwölf
  betroffenen Tabellen hängt und zusätzlich den Soft-Delete (`deleted_at` wird gesetzt)
  über einen BEFORE-UPDATE-Trigger abfängt. Löschrechte werden also durchgesetzt.
- **`tire_storage` hat gar keine Löschrichtlinie.** Auch Absicht: eine Einlagerung wird nie
  gelöscht, Auslagern ist ein Schreibvorgang. Ohne Richtlinie verweigert die RLS jedes
  DELETE – genau das ist gewollt.
- **`module_permissions`** ist seit Migration 16 nur für Superadmin schreibbar. Ein Admin
  kann sich keine Rechte selbst erteilen.

---

## C. Aufräumen

### C1. Tote Spalten entfernen

| Spalte | Status |
|---|---|
| `articles.braucht_lagerplatz` | Seit Migration 46 ohne Wirkung, im Code nirgends mehr gelesen. Kann fallen. |

### C2. Toter Code

- `rechtSchluessel()` in `lib/constants.ts` wird von niemandem aufgerufen. Entweder überall
  verwenden (dann auch in `canView()` und in `PermissionMatrix`, die den Schlüssel je
  einzeln zusammenbauen) oder entfernen.
- `GEO_GENAUIGKEIT_LABEL` in `lib/constants.ts` wird nirgends verwendet – entweder in der
  Oberfläche einsetzen (siehe E7) oder entfernen.
- Das Prop `pflicht` in `components/auftraege/EinlagerungBlock.tsx` wird an beiden
  Einbindungsstellen fest auf `false` gesetzt; der zugehörige Zweig ist tot.
- `QrBild` existiert fast wortgleich zweimal (`LagerplatzAufkleber.tsx`,
  `ReifensatzEtikett.tsx`).

### C3. Kommentare, die etwas anderes sagen als der Code

- Migration 37 behauptet, die Standarddauer sei „auch im Code 60 Minuten" – in
  `lib/constants.ts` stehen 30, und maßgeblich ist ohnehin `betrieb.termin_intervall_min`.
- `AuftraegePanel.tsx` und `EinsatzplanungPanel.tsx` tragen noch Kommentare aus der Zeit
  vor Migration 41 („Techniker darf keine Leistungen ändern") – das stimmt nicht mehr.

### C4. Protokoll-Beschriftungen nachziehen

`auftrag_fahrzeuge` und das Feld `kilometerstand` (Migration 44) fehlen in
`PROTOKOLL_TABELLE_LABEL` bzw. `PROTOKOLL_FELD_LABEL`. Sie erscheinen im Protokoll als
Rohname. Zwei Zeilen. Aufwand: winzig – und genau der Fehler, vor dem der Kommentar an
dieser Konstante selbst warnt.

### C5. Große Dateien

`app/page.tsx` ist wieder auf rund 3.100 Zeilen gewachsen (nach der Sanierung waren es
1.290). `components/auftraege/AuftragModal.tsx` liegt bei gut 1.000, `components/lager/
LagerPanel.tsx` bei knapp 900, `lib/helpers.ts` bei rund 970 Zeilen.

Das ist kein akutes Problem, aber jedes neue Modul hat bisher Zustand und Ladefunktionen in
`HomePage` dazugelegt, ohne dass Älteres kleiner wurde. Sinnvoller nächster Schnitt:
`TireAssignModal` aus `LagerPanel` herauslösen, `helpers.ts` thematisch teilen.
Aufwand: mittel, jederzeit aufschiebbar.

### C6. Keine Tests für Komponenten

Vitest deckt ausschließlich reine Rechenfunktionen ab. Dass ein Trigger-Fehler (etwa die
Vollständigkeitsprüfung der Rechnungsdaten) in der Oberfläche als lesbare Meldung ankommt,
prüft niemand automatisch. Aufwand: mittel, dauerhafter Nutzen.

### C7. Rollback-Skripte für die Migrationen 01–14 fehlen

Sie fehlen bewusst – diese Migrationen legen das Grundschema an, ihre Rücknahme wäre das
Leeren der Datenbank. Kein Handlungsbedarf, nur hier festgehalten, damit die Lücke nicht
für ein Versehen gehalten wird.

---

## D. Verbesserungen am Bestehenden

Nach Nutzen sortiert.

| # | Was | Warum | Aufwand |
|---|---|---|---|
| D1 | **Warnung bei Terminüberschneidung** beim Zuordnen von Mitarbeiter oder Firmenfahrzeug (nicht blockierend) | Doppelbuchungen fallen heute nur auf, wenn man zufällig genau diesen Tag im Stundenraster öffnet. Bei wenigen Technikern kostet jede Doppelbuchung einen halben Tag. | mittel |
| D2 | **Löschen eines Auftrags absichern**, wenn eine Rechnung dazu existiert oder der Auftrag erledigt/storniert ist | Heute lässt sich ein abgerechneter Auftrag ohne Warnung aus allen Listen entfernen. Die Rechnung bleibt als Beleg bestehen, ist aber nicht mehr auffindbar. | klein |
| D3 | **Lager bzw. Lagerplatz nicht löschen, solange er belegt ist** – oder wenigstens die Zahl der belegten Plätze in die Rückfrage schreiben | Ein Lager mit vierzig eingelagerten Kundensätzen lässt sich heute mit einem Klick und einer nichtssagenden Rückfrage löschen. | klein |
| D4 | **Zweites Sortierkriterium** bei allen Auftragsabfragen (`order_date`, dann Auftragsnummer) | Ohne zweites Kriterium ist die Reihenfolge bei gleichem Datum nicht festgelegt; zusammen mit der seitenweisen Abfrage können Zeilen doppelt oder gar nicht erscheinen. | klein |
| D5 | **Stornierte Aufträge ins Zeitfenster einbeziehen** – die Bedingung schließt heute nur alte *erledigte* aus, alte stornierte werden immer alle geladen | Genau das Wachstumsproblem, wegen dem das Zeitfenster eingeführt wurde. | klein |
| D6 | **Entwurfszustand im Auftragsfenster vollständig zurücksetzen** beim direkten Wechsel auf einen anderen Auftrag | Zurückgesetzt werden heute nur Titel, Datum, Zeit, Beschreibung, Fahrzeuge, Mitarbeiter und Notiz – nicht die Altreifen-Rückfrage, der Einlagerungsblock, Storno- und Wiedereröffnen-Zustand. Springt man aus einer Push-Benachrichtigung direkt in einen anderen Auftrag, unterbleibt die Altreifen-Frage. Am einfachsten über `key={order.id}` an der Komponente. | klein |
| D7 | **Nächste Rechnungsnummer gegen den Bestand prüfen**, bevor sie gespeichert wird | In den Betriebsdaten lässt sich heute jede Zahl ≥ 1 eintragen. Ein Tippfehler erzeugt eine doppelte oder übersprungene Nummer, ohne dass die Datenbank es merkt. | klein |
| D8 | **`mit_steuer` nicht mehr raten.** `RechnungDokument` fällt bei alten Belegen ohne dieses Feld auf `steuer !== 0` zurück – bei einer Rechnung über lauter steuerfreie Positionen ist das falsch. Für Altbestände einmalig setzen statt schätzen. | klein |
| D9 | **Einheitliche Löschbestätigung mit Auftragsnummer** – es gibt vier Stellen mit drei verschiedenen Texten, einer davon ohne jede Kennung | Bei lauter Aufträgen namens „Termin" ist der Titel keine brauchbare Rückfrage. | klein |
| D10 | **Telefonnummern kanonisch speichern** (zusätzliche Vergleichsform) | Voraussetzung für zuverlässige Suche und für die Dublettenerkennung (E1). Heute sind „0911 12345", „0911/12345" und „+49 911 12345" drei verschiedene Nummern. | mittel |
| D11 | **Filter „Storniert" in der Einsatzplanung** ergänzen – die Auftragsliste dort hat vier Filter, die Auftragsliste im Auftragsreiter fünf | klein |
| D12 | **Wiedereröffnen eines stornierten Auftrags** vom normalen Wiedereröffnen unterscheiden und den Stornogrund dabei zeigen | Fachlich sind „Arbeit war fertig" und „kam gar nicht zustande" zwei verschiedene Situationen. | klein |
| D13 | **Rückfrage beim Abschließen ohne Leistungen** („keine Leistung zugeordnet – trotzdem abschließen?") | klein |
| D14 | **Freie Plätze nach Lager gruppieren** in der Lagerplatz-Auswahl (`optgroup`) | Am Handy muss man sonst je Zeile den angehängten Lagernamen mitlesen. | klein |
| D15 | **Größere Schritte bei der Profiltiefe-Messung** (zusätzlich ±1 mm neben ±0,1 mm) | 6,0 → 2,0 mm sind heute vierzig Tipper, mit Handschuhen im Lager. | klein |
| D16 | **`canView()` robuster machen** – es teilt den Schlüssel am ersten Punkt, ein zweistufiger Bereich wie `lager.regale` würde still falsch ausgewertet. Heute wird es nirgends so aufgerufen, die Falle steht aber offen. | klein |
| D17 | **IBAN in den Betriebsdaten prüfen** (Länge und Prüfsumme) | Ein Tippfehler fällt sonst erst beim Kunden auf – oder der Girocode fehlt kommentarlos. | klein |
| D18 | **Aufkleberdruck für sehr große Lager stückeln** | Mehrere hundert QR-Bilder auf einmal lassen Safari am iPhone hängen. | mittel |

---

## E. Neue Funktionen – was dem Betrieb wirklich hilft

Nach Nutzen sortiert, nicht nach Aufwand.

### E1. Dublettenprüfung bei der Kundenanlage
Beim Anlegen wird heute nichts geprüft. Bei 424 Bestandskunden und telefonischer Neuanlage
entstehen Karteileichen zwangsläufig; die Dokumentation nennt „Dublette" bereits als Grund
für eine Deaktivierung, ohne dass es ein Werkzeug dagegen gäbe. Ein nicht blockierender
Hinweis („ähnlicher Kunde vorhanden: … – trotzdem anlegen?") auf Basis von Name + PLZ und
normalisierter Telefonnummer, dazu eine Admin-Ansicht mit Zusammenführen-Knopf.
*Aufwand: mittel. Setzt D10 voraus.*

### E2. Kommissionierliste „Was muss heute mit"
Aus allen Terminen eines Tages die zugeordneten Leistungen und die Reifengrößen der
betroffenen Fahrzeuge zusammenziehen, als eine Liste für die Beladung des Transporters am
Morgen. Nutzt ausschließlich Daten, die schon da sind.
*Aufwand: klein bis mittel. Sehr hoher Alltagsnutzen.*

### E3. Foto und Unterschrift beim Abschließen
Zustand der Reifen vorher/nachher fotografieren und den Kunden auf dem Handy quittieren
lassen. Bei Reklamationen ist das der Unterschied zwischen Aussage gegen Aussage und einem
Beleg. Das Datenmodell war dafür von Anfang an mitgedacht.
*Aufwand: mittel bis groß (Dateiablage nötig).*

### E4. Langlieger-Übersicht
Die Schwellen (18 Monate bzw. 150 €) sind bereits im Code, greifen aber nur im
Auslagern-Dialog beim einzelnen Satz. Eine filterbare Liste „alle Sätze über X Monaten,
sortiert nach Kunde und Betrag" macht vergessene Sätze sichtbar, statt darauf zu warten,
dass zufällig jemand auslagert. Das ist unmittelbar Umsatz.
*Aufwand: klein bis mittel.*

### E5. Tagesroute nach Fahrstrecke sortieren
Die Tagesliste sortiert nach Uhrzeit. Für einen mobilen Dienst mit mehreren Stopps wäre
eine Reihenfolge nach kürzestem Weg unmittelbar Zeit- und Spritersparnis. Die Koordinaten
liegen für die Navigation ohnehin vor.
*Aufwand: mittel.*

### E6. Auftragsvorlagen für wiederkehrende Leistungspakete
„Saisonwechsel mobil", „Wechsel + Wuchten" als ein Klick statt jeder Position einzeln.
*Aufwand: klein bis mittel.*

### E7. Stapel-Auslagern für den Saisonwechsel
Beim eigentlichen Saisonwechsel muss heute jeder Satz einzeln über den Auslagern-Dialog.
Ein geführter Modus „einen nach dem anderen abarbeiten" wäre bei dreistelligen Stückzahlen
ein spürbarer Unterschied.
*Aufwand: groß.*

### E8. Reifengrößen-Abgleich beim Einlagern
Am Fahrzeug steht eine Reifengröße, am eingelagerten Rad ebenfalls – verglichen wird nie.
Eine Warnung bei Abweichung findet falsch zugeordnete Sätze zum frühestmöglichen Zeitpunkt.
*Aufwand: mittel.*

### E9. Terminbestätigung an den Kunden
Heute erinnert die App das eigene Personal. Eine Bestätigung oder Erinnerung an den Kunden
(SMS oder E-Mail) senkt die Zahl der vergeblichen Anfahrten. Braucht einen externen
Dienst – vor dem Bau die Frage klären, ob das sein soll.
*Aufwand: mittel bis groß.*

### E10. Auskunftsauszug je Kunde
Ein Knopf im Kundenfenster (nur Admin), der alles zu diesem Kunden Gespeicherte als PDF
zusammenstellt. Deckt die DSGVO-Auskunft ab, die heute nur durch Durchklicken bedienbar
wäre. Passt zu B1/B2.
*Aufwand: mittel.*

### E11. Lagerauslastung im Blick
Hinweis, wenn ein Lager über 90 % belegt ist. Die Kennzahlen dafür werden bereits geladen.
*Aufwand: klein.*

### E12. Kapazitätsklasse am Lagerplatz
„Normal" und „groß/SUV", damit die Auswahl freier Plätze keine 20-Zöller in zu kleine
Fächer schickt.
*Aufwand: mittel.*

---

## F. Aus der alten Planung übernommen

### F1. Offline schreiben (PWA Stufe 4)
Lesen funktioniert offline (Stufen 1–3 sind gebaut). Schreiben nicht: es fehlt eine
Warteschlange und eine Konfliktbehandlung. Der kleine Zuschnitt – nur Status, Notiz und
Radmessung offline – ist der sinnvolle erste Schritt. Siehe `pwa-plan.md`.
*Aufwand: groß.*

### F2. Gerätetest der Terminerinnerung
Der Push ist scharfgeschaltet, aber nie bei gesperrtem Bildschirm und im Fokusmodus
„Fahren" ausprobiert worden. Das ist zehn Minuten Arbeit und entscheidet, ob die Funktion
im Alltag trägt. Siehe `benachrichtigungen-plan.md`.
*Aufwand: winzig, und trotzdem der Punkt mit dem höchsten Verhältnis von Erkenntnis zu Aufwand.*

### F3. Welche Geräte sind eigentlich im Einsatz?
Aus dem PWA-Plan unbeantwortet: welche iOS-Fassungen, ob der QR-Scanner in der
installierten Web-App auf den älteren davon funktioniert. Reine Bestandsaufnahme.

### F4. Erledigt, aber noch als offen geführt gewesen
Zur Klarstellung, damit niemand doppelt anfängt: Rechnungsstellung (Phase 5), die
Push-Terminerinnerung (Phase 14) und das Offline-Lesen (PWA Stufe 3) sind **gebaut**. Die
alte `roadmap.md` führte alle drei noch als offen.

### F5. Hinfällig
Der zentrale Warteschlangenlauf für die Geokodierung beim Massenimport war für die
Übernahme der Bestandskunden gedacht. Die ist über direktes SQL gelaufen, ohne diese
Route. Die technische Lücke bleibt (siehe B3), der ursprüngliche Anlass ist weg.

---

## G. Reihenfolge, wenn man einfach anfangen will

Abschnitt A ist am 21.09.2026 abgearbeitet (Runde 34, Migration 51, Service Worker v50).
Ab hier:

1. **F2** – zehn Minuten am Gerät, bevor mehr in die Erinnerung investiert wird. Das beste
   Verhältnis von Erkenntnis zu Aufwand in dieser ganzen Liste.
2. **C4, D5, D6, D7** – Kleinkram, der in einem Zug mitgeht.
3. **E4 und E2** – die beiden Funktionen mit dem besten Verhältnis von Aufwand zu Nutzen.
4. **D1 und D3** – die beiden Warnungen, die einen teuren Fehler verhindern (Doppelbuchung,
   Löschen eines belegten Lagers).
5. **B1/B2** – Löschkonzept, sobald jemand Zeit für die fachliche Entscheidung hat.
6. **F1** – Offline schreiben, als eigenes Vorhaben, nicht nebenbei.
