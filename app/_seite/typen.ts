import type { AbsichtInhalt } from "@/lib/offline/ausgang";
import type { OrderStatus } from "@/lib/types";

// Gemeinsame Bausteine für die Handlungs-Hooks der Startseite (v113, Fahrplan C5). Die Hooks
// bekommen von HomePage (app/page.tsx) dieselben Werkzeuge, mit denen sie dort gearbeitet haben.

// Einen oder mehrere Zwischenspeicher neu laden (`neuLaden` in app/page.tsx).
export type NeuLaden = (...schluessel: readonly (readonly unknown[])[]) => Promise<void>;

// Direkt schreiben oder – ohne Netz – als Absicht in den Ausgangskorb (`offlineOderDirekt`).
export type AbsichtMitTitel = { inhalt: AbsichtInhalt; titel: string };
export type OfflineOderDirekt = (
  direkt: () => Promise<void>,
  absicht: () => AbsichtMitTitel | AbsichtMitTitel[] | null,
  nurOffline?: boolean,
) => Promise<void>;

// Einen Auftrag anlegen (`addOrder`); gibt die Kennung zurück.
export type AuftragAnlegen = (fields: {
  customerId: string; title: string; description: string; orderDate: string; time: string; endTime?: string;
  status: OrderStatus; assignedEmployeeIds: string[];
}) => Promise<string>;

export type Nachladen = () => Promise<void>;

// Ein im Kalender angeklickter Termin für einen neuen Auftrag (Tag, Beginn, Ende).
export type NeuerTermin = { datum: string; von: string | null; bis: string | null };
