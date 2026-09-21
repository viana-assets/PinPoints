// Ergebnis eines Kundenkontakts (Migration 23). Bewusst schlank gehalten: das sind die drei
// Ausgänge, die ein Anruf im Alltag tatsächlich hat. Die erlaubten Werte stehen zusätzlich als
// Prüfbedingung in der Datenbank, damit kein direkter API-Aufruf einen vierten erfindet.
export type KontaktErgebnis = "auftrag" | "wiedervorlage" | "kein_interesse";

// Wie genau ist die gespeicherte Kartenposition? (Migration 35)
//
// 'exakt'     – der Kartendienst kannte die vollständige Adresse samt Hausnummer.
// 'ungefaehr' – nur die Straße war auffindbar; der Punkt ist die Straßenmitte.
// 'hand'      – jemand hat ihn selbst auf der Karte gesetzt. Das ist die beste Angabe, die
//               es gibt: Sie kommt von einem Menschen, der dort war.
// null        – keine Position (dann sind auch lat/lng leer).
export type GeoGenauigkeit = "exakt" | "ungefaehr" | "hand";

export type Customer = {
  id: string;
  // Die Kundennummer (Migration 48). Sie steht auf der Rechnung und ist für den Kunden die
  // Kennung, unter der er anruft – eine UUID ist dafür unbrauchbar. Von der Datenbank
  // fortlaufend vergeben; `null` nur in dem Augenblick zwischen Anlegen und Trigger.
  kundennummer: number | null;
  // Anzeigename. Bei einer Firma steht hier der Ansprechpartner, der Firmenname in `company`.
  name: string;
  // Firmenname (Migration 24), leer bei Privatpersonen. Bewusst keine eigene Firmen-Tabelle:
  // solange je Firma ein Ansprechpartner reicht, wäre sie eine Verknüpfung ohne Gegenwert.
  company: string | null;
  // "Herr" / "Frau" (Migration 24). Getrennt vom Namen, weil eine Anrede im Namensfeld die
  // alphabetische Sortierung verfälscht und in Anschreiben (Roadmap Phase 5) einzeln gebraucht
  // wird.
  anrede: "Herr" | "Frau" | null;
  email: string | null;
  address: string;
  phone_mobile: string | null;
  phone_landline: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  geo_genauigkeit: GeoGenauigkeit | null;
  status: "offen" | "kontaktiert";
  last_contact: string | null; // YYYY-MM-DD
  // Was beim letzten Kontakt herauskam (Migration 23). Null heißt „noch nichts festgehalten" –
  // so sind alle Datensätze von vor der Migration.
  kontakt_ergebnis: KontaktErgebnis | null;
  // Ab wann der Kunde wieder auf der Anrufliste stehen soll. Bis dahin ist er auf der Karte
  // hellblau, danach wieder fällig – siehe `effectiveColor()` in lib/helpers.ts.
  wiedervorlage_am: string | null; // YYYY-MM-DD
  active: boolean;
  // Seit Migration 19 wird nicht mehr hart gelöscht, sondern nur markiert – die Zeile
  // bleibt für Rechnungsbezug und Änderungsprotokoll erhalten. Alle Listenabfragen
  // filtern deshalb auf `deleted_at is null`.
  deleted_at: string | null;
};

// Der frühere Typ `Appointment` ist entfallen: seit Migration 07 ist ein Termin ein Auftrag
// mit Uhrzeit (siehe `Order` unten). Die Tabelle `public.appointments` existiert in der
// Datenbank noch mit ihren Altdaten, ist seit Migration 16 aber für die API gesperrt und wird
// von der App nicht mehr angefasst (Review-Befund D7).

export type ContactHistoryEntry = {
  id: string;
  customer_id: string;
  date: string;
  note: string | null;
};

export type RowDisplay = "datum" | "status" | "tage";

// Einstellungen, die für den BETRIEB gelten und nicht für einen Nutzer (Migration 38).
// Genau eine Zeile, von der Datenbank erzwungen.
export type Betrieb = {
  termin_intervall_min: number;
  updated_at: string;
  updated_by: string | null;
  // Der Briefkopf (Migration 48). Als Einstellung und nicht im Code: Eine Steuernummer oder
  // eine IBAN ändert sich, ohne dass jemand programmieren können muss.
  firma: string;
  inhaber: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  webseite: string;
  ust_id: string;
  steuernummer: string;
  kontoinhaber: string;
  bank: string;
  iban: string;
  bic: string;
  // Das Logo als data:-URI. Kein Dateispeicher, kein zweiter Dienst, keine Adresse, die
  // irgendwann ins Leere zeigt – das Bild gehört zum Briefkopf und reist mit ihm.
  logo: string;
  // Der Text zwischen Anschriftenfeld und Positionstabelle.
  anschreiben: string;
  fuss_zahlung: string;
  fuss_hinweis: string;
  fuss_dank: string;
  rechnung_praefix: string;
  // Die nächste zu vergebende Nummer. Wird von der Datenbank hochgezählt, nicht vom Client –
  // hier steht sie nur, damit die Maske sie anzeigen und einmalig setzen kann.
  rechnung_naechste_nummer: number;
  kunde_naechste_nummer: number;
};

// Die Felder der Betriebsdaten-Maske. `updated_at`, `updated_by` und die beiden Zähler stehen
// bewusst NICHT darin: Zeitstempel setzt die Datenbank, und die Zähler haben ihre eigene,
// einmalige Eingabe mit eigener Warnung.
export type BetriebFelder = Pick<Betrieb,
  | "firma" | "inhaber" | "strasse" | "plz" | "ort" | "telefon" | "email" | "webseite"
  | "ust_id" | "steuernummer" | "kontoinhaber" | "bank" | "iban" | "bic" | "logo"
  | "anschreiben" | "fuss_zahlung" | "fuss_hinweis" | "fuss_dank" | "rechnung_praefix">;

export type UserSettings = {
  user_id: string;
  period_months: number;
  map_style: string;
  row_display: RowDisplay;
};

export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  created_at: string;
};

export type StorageSlot = {
  id: string;
  warehouse_id: string;
  code: string;
  note: string | null;
  created_at: string;
};

// Saison eines eingelagerten Satzes (Migration 30). Aus diesem einen Feld entsteht die
// Saisonliste: „Welche Kunden haben Winterreifen bei uns liegen?" Die Werteliste erzwingt
// zusätzlich eine Prüfregel in der Datenbank – Freitext fiele sonst aus jeder Auswertung.
export type Saison = "sommer" | "winter" | "ganzjahr";

// Wie wurde die Profiltiefe festgehalten (Migration 33)? Zwei verschiedene Aussagen, nie
// gleichzeitig: „der Satz hat etwa 4 mm" (sammel) oder „VL 5,2 · VR 5,0 · HL 3,1 · HR 3,4"
// (einzeln). Bei `einzeln` bleibt der Satzwert leer und wird für die Anzeige aus den Rädern
// errechnet – das Minimum, denn das schwächste Rad entscheidet.
export type Erfassungsart = "sammel" | "einzeln";

// Position eines Rades am Auto. Null ist erlaubt: bei einem losen Ersatzrad weiß niemand mehr,
// wo es saß.
export type RadPosition = "VL" | "VR" | "HL" | "HR";

export type Felge = "stahl" | "alu" | "keine";

export type EingelagertesRad = {
  id: string;
  tire_storage_id: string;
  position: RadPosition | null;
  reifengroesse: string | null;
  dot_date: string | null;
  profiltiefe_mm: number | null;
  felge: Felge | null;
  sensor: boolean;
  bemerkung: string | null;
  created_at: string;
  updated_at: string;
};

export type TireStorage = {
  id: string;
  storage_slot_id: string;
  customer_id: string;
  // Zu welchem KUNDENFAHRZEUG der Satz gehört (Migration 30). Ein Kunde mit zwei Autos hat
  // zwei Sätze; ohne dieses Feld stand an beiden nur derselbe Name. Null ist möglich für
  // Altbestand – neue Einlagerungen brauchen es spätestens beim Abschluss des Auftrags.
  vehicle_id: string | null;
  saison: Saison | null;
  // Migration 33. Bei „einzeln" ist `profiltiefe_mm` leer und die Räder gelten.
  erfassungsart: Erfassungsart;
  anzahl_raeder: number;
  dot_date: string | null;
  profiltiefe_mm: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
  // In welchem Auftrag wurde der Satz herausgegeben (Migration 46)? Dort steht die
  // Lagergebühr. `null` heißt: liegt noch, oder wurde ohne Auftrag entnommen.
  entnahme_order_id: string | null;
  // Aus welchem Auftrag diese Einlagerung stammt (Migration 22). Null bei allem, was direkt im
  // Lager-Modul eingelagert wurde, und bei Altbestand von vor der Migration.
  order_id: string | null;
};

// Zustände eines Auftrags (Migration 20, Konzept in docs/auftragsablauf.md). Sie werden NICHT
// frei ausgewählt, sondern durch benannte Handlungen erreicht ("Arbeit beginnen",
// "Auftrag abschließen", "Stornieren"); die erlaubten Übergänge erzwingt ein Datenbank-Trigger.
export type OrderStatus = "offen" | "in_arbeit" | "erledigt" | "storniert";

// Ein Auftrag ist seit dem ERP-Umbau zugleich der "Termin": order_date/time sind das
// Datum/die Uhrzeit, zu der etwas beim Kunden ansteht (können aber auch nur ein grobes
// Anlage-Datum sein, wenn kein fester Termin vereinbart ist – time bleibt dann leer).
// Ein Fahrzeug an einem Auftrag, mit dem Kilometerstand dieses Tages (Migration 44).
// Ersetzt `orders.vehicle_id`, das nur EINES zuließ – ein Kunde mit zwei Wagen lässt beide am
// selben Termin wechseln.
export type AuftragFahrzeug = {
  id: string;
  order_id: string;
  vehicle_id: string;
  // `null` heißt „noch nicht abgelesen" und ist etwas anderes als 0: Ein fabrikneuer Wagen
  // hat 0 km. Pflicht wird die Angabe erst beim Abschließen eines Auftrags mit Rechnung.
  kilometerstand: number | null;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  // Fortlaufende, für Menschen lesbare Auftragsnummer (Migration 20) – für Rechnungen und für
  // jedes Gespräch mit dem Kunden. Getrennt von `id` (UUID, technischer Schlüssel).
  order_number: number;
  customer_id: string;
  // Welche Fahrzeuge der Auftrag betrifft, steht in `auftrag_fahrzeuge` (Migration 44) und
  // seit Migration 51 NUR dort. Die frühere Spalte `vehicle_id` ließ eines zu und wurde
  // parallel zur neuen Tabelle weitergeschrieben – die Rechnung las die eine Quelle, der
  // Vorgeschichte-Hinweis die andere.
  title: string;
  description: string | null;
  status: OrderStatus;
  order_date: string;
  time: string | null; // HH:MM, optional
  // Ende des Termins (Migration 37). Null heißt „kein Ende gepflegt" – der Kalender nimmt dann
  // STANDARD_DAUER_MIN an und zeichnet die Unterkante gestrichelt, weil eine Annahme keine
  // Zusage ist. Die Datenbank erzwingt: nur zusammen mit `time`, Form HH:MM, und nach `time`.
  end_time: string | null;
  // Freitext-Notiz, die ausschließlich von der zugeordneten Techniker-Rolle selbst gepflegt
  // wird (z. B. "Rad hinten links nicht zugänglich") – getrennt von `description`, das der
  // Admin/Büro-seitige Auftragstext bleibt. Siehe Migration 13 + docs/roadmap.md Phase 4.
  techniker_notiz: string | null;
  // Mit welchem eigenen Transporter der Auftrag gefahren wird (Migration 32). Null heißt
  // „noch nicht eingeteilt" – und ist damit selbst eine Information für die Einsatzplanung.
  firmenfahrzeug_id: string | null;
  // Wer hat wann abgeschlossen bzw. storniert – von der Datenbank gesetzt, nicht vom Client
  // (Migration 20). Ohne Zeitstempel und Person wäre ein Abschluss keine Abnahme.
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  // Begründung der letzten Wiedereröffnung. Die vollständige Historie steht im audit_log.
  reopen_reason: string | null;
  // Bekommt der Kunde eine Rechnung? (Migration 38) Der Schalter entscheidet, ob auf den
  // Nettobetrag die Steuer kommt. Er steht am AUFTRAG und nicht an der Position: Eine
  // Rechnung schreibt man für den ganzen Vorgang, nicht für einzelne Zeilen darin.
  rechnung_noetig: boolean;
  // Ist zu diesem Auftrag eine Rechnung ausgestellt? `null` heißt „noch offen" – genau das ist
  // die Arbeitsliste.
  //
  // Die Felder stammen aus Migration 40, als die Rechnung noch im ERP entstand und hier nur
  // ihre Nummer notiert wurde. Seit Migration 48/49 ist PinPoints selbst das rechnungsführende
  // System: Beide Werte setzt ein Trigger beim Ausstellen, von Hand ist hier nichts mehr
  // einzutragen und nichts mehr zurückzunehmen. Eine Rechnung wird storniert, nicht abgehakt.
  rechnung_erstellt_am: string | null;
  rechnung_erstellt_von: string | null;
  // Die Nummer des Belegs aus `rechnungen` – lückenlos vergeben (Migration 48).
  rechnung_nummer: string | null;
  created_at: string;
  updated_at: string;
  // Seit Migration 19 wird nicht mehr hart gelöscht, sondern nur markiert – die Zeile
  // bleibt für Rechnungsbezug und Änderungsprotokoll erhalten. Alle Listenabfragen
  // filtern deshalb auf `deleted_at is null`.
  deleted_at: string | null;
};

// Mitarbeiter-Stammdaten für die Einsatzplanung – bewusst unabhängig vom Login-System,
// damit auch nicht registrierte ("Fake"-)Mitarbeiter mit echtem Namen hinterlegt werden
// können, nicht nur eingeladene Techniker-Accounts.
export type Employee = {
  id: string;
  name: string;
  profile_id: string | null;
  created_at: string;
};

// Eigener Transporter (Migration 32). Bewusst eine eigene Tabelle neben `Vehicle`: „Fahrzeug"
// heißt im Kundenkontext das Auto des Kunden und im Einsatzkontext der eigene Wagen. Ein Typ
// mit zwei Bedeutungen wird an fünfzig Stellen zu zwei Bedeutungen.
export type Firmenfahrzeug = {
  id: string;
  kennzeichen: string;
  bezeichnung: string | null;
  notiz: string | null;
  // Ausgemustert statt gelöscht – an alten Aufträgen hängt das Fahrzeug weiter.
  aktiv: boolean;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  customer_id: string;
  license_plate: string | null;
  make_model: string | null;
  // Welche Reifengröße das Auto fährt – eine Eigenschaft des FAHRZEUGS, sie wechselt nicht
  // mit dem Satz. DOT-Datum und Profiltiefe standen hier früher daneben und waren nach dem
  // ersten Saisonwechsel still falsch; sie stehen seit Migration 33/34 am eingelagerten Satz
  // bzw. am einzelnen Rad (siehe docs/lager.md).
  tire_size: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// Artikelstammdaten (Migration 12): Dienstleistungen/Artikel, die einem Auftrag zugeordnet
// werden können. Preise stehen NICHT direkt am Artikel, sondern als eigene Historie in
// ArticlePrice (siehe dort), damit nachvollziehbar bleibt, welcher Preis wann galt.
export type Article = {
  id: string;
  // Für Menschen lesbare Artikelnummer (Migration 14). Beim Anlegen von der Datenbank
  // fortlaufend vorbelegt (Sequenz `article_number_seq`), in der Artikel-Übersicht aber
  // bewusst frei überschreibbar – verschiedene Artikelgruppen brauchen eigene Nummernkreise,
  // dafür reicht eine einzige Sequenz nicht. Eindeutigkeit sichert die Unique-Constraint.
  // Getrennt von `id` (UUID, technischer Primärschlüssel), weil eine UUID als "Artikelnummer"
  // im Alltag unpraktisch wäre.
  article_number: number;
  short_name: string;
  long_name: string;
  active: boolean;
  // Wann wird diese Leistung fällig (Migration 46)?
  //
  //   "normal"       – wenn sie erbracht ist. Alle üblichen Artikel.
  //   "lagergebuehr" – erst beim AUSLAGERN, mit der Menge = Lagermonate. Beim Einlagern weiß
  //                    niemand, wie lange der Satz liegen wird; eine Gebühr ließe sich gar
  //                    nicht beziffern.
  //
  // Ersetzt `braucht_lagerplatz` aus Migration 22. Jenes Kennzeichen trug zwei Aussagen in
  // einem Haken – „hier wird eingelagert" und „das kostet" – und war deshalb beim Auslagern
  // immer falsch herum. Die Spalte steht noch in der Datenbank, wird aber nicht mehr gelesen
  // und fällt in einer späteren Migration.
  abrechnungsart: "normal" | "lagergebuehr";
  // Fallen bei dieser Leistung Altreifen an (Migration 46)? Dann fragt das Auftragsfenster
  // beim Abschließen nach, wenn nichts eingelagert wurde – „nimmt der Kunde die alten mit?".
  //
  // Das ist die zweite, brauchbare Hälfte des alten `braucht_lagerplatz`: die Erinnerung an
  // den Vorgang. Sie sitzt aber an einem ANDEREN Artikel als die Gebühr – am Wechsel, nicht
  // an der Einlagerung –, deshalb hat Migration 46 nichts übernommen und der Haken wird im
  // Artikelstamm von Hand gesetzt. Und es bleibt eine Frage, kein Zwang: Genug Kunden nehmen
  // ihre alten Reifen mit.
  fragt_einlagerung: boolean;
  // Die Einheit auf der Rechnung (Migration 48): „Stück", „Fahrt", „Monate". Sie gehört an den
  // Artikel und nicht an die Position – sie ändert sich nicht von Auftrag zu Auftrag.
  einheit: string;
  // Die Bezeichnung dieser Leistung wird am AUFTRAG eingegeben (Migration 50) und ersetzt auf
  // der Rechnung den Artikelnamen. Für „Sonstiges" und ähnliche Sammelpositionen: Dort hilft
  // der Techniker bei etwas, das in keinem Artikel steht, und vereinbart einen Preis vor Ort.
  //
  // Ein Haken am Artikel und keine Erkennung am Namen: „wenn der Artikel Sonstiges heißt" wäre
  // ein Artikelname als Programmlogik und beim ersten Umbenennen falsch.
  freitext: boolean;
  created_at: string;
};

// Was am Artikel von Hand geändert werden kann. Steht hier und nicht viermal als Inline-Typ
// an den vier Stellen, die ihn durchreichen (Maske → Panel → Seite → Datenzugriff): Beim
// letzten Zusatzfeld musste er an jeder dieser Stellen einzeln nachgezogen werden, und wer
// eine vergisst, merkt es erst am Typfehler.
export type ArtikelFelder = {
  short_name: string;
  long_name: string;
  active: boolean;
  abrechnungsart: Article["abrechnungsart"];
  fragt_einlagerung: boolean;
  einheit: string;
  freitext: boolean;
};

// Ein Preis-Eintrag eines Artikels mit Gültigkeitszeitraum. `valid_to` ist null, solange der
// Preis "bis auf Weiteres" gilt – wird beim Anlegen eines neuen Preises für denselben Artikel
// automatisch auf den Vortag des neuen `valid_from` gesetzt.
export type ArticlePrice = {
  id: string;
  article_id: string;
  net_price: number;
  vat_rate: number;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null; // YYYY-MM-DD
  created_at: string;
};

// Zuordnung eines Artikels zu einem Auftrag. Preis/MwSt. sind ein Schnappschuss zum
// Zuordnungszeitpunkt (nicht live aus ArticlePrice berechnet), damit eine spätere
// Preisänderung bereits zugeordnete Positionen nicht rückwirkend verändert. Rabatt wird
// bewusst individuell hier vergeben, nicht am Artikel selbst.
export type OrderArticle = {
  id: string;
  order_id: string;
  article_id: string;
  quantity: number;
  net_price: number;
  vat_rate: number;
  // Sonderpreis für diese Position (Migration 38). NULL heißt „kein Sonderpreis" – dann gilt
  // Menge × Listenpreis. Das ist etwas anderes als 0, was „geschenkt" bedeutet.
  endpreis_netto: number | null;
  note: string | null;
  created_at: string;
  // Seit Migration 19 wird nicht mehr hart gelöscht, sondern nur markiert – die Zeile
  // bleibt für Rechnungsbezug und Änderungsprotokoll erhalten. Alle Listenabfragen
  // filtern deshalb auf `deleted_at is null`.
  deleted_at: string | null;
};

export type Role = "superadmin" | "admin" | "techniker" | "user";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
};

// Ein Eintrag im Änderungsprotokoll. Die Tabelle stammt aus MIGRATION 18 und zeichnet seit
// damals auf; Migration 36 hat sie nur sichtbar gemacht, drei fehlende Tabellen nachgezogen
// und den Auftrags-/Kundenbezug als eigene Spalte ergänzt.
//
// `alt` und `neu` sind die VOLLSTÄNDIGEN Zeilen vor und nach der Änderung – so schreibt es
// der Trigger aus 18. Was sich davon tatsächlich geändert hat, rechnet `protokollFelder()`
// beim Anzeigen aus. Das ist Absicht: Die Aufzeichnung soll vollständig sein, die Anzeige
// knapp, und beides gleichzeitig geht nur, wenn die Verkürzung nicht in der Datenbank
// stattfindet.
export type AuditAktion = "INSERT" | "UPDATE" | "DELETE";

export type AuditEintrag = {
  id: number;
  tabelle: string;
  datensatz_id: string | null;
  aktion: AuditAktion;
  alt: Record<string, unknown> | null;
  neu: Record<string, unknown> | null;
  // Kennung des Auslösers. Null bei Systemvorgängen ohne angemeldeten Menschen. Den Namen
  // dazu liefert `protokoll_personen()` – `profiles` selbst darf nur der Superadmin lesen.
  geaendert_von: string | null;
  geaendert_am: string;
  // Von der Datenbank berechnet (Migration 36), auch rückwirkend für alle Altzeilen.
  auftrag_id: string | null;
  kunde_id: string | null;
};

export type ProtokollPerson = { id: string; email: string | null };

// ---------------------------------------------------------------- Rechnung (Migration 48/49)
//
// Der Entwurfsentscheid, der alles andere erklärt: Eine Rechnung speichert Empfänger,
// Absender und Positionen als eigene KOPIE (jsonb) und nicht als Verweis auf Kunde, Betrieb
// und Auftrag.
//
// Das sieht nach Doppelung aus und ist das Gegenteil: Zieht der Kunde um, gehört auf die
// Rechnung von letztem Jahr die ALTE Anschrift – dorthin wurde sie geschickt. Wird ein Artikel
// umbenannt oder ein Preis geändert, steht auf der alten Rechnung weiter, was berechnet wurde.
// Ein Dokument, das sich rückwirkend mitverändert, ist kein Beleg.
//
// `order_id` und `customer_id` stehen trotzdem daneben – als Weg zur Navigation („zeig mir den
// Auftrag dazu"), nicht als Quelle des Inhalts.

export type RechnungAbsender = {
  firma: string; inhaber: string; strasse: string; plz: string; ort: string;
  telefon: string; email: string; webseite: string;
  ust_id: string; steuernummer: string;
  kontoinhaber: string; bank: string; iban: string; bic: string;
  logo: string;
};

export type RechnungEmpfaenger = {
  name: string;
  company: string | null;
  anrede: string | null;
  // Die Anschrift ist EIN Textfeld – so steht sie auch beim Kunden. Für den Anschriftenblock
  // wird an den Zeilenumbrüchen getrennt; wo keine sind, an den Kommas.
  address: string;
  email: string | null;
  kundennummer: number | null;
};

export type RechnungPosition = {
  artikelnummer: number | null;
  bezeichnung: string;
  // Die Zusatzzeile der Position (`order_articles.note`), z. B. „Radlager Reifen VR".
  zusatz: string | null;
  menge: number;
  einheit: string;
  // Netto je Einheit, wie er auf dem Papier steht.
  einzelpreis: number;
  // Die Zeilensumme netto. Sie ist IMMER menge × einzelpreis – siehe `positionenAusAuftrag()`
  // in lib/rechnung.ts, wo ein Sonderpreis, der sich nicht glatt auf die Menge verteilt, zu
  // einer eigenen Nachlasszeile wird statt zu einer Zeile, die nicht aufgeht.
  netto: number;
  steuersatz: number;
};

export type RechnungTexte = {
  // Ob die Rechnung mit Umsatzsteuerausweis ausgestellt wurde – der Schalter „Rechnung
  // benötigt" vom Auftrag, zum Zeitpunkt des Ausstellens.
  //
  // Er steht IM SNAPSHOT und nicht am Auftrag, aus demselben Grund wie alles andere hier: Der
  // Schalter am Auftrag kann sich später ändern, der Beleg darf sich davon nicht umrechnen
  // lassen. Ihn aus `steuer !== 0` zu erraten ginge fast immer gut und wäre bei einer Rechnung
  // über lauter steuerfreie Positionen falsch.
  mit_steuer: boolean;
  anschreiben: string;
  fuss_zahlung: string;
  fuss_hinweis: string;
  fuss_dank: string;
  // Woraus die Rechnung entstanden ist – für den Betreffblock. Abschrift wie alles andere:
  // Wird der Auftrag später gelöscht, steht die Nummer trotzdem noch auf dem Beleg.
  auftragsnummer: number | null;
  kennzeichen: string[];
};

export type RechnungArt = "rechnung" | "storno";

export type Rechnung = {
  id: string;
  nummer: number;
  nummer_text: string;
  art: RechnungArt;
  // Auf der ORIGINALRECHNUNG: durch welche Stornorechnung sie aufgehoben wurde.
  storniert_durch: string | null;
  storniert_am: string | null;
  // Auf der STORNORECHNUNG: welche Rechnung sie aufhebt.
  hebt_auf: string | null;
  order_id: string | null;
  customer_id: string | null;
  kundennummer: number | null;
  datum: string; // YYYY-MM-DD
  lieferdatum: string | null;
  empfaenger: RechnungEmpfaenger;
  absender: RechnungAbsender;
  positionen: RechnungPosition[];
  texte: RechnungTexte;
  netto: number;
  steuer: number;
  brutto: number;
  created_at: string;
  created_by: string | null;
};
