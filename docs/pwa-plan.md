# PWA-Ausbau: Plan und offene Fragen

Stand 09.09.2026. **Stufe 1, 2 und 3 sind umgesetzt.** Stufe 4 (offline schreiben) nicht.

Die Datenschutzfrage aus diesem Dokument – dürfen Kundendaten dauerhaft auf den Mobilgeräten
liegen? – wurde am 09.09.2026 vom Nutzer mit **ja** beantwortet. Damit war Stufe 3 frei.

## Ausgangslage

Was schon passt:

* Die Anwendung ist bereits eine Einzelseiten-Anwendung mit eigener Handy-Ansicht
  (Navigationsleiste unten, Karte als Vollbild) – das ist der Teil, der an einer PWA meist
  die meiste Arbeit macht.
* Läuft über HTTPS auf Vercel. Pflichtvoraussetzung für Service Worker.
* TanStack Query hält die geladenen Bestände bereits im Arbeitsspeicher vor. Für „offline
  lesen" muss dieser Zwischenspeicher nur noch dauerhaft abgelegt werden – die Struktur dafür
  ist da.

Was fehlt:

* Kein `public/`-Verzeichnis, kein `manifest.webmanifest`, keine App-Symbole in PNG.
* Kein Service Worker. Ohne ihn kein Offline-Betrieb und kein Start ohne Netz.
* Keine `theme-color`-Angabe, kein `apple-touch-icon`, kein `display: standalone`.

Konkret heißt das: Wer die Seite heute auf den Home-Bildschirm legt, bekommt eine
Verknüpfung, die Safari mit Adressleiste öffnet – keine App.

## Was eine PWA hier bringt – und was nicht

Bringt:

* Eigenes Symbol auf dem Home-Bildschirm, Start ohne Adressleiste, ganzer Bildschirm.
* Schnellerer Start (Programmcode liegt lokal statt bei jedem Aufruf im Netz).
* Auf iOS wichtig: Daten einer installierten Web-App werden **nicht** nach sieben Tagen
  Nichtnutzung gelöscht, anders als bei einer normalen Safari-Seite. Die Anmeldung hält
  dadurch länger.
* Mit Stufe 3/4: Arbeiten in Kellern, Tiefgaragen und Funklöchern.

Bringt **nicht**:

* Keinen Eintrag im App Store, kein Symbol in der Anwendungsübersicht des iPhones außer über
  „Zum Home-Bildschirm".
* Keine automatische Installationsaufforderung auf iOS. Android/Chrome zeigt eine, Safari
  nicht – dort muss man den Weg über „Teilen → Zum Home-Bildschirm" einmal erklären.

## Die Stufen

Jede Stufe ist für sich nutzbar und kann Wochen später fortgesetzt werden.

### Stufe 1 – Installierbar (klein, risikoarm) — UMGESETZT 07.09.2026

`manifest.webmanifest` mit Name, Symbolen (192/512 px PNG, aus der vorhandenen Bildmarke
erzeugt), `display: standalone`, Startadresse, Hintergrund- und Themenfarbe. Dazu
`apple-touch-icon`, `theme-color` und die Behandlung des unteren Bereichs auf randlosen
iPhones (`viewport-fit=cover` plus `env(safe-area-inset-bottom)` an der Navigationsleiste –
ohne das klebt sie an der Home-Leiste).

Ergebnis: eigenes Symbol, Vollbild, kein Safari-Rahmen. **Noch kein Offline-Betrieb.**

Aufwand: gering. Risiko: gering.

### Stufe 2 – Service Worker für die Programmhülle — UMGESETZT 07.09.2026

Ein Service Worker legt Programmcode, Stilblatt und Schriften lokal ab. Die App startet dann
auch ohne Netz – zeigt aber ohne Netz noch keine Daten, sondern einen sauberen Hinweis statt
einer Fehlerseite.

Zu klären ist hier die Aktualisierung: Ein Service Worker liefert standardmäßig die alte
Fassung weiter, bis alle Fenster geschlossen wurden. Ohne bewusste Regelung sitzt jemand
wochenlang auf einer veralteten Version. Vorschlag: neue Fassung im Hintergrund laden und
einen kleinen Balken „Neue Version verfügbar – neu laden" einblenden.

Aufwand: mittel. Risiko: mittel – ein falsch eingestellter Service Worker ist der klassische
Fall von „bei mir ist die App kaputt und ein Neuladen hilft nicht".

### Stufe 3 – Daten offline lesen — UMGESETZT 09.09.2026

Der TanStack-Query-Zwischenspeicher wird in IndexedDB gespiegelt. Beim Start ohne Netz zeigt
die App den letzten bekannten Stand mit einem deutlichen Hinweis „Stand von heute 08:14 –
offline". Kunden, Aufträge, Artikel, Lagerplätze.

Offene technische Frage: die Karte. Die Kartenkacheln kommen von einem fremden Server; ohne
Netz ist die Karte leer. Kacheln auf Vorrat herunterzuladen ist bei den freien
OpenStreetMap-Servern nicht ohne Weiteres zulässig – das wäre vor einer Offline-Karte zu
prüfen oder über einen bezahlten Kachel-Dienst zu lösen. Zwischenlösung: die Kundenliste
funktioniert offline, die Karte zeigt einen Hinweis.

Aufwand: mittel. Risiko: gering, solange nur gelesen wird.

### Stufe 4 – Offline schreiben (offen, die eigentliche Arbeit)

Änderungen ohne Netz landen in einer lokalen Warteschlange und werden nachgereicht, sobald
das Netz wieder da ist. Das ist kein Zwischenspeicher-Thema mehr, sondern eine
Datenmodell-Frage:

* **Identifikatoren**: Ein offline angelegter Auftrag braucht eine Kennung, bevor die
  Datenbank eine vergeben kann. Auftragsnummern werden heute serverseitig vergeben – offline
  angelegte Aufträge bekämen ihre Nummer erst beim Hochladen.
* **Konflikte**: Zwei Techniker ändern denselben Auftrag, einer offline. Wer gewinnt? „Der
  Letzte gewinnt" ist die einfache Antwort und verliert stillschweigend Daten. Sauberer:
  Konflikt erkennen und den Nutzer entscheiden lassen.
* **Reihenfolge**: „Auftrag anlegen" und „Leistung zum Auftrag" müssen in dieser Reihenfolge
  ankommen.
* **Sichtbarkeit**: Der Nutzer muss jederzeit sehen, was noch nicht übertragen ist – sonst
  glaubt er, es sei gespeichert.

Aufwand: hoch, deutlich höher als Stufen 1–3 zusammen. Risiko: hoch, weil hier echte Daten
verloren gehen können.

### Optional – Push-Benachrichtigungen

Auf iOS erst ab Version 16.4 und **nur**, wenn die App auf dem Home-Bildschirm installiert
ist. Braucht außerdem einen Server, der die Nachrichten verschickt. Sinnvoll nur, wenn es
einen echten Anlass gibt („dir wurde ein Auftrag für morgen zugewiesen").

## Was am 07.09.2026 gebaut wurde

| Datei | Zweck |
|---|---|
| `public/manifest.webmanifest` | Name, Symbole, Startadresse, `display: standalone`, Farben |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | App-Symbole; die maskierbare Fassung sitzt kleiner im Feld, weil Android bis zu 20 % am Rand wegschneidet |
| `public/apple-touch-icon.png` | 180 px. iOS liest die Symbole NICHT aus dem Manifest – ohne diese Datei nimmt es einen Bildschirmausschnitt der Seite als Symbol |
| `public/sw.js` | Service Worker |
| `public/offline.html` | Letzter Ausweg ohne Netz; enthält bewusst keine externen Schriften, Bilder oder Skripte |
| `components/PwaBereit.tsx` | Meldet den Worker an, zeigt den Balken „Neue Version verfügbar" |
| `app/layout.tsx` | Manifest-Verweis, `appleWebApp`, `viewport`-Export mit `viewport-fit: cover` und `theme-color` |
| `app/globals.css` | Sicherer Bereich unten, Gestaltung des Hinweisbalkens |
| `middleware.ts` | Ausnahmen für die PWA-Dateien |

Vier Dinge, die dabei nicht offensichtlich sind und beim nächsten Anfassen Zeit sparen:

**Die Middleware muss die PWA-Dateien durchlassen.** Ihr Muster erfasste vorher jeden Pfad
außer `_next/static`. Damit hätte `/sw.js` für einen nicht angemeldeten Browser eine Umleitung
zur Anmeldeseite geliefert – der Browser lehnt die Anmeldung eines Service Workers dann ab,
und zwar ohne sichtbare Fehlermeldung. Dasselbe gilt für Manifest, Symbole und ausgerechnet
die Offline-Seite. Die Ausnahmen stehen jetzt im Muster; wer eine PWA-Datei hinzufügt, trägt
sie dort ein.

**`viewport-fit: cover` verlangt eine Gegenleistung.** Die installierte App läuft bis an die
Bildschirmkanten, also auch unter die Home-Anzeige des iPhones. Die Rasterzeile der unteren
Navigationsleiste ist deshalb `calc(58px + env(safe-area-inset-bottom, 0px))` hoch, und
Karte, Kartenknopf und Kurzmeldung rechnen denselben Zuschlag mit. Ohne Aussparung ist
`env(...)` gleich 0 – am Desktop ändert sich dadurch nichts.

**Der Zwischenspeicher enthält ausschließlich Programmcode.** Der Service Worker greift
gezielt drei Dinge ab: `/_next/static/`, die eigenen Symbole samt Manifest, und die
Google-Schriften. Alles andere – Supabase, `/api/`, Kartenkacheln – geht unberührt ans Netz.
Deshalb liegt kein Kundenname und keine Adresse dauerhaft auf dem Gerät, und deshalb kam
Stufe 2 ohne Anpassung der technisch-organisatorischen Maßnahmen aus. Wer dort Datenabfragen
aufnimmt, verlässt diese Zusage – das ist dann Stufe 3.

**Bei jeder Änderung an `public/sw.js` die Konstante `FASSUNG` hochzählen.** Sie bildet den
Namen des Zwischenspeichers; ein neuer Name wirft beim Aktivieren die alten Bestände weg.
Ohne das Hochzählen behalten Geräte alte Programmteile.

## Stufe 3 im Einzelnen (09.09.2026)

Der Zwischenspeicher von TanStack Query wird in die IndexedDB des Browsers gespiegelt
(`app/providers.tsx`, `PersistQueryClientProvider` mit einem asynchronen Speicher über
`idb-keyval`). Beim Start ohne Netz stehen Kunden, Aufträge, Fahrzeuge, Artikel und
Lagerdaten in dem Stand da, in dem sie zuletzt geladen wurden.

**Drei Schutzmaßnahmen gehören dazu und dürfen nicht einzeln entfernt werden:**

1. **Höchstalter sieben Tage.** Danach wird der Bestand verworfen statt angezeigt. Ein Monate
   alter Stand ist gefährlicher als gar keiner.
2. **Löschen beim Abmelden.** `datenSpeicherLeeren()` in `handleLogout`. Ohne das läge der
   Kundenbestand des Vorgängers auf einem weitergegebenen oder verlorenen Gerät weiter herum.
3. **Schemakennung.** Ändert sich die Form der Daten, wird der alte Bestand verworfen, statt
   ihn in eine Oberfläche zu laden, die ihn nicht mehr versteht. Bei jeder Änderung an der
   Datenform hochzählen – gleiche Regel wie `FASSUNG` in `public/sw.js`.

Dazu zwei Dinge, die ohne sie nicht funktioniert hätten:

**`gcTime` muss mindestens so lang sein wie das Höchstalter.** Voreingestellt wirft der
Zwischenspeicher einen Bestand nach fünf Minuten weg; ein so verworfener Bestand wird beim
nächsten Start gar nicht erst wiederhergestellt. Der Wert steht deshalb an derselben
Konstante wie das Höchstalter.

**Die Anmeldung darf ohne Netz nicht abbrechen.** `supabase.auth.getUser()` fragt beim Server
nach und schlägt ohne Netz fehl – die Anwendung sprang daraufhin zur Anmeldeseite, die ohne
Netz niemand ausfüllen kann. Jetzt fällt sie auf `getSession()` zurück, das die gespeicherte
Sitzung ohne Netzzugriff liest. Auch Rolle und Einstellungen dürfen fehlen: ohne Rolle gilt
die geringste Berechtigung, für die Einstellungen greifen die Voreinstellungen. Die Datenbank
prüft Berechtigungen bei jedem Schreibzugriff ohnehin selbst (Row-Level-Security).

**Was offline sichtbar ist und was nicht:** Kundenliste, Aufträge, Termine und die Nadeln auf
der Karte kommen aus dem gespeicherten Stand. **Der Kartenhintergrund fehlt** – die Kacheln
liegen bei OpenStreetMap und dürfen nicht auf Vorrat heruntergeladen werden. Ein Balken am
unteren Rand nennt dazu immer den Stand („Offline – Stand von 08:14 Uhr"), damit niemand alte
Daten für aktuelle hält.

**Was weiterhin nicht geht: schreiben.** Änderungen ohne Netz schlagen fehl. Das ist Stufe 4
und ein eigenes Vorhaben (Warteschlange, Konflikte, Auftragsnummern).

## Der Weg zur Installation steht in den Einstellungen

Einstellungen → Block **„App installieren"** (`components/PwaInstallieren.tsx`). Er zeigt nicht
überall dasselbe, sondern das, was auf dem jeweiligen Gerät tatsächlich möglich ist:

| Lage | Was der Block zeigt |
|---|---|
| läuft schon als App | Hinweis, dass nichts zu tun ist |
| Chrome/Edge, Angebot liegt vor | Knopf „App installieren" – ein Tippen genügt |
| iPhone/iPad in Safari | die vier Schritte über „Teilen → Zum Home-Bildschirm" |
| iPhone/iPad in Chrome/Firefox/Edge | Warnhinweis, dass **nur Safari** das kann, plus Adresse und Schritte |
| sonstiger Browser ohne Angebot | Menüweg (drei Punkte → installieren) |

Zwei Fallstricke, die dabei gelöst sind:

**`beforeinstallprompt` feuert genau einmal und früh** – meist bevor jemand die Einstellungen
öffnet. Wer erst dort zuhört, verpasst es und der Knopf bliebe für immer wirkungslos. Deshalb
hört `components/PwaBereit.tsx` im Grundgerüst ab dem ersten Rendern zu und legt das Ereignis
in `lib/pwaInstallation.ts` ab; der Knopf holt es sich von dort. Die Aufforderung ist zudem
EINWEG – nach `prompt()` ist sie verbraucht und wird verworfen.

**Apple erlaubt keinen Installationsknopf.** Auf iOS gibt es keine Programmierschnittstelle
dafür, nur den Weg von Hand über das Teilen-Menü. Und dort kann es ausschließlich Safari:
Chrome, Firefox und Edge laufen auf dem iPhone zwar auf Safaris Unterbau, bieten „Zum
Home-Bildschirm" aber nicht an. Erkannt wird das am Kürzel in der Browserkennung
(`CriOS`/`FxiOS`/`EdgiOS`/`OPiOS`); iPadOS ab 13 meldet sich als Mac und wird über die Zahl der
Berührungspunkte auseinandergehalten.

## So wird geprüft, ob es wirkt

1. Einstellungen öffnen. Erwartet: der Block „App installieren" mit der zum Gerät passenden
   Anleitung – am iPhone die vier Schritte, in Chrome ein Knopf.
2. Seite in Safari öffnen, „Teilen → Zum Home-Bildschirm". Erwartet: das PinPoints-Symbol,
   nicht ein Bildschirmausschnitt.
3. Aus dem Home-Bildschirm starten. Erwartet: kein Safari-Rahmen, keine Adressleiste. **Die
   Anmeldung ist einmalig neu fällig** – eine installierte Web-App hat auf iOS einen eigenen
   Datenbereich und erbt die Safari-Sitzung nicht.
4. Untere Navigationsleiste ansehen. Erwartet: sie klebt nicht an der Home-Anzeige.
5. Flugmodus einschalten, App starten. Erwartet: die zuletzt gesehene Hülle oder die Seite
   „Keine Verbindung" – auf keinen Fall die Fehlerseite des Browsers.
6. Der Balken „Neue Version verfügbar" erscheint **nur, wenn sich `public/sw.js` selbst
   geändert hat** – nicht bei jedem Deploy. Das ist kein Fehler: Seiten werden netz-zuerst
   ausgeliefert und die Programmteile tragen eine Prüfsumme im Dateinamen, mit Netz ist die
   App nach einem Neuladen also ohnehin immer aktuell. Der Balken ist für den Sonderfall da,
   dass sich der Service Worker selbst ändert – dann übernimmt die neue Fassung erst, wenn
   der Nutzer zustimmt, statt mitten in einer Eingabe.

## Die wichtigsten Fragen – jetzt vor Stufe 3 zu beantworten

**Zweck**

1. Was soll ohne Netz möglich sein? Nur nachschauen (Adresse, Telefonnummer, Termin), oder
   auch arbeiten (Auftrag abschließen, Leistung erfassen, Foto anhängen)? Davon hängt ab, ob
   Stufe 3 reicht oder Stufe 4 nötig ist – und das ist der größte Unterschied im Aufwand.
2. Wie oft kommt „kein Netz" im Alltag wirklich vor? Ein Reifenwechsel in einer Tiefgarage ist
   ein anderer Fall als ein kurzer Funkloch-Moment auf der Fahrt.

**Datenschutz und Sicherheit** – das ist die Frage mit der längsten Vorlaufzeit

3. Dürfen Kundendaten (Namen, Adressen, Telefonnummern) dauerhaft auf den Mobilgeräten der
   Mitarbeiter liegen? Genau das tut ein Offline-Zwischenspeicher. Heute liegen die Daten nur
   flüchtig im Arbeitsspeicher des Browsers – das ist ein anderer Sachverhalt als eine
   dauerhafte lokale Kopie.
4. Was passiert bei Geräteverlust? Braucht es eine Höchstdauer für den lokalen Bestand, ein
   Löschen beim Abmelden, eine Geräteverschlüsselungs-Pflicht?
5. Sind die technisch-organisatorischen Maßnahmen anzupassen? Meine Einschätzung: Stufe 1 und
   2 nicht (dort liegt nur Programmcode lokal), ab Stufe 3 ja.

**Geräte und Betrieb**

6. Welche Geräte und iOS-Versionen sind im Einsatz? Push braucht 16.4+; der QR-Scanner nutzt
   die Kamera, und die funktionierte in installierten Web-Apps auf älteren iOS-Fassungen
   nicht – das ist vor dem Umstieg auf einem echten Gerät zu prüfen.
7. Nach der Installation ist eine erneute Anmeldung nötig: eine installierte Web-App hat auf
   iOS einen eigenen Datenbereich und erbt die Safari-Sitzung nicht. Wer erklärt den
   Mitarbeitern die Installation?
8. Wie soll die Aktualisierung ablaufen – Hinweisbalken zum Neuladen, oder stillschweigend
   beim nächsten Start?

**Technik**

9. Service Worker selbst schreiben oder ein Paket nehmen (Serwist, Nachfolger von next-pwa)?
   Ein Paket nimmt Arbeit ab und bringt eine weitere Abhängigkeit ins Projekt. Für Stufe 2
   allein reicht ein handgeschriebener Service Worker von etwa 60 Zeilen.
10. Soll die Karte offline nutzbar sein? Wenn ja, ist die Kachelfrage (siehe Stufe 3) vorab zu
    klären – notfalls mit einem bezahlten Anbieter.

## Empfehlung

Stufe 1 sofort: kleiner Aufwand, sofort sichtbarer Nutzen, keine Datenschutzfrage. Stufe 2
direkt hinterher, mit sauberem Aktualisierungshinweis.

Stufe 3 und 4 erst, wenn Frage 1 und die Fragen 3 bis 5 beantwortet sind. Stufe 4 ist ein
eigenes Vorhaben in der Größenordnung der bisherigen Phase 5 – nicht etwas, das man
nebenher mitnimmt.

## Wann die installierte App neu lädt (Korrektur vom 09.09.2026)

Beobachtet: Am Rechner standen neue Aufträge, das iPhone zeigte stundenlang den Vormittagsstand.

Ursache: `refetchOnWindowFocus` stand auf `false` – aus dem guten Vorsatz, im Außendienst
Daten zu sparen. Der Vorsatz übersah, wie eine installierte App benutzt wird: Sie wird nie
geschlossen, sondern weggelegt und wieder hervorgeholt. Ohne Neuladen beim Hervorholen gibt es
damit keinen Anlass mehr, überhaupt jemals neu zu laden.

Jetzt: `refetchOnWindowFocus: true`, begrenzt durch `staleTime` von einer Minute
(`lib/queries/hooks.ts`) – also höchstens ein Abruf pro Minute, und nur für die gerade
sichtbaren Listen. Zusätzlich steht in den Einstellungen neben dem Stand ein Knopf
„Jetzt aktualisieren".

**Wichtig für das Verständnis:** Der Zwischenspeicher betrifft nur, was dieses Gerät ANZEIGT.
Terminerinnerungen verschickt der Server aus der Datenbank – ein Handy mit altem Stand bekommt
sie trotzdem.
