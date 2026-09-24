import type { ComponentType } from "react";
import {
  IconDashboard, IconKunden, IconAuftraege, IconTermine, IconLager, IconSaison,
  IconEinsatzplanung, IconNeu, IconInaktiv, IconArtikel, IconAuswertung, IconRechnung, IconAdmin, IconSettings,
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
  | "auftraege" | "inactive" | "add" | "settings" | "admin" | "artikel" | "auswertung" | "rechnungen" | "more";

export type ModulEintrag = {
  tab: TabKey;
  label: string;
  // Der Satz auf der Kachelseite „Weitere". In der schmalen Leiste steht nur das Label.
  beschreibung: string;
  Icon: ComponentType;
  // `null` = immer sichtbar (Dashboard), `"admin"` = nur für Admin/Superadmin, sonst
  // `<bereich>` oder `<bereich>.<verb>` für canView() (siehe RECHTE_KATALOG in
  // lib/constants.ts). Ohne Verb gilt „lesen".
  //
  // „Neuer Kunde" und „Inaktive Kunden" haben seit dem 17.09.2026 keinen eigenen Rechte-
  // Eintrag mehr: Das eine ist „Kunden schreiben", das andere „Kunden lesen". Zwei Schlüssel
  // für dieselbe Aussage laufen auseinander, sobald jemand nur einen davon umstellt – und
  // dann steht in der Modulverwaltung etwas anderes, als die Datenbank tut.
  sichtbar: string | null | "admin";
  // Die vier wichtigsten Module stehen am Handy in der unteren Leiste, alles andere hinter
  // „Weitere" (seit 23.09.2026 vier statt drei: Einsatzplanung kam dazu). Am Desktop ist beides dieselbe, breite Seitenleiste.
  primaer?: boolean;
  // Trennlinie bzw. Abstandhalter VOR diesem Eintrag (nur Seitenleiste).
  trennerDavor?: "linie" | "abstand";
};

export const MODULE: ModulEintrag[] = [
  // Reihenfolge seit dem 23.09.2026: Dashboard, Einsatzplanung, Aufträge, Kunden – so, wie der
  // Tag abläuft (erst der Plan, dann die Arbeit daran, dann die Kartei). Gilt für beide
  // Navigationen: die Seitenleiste am Rechner und die untere Leiste am Handy.
  { tab: "dashboard",      label: "Dashboard",        beschreibung: "Kennzahlen und der Überblick über den Tag",                 Icon: IconDashboard,      sichtbar: null,                primaer: true },
  { tab: "einsatzplanung", label: "Einsatzplanung",   beschreibung: "Aufträge nach Tag, Mitarbeiter und Fahrzeug planen",        Icon: IconEinsatzplanung, sichtbar: "einsatzplanung",    primaer: true },
  { tab: "auftraege",      label: "Aufträge",         beschreibung: "Alle Aufträge, Leistungen und Zustände",                    Icon: IconAuftraege,      sichtbar: "auftraege",         primaer: true },
  { tab: "list",           label: "Kunden",           beschreibung: "Kundenliste mit Karte, Filtern und Kontakt",                Icon: IconKunden,         sichtbar: "kunden",            primaer: true },

  { tab: "termine",        label: "Termine",          beschreibung: "Chronologische Terminübersicht (Aufträge mit Uhrzeit)",     Icon: IconTermine,        sichtbar: "termine",           trennerDavor: "linie" },
  { tab: "lager",          label: "Lager",            beschreibung: "Lager & Lagerplätze verwalten, Reifen zuordnen",            Icon: IconLager,          sichtbar: "lager" },
  { tab: "saison",         label: "Saisonliste",      beschreibung: "Wer hat welche Reifen bei uns liegen – die Anrufliste",     Icon: IconSaison,         sichtbar: "saison" },
  { tab: "add",            label: "Neuer Kunde",      beschreibung: "Kunden anlegen, optional gleich mit Auftrag",               Icon: IconNeu,            sichtbar: "kunden.schreiben" },
  { tab: "inactive",       label: "Inaktive Kunden",  beschreibung: "Deaktivierte Kunden ansehen & reaktivieren",                Icon: IconInaktiv,        sichtbar: "kunden.lesen" },
  { tab: "artikel",        label: "Artikel",          beschreibung: "Artikelstamm und Preis-Historie",                           Icon: IconArtikel,        sichtbar: "artikel" },
  { tab: "rechnungen",     label: "Rechnungen",       beschreibung: "Alle ausgestellten Rechnungen, Nachdruck und Storno",       Icon: IconRechnung,       sichtbar: "rechnungen" },
  { tab: "auswertung",     label: "Auswertungen",     beschreibung: "Umsatz, Steuer, Nachlass, Saisonalität, Mitarbeiter, Artikel", Icon: IconAuswertung,   sichtbar: "auswertung" },

  { tab: "admin",          label: "Admin",            beschreibung: "Nutzer einladen & verwalten, Mitarbeiter, Firmenfahrzeuge", Icon: IconAdmin,          sichtbar: "admin", trennerDavor: "abstand" },
  { tab: "settings",       label: "Einstellungen",    beschreibung: "Anzeige, Wiedervorlage-Zeitraum, App, Abmelden",            Icon: IconSettings,       sichtbar: "einstellungen" },
];

// Womit die App beim Öffnen startet (seit 23.09.2026): die Einsatzplanung – der Plan des Tages
// ist das Erste, was man sehen will. Darf jemand die Einsatzplanung nicht sehen, fällt die
// Seite auf das Dashboard zurück (app/page.tsx), das für alle sichtbar ist. Links aus
// Benachrichtigungen und QR-Aufklebern öffnen weiterhin ihr eigenes Ziel.
export const START_TAB: TabKey = "einsatzplanung";
export const START_TAB_ERSATZ: TabKey = "dashboard";

// Welche Reiter stecken auf dem Handy hinter „Weitere"? Ergibt sich aus der Liste, statt
// daneben gepflegt zu werden – sonst leuchtet der Knopf irgendwann beim falschen Modul.
export const SEKUNDAERE_TABS: TabKey[] = MODULE.filter((m) => !m.primaer).map((m) => m.tab);
