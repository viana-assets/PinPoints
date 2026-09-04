// Ergebnis eines Kundenkontakts (Migration 23). Bewusst schlank gehalten: das sind die drei
// Ausgänge, die ein Anruf im Alltag tatsächlich hat. Die erlaubten Werte stehen zusätzlich als
// Prüfbedingung in der Datenbank, damit kein direkter API-Aufruf einen vierten erfindet.
export type KontaktErgebnis = "auftrag" | "wiedervorlage" | "kein_interesse";

export type Customer = {
  id: string;
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
  status: "offen" | "kontaktiert";
  last_contact: string | null; // YYYY-MM-DD
  // Was beim letzten Kontakt herauskam (Migration 23). Null heißt „noch nichts festgehalten" –
  // so sind alle Datensätze von vor der Migration.
  kontakt_ergebnis: KontaktErgebnis | null;
  // Ab wann der Kunde wieder auf der Anrufliste stehen soll. Bis dahin ist er auf der Karte
  // orange, danach wieder fällig – siehe `effectiveColor()` in lib/helpers.ts.
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

export type TireStorage = {
  id: string;
  storage_slot_id: string;
  customer_id: string;
  dot_date: string | null;
  profiltiefe_mm: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
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
export type Order = {
  id: string;
  // Fortlaufende, für Menschen lesbare Auftragsnummer (Migration 20) – für Rechnungen und für
  // jedes Gespräch mit dem Kunden. Getrennt von `id` (UUID, technischer Schlüssel).
  order_number: number;
  customer_id: string;
  // Welches Fahrzeug dieses Kunden betrifft der Auftrag (Migration 20). Bei einem Kunden mit
  // mehreren Autos die entscheidende Angabe für den Techniker vor Ort.
  vehicle_id: string | null;
  title: string;
  description: string | null;
  status: OrderStatus;
  order_date: string;
  time: string | null; // HH:MM, optional
  assigned_employee_id: string | null;
  // Freitext-Notiz, die ausschließlich von der zugeordneten Techniker-Rolle selbst gepflegt
  // wird (z. B. "Rad hinten links nicht zugänglich") – getrennt von `description`, das der
  // Admin/Büro-seitige Auftragstext bleibt. Siehe Migration 13 + docs/roadmap.md Phase 4.
  techniker_notiz: string | null;
  // Wer hat wann abgeschlossen bzw. storniert – von der Datenbank gesetzt, nicht vom Client
  // (Migration 20). Ohne Zeitstempel und Person wäre ein Abschluss keine Abnahme.
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  // Begründung der letzten Wiedereröffnung. Die vollständige Historie steht im audit_log.
  reopen_reason: string | null;
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

export type Vehicle = {
  id: string;
  customer_id: string;
  license_plate: string | null;
  make_model: string | null;
  tire_size: string | null;
  tire_dot_date: string | null;
  tire_profile_mm: number | null;
  stored_tire_storage_id: string | null;
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
  // Leistung, bei der etwas ins Lager geht (Migration 22). Steht eine solche Leistung im
  // Auftrag, verlangt die Datenbank vor dem Abschluss einen belegten Lagerplatz.
  //
  // Das Kennzeichen hängt bewusst an der LEISTUNG und nicht an einem festen Namen im Code:
  // kommt später „Felgen einlagern" oder „Dachbox" dazu, wird ein Haken gesetzt statt Code
  // geändert. Ein Vergleich auf „Reifeneinlagerung" wäre beim ersten Umbenennen still kaputt.
  braucht_lagerplatz: boolean;
  created_at: string;
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
  discount_percent: number;
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
