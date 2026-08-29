// Zentrale, modulübergreifende Konstanten – siehe docs/konstanten-register.md und
// docs/README.md (Konstanten-Regel: ein fester Wertebereich wird genau einmal hier benannt
// und überall per Name referenziert, nie als literaler Wert ein zweites Mal hingeschrieben).
//
// Rein modul-lokale Konstanten (z. B. MAP_STYLES in lib/mapStyles.ts, DEFAULT_VAT_RATE in
// lib/helpers.ts) bleiben bewusst bei ihrem Thema statt hier gesammelt zu werden – hier
// stehen nur Konstanten, die von mehreren, fachlich unterschiedlichen Stellen in
// app/page.tsx verwendet werden (Rollen, Berechtigungen, Auftragsstatus, Kalenderfarben).

import type { OrderStatus, Role } from "./types";

// ---------------------------------------------------------------- Rollen
export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  techniker: "Techniker",
  user: "Nutzer",
};

// Alle existierenden Rollen, abgeleitet aus ROLE_LABEL – damit es keine zweite Aufzählung
// gibt, die beim Hinzufügen einer Rolle vergessen werden kann (z. B. in der Einladungsroute).
export const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[];

// ---------------------------------------------------------------- Auftragsstatus
// Anzeigename je Auftragsstatus – referenziert von CustomerOrderRow, AuftraegePanel und
// EinsatzplanungPanel (vorher an allen drei Stellen als identische lokale Konstante
// dupliziert, siehe docs/konstanten-register.md).
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

// Farbklasse je Zustand für das Status-Kennzeichen (.badge in globals.css). Seit Migration 20
// ist der Status in den Listen nur noch eine Anzeige – gehandelt wird im Auftragsfenster über
// benannte Schaltflächen, siehe docs/auftragsablauf.md.
export const ORDER_STATUS_FARBE: Record<OrderStatus, string> = {
  offen: "red",
  in_arbeit: "orange",
  erledigt: "green",
  storniert: "grau",
};

// Zustände, in denen die Positionen eines Auftrags eingefroren sind: die Rechnungsgrundlage
// steht fest und darf sich nicht mehr ändern. Ein Datenbank-Trigger erzwingt dasselbe
// (Migration 20) – hier steht es nur, damit die Oberfläche gar nicht erst etwas anbietet, das
// die Datenbank ohnehin ablehnen würde.
export const ABGESCHLOSSENE_ZUSTAENDE: OrderStatus[] = ["erledigt", "storniert"];

export function istAbgeschlossen(status: OrderStatus): boolean {
  return ABGESCHLOSSENE_ZUSTAENDE.includes(status);
}

// ---------------------------------------------------------------- Modul-Berechtigungen
// Ein fester Katalog von Berechtigungs-"Zeilen", jede mit einem eindeutigen Schlüssel (in
// `module_permissions.module_key` gespeichert). "view.*" steuert, ob eine Rolle den
// jeweiligen Tab überhaupt sieht/öffnen kann; "action.*" steuert einzelne Handlungen
// innerhalb eines Moduls (aktuell nur Lager, weil das konkret gefragt war – lässt sich für
// weitere Module genauso ergänzen). Superadmin darf immer alles, unabhängig von dieser
// Tabelle. Dashboard ist immer für alle sichtbar (Startseite/Absturz-Sicherung), daher zwar
// in der Liste (Transparenz), aber nicht abwählbar.
export type PermItem = { key: string; label: string; indent?: boolean; locked?: boolean };

export const PERMISSION_CATALOG: PermItem[] = [
  { key: "view.dashboard", label: "Dashboard", locked: true },
  { key: "view.kunden", label: "Kunden" },
  { key: "view.auftraege", label: "Aufträge" },
  { key: "view.termine", label: "Termine" },
  { key: "view.lager", label: "Lager" },
  { key: "action.lager.tire_assign", label: "– Reifen einem Lagerplatz zuordnen/entfernen", indent: true },
  { key: "action.lager.slot_create", label: "– Lagerplätze anlegen", indent: true },
  { key: "action.lager.slot_delete", label: "– Lagerplätze löschen", indent: true },
  { key: "action.lager.warehouse_create", label: "– Neues Lager anlegen", indent: true },
  { key: "action.lager.warehouse_edit", label: "– Lager bearbeiten (Name/Adresse/Notiz)", indent: true },
  { key: "action.lager.warehouse_delete", label: "– Lager löschen", indent: true },
  { key: "view.einsatzplanung", label: "Einsatzplanung" },
  { key: "view.neuer_kunde", label: "Neuer Kunde" },
  { key: "view.inaktive_kunden", label: "Inaktive Kunden" },
  { key: "view.artikel", label: "Artikel" },
  { key: "view.einstellungen", label: "Einstellungen" },
];

// Fallback, solange in der Datenbank (noch) keine Zeile für einen Schlüssel existiert –
// entspricht dem Verhalten von vor der Modul-Berechtigungen-Funktion (nichts eingeschränkt),
// außer bei den Lager-Struktur-Aktionen, die von Anfang an nur Admin/Superadmin waren.
// Techniker sieht bewusst kein "view.kunden"/"view.neuer_kunde"/"view.inaktive_kunden" mehr
// (Phase 4: Techniker-Rolle mit echten Rechten) – volle Kundenstammdaten-Verwaltung bleibt
// Admin/Superadmin/Nutzer vorbehalten. Ist eine Zeile bereits in `module_permissions`
// hinterlegt (z. B. aus einem Stand vor dieser Änderung), überschreibt die Datenbank-Zeile
// diesen Fallback – dann bitte einmalig im Admin-Bereich unter "Modulverwaltung" bei den drei
// Kunden-Zeilen den Haken bei "Techniker" entfernen.
export const PERMISSION_DEFAULTS: Record<string, string[]> = {
  "view.dashboard": ["admin", "techniker", "user"],
  "view.kunden": ["admin", "user"],
  "view.auftraege": ["admin", "techniker", "user"],
  "view.termine": ["admin", "techniker", "user"],
  "view.lager": ["admin", "techniker", "user"],
  "action.lager.tire_assign": ["admin", "techniker", "user"],
  "action.lager.slot_create": ["admin"],
  "action.lager.slot_delete": ["admin"],
  "action.lager.warehouse_create": ["admin"],
  "action.lager.warehouse_edit": ["admin"],
  "action.lager.warehouse_delete": ["admin"],
  "view.einsatzplanung": ["admin", "techniker", "user"],
  "view.neuer_kunde": ["admin", "user"],
  "view.inaktive_kunden": ["admin", "user"],
  // "Artikel" (vorher "Artikelstamm" im Admin-Bereich, siehe docs/roadmap.md Phase 4) ist eine
  // eigene Kachel wie "Kunden"/"Neuer Kunde" – Pflegen bleibt laut RLS ohnehin nur
  // Admin/Superadmin vorbehalten (Migration 12), hier geht es nur um das Sehen der Übersicht.
  "view.artikel": ["admin", "user"],
  "view.einstellungen": ["admin", "techniker", "user"],
};

export const PERMISSION_ROLES: Role[] = ["admin", "techniker", "user"];

// ---------------------------------------------------------------- Einsatzplanung
// Farbpalette für Mitarbeiter-Punkte im Kalender – Farbe pro Mitarbeiter ist stabil nach
// Reihenfolge in der Mitarbeiterliste, siehe employeeColorFor() in app/page.tsx.
export const EMP_COLORS = ["#FF5A1F", "#1E9B6E", "#1E3A5F", "#8a5cf6", "#e0447a", "#c9a227", "#2f8fd1", "#a15c2e"];
