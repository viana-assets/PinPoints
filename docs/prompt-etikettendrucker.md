# Prompt: Marktscreening Etikettendrucker

Alles unterhalb der Linie ist der Prompt. Kopieren, in eine KI mit Websuche einfügen, absenden.

## Stand 21.09.2026: ein zweiter Weg aufs Papier – die harten Kriterien unten gelten seitdem nur
## noch für den DIREKTEN Weg

Seit dem 21.09.2026 hat die Anwendung neben dem Systemdruckdialog einen zweiten Weg, ein
Etikett auf Papier zu bekommen: Es wird als PNG in exakt seiner physischen Größe erzeugt
(`lib/etikettBild.ts`, 203 dpi) und an das **Teilen-Menü** des iPhones übergeben
(`navigator.share` mit Datei). Von dort nimmt jede App, die Bilder annehmen kann – auch die
Hersteller-App eines Bluetooth-Etikettendruckers –, das Bild entgegen; gedruckt wird über
Bluetooth, in der App des Druckers. Kennt das Gerät kein Teilen-Menü, speichert die
Anwendung das Bild stattdessen zum Herunterladen.

Das ändert die Ausgangslage unten in einem Punkt, der bei der Recherche zu beachten ist:
**AirPrint ist die eigentliche Hürde am iPhone, aber nur für den DIREKTEN Weg** über den
Systemdruckdialog (Safari-Druckfunktion, Kriterium 1/2 unten). Ein Drucker, der nur über seine
eigene Hersteller-App erreichbar ist (reines Bluetooth, kein AirPrint), ist über den zweiten
Weg trotzdem nutzbar – zwei Tipper umständlicher als der direkte Druckdialog, aber
funktionierend. Kriterium 1 und 2 unten schließen deshalb nicht mehr grundsätzlich aus, sie
schließen nur vom **direkten** Weg aus. Bitte in der Recherche zu jedem Kandidaten beide Wege
ausweisen: AirPrint-fähig (druckt direkt aus dem Systemdialog) versus nur über eigene App
erreichbar (druckt über den Umweg „Bild teilen"). Eine native App bzw. ein Hersteller-SDK auf
dem iPhone ist dafür weiterhin nicht nötig – die Anwendung selbst bleibt eine reine
Web-Anwendung ohne Hersteller-Integration; der Umweg läuft über das ohnehin vorhandene
Betriebssystem-Teilen-Menü, nicht über eine eigene Schnittstelle zum Drucker.

---

## Auftrag

Du bist Einkaufsberater für Auto-ID-Hardware. Suche im deutschsprachigen Markt (Stand heute)
**alle Etikettendrucker, die die unten stehenden harten Kriterien erfüllen** — nicht die
bekanntesten, sondern die passenden. Nenne auch Modelle abseits von Brother und Zebra
(z. B. Bixolon, Citizen, TSC, Godex, Epson, Honeywell, Toshiba, Sato, Dymo, Seiko, Star
Micronics, cab, Printronix, Custom, Zijiang, Munbyn, iDPRT, Rollo, Arkscan).

Recherchiere mit Websuche und belege jede Aussage mit einer Quelle. **Rate nicht.** Wo eine
Angabe nicht belegbar ist, schreib „nicht belegbar" statt einer Vermutung — eine falsche
Zusage kostet hier ein Gerät, das nicht benutzt werden kann.

## Der Einsatzfall

Ein mobiler Reifenservice lagert Kundenreifen ein. Zu jedem eingelagerten Reifensatz wird ein
Etikett gedruckt und **auf den Reifen geklebt**: QR-Code plus Kundenname, Fahrzeug, Saison,
Profiltiefe, Lagerplatz. Wahlweise auch vier Einzeletiketten, eines je Rad (VL/VR/HL/HR mit
der jeweiligen Profiltiefe).

Gedruckt wird **im Lager, direkt am Regal**. Dort gibt es:

- **keinen PC**, kein Notebook, kein Tablet
- **kein WLAN**, keinen Router, kein Netzwerk
- Strom (Steckdose vorhanden)
- ein **iPhone** als einziges Bediengerät

Die Software ist eine **Web-Anwendung (PWA) im Safari-Browser**. Sie erzeugt das Etikett als
Druckseite und ruft den normalen **Druckdialog des Betriebssystems** auf. Es gibt **keine
native App, kein Hersteller-SDK, keine Möglichkeit, ein Drucker-Protokoll wie ZPL oder ESC/POS
direkt anzusprechen**. Das ist nicht verhandelbar und die Ursache fast aller Ausschlüsse unten.

## Harte Ausschlusskriterien (alle müssen erfüllt sein)

1. **Druckbar vom iPhone aus Safari heraus, ohne Hersteller-App.**
   Praktisch heißt das: Der Drucker muss **AirPrint** unterstützen (Bonjour/mDNS-Erkennung,
   IPP-Druck). Geräte, die sich nur über eine eigene App des Herstellers ansteuern lassen,
   fallen raus — auch wenn sie technisch „Bluetooth" oder „WLAN" können.

2. **Bluetooth allein genügt nicht.** Das iOS-Drucksystem druckt über IP. Ein reiner
   Bluetooth-Drucker ist für diesen Einsatzfall unbrauchbar, egal wie gut er sonst ist.

3. **Eigener WLAN-Zugangspunkt (Access-Point-Modus / Wi-Fi Direct / Wireless Direct).**
   Da es im Lager kein Netzwerk gibt, muss der Drucker sein eigenes WLAN aufspannen, in das
   sich das iPhone einwählt. Ein Drucker, der zwingend einen vorhandenen Router braucht,
   fällt raus.
   *Hinweis für die Recherche:* Der Weg über den iPhone-Hotspot funktioniert NICHT zuverlässig
   — Multicast/Bonjour wird dort häufig blockiert. Bitte nicht als Lösung vorschlagen.

4. **Etikettenformat 50 × 30 mm muss druckbar sein**, als Einzeletikett von der Rolle
   (ein Etikett = eine Seite). Wünschenswert zusätzlich 40 × 30 mm und 57 × 40 mm.
   **Kritische Rückfrage, die du je Modell beantworten sollst:** Meldet der Drucker seine
   Etikettengröße so an das iOS-Drucksystem, dass im Druckdialog das Etikettenformat
   erscheint — oder bietet iOS nur A4/Letter an? Falls dazu Erfahrungsberichte auffindbar
   sind, nenne sie. Das ist der häufigste Grund, warum ein sonst passender Drucker scheitert.

5. **Auflösung mindestens 203 dpi.** Mehr schadet nicht, ist aber nicht nötig: Der QR-Code
   ist 18–21 mm groß und wurde bei 203 dpi getestet und sauber zurückgelesen.

## Wünschenswert (bitte je Modell bewerten, kein Ausschluss)

- **Thermotransfer mit Farbband**, nicht nur Thermodirekt. Die Etiketten kleben 6–8 Monate
  auf einem Reifen: Wärme, UV, Weichmacher aus dem Gummi und Reifenmontagepaste an den
  Fingern. Thermodirekt verblasst unter diesen Bedingungen. Wenn ein Gerät nur Thermodirekt
  kann, nenne das ausdrücklich als Einschränkung.
- **Standard-Etikettenrollen** statt proprietärer, chipgebundener Verbrauchsmaterialien.
  Bitte Folgekosten je 1.000 Etiketten grob angeben, wenn auffindbar.
- **Geeignete Etikettenmaterialien** für den Zweck: Kunststoff (PP/PE) statt Papier, Kleber
  für raue, gummiartige, teils fettige Oberflächen. Nenne konkrete Material-/Klebertypen,
  wenn der Hersteller welche führt.
- Kompakt und werkstatttauglich (Staub, Temperaturschwankungen).
- Optionaler Akku (nicht nötig, Strom ist vorhanden).
- Verfügbarkeit in Deutschland, Gewährleistung, Ersatzteile.

## Nicht relevant

- Druckgeschwindigkeit (es sind wenige Etiketten am Stück).
- Hohe Stückzahlen: geschätzt einige hundert Etiketten je Saison, keine Massenproduktion.
  (Diese Zahl ist eine Schätzung und darf gern hinterfragt werden.)
- Farbe. Schwarz-weiß genügt.
- Netzwerkverwaltung, Flottenmanagement, Cloud-Anbindung.

## Budget

Kein festes Limit, aber begründungspflichtig. Bitte in drei Klassen gliedern:
**unter 150 €**, **150–400 €**, **über 400 €** (jeweils brutto, Endkundenpreis Deutschland).
Bei den teureren Geräten: Was genau bekommt man dafür, das die günstigeren nicht können?

## Ausgabeformat

**1. Übersichtstabelle** aller Kandidaten, die die harten Kriterien erfüllen:

| Modell | AirPrint belegt? | AP-Modus | 50×30 mm | Verfahren | dpi | Verbrauchsmaterial | Preis | Quelle |

**2. Je Kandidat ein kurzer Absatz:** Wofür er sich eignet, wo sein Haken liegt, und wie
sicher die AirPrint-Aussage belegt ist (Herstellerangabe / Datenblatt / Erfahrungsbericht /
nur Händlertext).

**3. Eine Liste der geprüften und AUSGESCHLOSSENEN Modelle** mit je einem Satz Begründung.
Diese Liste ist ausdrücklich erwünscht — sie erspart die zweite Recherche.

**4. Eine klare Empfehlung** mit Begründung, plus einen günstigen Kandidaten zum Ausprobieren.

**5. Die offenen Punkte**, die sich nur am Gerät klären lassen, als Prüfliste für den Test
nach Lieferung.

## Umgang mit Unsicherheit

Herstellerseiten und Händlertexte behaupten oft „kompatibel mit iOS und Android" und meinen
damit die eigene App. Das ist für diesen Einsatzfall **keine** Bestätigung. Als Beleg für
AirPrint zählt: eine ausdrückliche AirPrint-Nennung im Datenblatt oder Handbuch, ein Eintrag
in Apples AirPrint-Liste, oder ein glaubwürdiger Erfahrungsbericht. Unterscheide diese Stufen
in deiner Antwort.
