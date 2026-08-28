export type Customer = {
  id: string;
  name: string;
  address: string;
  phone_mobile: string | null;
  phone_landline: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  status: "offen" | "kontaktiert";
  last_contact: string | null; // YYYY-MM-DD
  active: boolean;
};

export type Appointment = {
  id: string;
  customer_id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  description: string | null;
};

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
};

export type OrderStatus = "offen" | "in_arbeit" | "erledigt";

// Ein Auftrag ist seit dem ERP-Umbau zugleich der "Termin": order_date/time sind das
// Datum/die Uhrzeit, zu der etwas beim Kunden ansteht (können aber auch nur ein grobes
// Anlage-Datum sein, wenn kein fester Termin vereinbart ist – time bleibt dann leer).
export type Order = {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  status: OrderStatus;
  order_date: string;
  time: string | null; // HH:MM, optional
  assigned_employee_id: string | null;
  created_at: string;
  updated_at: string;
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
  short_name: string;
  long_name: string;
  active: boolean;
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
};

export type Role = "superadmin" | "admin" | "techniker" | "user";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
};
