# Berechtigungen und Rollen

**Stand: 19.09.2026.** Dieses Blatt beschreibt, wer in PinPoints was darf, wo diese
Entscheidung tatsächlich fällt, und welche Irrtümer das Projekt dabei schon gemacht hat –
damit sie kein zweites Mal gemacht werden.

Die Fassung vor diesem Stand beschrieb das Modell aus den Migrationen 09/10/16
(`view.<modul>` / `action.<modul>.<aktion>`, ein Haken je Rolle,
`public.has_module_permission()`). Das gibt es seit Migration 42/43 nicht mehr. Wer noch
danach sucht, sucht nach Schlüsseln, die heute für jeden außer dem Superadmin schlicht
„verboten" bedeuten – siehe „Fallen" weiter unten.

## Die Rollen

Die Rolle steht in `profiles.role` (Constraint aus Migration 05), Anzeigenamen zentral in
`ROLE_LABEL` (`lib/constants.ts`). Konfigurierbar sind drei Rollen; sie stehen in
`PERMISSION_ROLES` und bilden die Spalten der Rechtematrix.

- **Admin** – das Büro. Pflegt Kunden, Aufträge, Artikel und Preise, teilt Mitarbeiter ein,
  stellt Rechnungen aus, sieht die Auswertungen. Darf Nutzer einladen (Rollenwahl
  Nutzer/Techniker/Admin, nicht Superadmin), sieht aber keine vollständige Accountliste.
- **Techniker** – der Mann vor Ort. Er arbeitet an den Aufträgen, die ihm zugeteilt sind, und
  sieht von allem anderen so wenig wie möglich. Seine Grenzen kommen aus zwei Quellen: aus der
  Rechtematrix wie bei allen, und zusätzlich aus eigenen Regeln in der Datenbank
  („Sonderregeln" weiter unten), die sich nicht über die Matrix abschalten lassen.
- **Nutzer** („user") – ein Büroplatz ohne Verantwortung für Stammdaten: arbeitet mit Kunden
  und Aufträgen, ändert aber keine Preise, keine Mitarbeiter, keine Rechnungen und sieht keine
  Auswertungen.

Dazu kommt der **Superadmin**, und er ist bewusst keine vierte Spalte in der Matrix: Er darf
immer alles, unabhängig davon, was in der Tabelle steht. Das ist das Sicherheitsnetz – eine
falsch gesetzte Zeile darf nicht dazu führen, dass sich niemand mehr an die Verwaltung
heranarbeiten kann. Der Superadmin ist die einzige Rolle, die die volle Accountliste sieht,
die Rolle Superadmin vergeben und das Änderungsprotokoll (`public.audit_log`, Migration 18)
lesen darf. Die Rechtematrix selbst ist ebenfalls nur für ihn sichtbar.

Gegen Selbstbeförderung ist die Rolle eigens gesperrt: Ein Trigger auf `profiles`
(Migration 15/16) lehnt jede Änderung an `role` ab, die nicht vom Superadmin oder vom
Service-Role-Key der Einladungsroute kommt. Eine Zeilen-Richtlinie hätte das nicht geleistet –
die Rolle steht in der eigenen Zeile, und die darf man bearbeiten.

## Das Modell: Bereich plus Verb

Seit Migration 42 hat jeder **Bereich** je Rolle **drei Haken**: `lesen`, `schreiben`,
`loeschen` (`VERBEN` in `lib/constants.ts`). Gespeichert wird das in
`public.module_permissions`: eine Zeile je Bereich, drei Rollenlisten
(`read_roles`, `edit_roles`, `delete_roles`).

Drei Verben und nicht vier: „anlegen" und „ändern" sind beide „schreiben". Die Trennung wäre
denkbar, aber im Betrieb gibt es niemanden, der ändern darf und nicht anlegen – sie hätte nur
die Tabelle verdoppelt.

Die Spalte für „schreiben" heißt weiterhin `edit_roles`. Das ist ein bewusster Kompromiss aus
Migration 42: Umbenennen wäre sauberer gewesen, hätte aber jede Stelle Bestandscode
mitgerissen, die sie noch liest – und eine Spalte, die während des Umbaus zwei Namen trägt,
ist schlimmer als eine, die anders heißt als sie meint. Die Zuordnung steht an genau einer
Stelle im Code: `SPALTE` in `lib/api/permissions.ts`.

### Zwei Ebenen, und warum

Der Katalog (`RECHTE_KATALOG`, `lib/constants.ts`) kennt zwei Arten von Zeilen:

- **Modulzeile** (fett in der Maske, z. B. `auftraege`, `lager`) – sie entscheidet nur eines:
  Geht der Reiter überhaupt auf? Solche Zeilen haben nur das Verb `lesen`.
- **Handlungszeile** (eingerückt, `unter: true`, z. B. `auftraege.leistungen`,
  `lager.regale`) – sie entscheidet, was man mit den Daten dahinter tun darf.

Ein Modul mit nur einem Datenbereich bekommt keine Unterzeile, sondern trägt die drei Verben
selbst (`kunden`, `artikel`, `mitarbeiter`, …). Eine Einrückung mit genau einem Kind erklärt
nichts und kostet eine Zeile.

### Geschnitten nach dem, was man tut – nicht nach Tabellen

Der erste Entwurf von Migration 42 schnitt die Bereiche an Tabellen: „Lager und Lagerplätze",
„Eingelagerte Reifen". Beim Durchsprechen fiel auf, dass das niemand deuten kann, der die
Datenbank nicht kennt – und dass dadurch zwei Haken schlicht falsch saßen:

- „Löschen" bei den eingelagerten Reifen hätte **nicht** das Auslagern gesteuert. Auslagern ist
  ein `update` (`removed_at` setzen); eine Einlagerung wird nie gelöscht, sie bleibt als
  Historie stehen. Der Haken hätte in Wahrheit das Entfernen einer Radmessung geregelt und
  dabei ausgesehen, als ginge es ums Auslagern.
- Eine Leistung aus einem Auftrag zu entfernen hing am selben „Löschen" wie das Wegwerfen des
  ganzen Auftrags. Ein Techniker konnte damit eine Leistung eintragen, aber seinen eigenen
  Tippfehler nicht mehr korrigieren – genau der Umweg über das Büro, den Migration 41 gerade
  abgeschafft hatte.

Deshalb heißen die Zeilen heute nach der **Handlung**, und „löschen" steht nur dort, wo
wirklich etwas verschwindet. Der Unterschied zwischen „korrigieren" und „wegwerfen" ist der
eigentliche Grund für die zweite Ebene.

Wo ein Verb in einem Bereich nicht vorkommt, steht in der Maske eine **graue Zelle**, keine
Lücke – eine leere Stelle in einer Spalte sieht beim Überfliegen aus wie ein nicht gesetzter
Haken, und das ist die gefährlichere Verwechslung. Der Grund steht im Tooltip (`warumNicht`),
die Bedeutung der Zeile ebenfalls (`erklaerung`). Eine gesperrte Zelle ohne Begründung ist eine
Aufforderung zum Rätselraten.

## Wo die Entscheidung fällt: in der Datenbank

**`public.darf(bereich, verb)`** (Migration 42) ist die eine Stelle, an der ein Recht
ausgewertet wird: Superadmin immer `true`, sonst die Frage, ob die eigene Rolle in der
passenden Rollenliste der Zeile steht. Die Funktion ist `security definer` – sonst hinge die
Abfrage auf `module_permissions` an den Zeilenrechten des Aufrufers – und `stable`, damit
Postgres sie je Anweisung einmal auswertet statt je Zeile.

Jede Geschäftstabelle trägt darauf aufbauend getrennte Richtlinien für `select`, `insert`,
`update` und `delete`. Ein Haken in der Modulverwaltung ändert damit tatsächlich, was möglich
ist – nicht nur, was sichtbar ist. Ein Löschen-Haken, den nur die Oberfläche kennt, ist eine
Zusage, die das Programm nicht hält: Wer die API direkt anspricht, löscht trotzdem.

**Die Oberfläche blendet nur aus.** In `app/page.tsx` beantworten zwei Helfer dieselbe Frage
ein zweites Mal, ausschließlich um Knöpfe zu verstecken, die die Datenbank ohnehin ablehnen
würde:

- `darf(bereich, verb = "lesen")` – liest aus dem geladenen `modulePermissions`-State, sonst
  aus `RECHTE_VORGABE`, Superadmin-Bypass eingebaut.
- `canView(regel)` – für die Sichtbarkeitsregeln aus `lib/module.ts`. Die Regel ist ein Paar
  aus Bereich und Verb, getrennt durch einen Punkt (`"kunden.schreiben"` für „Neuer Kunde",
  `"kunden.lesen"` für „Inaktive Kunden"); ohne Verb gilt `lesen`.

`lib/module.ts` ist die eine Liste beider Navigationen (Seitenleiste und Kachelseite
„Weitere"). Das Feld `sichtbar` trägt die Regel: `null` = immer sichtbar (Dashboard),
`"admin"` = nur Admin/Superadmin, sonst der Rechteschlüssel. `modulSichtbar()` wertet das an
einer Stelle aus, damit Seitenleiste und Kachelseite nicht auseinanderlaufen können – genau
das war am 10.09.2026 wochenlang unbemerkt der Fall.

Feiner verdrahtet ist das Lager: `LagerPanel` bekommt sechs einzelne Boolean-Props
(`canCreateWarehouse`, `canEditWarehouse`, `canDeleteWarehouse`, `canCreateSlot`,
`canDeleteSlot`, `canAssignTire`), gespeist aus `darf("lager.regale", …)` und
`darf("lager.einlagerung","schreiben")`.

Die Maske selbst ist `components/admin/PermissionMatrix.tsx` (Admin-Bereich, Reiter
„Rechte", nur für den Superadmin sichtbar; bis 26.09.2026 „Modulverwaltung"): oben die Wahl der
Rolle, darunter links die Bereiche aus `RECHTE_KATALOG` und drei Spalten Lesen · Schreiben ·
Löschen für diese eine Rolle (vorher alle Rollen nebeneinander, neun Spalten – am Handy nicht
lesbar). Graue Felder gibt es im Bereich nicht; der Grund steht im Titel, die Erklärung der Zeile
klappt beim Antippen des Namens auf. **Jeder Klick speichert sofort und für sich** –
ein „Speichern"-Knopf über einer Matrix mit knapp vierzig Haken ist eine Einladung, die halbe
Arbeit zu verlieren. Der Datenzugriff dazu liegt in `lib/api/permissions.ts`;
`upsertModulePermissions()` schickt bewusst nur das eine geänderte Verb mit, weil ein Aufruf
mit allen drei Listen bei zwei gleichzeitig offenen Fenstern die Änderung des anderen
überschreiben würde.

## Die Bereiche und ihre Vorgabe

Vorgabe heißt: Was gilt, solange in `public.module_permissions` für diesen Bereich noch keine
Zeile steht. Quelle ist `RECHTE_VORGABE` in `lib/constants.ts`; dieselben Werte hat
Migration 42 beim ersten Lauf in die Tabelle geschrieben (bzw. Migration 48 für
`rechnungen`). **L** = lesen, **S** = schreiben, **X** = löschen, **–** = nichts. Was in der
Spalte nicht vorkommt, gibt es in diesem Bereich nicht (graue Zelle).

| Schlüssel | Zeile in der Maske | Admin | Techniker | Nutzer |
|---|---|---|---|---|
| `dashboard` | Dashboard (gesperrt, immer an) | L | L | L |
| `kunden` | Kunden | L S X | – | L S |
| `auftraege` | **Aufträge** (Modul) | L | L | L |
| `auftraege.auftrag` | – Auftrag anlegen und ändern | L S X | L S | L S X |
| `auftraege.leistungen` | – Leistungen im Auftrag | L S X | L S X | L S X |
| `auftraege.einteilung` | – Mitarbeiter einteilen | L S | L | L S |
| `termine` | Termine | L | L | L |
| `einsatzplanung` | Einsatzplanung | L | L | L |
| `lager` | **Lager** (Modul) | L | L | L |
| `lager.regale` | – Regale und Plätze verwalten | L S X | L | L |
| `lager.einlagerung` | – Reifen ein- und auslagern | L S | L S | L S |
| `lager.raeder` | – Räder einzeln messen | L S X | L S X | L S X |
| `saison` | Saisonliste | L | – | L |
| `artikel` | Artikel und Preise | L S X | – | L |
| `mitarbeiter` | Mitarbeiter | L S X | L | L |
| `firmenfahrzeuge` | Firmenfahrzeuge | L S X | L | L |
| `rechnungen` | Rechnungen | L S | – | – |
| `auswertung` | Auswertungen | L | – | – |
| `einstellungen` | Einstellungen | L S | L S | L S |

Der Techniker ist in dieser Tabelle die eigentliche Aussage: Er sieht Aufträge, Termine, Lager
und Einsatzplanung, arbeitet dort und darf seine eigenen Eingaben auch **korrigieren** – eine
versehentlich eingetragene Leistung wieder entfernen, eine falsch erfasste Radmessung löschen.
Was er nicht darf: den Kundenstamm durchblättern, Preise ändern, Auswertungen öffnen, Rechnungen
sehen, sich selbst einteilen und ganze Aufträge oder Kunden wegwerfen.

Einzelne Zeilen verdienen einen Satz Begründung:

- **`auftraege.einteilung` – Schreiben ohne Techniker, unabhängig von allem anderen.** Wer sich
  selbst Aufträge zuteilen kann, teilt sich auch fremde zu. Aus demselben Grund verweigert die
  `insert`-Richtlinie auf `orders` einem Techniker das Anlegen, selbst wenn die Matrix es ihm
  gäbe.
- **`auftraege.leistungen` – Löschen für alle drei Rollen.** „Löschen" heißt hier korrigieren.
- **`lager.einlagerung` – kein Löschen.** Auslagern ist das Schreiben; die Zeile bleibt als
  Historie stehen. `tire_storage` hat deshalb weder Löschrichtlinie noch Löschtrigger: Wenn die
  Anwendung etwas nie tut, soll auch kein Haken so tun, als könnte man es erlauben.
- **`rechnungen` – kein Löschen.** Eine Rechnung wird storniert, nicht gelöscht. Eine fehlende
  Nummer ist eine Lücke im Kreis, und die erklärt man bei der nächsten Prüfung.
- **`dashboard` – gesperrt.** Immer an, für alle, nicht abwählbar (Startseite und
  Absturz-Sicherung). Es steht trotzdem in der Liste, aus Transparenz.
- **`einstellungen`** meint immer nur die eigenen; jeder hat genau einen Satz.

## Sonderregeln, die nicht über die Matrix laufen

Diese Regeln gelten **zusätzlich** zur Matrix und lassen sich dort nicht abschalten. Sie sind
der Grund, warum ein Techniker mit gesetztem Haken trotzdem nicht alles sieht.

**Nur eigene Aufträge** (Migration 13, gehärtet in 15, seit 42 in die neuen Richtlinien
eingearbeitet). `public.is_own_order(auftrag)` fragt, ob der eigene Mitarbeiter-Datensatz über
`order_employees` an diesem Auftrag hängt. Die Richtlinien auf `orders`, `order_employees`,
`order_articles` und `auftrag_fahrzeuge` (Migration 44) lauten deshalb überall nach demselben
Muster: **Modulrecht UND (kein Techniker ODER eigener Auftrag)**. Die Verbindung Account →
Mitarbeiter läuft über `employees.profile_id`, ausgewertet von
`public.current_employee_id()`.

**Nur Kunden der eigenen Aufträge** (Migration 45). Migration 42 hatte das Lesen von
`customers`, `contact_history` und `vehicles` an `darf('kunden','lesen')` gehängt – und dort
steht der Techniker mit Absicht nicht drin. Damit sah er aber auch den Kunden seines eigenen
Auftrags nicht mehr: Name und Anschrift im Auftragsfenster fehlten, der Navigationsknopf zum
Einsatzort war leer, die Kundensuche im Lager tot, und die Rechnungs-Abhakliste meldete
„Anschrift fehlt", obwohl sie gepflegt war. Migration 45 korrigiert das nach derselben Form:
`public.ist_eigener_kunde(kunde)` – hat der Aufrufer mindestens einen Auftrag bei diesem
Kunden? Bewusst **nicht** korrigiert wurde die Kontakthistorie: Wann wer mit dem Kunden
telefoniert hat, ist Büroarbeit; der Techniker braucht die Anschrift, nicht den Vorgang. Ebenso
bleibt das **Schreiben** an `darf('kunden','schreiben')` – wer die Anschrift seines Kunden
ändern kann, ändert dessen Kartei.

**Nur Kollegen auf gemeinsamen Aufträgen** (Migration 42). `public.ist_kollege(mitarbeiter)`
liefert wahr für einen selbst und für jeden, der mit einem auf mindestens einem Auftrag steht.
Vorher lag die vollständige Belegschaft für jeden Eingeloggten offen und nur die Oberfläche
blendete sie aus – zwei verschiedene Wahrheiten für dieselbe Frage, und die, die zählt, ist die
der Datenbank.

**Am eigenen Auftrag alles außer wegnehmen** (Migration 41, Entscheidung vom 16.09.2026).
Bis dahin durfte ein Techniker an seinem Auftrag nur `status` und `techniker_notiz` ändern.
Im Betrieb war das zu eng: Wenn sich der Termin vor Ort verschiebt oder eine Leistung
dazukommt, weiß das der Mann vor Ort und niemand sonst; er musste anrufen, damit jemand im Büro
einträgt, was er gerade sieht. Das ist keine Sicherheit, das ist eine Warteschlange. Seit 41
darf er alles ändern – auch Preise und die Rechnungsschalter. Die Begründung ist nicht „das ist
ungefährlich", sondern: Seit Migration 18/36 steht jede Änderung mit Person und Zeitpunkt im
Protokoll und ist am Auftrag sichtbar. Nachvollziehbarkeit statt Verbot.

Gesperrt bleiben genau die Handlungen, die etwas **wegnehmen** statt hinzuzufügen: stornieren,
löschen, wiedereröffnen – dazu die Felder, die die Identität des Auftrags ausmachen
(`order_number`, `customer_id`). Durchgesetzt wird das von
`public.restrict_techniker_order_update()` als Negativliste.

**Achtung, hier dreht sich eine Regel um:** Phase 6 hatte den Spaltenschutz bewusst von einer
Negativ- auf eine Positivliste umgestellt („alles gesperrt außer diesen"), damit eine künftige
Spalte automatisch geschützt ist. Migration 41 dreht das zurück, weil sich die Absicht
umgedreht hat: „alles außer wegnehmen" lässt sich nur als Negativliste ausdrücken. **Der Preis
dafür: Eine neue Spalte an `orders` ist für Techniker automatisch änderbar.** Wer eine anlegt,
muss sich fragen, ob sie in die gesperrte Liste gehört. Das steht auch in `architektur.md`,
im Migrationsverlauf zu Migration 41.

**Der Abschluss friert ein** (Migration 20, unverändert). An einem erledigten oder stornierten
Auftrag ändert auch der Techniker nichts mehr. Das ist keine Einschränkung seiner Rechte,
sondern die Zusage, dass ein Abschluss ein Abschluss ist. In der Oberfläche spiegelt
`ABGESCHLOSSENE_ZUSTAENDE` / `istAbgeschlossen()` dasselbe, damit gar nichts erst angeboten
wird, was die Datenbank ablehnen würde.

## Fallen, die dieses Projekt gelernt hat

**Mehrere Richtlinien für dieselbe Aktion sind ein ODER – eine zusätzliche Richtlinie
LOCKERT.** Das ist die teuerste Einsicht des Umbaus. Wer neben „Techniker sieht eigene
Aufträge" eine zweite Richtlinie `darf('auftraege','lesen')` stellt, hat die
Techniker-Einschränkung nicht ergänzt, sondern **aufgehoben**: Es genügt, dass eine von beiden
zutrifft. Deshalb ersetzt Migration 42 die alten Richtlinien und führt die Bedingung in *einer*
zusammen (Modulrecht UND (kein Techniker ODER eigener Auftrag)), statt sie danebenzustellen.

Genau daran ist es trotzdem ein zweites Mal gescheitert: Eine frühe Fassung von Migration 42
benannte die Lager-Richtlinien von „Bereich lager …" in „Bereich lager.regale …" um – und
räumte die alten nicht weg, weil auch die `drop`-Anweisungen schon den neuen Namen trugen. Auf
`warehouses` und `storage_slots` lagen danach zwei Sätze Richtlinien, und die alten fragten
eine Zeile ab, die niemand mehr pflegt. Wer in der neuen Matrix das Schreiben abhakte, nahm es
damit nicht weg. **Eine Rechtematrix, die ein Wegnehmen anzeigt, aber nicht vollzieht, ist
schlimmer als gar keine.** Migration 43 räumt diese Geisterrichtlinien auf; sie ist auch dann
gefahrlos auszuführen, wenn die frühe Fassung nie lief – sie findet dann schlicht nichts.
Merksatz für jede Umbenennung: Erst nach dem **alten** Namen droppen, dann unter dem neuen
anlegen.

**Ein verbotenes DELETE meldet sich nicht.** Eine Richtlinie, die ein `delete` verbietet, wirft
keinen Fehler – die Zeile ist für die Anweisung schlicht nicht sichtbar, es werden null Zeilen
gelöscht, und der Nutzer klickt „Löschen", nichts passiert, niemand sagt warum. Deshalb fragen
die `delete`-Richtlinien in Migration 42 nach **`lesen`** und nicht nach `loeschen`. Das sieht
nach einer Lücke aus und ist keine: Eine Richtlinie, die die Zeile wegfiltert, lässt den
Trigger gar nicht erst laufen, und dann steht wieder „DELETE 0" ohne ein Wort dazu. Die Zeile
muss sichtbar sein, damit der Trigger sie ablehnen und **begründen** kann. Die eigentliche
Entscheidung trifft `public.pruefe_loeschrecht()` (`trg_loeschrecht`), und ein BEFORE-Trigger,
der eine Ausnahme wirft, lässt sich vom Aufrufer so wenig umgehen wie eine Richtlinie – es ist
dasselbe Verfahren, das den Spaltenschutz für Techniker seit Migration 15 trägt.

**Regel daraus: Wo eine Begründung nötig ist, muss ein Trigger entscheiden, nicht eine
Richtlinie.** Eine Richtlinie kann nur verschwinden lassen; sie kann nicht sagen, warum.

**Löschen ist hier meistens gar kein DELETE.** Kunden, Aufträge und Auftragspositionen werden
seit Migration 19 nicht gelöscht, sondern mit `deleted_at` markiert. Technisch ist das ein
`update` – und ein `update` fragt nach dem **Schreibrecht**. Ohne Gegenmaßnahme hätte jeder,
der schreiben darf, auch löschen dürfen, egal was in der Matrix steht. Derselbe Trigger fängt
das ab: Er löst nur aus, wenn `deleted_at` in **dieser** Änderung von leer auf gesetzt geht –
ein bereits gelöschter Auftrag, der durch die Kettenwirkung aus Migration 19 nebenbei
weitergeschrieben wird, löst ihn nicht aus. Wiederherstellen ist kein Löschen, sondern ein
Schreiben, und das ist ohnehin geprüft.

**Ein unbekannter Rechteschlüssel liefert „verboten" – und fällt niemandem auf.** Fehlt die
Zeile in `module_permissions`, ist die Rollenliste leer und `public.darf()` antwortet für jeden
außer dem Superadmin mit Nein. In der Oberfläche passiert dasselbe über den leeren Rückfall in
`RECHTE_VORGABE`. Das Tückische daran: Wer als Superadmin testet, merkt nichts. Genau das ist
beim Umbau am 17.09.2026 dreimal passiert – `view.neuer_kunde` und `view.inaktive_kunden`
existierten nicht mehr, und im Lager stand noch `darf("lager","schreiben")` und
`darf("einlagerung", …)`, zwei Schlüssel, die es im Katalog nicht gibt; ein Techniker konnte
damit keinen Reifen einlagern. Deshalb warnt `canView()` seitdem außerhalb der Produktion auf
der Konsole, wenn ein Bereich im Katalog fehlt. **Beim Testen von Rechten reicht der
Superadmin nicht – es braucht je einen Testzugang pro Rolle.**

**`canView()` trennt am ersten Punkt.** Die Regel `"kunden.schreiben"` wird zu Bereich `kunden`
und Verb `schreiben`. Ein zweistufiger Bereichsschlüssel wie `"lager.regale"` darf dort deshalb
**nicht** stehen – er würde als Bereich `lager` mit dem Verb `regale` gelesen und wäre still
falsch. Für Handlungszeilen ist `darf("lager.regale", "schreiben")` zu verwenden, mit beiden
Werten getrennt. In `lib/module.ts` stehen aus diesem Grund ausschließlich einstufige
Schlüssel.

**`rechtSchluessel()` in `lib/constants.ts` wird derzeit von niemandem aufgerufen.** Der Helfer
stammt aus dem Umbau und setzt Bereich und Verb zu einem Punktschlüssel zusammen – was
angesichts der vorigen Falle eher eine Einladung als eine Hilfe ist. Wer aufräumt, kann ihn
entfernen; wer ihn benutzen will, sollte vorher sicher sein, wofür.

**Noch einmal zum Mitschreiben: Ein Haken ist eine Zusage.** Wenn ein Verb in der Maske steht,
muss es in der Datenbank eine Richtlinie oder einen Trigger geben, die ihn auswerten. Wenn es
ihn nicht gibt, gehört das Verb nicht in den Katalog, sondern als graue Zelle mit Begründung
hinein.

## Einen neuen Bereich hinzufügen

Vier Schritte, und keiner davon ist optional:

1. **Katalog** – eine Zeile in `RECHTE_KATALOG` (`lib/constants.ts`): `schluessel`, `label`,
   die tatsächlich vorkommenden `verben`, eine `erklaerung` (Tooltip an der Zeile) und, falls
   ein Verb fehlt, ein `warumNicht`. Handlungszeile mit `unter: true` und einem Label, das mit
   „– " beginnt. Der Schlüssel heißt nach der **Handlung**, nicht nach der Tabelle.
2. **Vorgabe** – derselbe Schlüssel in `RECHTE_VORGABE`, mit den Rollen je Verb. Das ist das,
   was gilt, bevor jemand die Matrix anfasst.
3. **Migration** – die Richtlinien auf der betroffenen Tabelle, getrennt nach
   `select`/`insert`/`update`/`delete`, die `public.darf('<bereich>','<verb>')` abfragen; dazu
   eine `insert … on conflict do nothing`-Zeile in `module_permissions` mit denselben Vorgaben
   wie in Schritt 2. Wenn die Tabelle `deleted_at` trägt oder ein Löschen begründet werden
   soll: `trg_loeschrecht` und `trg_loeschrecht_soft` mit dem Bereich als Argument anhängen.
   Migration 42 ist die Vorlage, Migration 48 (`rechnungen`) das kleine Beispiel für einen
   nachträglich ergänzten Bereich. Die Projektwache am Anfang jeder Migration nicht vergessen.
4. **Modul-Eintrag** – falls es ein eigener Reiter wird: eine Zeile in `MODULE`
   (`lib/module.ts`) mit `sichtbar: "<bereich>"` oder `"<bereich>.<verb>"` (einstufig, siehe
   Falle oben), Label, Beschreibung und Icon. Damit erscheint er in Seitenleiste und
   Kachelseite zugleich. Innerhalb des Moduls werden einzelne Knöpfe mit
   `darf("<bereich>", "<verb>")` verdrahtet.

Danach mit je einem Testzugang pro Rolle prüfen, dass die Maske und die Datenbank dasselbe
sagen – nicht als Superadmin.

## Siehe auch

- `konstanten-register.md` – wo die Rechte-Konstanten stehen und wer sie verwendet
- `auftraege.md` – Zustände eines Auftrags, das Einfrieren beim Abschluss (Migration 20)
- `artikelstammdaten.md` – wer Preise pflegen darf und warum
- `architektur.md` – Reihenfolge und Inhalt der Migrationen, u. a. die Notiz zur Negativliste
  aus Migration 41
