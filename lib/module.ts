import type { ComponentType } from "react";
import {
  IconDashboard, IconKunden, IconAuftraege, IconTermine, IconLager, IconSaison,
  IconEinsatzplanung, IconNeu, IconInaktiv, IconArtikel, IconAdmin, IconSettings,
} from "@/components/icons";

// Die Module der Anwendung – EINE Liste für beide Navigationen.
//
// Warum das hier steht und nicht zweimal in app/page.tsx: Es gab die Seitenleiste (Desktop)
// und die Kachelseite „Weitere" (Handy) als zwei handgeschriebene Aufzählungen derselben
// Module. Zweimal dasselbe zu pflegen geht genau so lange gut, bis jemand ein Modul ergänzt –
// am 10.09.2026 fehlten deshalb die Saisonliste UND der Artikelstamm auf dem Handy, und zwar
// wochenlang unbemerkt, weil am Schreibtisch alles da war.
//
// Das ist die Konstanten-Regel aus docs/README.md, angewandt auf die Navigation: ein fester
// Wertebereich wird genau einmal benannt und überall per Name referenziert.

export type TabKey =
  | "dashboard" | "list" | "termine" | "lager" | "saison" | "einsatzplanung"
  | "auftraege" | "inactive" | "add" | "settings" | "admin" | "artikel" | "more";

export type ModulEintrag = {
  tab: TabKey;
  label: string;
  // Der Satz auf der Kachelseite „Weitere". In der schmalen Leiste steht nur das Label.
  beschreibung: string;
  Icon: ComponentType;
  // `null` = immer sichtbar (Dashboard), `"admin"` = nur für Admin/Superadmin, sonst der
  // Modulschlüssel für canView() (siehe PERMISSION_DEFAULTS in lib/constants.ts).
  sichtbar: string | null | "admin";
  // Die drei wichtigsten Module stehen am Handy in der unteren Leiste, alles andere hinter
  // „Weitere". Am Desktop ist beides dieselbe, breite Seitenleiste.
  primaer?: boolean;
  // Trennlinie bzw. Abstandhalter VOR diesem Eintrag (nur Seitenleiste).
  trennerDavor?: "linie" | "abstand";
};

export const MODULE: ModulEintrag[] = [
  { tab: "dashboard",      label: "Dashboard",        beschreibung: "Kennzahlen und der Überblick über den Tag",                 Icon: IconDashboard,      sichtbar: null,                primaer: true },
  { tab: "list",           label: "Kunden",           beschreibung: "Kundenliste mit Karte, Filtern und Kontakt",                Icon: IconKunden,         sichtbar: "kunden",            primaer: true },
  { tab: "auftraege",      label: "Aufträge",         beschreibung: "Alle Aufträge, Leistungen und Zustände",                    Icon: IconAuftraege,      sichtbar: "auftraege",         primaer: true },

  { tab: "termine",        label: "Termine",          beschreibung: "Chronologische Terminübersicht (Aufträge mit Uhrzeit)",     Icon: IconTermine,        sichtbar: "termine",           trennerDavor: "linie" },
  { tab: "lager",          label: "Lager",            beschreibung: "Lager & Lagerplätze verwalten, Reifen zuordnen",            Icon: IconLager,          sichtbar: "lager" },
  { tab: "saison",         label: "Saisonliste",      beschreibung: "Wer hat welche Reifen bei uns liegen – die Anrufliste",     Icon: IconSaison,         sichtbar: "saison" },
  { tab: "einsatzplanung", label: "Einsatzplanung",   beschreibung: "Aufträge nach Tag, Mitarbeiter und Fahrzeug planen",        Icon: IconEinsatzplanung, sichtbar: "einsatzplanung" },
  { tab: "add",            label: "Neuer Kunde",      beschreibung: "Kunden anlegen, optional gleich mit Auftrag",               Icon: IconNeu,            sichtbar: "neuer_kunde" },
  { tab: "inactive",       label: "Inaktive Kunden",  beschreibung: "Deaktivierte Kunden ansehen & reaktivieren",                Icon: IconInaktiv,        sichtbar: "inaktive_kunden" },
  { tab: "artikel",        label: "Artikel",          beschreibung: "Artikelstamm und Preis-Historie",                           Icon: IconArtikel,        sichtbar: "artikel" },

  { tab: "admin",          label: "Admin",            beschreibung: "Nutzer einladen & verwalten, Mitarbeiter, Firmenfahrzeuge", Icon: IconAdmin,          sichtbar: "admin", trennerDavor: "abstand" },
  { tab: "settings",       label: "Einstellungen",    beschreibung: "Anzeige, Wiedervorlage-Zeitraum, App, Abmelden",            Icon: IconSettings,       sichtbar: "einstellungen" },
];

// Welche Reiter stecken auf dem Handy hinter „Weitere"? Ergibt sich aus der Liste, statt
// daneben gepflegt zu werden – sonst leuchtet der Knopf irgendwann beim falschen Modul.
export const SEKUNDAERE_TABS: TabKey[] = MODULE.filter((m) => !m.primaer).map((m) => m.tab);
