# Rechnungswesen

PinPoints stellt seit Migration 48/49 Rechnungen selbst aus – vorher entstanden sie in einem
ERP, und der Auftrag hielt nur dessen Nummer fest (Migration 40). Am 18.09.2026 wurde
entschieden, dass PinPoints das rechnungsführende System wird. Dieses Dokument beschreibt den
seitherigen Ist-Zustand: Datenmodell, Nummernvergabe, Lebenszyklus, Druck und die
Betriebsdaten-Maske.

## Zweck und Abgrenzung

Eine Rechnung ist hier ein **Beleg**: eine fortlaufend nummerierte, inhaltlich eingefrorene
Kopie dessen, was einem Kunden für einen Auftrag in Rechnung gestellt wird. Drei Eigenschaften
sind in der Datenbank verankert, nicht nur in der Oberfläche:

- Ihre Nummer ist einmalig und fortlaufend, ohne Lücken.
- Ihr Inhalt steht fest, sobald sie ausgestellt ist. Eine spätere Preis-, Kunden- oder
  Betriebsänderung wirkt sich nicht rückwirkend aus.
- Sie wird storniert, nicht gelöscht.

**Was das Modul nicht ist:** keine Buchhaltung und keine OP-Verwaltung. Es gibt keinen
Zahlungseingang, keinen Mahnlauf, kein Fälligkeitsdatum, keine automatische Verbuchung und
keinen Export ins Rechnungswesen. Ob eine Rechnung bezahlt ist, wird hier nicht erfasst. Es
gibt auch keinen eigenen Versanddienst – siehe Abschnitt „E-Mail-Versand".

## Datenmodell

### Tabelle `betrieb`

Genau eine Zeile (`id boolean primary key default true check (id)`), seit Migration 38.
Migration 48 hat sie um den Briefkopf und den Nummernkreis erweitert:

| Feld | Bedeutung |
|---|---|
| `termin_intervall_min` | Terminraster (Migration 38, nicht rechnungsbezogen) |
| `firma`, `inhaber`, `strasse`, `plz`, `ort` | Anschrift im Briefkopf |
| `telefon`, `email`, `webseite` | Kontaktdaten in der Fußzeile |
| `ust_id`, `steuernummer` | Steuerangaben in der Fußzeile |
| `kontoinhaber`, `bank`, `iban`, `bic` | Bankverbindung, Grundlage des Girocodes |
| `logo` | Logo als `data:`-URI (kein Dateispeicher) |
| `anschreiben` | Text zwischen Anschriftenfeld und Positionstabelle |
| `fuss_zahlung`, `fuss_hinweis`, `fuss_dank` | drei Fußzeilentexte |
| `rechnung_praefix` | Präfix der Rechnungsnummer, Vorgabe `RE` |
| `rechnung_naechste_nummer` | nächste zu vergebende Rechnungsnummer, Vorgabe `1` |
| `kunde_naechste_nummer` | nächste zu vergebende Kundennummer, Vorgabe `10000` |
| `updated_at`, `updated_by` | von der Datenbank gesetzt |

Gelesen werden darf die Zeile von allen angemeldeten Nutzern (das Terminraster braucht jeder),
geändert nur von `admin`/`superadmin`. Es gibt bewusst keine Insert-/Delete-Regel – die eine
Zeile steht und bleibt stehen.

### Tabelle `rechnungen`

Angelegt in Migration 48:

| Feld | Bedeutung |
|---|---|
| `id` | Primärschlüssel |
| `nummer` | laufende Zahl, einmalig (Unique-Index) |
| `nummer_text` | Präfix + Zahl, z. B. `RE1782`, ebenfalls einmalig |
| `art` | `'rechnung'` oder `'storno'` |
| `storniert_durch` | auf der Originalrechnung: welche Stornorechnung sie aufhebt |
| `storniert_am` | Zeitpunkt der Aufhebung |
| `hebt_auf` | auf der Stornorechnung: welche Rechnung sie aufhebt (Pflicht bei `art = 'storno'`) |
| `order_id`, `customer_id` | Verweise für die Navigation, **nicht** Quelle des Inhalts |
| `kundennummer` | Kopie der Kundennummer zum Ausstellungszeitpunkt |
| `datum` | Rechnungsdatum |
| `lieferdatum` | Tag der Leistungserbringung (`orders.order_date`) |
| `empfaenger` | jsonb-Snapshot (`RechnungEmpfaenger`) |
| `absender` | jsonb-Snapshot (`RechnungAbsender`) |
| `positionen` | jsonb-Array (`RechnungPosition[]`) |
| `texte` | jsonb-Snapshot (`RechnungTexte`) |
| `netto`, `steuer`, `brutto` | `numeric(12,2)`, beim Ausstellen berechnet und danach nur noch gelesen |
| `created_at`, `created_by` | von der Datenbank gesetzt |

RLS ist aktiv: Lesen und Schreiben je über `darf('rechnungen', 'lesen'|'schreiben')`, Update nur
für den Storno-Trigger (siehe unten) – eine eigene Löschrichtlinie existiert nicht.

### `articles.freitext` und `articles.einheit`

Beide seit Migration 48/50 am Artikel, nicht an der Position, weil sie sich nicht von Auftrag
zu Auftrag ändern:

- `einheit` (`text`, Vorgabe `'Stück'`): steht hinter der Menge auf der Rechnung. Im
  Artikelstamm ein Textfeld mit Datalist-Vorschlägen (`EINHEITEN` in `lib/constants.ts`:
  Stück, Fahrt, Monate, Pauschal, Stunde) – feste Liste plus freie Eingabe, keine geschlossene
  Auswahl.
- `freitext` (`boolean`, Vorgabe `false`): siehe Abschnitt „Freitextposition".

### `customers.kundennummer`

`integer`, seit Migration 48, per Trigger (`vergib_kundennummer()`) fortlaufend vergeben, nach
demselben Muster wie die Rechnungsnummer (`for update` auf die `betrieb`-Zeile, Start bei
`kunde_naechste_nummer = 10000`). Anders als bei der Rechnungsnummer gibt es hier keine
Lückenlosigkeits-Pflicht in dem Sinn, dass ein gelöschter Kunde seine Nummer „zurückgibt" –
Kunden werden ohnehin nur weich gelöscht (`deleted_at`).

### `auftrag_fahrzeuge`

Seit Migration 44 die Quelle für „welche Fahrzeuge betrifft dieser Auftrag" (ersetzt das
einzelne `orders.vehicle_id`). Relevant fürs Rechnungswesen sind zwei Felder:

- `vehicle_id` → darüber werden die Kennzeichen für den Rechnungskopf (`texte.kennzeichen`)
  zusammengesucht.
- `kilometerstand` (`integer`, `null` = „noch nicht abgelesen"): keine Eigenschaft des
  Fahrzeugs, sondern eine Messung am Tag des Auftrags. Pflicht wird er – zusammen mit dem
  Kennzeichen – erst beim Abschließen eines Auftrags mit `rechnung_noetig = true`, geprüft
  durch `pruefe_rechnungsdaten()` (Migration 44). Der Kilometerstand erscheint auf der Rechnung
  selbst nicht; `RechnungDokument` druckt nur die Kennzeichen.

### Felder an `orders`

| Feld | Bedeutung |
|---|---|
| `rechnung_noetig` | Schalter „Rechnung benötigt" (Migration 38), Vorgabe `false`. Entscheidet, ob Positionen mit Steuer ausgewiesen werden. Steht am Auftrag, nicht an der Position. |
| `rechnung_erstellt_am` | `null` = offen. Wird von `rechnung_am_auftrag()` (Trigger, Migration 49) nach `insert` auf `rechnungen` gesetzt – nicht vom Client. |
| `rechnung_erstellt_von` | wer ausgestellt hat |
| `rechnung_nummer` | Kopie von `nummer_text` der gültigen Rechnung, am Auftrag zur schnellen Anzeige |

Solange eine gültige Rechnung am Auftrag hängt, lässt sich `rechnung_erstellt_am` nicht mehr
von Hand auf `null` zurücksetzen (`stempel_rechnung()`, erweitert in Migration 49) – die
Ablehnung nennt die Rechnungsnummer. Erst ein Storno nimmt den Haken zurück, und auch das nur,
wenn danach keine andere gültige Rechnung mehr am Auftrag hängt.

## Der lückenlose Nummernkreis

`betrieb.rechnung_naechste_nummer` ist **keine Postgres-Sequence**. Eine Sequence vergibt auch
dann eine Nummer, wenn die Transaktion, die sie angefordert hat, danach abbricht (Rollback,
Verbindungsabbruch) – das reißt eine Lücke in den Kreis, die bei einer Prüfung erklärt werden
muss.

Stattdessen vergibt der Trigger `vergib_rechnungsnummer()` (`before insert on rechnungen`) die
Nummer **in derselben Transaktion**, in der die Rechnungszeile entsteht:

```
select b.rechnung_naechste_nummer, b.rechnung_praefix, btrim(b.firma)
  into naechste, praefix, absender
  from public.betrieb b where b.id for update;
```

`for update` sperrt die eine `betrieb`-Zeile bis zum Ende der Transaktion. Zwei gleichzeitig
ausgestellte Rechnungen bekommen dadurch garantiert zwei verschiedene Nummern statt zweimal
derselben – die zweite Transaktion wartet, bis die erste committet oder zurückrollt. Bricht das
`insert` ab (z. B. weil der Firmenname fehlt, siehe unten), bleibt `rechnung_naechste_nummer`
unverändert, und die Nummer ist wieder frei – es entsteht keine Lücke.

Seit Migration 49 prüft derselbe Trigger zusätzlich, dass ein Firmenname gepflegt ist:

```
if absender is null or absender = '' then
  raise exception 'Die Betriebsdaten sind noch nicht gepflegt. ...';
end if;
```

Diese Prüfung sitzt bewusst *vor* der Nummernvergabe und im Trigger, nicht im Programm: Wer
erst die Nummer zieht und danach merkt, dass der Absender fehlt, hat eine Lücke im Kreis.

`lib/rechnung.ts` liefert mit `voraussichtlicheNummer()` nur eine **Vorschau** (`RE` +
`rechnung_naechste_nummer`) für die Anzeige im Entwurf – ausdrücklich nicht reserviert.
Zwischen dem Anzeigen des Entwurfs und dem tatsächlichen Ausstellen kann jemand anders
ausgestellt haben; dann bekommt der nächste Klick die nächste freie Nummer. Deshalb steht auf
dem Entwurf „voraussichtlich" und nicht die Nummer allein (`RechnungDokument`,
`re-vorbehalt`).

Die nächste Nummer lässt sich in der Betriebsdaten-Maske von Hand setzen
(`setzeNaechsteRechnungsnummer()`) – vorgesehen für die einmalige Übernahme aus einem
Altsystem, mit deutlicher Warnung vor doppelt oder übersprungen vergebenen Nummern.

Ausstellen und Stornieren sind die einzigen beiden schreibenden Vorgänge, die in `rechnungen`
etwas erzeugen; beide laufen über denselben Trigger und damit über denselben Nummernkreis –
eine Stornorechnung ist eine ganz normale Zeile mit `art = 'storno'` und bekommt genauso ihre
eigene, fortlaufende Nummer.

## Das Snapshot-Prinzip

`empfaenger`, `absender`, `positionen` und `texte` sind **jsonb-Kopien**, keine Verweise auf
`customers`, `betrieb` oder `order_articles`. Das sieht nach Doppelung aus und ist das
Gegenteil:

- Zieht der Kunde um, gehört auf die Rechnung von letztem Jahr die **alte** Anschrift – dorthin
  wurde sie geschickt.
- Wird ein Artikel umbenannt oder sein Preis geändert, steht auf der alten Rechnung weiter, was
  damals berechnet wurde.
- Ändert sich der Briefkopf (Anschrift, Bankverbindung, Logo, Texte), behalten bereits
  ausgestellte Rechnungen ihren alten Briefkopf.

`order_id` und `customer_id` bleiben trotzdem als Fremdschlüssel stehen – aber nur für die
Navigation („zeig mir den Auftrag dazu"), nicht als Quelle des Inhalts. `order_id` verweist mit
`on delete set null`, `customer_id` ebenso: Wird ein Auftrag oder Kunde gelöscht, bleibt die
Rechnung als Beleg vollständig erhalten und verliert nur den Rückweg.

Auch die **Summen** (`netto`, `steuer`, `brutto`) werden bei einer bereits ausgestellten
Rechnung nicht neu gerechnet, sondern aus der Datenbank gelesen (`RechnungDokument`): Was
einmal auf dem Papier stand, bleibt stehen, auch wenn sich die Rundungslogik der Anwendung
später ändern sollte. Nur der Entwurf – der noch keine gespeicherten Zahlen hat – rechnet live
mit `rechnungSummen()`.

`vergib_rechnungsnummer()` setzt `nummer`/`nummer_text` und `rechnung_am_auftrag()` den Haken
am Auftrag; alles andere am Snapshot kommt aus dem Programm (`entwurfBauen()` in
`lib/rechnung.ts`), das aus den aktuellen Stammdaten genau einmal eine Kopie baut.

## Lebenszyklus

Drei Zustände, in `RechnungModal` als Pille angezeigt:

1. **Entwurf** – noch keine Nummer. `RechnungModal` zeigt bei jedem Öffnen den aktuellen Stand
   des Auftrags über `entwurfBauen()`; alles am Auftrag lässt sich weiter ändern. Die Nummer
   wird **erst auf Knopfdruck** vergeben („Rechnung ausstellen"), nicht schon beim Öffnen des
   Fensters – eine Nummer, die nur durch Nachsehen entstünde, wäre beim Schließen des Fensters
   eine Lücke.
2. **Ausgestellt** – Nummer vergeben, Inhalt eingefroren. `stelleRechnungAus()`
   (`lib/api/rechnungen.ts`) fügt den Entwurf per `insert` ein und liest über
   `.select().single()` zurück, welche Nummer tatsächlich vergeben wurde – eine zweite Abfrage
   danach könnte bei gleichzeitigem Ausstellen die falsche Zeile treffen.
3. **Storniert** – aufgehoben durch eine zweite Rechnung (`stornoAus()`): derselbe Inhalt mit
   umgekehrtem Vorzeichen bei allen Beträgen, `art = 'storno'`, `hebt_auf` verweist auf die
   Originalrechnung. Der Trigger `rechnung_am_auftrag()` setzt daraufhin auf der Original-Zeile
   `storniert_durch`/`storniert_am` und nimmt – falls danach keine andere gültige Rechnung mehr
   am Auftrag hängt – den Haken `orders.rechnung_erstellt_am` zurück. Beide Rechnungen bleiben
   stehen und sichtbar; `istGueltig()` liefert für die Original-Zeile danach `false`.

**Kein Update, kein Delete.** Der Trigger `rechnung_unveraenderlich()` lehnt jedes `update`
ab, das irgendein Feld außer `storniert_durch`/`storniert_am` verändert, und jedes `delete`
grundsätzlich, mit einer Fehlermeldung, die die Rechnungsnummer nennt. `lib/api/rechnungen.ts`
hat deshalb bewusst **keine** `updateRechnung()`- oder `deleteRechnung()`-Funktion – eine
solche Funktion wäre ein Versprechen, das die Datenbank sofort bricht. Der Kommentar im
Quelltext nennt das ausdrücklich: „Auffällig kurz, und das ist Absicht."

Eine Korrektur läuft ausschließlich über eine Stornorechnung, die eine neue Rechnung für den
Auftrag ermöglicht (`RechnungModal` bietet nach einem Storno wieder „Neuer Entwurf" an).

**Der Grund ist Pflicht (Migration 54, 23.09.2026).** Eine Stornorechnung ohne Begründung lehnt
die Datenbank ab – `rechnungen_storno_braucht_grund` prüft, dass `storno_grund` bei
`art = 'storno'` nicht leer ist (Leerzeichen zählen nicht). Beim AUFTRAG war der Grund seit
Migration 20 Pflicht; ausgerechnet der Beleg, der einen anderen Beleg aufhebt, stand bis dahin
ohne da. Bei einer Prüfung ist die erste Frage nicht „gibt es ein Storno", sondern „warum".

Drei Einzelheiten, die man später sonst nicht mehr versteht:

* Die Prüfbedingung ist **`not valid`**, und das ist kein Versäumnis: Sie gilt ab jetzt. Ein
  Storno aus der Zeit davor hat keinen Grund und bekommt auch keinen nachträglich eingesetzten –
  ein erfundener Grund stünde im Beleg, als hätte ihn jemand damals aufgeschrieben. Für jede
  neue oder geänderte Zeile prüft Postgres trotzdem vollständig.
* `storno_grund` steht seit Migration 54 in der Feldliste von `rechnung_unveraenderlich()`. Ohne
  das ließe sich ausgerechnet die Begründung nachträglich austauschen, während jedes andere Feld
  gesperrt ist.
* Der Grund steht **in der App, nicht auf dem gedruckten Beleg**. Er ist eine interne Notiz
  („falscher Kunde ausgewählt") und geht den Empfänger nichts an. Soll er aufs Papier, gehört er
  in die Schlusstexte, nicht in dieses Feld.

**Wo der Storno-Knopf sitzt (Stand 22.09.2026): an beiden Stellen.** Ursprünglich gab es ihn
ausdrücklich nur im Rechnungsfenster **am Auftrag**, mit dem Argument, man solle dabei den
Zusammenhang sehen, aus dem die Rechnung entstand. In der Praxis hieß das: Wer im Rechnungsbuch
eine falsche Rechnung fand, musste über „Zum Auftrag" springen und dort dasselbe Fenster noch
einmal öffnen – und hat den Storno gar nicht erst gefunden. Ein Argument, das den Weg
verlängert, ohne einen Fehler zu verhindern, trägt nicht. Beide Fenster zeigen jetzt dieselbe
Rückfrage im **wortgleichen** Text: Zwei Formulierungen für dieselbe Handlung wären zwei
Gelegenheiten, sie unterschiedlich zu verstehen.

### Testbelege vor dem Echtbetrieb entfernen

`supabase/einmalig/testrechnungen_entfernen.sql` – **keine Migration**, sondern ein einmaliges
Skript mit Schritt-für-Schritt-Kommentaren. Es schaltet `trg_rechnung_unveraenderlich` für die
Dauer des Vorgangs ab, entfernt erst die Stornos (wegen `hebt_auf`), dann die Rechnungen, setzt
`betrieb.rechnung_naechste_nummer` auf 1 und schaltet den Schutz wieder ein; Schritt 0 zeigt
vorher, was verschwinden würde, Schritt 5 kontrolliert hinterher.

**Ab wann es nicht mehr ausgeführt werden darf:** sobald die erste Rechnung an einen echten
Kunden gegangen ist. Ab dann ist jede Lücke im Nummernkreis eine Frage bei der nächsten
Prüfung, und „das war ein Skript" ist keine Antwort darauf.

## Positionsberechnung

`positionenAusAuftrag()` (`lib/rechnung.ts`) baut aus den `order_articles`-Zeilen eines
Auftrags die gedruckten Positionen. Ausgangspunkt: `order_articles.endpreis_netto` ist der
Preis für die **ganze Position**, nicht je Stück (Migration 38) – auf der Rechnung stehen aber
Menge, Einzelpreis und Gesamt nebeneinander, und die Zeile muss aufgehen, wenn jemand
nachrechnet. Drei Fälle:

| Fall | Bedingung | Ergebnis |
|---|---|---|
| Kein Sonderpreis | `endpreis_netto == null` | Einzelpreis = Listenpreis (`net_price`), Gesamt = Menge × Einzelpreis |
| Sonderpreis, glatt verteilbar | `endpreis_netto / menge` geht in Cent glatt auf | Einzelpreis = Sonderpreis ÷ Menge, Gesamt = Sonderpreis |
| Sonderpreis, nicht glatt verteilbar | Rest bleibt bei der Division | Position zum Listenpreis, plus eigene Zeile „Nachlass" mit negativem Betrag |

Der dritte Fall ist die einzige Fassung, die immer stimmt, und zugleich die ehrlichste: Der
Kunde sieht, was die Leistung kostet und was ihm nachgelassen wurde, statt einer Zeile mit
krummem Einzelpreis. Die Nachlasszeile trägt `NACHLASS_BEZEICHNUNG = "Nachlass"`, `menge = 1`,
`einheit = ""` und als `zusatz` die Bezeichnung der zugehörigen Position.

**Rundung**: `aufCent()` rundet kaufmännisch auf den Cent (`Math.round((betrag +
Number.EPSILON) * 100) / 100`) – `Math.round` allein reicht nicht, weil z. B. 1.005 in
Fließkomma minimal unter der Mitte liegt und sonst abgerundet würde.

`rechnungSummen()` gruppiert die Positionen nach `steuersatz` und weist je Satz Netto und
Steuer getrennt aus (die auf der Rechnung verlangte Form „19 % aus 260,00 € = 49,40 €"). Der
Parameter `mitSteuer` ist der Schalter `orders.rechnung_noetig` zum Zeitpunkt der Berechnung;
ist er `false`, bleiben alle Steuerbeträge 0 und die Rechnung zeigt „Ohne
Umsatzsteuerausweis" statt einer Steuerzeile.

## Freitextposition

Seit Migration 50 hat `articles.freitext` (Boolean, Vorgabe `false`) eine zweite Bedeutung für
`order_articles.note`: Bei einem so gekennzeichneten Artikel **ersetzt** der eingegebene Text
die Artikelbezeichnung auf der Rechnung, statt sie nur zu ergänzen.

Der Anlass laut Migrationskommentar: Der Techniker hilft vor Ort bei etwas, das in keinem
Artikel steht, und vereinbart einen Preis. Dafür gab es den Sammelartikel „Sonstiges" ohne
feste Bezeichnung – auf der Rechnung stand dann nur „Sonstiges", und der Kunde wusste nicht,
wofür er zahlt.

In `positionenAusAuftrag()`:

```
const freitext = a?.freitext === true && text !== "";
const bezeichnung = freitext ? text : artikelname;
```

Bei einem normalen Artikel ist `note` eine Zusatzzeile unter dem Artikelnamen (z. B. „Radlager
Reifen VR" unter „Reifenmontage") – Ergänzung, nicht Ersatz. Bleibt `note` bei einem
Freitext-Artikel leer, steht der Artikelname („Sonstiges") weiter da; eine Rechnungszeile ganz
ohne Bezeichnung wäre schlimmer.

In `ArticleAssignPanel` ist das Eingabefeld immer vorhanden (nicht nur bei Freitext-Artikeln,
damit die Zeile beim Artikelwechsel nicht springt), ändert aber Beschriftung und Pflichtcharakter:
„Bezeichnung" / „Was wurde gemacht?" bei Freitext, sonst „Text auf der Rechnung" / optionaler
Zusatz. Fehlt der Text bei einem gewählten Freitext-Artikel, bekommt das Feld einen farbigen
Rand (Klasse `fehlt`) – ein Hinweis, kein Zwang: Die Datenbank erzwingt hier nichts, es ist kein
Pflichtfeld beim Abschließen.

Der Haken sitzt bewusst **am Artikel**, nicht als Namenserkennung im Code („wenn Artikel
Sonstiges heißt“): Ein Artikelname als Programmlogik wäre beim ersten Umbenennen falsch, und
verschiedene Betriebe nennen ihre Sammelposition unterschiedlich.

Menge und Einheit einer Freitextposition folgen keiner Sonderregel – sie kommen wie bei jedem
Artikel aus `order_articles.quantity` und `articles.einheit`. Für einen vor Ort vereinbarten
Pauschalpreis ist die übliche Einstellung `menge = 1`, `einheit = "Pauschal"` (Wert aus
`EINHEITEN`), aber das ist Konvention der Bedienung, keine Regel im Code.

## Druck und A4-Layout

`RechnungDokument` ist die **einzige** Komponente für Bildschirmvorschau und Druck – keine
zweite Fassung, die beim Ausdruck von der Vorschau abweichen könnte. Das Layout ist in
**Millimetern** gesetzt (`.rechnungsseite` in `app/globals.css`: `width:210mm;
min-height:297mm; padding:15mm 20mm 10mm 25mm;`), nicht in Pixeln – eine Rechnung hat eine
physische Größe. Die Ränder folgen DIN 5008 (links 25 mm Lochrand, rechts 20 mm, oben 15 mm),
das Anschriftenfeld (85 × 40 mm) sitzt so, dass es im Sichtfenster eines DIN-lang-Umschlags
steht.

In der Bildschirmvorschau wird die 210-mm-Seite per CSS-`transform: scale(...)` verkleinert
dargestellt (`--re-zoom`, gestaffelt nach Fenstergröße) – nie mit kleinerer Schrift, sonst wären
Vorschau und Ausdruck zwei Layouts.

**`@page` statt Innenabstand für den Druck**: `RECHNUNG_SEITE_CSS` in `lib/constants.ts`
(`"@page { size: A4; margin: 15mm 20mm 10mm 25mm; }"`) wird von `RechnungModal` und
`RechnungenPanel` jeweils per `<style>` in den Dialog eingehängt – **nicht** fest in
`globals.css`, weil eine `@page`-Regel für das ganze Dokument gilt und sich nicht je Element
umstellen lässt; stünde sie global fest, käme sie dem Etikettendruck (50 × 30 mm) in die Quere.

Der Grund, warum die Seitenränder beim Druck über `@page` und nicht über
`.rechnungsseite { padding }` kommen, ist der allgemeine Grundsatz aus `design-system.md`
(„Seitenränder beim Druck gehören ins `@page`, nicht ins Padding"). Beim Druck fällt hier
darum `.rechnungsseite` auf `padding:0; min-height:272mm` zurück (297 − 15 − 10 mm), damit
die Fußzeile bei einer kurzen Rechnung weiterhin am unteren Rand steht statt in der
Blattmitte.

Zusätzlich verhindert `.re-tabelle tr { break-inside: avoid; page-break-inside: avoid; }`, dass
eine einzelne Position über einen Seitenumbruch zerrissen wird (Bezeichnung auf Seite 1, Betrag
auf Seite 2 wäre genau die Zeile, über die ein Kunde anruft); dieselbe Regel gilt für den
Girocode-Block und die Fußzeile.

Gedruckt wird über die Druckfunktion des Browsers (`window.print()`) – kein eigener
PDF-Erzeuger.

**Gedruckt wird dabei immer aus dem `RechnungModal` heraus, einem Fenster mit
`position:fixed`.** Das ist nicht auf jedem Gerät folgenlos: iOS Safari druckt den Inhalt eines
`position:fixed`-Elements nicht mit, und ein Vorfahre mit `overflow:hidden` (hier `#app`)
verhindert den Seitenumbruch auf mehrseitigen Rechnungen. Die Klasse `druck-fenster` am
Rechnungsfenster sowie die zugehörige `@media print`-Regel in `globals.css` lösen beides;
Details und Begründung stehen in `docs/design-system.md`, Abschnitt „Drucken aus einem Fenster
(21.09.2026)".

## Girocode / EPC-QR

`girocodeText()` (`lib/rechnung.ts`) erzeugt den Inhalt für einen EPC-QR-Code nach Fassung 002
des European Payments Council – elf durch Zeilenvorschub getrennte Felder:

```
BCD
002
1                (Zeichensatz: UTF-8)
SCT              (SEPA Credit Transfer)
<BIC>
<Kontoinhaber oder Firma, max. 70 Zeichen>
<IBAN>
EUR<Betrag mit Punkt, z. B. EUR123.45>
                 (Zweckcode – leer)
                 (Referenz – leer)
Rechnung <Nummer>, max. 140 Zeichen
```

Fassung 002 ist bewusst gewählt, weil hier die BIC entfallen darf – innerhalb des SEPA-Raums
reicht die IBAN. Voraussetzung für den Code ist eine gepflegte **IBAN im Betrieb**
(`absender.iban`, aus dem Snapshot) sowie ein Name (`kontoinhaber` oder ersatzweise `firma`)
und ein positiver Bruttobetrag; ohne IBAN oder bei einer Stornorechnung (negativer Betrag)
liefert die Funktion `null`, und es wird kein Code gedruckt – ein Code auf einer
Stornorechnung wäre eine Aufforderung, Geld zu schicken, das der Kunde gerade zurückbekommt.
Der Betrag steht im Punktformat (`EUR123.45`), auch auf einer deutschen Rechnung, weil ihn eine
Banking-App liest, kein Mensch.

Gerendert wird der Code erst, wenn die Rechnungsnummer feststeht (nicht im Entwurf, siehe
`RechnungDokument`) – „Rechnung (Entwurf)“ im Verwendungszweck wäre unsinnig. Das Bild selbst
entsteht clientseitig über die Bibliothek `qrcode` (`QRCode.toDataURL`,
Fehlerkorrekturstufe M) in einer eigenen kleinen Komponente (`GiroBild`); schlägt die Erzeugung
fehl, wird die Rechnung trotzdem ohne Code gedruckt.

## E-Mail-Versand

`mailtoRechnung()` (`lib/rechnung.ts`) baut ausschließlich einen `mailto:`-Link mit Empfänger,
Betreff und Text – **kein** tatsächlicher Versand und **kein** Dateianhang. Zwei Gründe stehen
im Quelltext:

- Ein Browser darf einer E-Mail von einer Webseite aus keine Datei anhängen; das ist eine
  Sicherheitsgrenze des Browsers, keine fehlende Funktion hier.
- Diese Anwendung hat keinen eigenen Versanddienst – dafür bräuchte es ein weiteres System mit
  Kundendaten darin.

Der Mensch hängt das PDF selbst an, praktisch über die Druckvorschau des Browsers (am iPhone
über das Teilen-Symbol). Text und Betreff kommen aus dem **Snapshot** der Rechnung
(`empfaenger`/`absender`), nicht aus den aktuellen Kunden-/Betriebsdaten – wer eine zwei Jahre
alte Rechnung erneut verschickt, soll sie mit dem Absender verschicken, der auf ihr steht. Der
Link ist `null`, wenn der Empfänger keine E-Mail-Adresse hat (`RechnungModal` zeigt dann einen
Hinweistext statt des Knopfs).

## Betriebsdaten-Maske

`BetriebsdatenPanel` (Admin-Bereich) gliedert sich in fünf Karten:

1. **Briefkopf** – Firma, Inhaber, Anschrift, Kontakt, USt-IdNr., Steuernummer.
2. **Bankverbindung** – Kontoinhaber, Bank, IBAN, BIC; Grundlage des Girocodes.
3. **Logo** – Upload als Datei, im Browser über `FileReader.readAsDataURL()` in eine
   `data:`-URI umgewandelt und so in `betrieb.logo` gespeichert. Zulässige Typen
   `LOGO_TYPEN = ["image/png", "image/jpeg", "image/svg+xml"]`, maximale Größe
   `LOGO_MAX_BYTES = 200 * 1024` (200 kB) – größer gehört laut Fehlermeldung nicht in eine
   Datenbankzeile, empfohlen werden rund 300 Pixel Breite.
4. **Texte auf der Rechnung** – Anschreiben (mehrzeilig, Leerzeilen bleiben über
   `white-space: pre-line` erhalten) sowie die drei Fußzeilentexte Zahlung/Hinweis/Dank.
5. **Der Nummernkreis** – Präfix-Feld plus Anzeige der nächsten Nummer mit separatem
   „Ändern"-Vorgang (`onNummernkreis`/`setzeNaechsteRechnungsnummer()`), bewusst getrennt vom
   übrigen Formular.

Das restliche Formular speichert erst auf Knopfdruck („Briefkopf speichern“,
`speichereBetrieb()`), nicht sofort bei jeder Eingabe wie das Terminraster – eine halb
eingetippte IBAN soll nie eine Sekunde lang die gültige sein.

## Berechtigung `rechnungen`

Eigener Bereich in der Rechtematrix (`RECHTE_VORGABE`, siehe
`docs/berechtigungen-und-rollen.md`), Vorgabe: Admin **L S**, Techniker **–**, Nutzer **–**.
Es gibt keine Löschstufe (`X`) in diesem Bereich, weil die Datenbank ohnehin kein Löschen
zulässt.

Ohne `rechnungen.lesen` bleibt der Reiter „Rechnungen“ verborgen (`canView("rechnungen")` in
`app/page.tsx`) und im Auftragsfenster erscheint kein Knopf, der das Rechnungsfenster öffnet
(`darf("rechnungen", "lesen")`) – ein sichtbarer Knopf, der dann doch nichts anzeigen dürfte,
wäre eine Behauptung.

Ohne `rechnungen.schreiben` ist der Knopf „Rechnung ausstellen“ deaktiviert
(`darfSchreiben` in `RechnungModal`), ebenso „Stornieren“. Die Berechtigung wird zusätzlich in
der Datenbank über die RLS-Policies auf `rechnungen` durchgesetzt – ein deaktivierter Knopf
allein wäre nur eine Bitte.

Ein Techniker sieht mit dieser Vorgabe keine Rechnungen und kann keine ausstellen, unabhängig
davon, ob er den zugehörigen Auftrag sehen darf.

## Fallstricke

- **Den Nummernkreis von Hand verschieben, ohne die tatsächlich vergebenen Nummern zu prüfen.**
  Der Wert in der Betriebsdaten-Maske ist die *nächste* Nummer, nicht die letzte vergebene. Ein
  falsch gesetzter Wert erzeugt entweder eine doppelt vergebene Nummer (bekommt man
  nachträglich nicht mehr auseinander) oder eine übersprungene, die bei der nächsten Prüfung
  erklärt werden muss.
- **Den Snapshot für „aktuell genug“ halten.** Wer versucht ist, `empfaenger`/`absender` aus
  einer bereits ausgestellten Rechnung nachträglich mit frischen Stammdaten zu überschreiben
  (etwa per direktem SQL), bricht den ganzen Beleg-Gedanken – und `rechnung_unveraenderlich()`
  lehnt es ohnehin ab.
- **Eine Update- oder Delete-Funktion in `lib/api/rechnungen.ts` ergänzen wollen.** Es gibt sie
  absichtlich nicht; jeder Versuch scheitert am Trigger, aber schon der Versuch, ihn zu
  umgehen, ist ein Zeichen, dass die eigentliche Absicht ein Storno ist.
- **`RECHNUNG_SEITE_CSS` fest in `globals.css` verschieben.** Eine globale `@page`-Regel gilt
  für das ganze Dokument und würde mit dem Etikettendruck (50 × 30 mm) kollidieren. Sie gehört
  ausschließlich in den `<style>`-Block der Rechnungsfenster.
- **Die Seitenränder der Rechnung über `.rechnungsseite { padding }` statt über `@page`
  einstellen.** Padding wirkt beim Druck nur auf Seite 1; bei mehrseitigen Rechnungen rutscht
  der Inhalt auf Folgeseiten an den Blattrand (siehe Abschnitt „Druck und A4-Layout“).
- **Die Vorschau-Skalierung über eine kleinere Schrift statt über `transform: scale()` lösen.**
  Das würde Bildschirm und Ausdruck zu zwei verschiedenen Layouts machen, deren Unterschied man
  erst beim Kunden bemerkt.
- **`net_price` als Einzelpreis in der Rechnungszeile behandeln, wenn `endpreis_netto` gesetzt
  ist.** `endpreis_netto` gilt für die ganze Position, nicht je Stück; der naive Einzelpreis
  wäre bei Menge > 1 falsch. `positionenAusAuftrag()` kapselt genau das.
- **Den Freitext-Haken über den Artikelnamen erkennen wollen** (z. B. „wenn short_name
  'Sonstiges' enthält“) statt über `articles.freitext`. Bricht beim ersten Umbenennen des
  Artikels, ohne dass es auffällt.
- **`mailtoRechnung()` für einen echten Versand halten.** Der Link öffnet nur das
  Mail-Programm des Nutzers; ohne manuell angehängtes PDF verschickt er nichts.
- **Vergessen, dass `rechnung_erstellt_am` sich nicht mehr von Hand zurücknehmen lässt,
  sobald eine gültige Rechnung existiert.** Der Trigger lehnt das ab und verweist auf die
  Stornorechnung als einzigen Weg.

## Verwandte Dateien

- `lib/rechnung.ts` – reine Berechnungs- und Aufbaulogik, ohne Datenbank und ohne React.
- `lib/api/rechnungen.ts` – die beiden schreibenden Datenbankzugriffe (Ausstellen, Stornieren).
- `lib/api/betrieb.ts` – Betriebsdaten laden/speichern, Nummernkreis von Hand setzen.
- `components/rechnungen/RechnungDokument.tsx` – das gedruckte/angezeigte Dokument.
- `components/rechnungen/RechnungModal.tsx` – Rechnungsfenster am Auftrag (Entwurf, Ausstellen,
  Stornieren).
- `components/rechnungen/RechnungenPanel.tsx` – das Rechnungsbuch (Reiter „Rechnungen“).
- `components/admin/BetriebsdatenPanel.tsx` – Briefkopf-, Bank-, Logo- und Nummernkreis-Maske.
- `components/auftraege/ArticleAssignPanel.tsx` – Positionszuordnung inkl. Endpreis und
  Rechnungstext am Auftrag.
- `supabase/migrations/48_rechnungen.sql`, `49_rechnung_am_auftrag.sql`, `50_freitext_position.sql` –
  die zugehörigen Migrationen.
