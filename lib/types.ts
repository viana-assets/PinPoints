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

export type UserSettings = {
  user_id: string;
  period_months: number;
  map_style: string;
  theme: "light" | "dark";
};
