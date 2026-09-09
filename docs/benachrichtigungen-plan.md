# Terminerinnerung als Push-Benachrichtigung – Plan

Stand 09.09.2026. **Alle fünf Teile sind gebaut** – Geräteanmeldung, Empfängerauswahl,
Zeitgeber, Versand und der Sprung ins Kundenfenster. Der Vortest („Testnachricht an mich")
hat gezeigt, dass Meldungen auf dem iPhone ankommen; die Prüfung bei gesperrtem Bildschirm und
im Fokus „Fahren" steht noch aus – siehe „Vortest" am Ende. Was zum Scharfschalten noch von
Hand passieren muss, steht unter „Einrichtung der Terminerinnerung".

## Das Ziel

Fünf Minuten vor einem Termin bekommt der zugeordnete Techniker eine Benachrichtigung auf
dem Sperrbildschirm. Ein Tippen öffnet nicht die App-Startseite, sondern direkt das
Kundenfenster – mit Anruf- und Navigationsknopf in Reichweite. Der Techniker sitzt im Auto;
jeder zusätzliche Schritt ist einer zu viel.

## Wie es funktioniert – fünf Teile

**1. Anmeldung des Geräts (gebaut).** In den Einstellungen ein Schalter „Terminerinnerungen auf diesem
Gerät". Ein Tippen fragt die Erlaubnis ab (das MUSS aus einer Nutzergeste kommen, sonst
verweigert der Browser) und legt eine Push-Anmeldung an: eine Adresse beim Push-Dienst des
Geräteherstellers plus zwei Schlüssel. Die kommen in eine neue Tabelle `push_geraete`
(profile_id, endpoint, p256dh, auth, Gerätename, angelegt_am). Ein Mensch kann mehrere Geräte
haben, ein Gerät gehört zu genau einem Konto.

**2. Wer wird benachrichtigt (gebaut).** Auftrag → zugeordnete Mitarbeiter (`order_employees`) →
`employees.profile_id` → alle Geräte dieses Kontos. Mitarbeiter ohne verknüpftes Benutzerkonto
bekommen nichts – die Verknüpfung gibt es bereits in der Mitarbeiterverwaltung.

**3. Der Zeitgeber (gebaut: Migration 28).** Ein Vorgang, der jede Minute läuft und fragt: welcher Auftrag beginnt in
fünf Minuten, hat einen zugeordneten Techniker mit angemeldetem Gerät, und wurde noch nicht
gemeldet? Eine zweite Tabelle `push_versand` (order_id, profile_id, gesendet_am) verhindert
Doppelmeldungen – ohne sie schickt ein Zeitgeber, der zweimal in derselben Minute läuft, die
Nachricht zweimal.

**4. Der Versand (gebaut: `app/api/push/senden`).** Eine Route `POST /api/push/senden` in der bestehenden Next.js-Anwendung,
geschützt durch ein geheimes Kopffeld. Sie verschlüsselt und verschickt die Nachrichten über
das Web-Push-Verfahren.

*Bewusst NICHT über Supabase Edge Functions*, obwohl das technisch naheläge: Edge Functions
werden über die Supabase-Kommandozeile veröffentlicht. Für dieses Projekt werden Dateien
einzeln über die GitHub-Oberfläche hochgeladen, eine Kommandozeile steht nicht zur Verfügung.
Eine Next.js-Route wird beim nächsten Deploy einfach mitveröffentlicht.

**5. Der Sprung ins Kundenfenster (gebaut).** Die Nachricht trägt eine Zieladresse mit, z. B.
`/?kunde=‹id›`. Der Service Worker fängt das Antippen ab (`notificationclick`), holt ein
bereits offenes Fenster nach vorn oder öffnet ein neues. Die Anwendung liest den Parameter
beim Start und öffnet das Kundenfenster – exakt das Muster, das für den QR-Aufkleber am
Lagerregal schon existiert (`?lagerplatz=` in `app/page.tsx`), inklusive des Bereinigens der
Adresszeile danach.

## Einrichtung der Terminerinnerung (Stand 09.09.2026)

Der Code ist da; scharf wird die Erinnerung erst durch drei Handgriffe.

1. **Migration 27** (`push_versand`) im SQL-Editor ausführen – die Doppelmeldungssperre.
2. **Ein Geheimnis erzeugen** und an zwei Stellen hinterlegen. Es schützt die Versandroute:
   ohne dieses Kopffeld weist sie jeden Aufruf ab, sonst könnte jeder im Internet Meldungen auf
   fremden Sperrbildschirmen auslösen.
   - bei Vercel als Umgebungsvariable `PUSH_GEHEIMNIS`, danach einmal neu deployen
   - in der Datenbank in `private.push_konfiguration` (Vorlage im Kopf von Migration 28)
3. **Migration 28** ausführen – schaltet `pg_cron`/`pg_net` ein und legt den Minutentakt an.

Prüfen lässt es sich ohne Warten auf einen echten Termin: einen Auftrag auf heute mit einer
Uhrzeit sechs Minuten in der Zukunft anlegen, sich selbst als Mitarbeiter zuordnen (das eigene
Benutzerkonto muss im Admin-Bereich mit diesem Mitarbeiter verknüpft sein) und das Handy
weglegen. Kommt nichts, in dieser Reihenfolge nachsehen:

```sql
select * from cron.job;                                                -- läuft der Auftrag?
select * from cron.job_run_details order by start_time desc limit 20;  -- mit welchem Ergebnis?
select * from net._http_response order by created desc limit 20;       -- was antwortet die Route?
select * from public.push_versand order by gesendet_am desc limit 20;  -- wurde eingetragen?
```

Was die Antwortnummern in `net._http_response` bedeuten:

| Nummer | Bedeutung |
|---|---|
| 200 | Route erreicht. Der Inhalt sagt, was sie getan hat (`faellig`, `erinnerungen`, `gesendet`). |
| 401 | Die beiden Geheimnisse stimmen nicht überein. |
| 404 | Die Route ist noch nicht deployed. |
| 405 | Die Middleware hat umgeleitet – siehe unten. |

**Die 405-Falle (09.09.2026, hat eine Stunde gekostet).** Die Middleware schützt alle Pfade
außer den PWA-Dateien: ohne Sitzung geht es auf `/login`. Der Zeitgeber der Datenbank HAT keine
Sitzung – er ist kein Mensch mit Browser. Also wurde sein Aufruf umgeleitet, und weil eine
Umleitung mit 307 die Methode behält, kam auf der Anmeldeseite ein POST an. Eine Seite kennt
nur GET: Antwort 405. Jede Minute, ohne dass irgendwo ein Fehler zu sehen gewesen wäre – in
der Anwendung sah alles richtig aus, in der Datenbank auch.

Deshalb steht `api/push/senden` seit dem in der Ausnahmeliste des Matchers in `middleware.ts`.
Die Route prüft sich selbst über das Geheimnis im Kopffeld; das ist für einen Aufruf ohne
Mensch die richtige Prüfung. **Merksatz für jede weitere Route, die eine Maschine aufruft:**
Sie muss in die Ausnahmeliste, sonst redet sie mit der Anmeldeseite.

### Zwei Entscheidungen im Versand, die man später sonst nicht mehr versteht

**Antippen öffnet den AUFTRAG, und zwar über eine Nachricht statt über `navigate()`
(09.09.2026 am Gerät gemessen).** Zwei Befunde aus dem ersten echten Durchlauf:

Erstens landete das Antippen im Kundenfenster – geplant war das, richtig ist es nicht. Wer im
Auto sitzt, braucht diesen einen Termin: Fahrzeug, Leistungen, Navigation, Anruf. Die
Kundenakte mit allen Aufträgen der letzten Jahre ist dann ein Umweg. Die Meldung trägt deshalb
`/?auftrag=‹id›`, und das Auftragsfenster hat neben der Navigation jetzt auch einen
Anruf-Knopf.

Zweitens passierte beim Antippen gar nichts: Die App kam dort wieder hoch, wo sie zuletzt war.
Grund ist `client.navigate()` im Service Worker – in der installierten App auf iOS bewirkt es
nichts, und zwar ohne Fehlermeldung. Der Service Worker holt das Fenster jetzt nach vorn und
schickt ihm das Ziel als **Nachricht** (`postMessage`); die Anwendung öffnet daraufhin selbst
das richtige Fenster. Das funktioniert überall, ist schneller und verliert keine halb
ausgefüllte Eingabe. Nur wenn gar kein Fenster offen ist, wird eines mit der Adresse geöffnet –
dann greift derselbe Weg wie beim QR-Aufkleber am Regal.

**Die Sperre gilt je Termin, nicht je Auftrag (Migration 29).** Der erste Entwurf sperrte auf
(Auftrag, Person): einmal gesendet, nie wieder. Beim Testen fällt das sofort auf – man
verschiebt denselben Auftrag und bekommt nichts mehr. Im Betrieb wäre es später und teurer
aufgefallen: Kunde verschiebt von 10:00 auf 14:00, die Erinnerung kam um 09:55, und um 13:55
bleibt es still. Seitdem gehört der Terminzeitpunkt zum Schlüssel – ein verschobener Termin ist
ein neuer Eintrag mit eigener Erinnerung, derselbe Termin bleibt gesperrt, und der Verlauf
bleibt sichtbar.

**Erst eintragen, dann senden – nicht erst prüfen.** Der Versand schreibt zuerst alle Paare
(Auftrag, Person) nach `push_versand` und verschickt danach nur, was dabei wirklich neu
entstanden ist. Der eindeutige Schlüssel entscheidet, nicht eine vorherige Abfrage. Der Weg
„erst nachsehen, ob schon gesendet, dann senden" hat ein Zeitfenster zwischen Nachsehen und
Senden – zwei gleichzeitige Läufe schicken die Meldung darin doppelt.

**Die Uhrzeit am Auftrag ist die Uhr an der Wand.** In der Datenbank steht `HH:MM` ohne
Zeitzone, der Server läuft in UTC. Ohne Umrechnung über `Europe/Berlin` käme die Erinnerung im
Sommer zwei Stunden zu früh – und zwar lautlos, weil nichts abstürzt. Deshalb `ZEITZONE` in
`lib/constants.ts` und die Umrechnung in einer eigenen Funktion.

**Das Fenster ist fünf Minuten breit, nicht eine Minute.** Fällt ein Lauf des Zeitgebers aus,
holt der nächste die Erinnerung nach. Nach hinten ist es zu: eine Erinnerung an einen Termin,
der schon läuft, ist keine mehr. Geprüft in `tests/terminerinnerung.test.ts`.

## Der Zeitgeber: zwei Wege

| | Vercel Cron | Supabase `pg_cron` |
|---|---|---|
| Einrichtung | `vercel.json` im Repository | eine Migration im SQL-Editor |
| Minutentakt | abhängig vom Vercel-Tarif – auf dem kostenlosen Tarif nur täglich | ja |
| Passt zum Arbeitsablauf | Datei hochladen | wie alle bisherigen Änderungen an der Datenbank |

**Empfehlung: `pg_cron` plus `pg_net`.** Der Auftrag steht dann als Migration in
`supabase/migrations/` wie alles andere an der Datenbank, läuft im Minutentakt und ruft die
Versandroute mit dem geheimen Kopffeld auf. Beides sind Erweiterungen, die in Supabase
eingeschaltet werden müssen – ein einmaliger Handgriff in der Oberfläche.

## Was vorher klar sein muss

**iOS lässt Push nur in der installierten App zu.** Ab iOS 16.4, und nur wenn PinPoints über
„Zum Home-Bildschirm" installiert wurde. In Safari als normale Seite kommt keine
Benachrichtigung an – auch nicht, wenn die Seite offen ist. Für die Techniker heißt das:
Installation ist Voraussetzung, nicht Komfort. Der Block „App installieren" in den
Einstellungen ist dafür schon da.

**Der Fahrfokus des iPhones unterdrückt Benachrichtigungen.** Genau in der Situation, für die
das gedacht ist – während der Fahrt – blendet iOS standardmäßig alles aus. PinPoints muss auf
jedem Gerät einmal als erlaubte App im Fokus „Fahren" eingetragen werden, sonst kommt die
Meldung erst beim Anhalten. Das ist eine Einstellung am Gerät, die die Anwendung nicht setzen
kann.

**Termine brauchen eine Uhrzeit.** `orders.time` ist heute optional; Aufträge ohne Uhrzeit
kann niemand fünf Minuten vorher melden. Entweder wird die Uhrzeit für terminierte Aufträge
zur Pflicht, oder Aufträge ohne Uhrzeit bleiben stillschweigend außen vor. Zweites ist
gefährlicher: es sieht aus, als funktioniere die Erinnerung nicht.

**Genauigkeit.** Ein Zeitgeber im Minutentakt trifft auf etwa eine Minute genau. Aus „fünf
Minuten vorher" werden in der Praxis vier bis sechs. Für den Zweck reicht das; eine
sekundengenaue Zustellung wäre ein anderer Aufwand.

## Die Datenschutzfrage: was steht in der Meldung?

Der Text erscheint auf dem Sperrbildschirm – sichtbar für jeden, der das Telefon in der Hand
hält oder danebensteht. Der Inhalt selbst ist auf dem Weg verschlüsselt; der Push-Dienst von
Apple oder Google kann ihn nicht lesen. Das Risiko ist nicht die Übertragung, sondern die
Anzeige.

Drei Möglichkeiten:

1. **Voller Text**: „Termin in 5 Min: Daniel Hartman, Rednitzstr. 18". Am schnellsten
   erfassbar, zeigt aber Name und Adresse offen an.
2. **Nur der Name**: „Termin in 5 Min: Daniel Hartman". Die Adresse steht nach dem Antippen.
   *Empfehlung* – der Name genügt zum Wiedererkennen, die Adresse braucht man ohnehin erst in
   der Navigation.
3. **Ohne Personenbezug**: „Nächster Termin in 5 Minuten". Datenschutzfreundlich, aber der
   Techniker muss immer erst tippen.

Unabhängig davon zu klären: Die Push-Anmeldung eines Geräts ist ein Gerätebezug, der beim
Abmelden gelöscht werden sollte, und der Versand über Apple/Google ist eine weitere
Verarbeitung – sie gehört in die Verarbeitungsübersicht.

## Aufwand

Mittel. Konkret entstehen:

* zwei Migrationen (`push_geraete`, `push_versand` mit RLS; der Zeitgeber-Auftrag)
* `app/api/push/anmelden`, `app/api/push/abmelden`, `app/api/push/senden`
* ein Block in den Einstellungen (Schalter, Erlaubnis abfragen, Gerät abmelden)
* `push`- und `notificationclick`-Behandlung in `public/sw.js` (Fassung hochzählen!)
* `?kunde=`-Parameter in `app/page.tsx` nach dem Muster von `?lagerplatz=`
* das Paket `web-push` in `package.json`

Dazu drei Umgebungsvariablen bei Vercel: öffentlicher und geheimer VAPID-Schlüssel sowie das
Geheimnis für die Versandroute.

**Die Schlüssel werden auf dem eigenen Rechner erzeugt, nicht hier.** Ein VAPID-Schlüsselpaar
ist ein EC-P-256-Paar; `npx web-push generate-vapid-keys` erzeugt es lokal. Der geheime Teil
gehört ausschließlich in die Umgebungsvariablen bei Vercel und darf nirgendwo sonst auftauchen.

## Was zuerst zu prüfen wäre

Bevor das alles gebaut wird, lohnt ein Vortest von zehn Minuten: PinPoints auf einem echten
Diensthandy installieren, Benachrichtigungen erlauben, eine Testnachricht schicken. Kommt sie
an – auch bei gesperrtem Bildschirm, auch im Fahrfokus? Damit steht oder fällt der ganze
Rest, und es ist die eine Frage, die sich nicht am Schreibtisch beantworten lässt.

---

## Vortest – gebaut am 09.09.2026

Bewusst nur der Teil, an dem alles Weitere hängt: Geräteanmeldung und eine Testnachricht.
Kein Zeitgeber, kein Terminversand.

| Was | Wo |
|---|---|
| Tabelle `push_geraete` | Migration 26 (+ Rollback) |
| Anmelden / Abmelden / Testnachricht | `app/api/push/anmelden`, `.../abmelden`, `.../test` |
| Gegenprobe „kennt der Server dieses Gerät?" | `app/api/push/status` |
| Öffentlicher Schlüssel für den Browser | `app/api/push/schluessel` |
| Client-Seite | `lib/push.ts` |
| Bedienung | `components/PushEinstellung.tsx`, in den Einstellungen |
| Anzeige und Antippen | `push`- und `notificationclick`-Behandlung in `public/sw.js` |

Vier Entscheidungen, die nicht offensichtlich sind:

**Der öffentliche Schlüssel kommt über eine Route, nicht als `NEXT_PUBLIC_`-Variable.**
`NEXT_PUBLIC_`-Werte werden beim Bauen fest eingebacken; wer den Schlüssel in Vercel setzt und
sich wundert, warum nichts geht, hat schlicht noch nicht neu gebaut. Diese Route trägt
deshalb `export const dynamic = "force-dynamic"` – ohne das wäre die Antwort beim Bauen
festgeschrieben worden und der Fehler nur eine Ebene tiefer versteckt. (Im Build war die Route
zuerst als „○ static" ausgewiesen; genau daran fiel es auf.)

**Der Schlüssel der Gerätetabelle ist die Adresse beim Push-Dienst, nicht die Person.** Ein
Mensch hat mehrere Geräte, und auf einem Gerät meldet sich irgendwann jemand anderes an. Wäre
die Person der Schlüssel, bekäme der Vorgänger weiter Meldungen auf ein fremdes Telefon.

**Die Testroute sendet ausschließlich an die EIGENEN Geräte.** Eine Route, die an fremde
Geräte senden kann, wäre eine Fernsteuerung für fremde Sperrbildschirme. Der spätere
Terminversand bekommt einen eigenen, per Geheimnis geschützten Weg.

**Die Anzeige fragt den Server, nicht nur den Browser.** Ein Push-Abo im Browser heißt noch
nicht, dass die Anmeldung auch in der Datenbank steht. Genau das ist am 09.09.2026 passiert:
Migration 26 war noch nicht ausgeführt, das Speichern schlug fehl – die Einstellungen meldeten
trotzdem „Dieses Gerät ist angemeldet", und erst der Testversand brachte den wahren Grund ans
Licht. Seitdem gilt zweierlei: `geraetAnmelden()` nimmt das Browser-Abo wieder zurück, wenn der
Server es nicht speichern konnte, und `pushLage()` prüft über `/api/push/status` gegen. Bleibt
der Server stumm (offline), bleibt es bei „angemeldet" – eine fehlende Verbindung ist kein
Beleg dafür, dass die Anmeldung weg ist. Fehlt die Tabelle, nennen die Routen die vergessene
Migration im Klartext, statt die PostgREST-Meldung durchzureichen.

**Geräte, die 404 oder 410 melden, werden sofort gelöscht.** Das heißt: App entfernt oder
Anmeldung erneuert. Ohne das Aufräumen wächst die Tabelle mit Adressen, an die für immer
vergeblich gesendet wird.

### Einrichtung

1. Migration 26 im SQL-Editor ausführen – **im richtigen Supabase-Projekt**. Ohne die Tabelle
   läuft die Anmeldung in „Could not find the table 'public.push_geraete'".
2. Bei Vercel `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` setzen, danach einmal neu deployen.
   Die Schlüssel wurden auf dem Rechner des Nutzers erzeugt; der private Teil gehört
   ausschließlich in die Umgebungsvariablen.
3. PinPoints auf dem iPhone **installiert** öffnen (in Safari selbst gibt es kein Push),
   Einstellungen → Benachrichtigungen → „Dieses Gerät anmelden".
4. „Testnachricht an mich".

### Wenn „Tabelle nicht gefunden" kommt, obwohl Migration 26 gelaufen ist

Zwei Ursachen sehen von außen gleich aus, und beide sind nicht die vergessene Migration:

1. **Die Migration lief im falschen Projekt.** In der Organisation liegen mehrere Supabase-
   Projekte nebeneinander; der SQL-Editor merkt sich das zuletzt geöffnete. Vergleichen:
   die Kennung in der Adresse des SQL-Editors (`/project/<kennung>/sql/...`) gegen
   `NEXT_PUBLIC_SUPABASE_URL` in Vercel (`https://<kennung>.supabase.co`). Seit 09.09.2026
   nennen die Push-Routen diese Kennung in der Fehlermeldung mit, damit der Vergleich ohne
   Suche möglich ist.
2. **Der Schema-Zwischenspeicher von PostgREST ist veraltet.** Die Tabelle existiert, die
   API kennt sie noch nicht. Abhilfe im SQL-Editor:

```sql
select to_regclass('public.push_geraete') as tabelle;  -- null = in DIESEM Projekt nicht da
notify pgrst, 'reload schema';
```

Ein „policy … already exists" beim erneuten Ausführen heißt übrigens nur, dass die Migration in
diesem Projekt schon einmal gelaufen ist – die Tabelle ist dann dort vorhanden.

### Die Frage, um die es geht

Kommt die Meldung an – **bei gesperrtem Bildschirm** und **im Fokus „Fahren"**? iOS
unterdrückt Mitteilungen im Fahrmodus standardmäßig; PinPoints muss dort je Gerät einmal als
erlaubte App eingetragen werden. Fällt dieser Test durch, ist die ganze Terminerinnerung
anders zu planen – deshalb kommt er vor dem Bau und nicht danach.
