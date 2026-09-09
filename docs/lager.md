# Lager-Modul

Eigener Top-Level-Tab `tab === "lager"`: zweistufige Navigation wie ein eigenes Modul –
erst Kartenübersicht aller Lager mit Auslastungsbalken und Lageradresse (`LagerPanel`,
Ebene 1), dann nach Klick auf ein Lager (Breadcrumb "Lager › {Name}") die Lagerplätze als
Karten-Grid mit Belegt/Frei-Status (Ebene 2). Klick auf einen Lagerplatz öffnet
`TireAssignModal`: Kunde+DOT-Datum+Profiltiefe zuordnen/ändern/entfernen, plus **Historie**
des Lagerplatzes (frühere Einlagerungen, Migration 06 – Entfernen ist ein Soft-Delete über
`tire_storage.removed_at`, nicht `delete`).

**Lager-Einstellungen**: Beim Anlegen eines neuen Lagers können direkt Name, Lageradresse
(Migration 08, `warehouses.address`) und Notiz hinterlegt sowie die Lagerplätze über eine
Nummerierungslogik (Präfix + Von/Bis-Nummer + Stellenanzahl, z. B. `A` 1–20 zweistellig →
`A-01` … `A-20`, `buildSlotCodes()`/`SlotNumberingFields` in `app/page.tsx`) in einem Zug
erzeugt werden, statt hinterher einzeln. Ein bestehendes Lager lässt sich über
"Lager bearbeiten" (Ebene 2) nachträglich umbenennen/Adresse+Notiz ändern
(`updateWarehouse`), und über "+ Mehrere Lagerplätze nach Nummerierung anlegen" lassen sich
jederzeit weitere Plätze nach demselben Schema nachrüsten (`addStorageSlotsBulk`).

Berechtigungen für dieses Modul sind am feinsten granular geregelt, siehe
`berechtigungen-und-rollen.md` (`action.lager.*`-Schlüssel). Seit Migration 16 werden sie auch
in der Datenbank durchgesetzt und nicht mehr nur als ausgeblendeter Knopf – vorher konnte
jeder eingeloggte Account per direktem API-Aufruf Lager und Lagerplätze anlegen und löschen.

**Ein Lagerplatz hat höchstens eine aktive Belegung** (Migration 15, partieller Unique-Index
auf `tire_storage(storage_slot_id) where removed_at is null`). Vorher war das nur eine Annahme
der Oberfläche: zwei parallele Zuordnungen erzeugten zwei aktive Zeilen, und welche angezeigt
wurde, war Zufall. Seit Migration 18 muss außerdem ein Lagerplatz-Code innerhalb eines Lagers
eindeutig sein.

---

## QR-Aufkleber am Regal (Migration 22)

Jeder Lagerplatz kann einen Aufkleber bekommen, der genau auf ihn zeigt.

- **Einzeln**: der 🏷-Knopf auf der Lagerplatz-Karte, für den Nachdruck eines abgerissenen
  Aufklebers.
- **Alle auf einmal**: „Aufkleber für alle N Lagerplätze drucken" über dem Karten-Grid, für die
  Erstausstattung eines Lagers.

Beides öffnet denselben Druckbogen (`LagerplatzAufkleber`); der Unterschied ist allein die Länge
der übergebenen Liste. Gedruckt wird über die Druckfunktion des Browsers – kein PDF-Erzeuger im
Paketumfang: das Ergebnis wäre dasselbe Blatt Papier, nur mit einer weiteren Abhängigkeit und
ohne die Vorschau, in der man Ränder und Skalierung im Druckdialog noch geradeziehen kann. Die
Druckansicht steckt in `@media print` in `globals.css` und blendet über `visibility` alles außer
dem Bogen aus.

### Was im Code steht: ein Link, keine Zeichenkette

Auf dem Aufkleber steht `https://‹diese Umgebung›/?lagerplatz=‹storage_slots.id›`
(`lib/lagerplatzCode.ts`). Der Unterschied zu einer bloßen Kennung ist im Alltag der ganze
Punkt: **der Aufkleber funktioniert auch mit der normalen Handy-Kamera** – draufhalten, auf die
Einblendung tippen, die App öffnet sich an diesem Lagerplatz. Stünde dort nur `a1b2c3…`, zeigte
die Kamera-App kryptischen Text und der Aufkleber wäre außerhalb dieser App wertlos.

Die Basisadresse kommt aus `window.location.origin`, nicht aus einer Konstante: aus einer
Testumgebung gedruckte Aufkleber zeigen dann auch dorthin, statt still auf die Produktivadresse
zu verweisen.

Als Kennung dient die vorhandene `storage_slots.id`. Bewusst **keine** zweite, kürzere Kennung –
die müsste erzeugt, auf Eindeutigkeit geprüft und mit der Id synchron gehalten werden: drei
Fehlerquellen für ein paar gesparte Zeichen im QR-Bild. Und es ist kein Geheimnis, das am Regal
klebt: wer den Link ohne Anmeldung öffnet, sieht nichts, dafür sorgt unverändert die
Row-Level-Security.

`lagerplatzIdAusCode()` liest die Kennung zurück und nimmt dabei bewusst mehr an als die eigene
Adresszeile (Link aus einer anderen Umgebung, abgetippte nackte Kennung), weist aber alles
andere ab – im Lager hängen auch Paketaufkleber und Reifenetiketten mit Codes herum. Die Fälle
stehen als Tests in `tests/lagerplatzCode.test.ts`.

---

## Einlagerung am Auftrag (Migration 22)

Bis hierher kannte das Lager nur zwei Beteiligte: einen Lagerplatz und einen Kunden. **Warum**
die Reifen dort liegen, stand nirgends – damit ließ sich weder eine Einlagerung abrechnen noch
nachvollziehen, welcher Arbeitsgang sie ausgelöst hat, und der Techniker vor Ort hatte aus dem
Auftrag heraus keinen Weg ins Regal.

`tire_storage.order_id` schließt die Lücke. Im Auftragsfenster gibt es dafür einen eigenen Block
(`EinlagerungBlock`), direkt hinter den Leistungen:

| | |
|---|---|
| **Manuell** | Auswahlliste der freien Lagerplätze (Code · Lager) |
| **Per Scan** | „Lagerplatz scannen" öffnet die Kamera, der Aufkleber am Regal wird abgelesen |

Der Scan ist nicht Bequemlichkeit, sondern Fehlervermeidung: eine Liste mit hundert
Lagerplätzen auf einem Handy, während man mit Reifen in der Hand vor dem Regal steht, ist die
zuverlässigste Art, A-12 statt A-21 zu treffen.

Ein bereits belegter Platz erscheint nicht in der Auswahl, und ein Scan darauf wird mit Namen
abgelehnt („Lagerplatz A-12 ist bereits belegt."). Wird ein Auftrag einem anderen Platz
zugeordnet, zieht die vorhandene Einlagerung um, statt dass eine zweite entsteht – sonst blieben
zwei Plätze belegt, von denen einer niemandem gehört.

### Wann ein Lagerplatz Pflicht ist

Am **Artikel**, nicht am Auftrag und nicht an einem Namen im Code: `articles.braucht_lagerplatz`
ist ein Haken in den Artikelstammdaten. Steht eine so gekennzeichnete Leistung im Auftrag,
**lässt die Datenbank den Abschluss nicht zu**, solange kein Lagerplatz belegt ist – der
erweiterte Statuswechsel-Trigger aus Migration 22 prüft das, nicht die Oberfläche. Der Hinweis
im Auftragsfenster zeigt nur an, was dort ohnehin erzwungen wird; ein Hinweis ohne Regel in der
Datenbank wäre eine Bitte, keine Zusicherung.

Warum das Kennzeichen am Artikel hängt: kommt morgen „Felgen einlagern" oder „Dachbox" dazu,
wird ein Haken gesetzt statt Code geändert. Ein Vergleich auf den Artikelnamen
„Reifeneinlagerung" wäre beim ersten Umbenennen still kaputt – und still kaputte Prüfungen sind
schlimmer als keine.

Beim Stornieren wird **nicht** geprüft: ein stornierter Auftrag wurde ja gerade nicht ausgeführt.

### Der Scanner

`components/QrScanner.tsx`, zwei Wege, weil es keinen gibt, der überall funktioniert:

1. `BarcodeDetector` – im Browser eingebaut (Android/Chrome, Chrome/Edge am Rechner). Nichts
   nachzuladen, sehr schnell.
2. `jsqr` – kleine Bibliothek, wertet ein einzelnes Kamerabild aus. Der Weg für iPhones: Safari
   kennt `BarcodeDetector` nicht.

Die Bibliothek wird **erst beim Scannen nachgeladen** (`await import`) und nur dort, wo der
eingebaute Weg fehlt. Wer nie scannt, lädt sie nie.

Beides braucht eine verschlüsselte Verbindung – Browser geben die Kamera über `http` nicht
frei. Auf Vercel ist das gegeben; lokal über `http` erscheint eine Meldung statt eines stummen
schwarzen Bildes. Kein Kamerazugriff, kein Gerät, abgelehnte Erlaubnis: jeder Fall hat seine
eigene Meldung, und der Lagerplatz lässt sich immer noch aus der Liste wählen.

### Aufruf über den Aufkleber

`?lagerplatz=‹Kennung›` wird in `app/page.tsx` einmal beim Start aus der Adresszeile gelesen,
danach wird die Adresszeile **sofort bereinigt** (`history.replaceState`) – sonst landet der
Parameter in Lesezeichen und im Verlauf, und ein Neuladen springt Wochen später wieder auf
denselben Lagerplatz. Das Lager-Modul schlägt daraufhin das richtige Lager auf und öffnet den
Platz (`springeZuLagerplatzId`).

Gelesen wird über `window.location` statt `useSearchParams()`: dieser Baum ist vollständig auf
dem Client zuhause, und `useSearchParams` verlangte in Next 14 eine Suspense-Grenze und machte
die Seite dynamisch – Aufwand ohne Gegenwert für einen einzelnen Parameter.
