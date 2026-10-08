"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteCustomerRow, insertCustomer, kundeEmailErgaenzen, markCustomerContacted, markCustomerOpen, positionNeuSuchen,
  setCustomerActive, testkundeLoeschen, updateCustomerFieldsById,
} from "@/lib/api/customers";
import type { Verb } from "@/lib/constants";
import { formatDate } from "@/lib/helpers";
import { qk } from "@/lib/queries/keys";
import type { Customer, KontaktErgebnis } from "@/lib/types";
import type { Nachladen, NeuerTermin, NeuLaden } from "./typen";

// Die Handlungen am Kunden (v127, Fahrplan C5 – aus app/page.tsx herausgelöst, nach dem Muster von
// useLagerAktionen): Kontakt festhalten, offen/aktiv setzen, Stammdaten ändern, Position neu suchen,
// anlegen, löschen. Kunden gehen bewusst nicht offline (claude/offline-schreiben.md) – alles direkt.

export type KundenKontext = {
  supabase: SupabaseClient;
  customers: Customer[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setKontaktKundeId: (id: string | null) => void;
  // Ein im Kalender angeklickter Termin, der auf den neuen Kunden wartet.
  terminFuerNeuenKunden: NeuerTermin | null;
  setTerminFuerNeuenKunden: (t: NeuerTermin | null) => void;
  darf: (bereich: string, verb?: Verb) => boolean;
  neuenAuftragAnlegen: (kundenId: string, termin?: NeuerTermin | null) => Promise<void>;
  refreshCustomers: Nachladen;
  refreshOrders: Nachladen;
  refreshTireStorages: Nachladen;
  loadHistory: (customerId: string) => void | Promise<void>;
  neuLaden: NeuLaden;
};

export function useKundenAktionen(k: KundenKontext) {
  const {
    supabase, customers, selectedId, setSelectedId, setKontaktKundeId, terminFuerNeuenKunden, setTerminFuerNeuenKunden,
    darf, neuenAuftragAnlegen, refreshCustomers, refreshOrders, refreshTireStorages, loadHistory, neuLaden,
  } = k;

  // Kontakt bestätigen – und sonst nichts. Bis zum 29.08.2026 hing an dieser Funktion noch ein
  // Ankreuzfeld "Termin dabei vereinbart", das im selben Zug einen Auftrag anlegte. Das hat zwei
  // Dinge verbunden, die nicht zusammengehören: ein Auftrag entsteht auch ohne Anruf (Kunde
  // steht vor Ort, Anschlussauftrag), und ein Anruf führt oft zu keinem Auftrag. Vor allem aber
  // setzte jede Auftragsanlage `last_contact` – und daran hängt die Wiedervorlage-Uhr. Auftrag
  // anlegen geht jetzt über denselben Weg wie überall: das Auftragsformular.
  // Siehe docs/termine-kontakt-auftrag-analyse.md.
  // Kunde, für den gerade der Kontaktdialog offen ist (Migration 23). Der Dialog ersetzt das
  // frühere „Kontaktiert speichern", das nur festhielt, DASS telefoniert wurde.
  // Siehe docs/kunden-und-karte.md.
  async function kontaktFesthalten(id: string, ergebnis: KontaktErgebnis, contactDate: string, wiedervorlageAm: string | null) {
    const notiz =
      ergebnis === "auftrag" ? "Kontaktiert – Auftrag vereinbart"
      : ergebnis === "wiedervorlage" ? `Kontaktiert – Wiedervorlage am ${formatDate(wiedervorlageAm || contactDate)}`
      : "Kontaktiert – kein Interesse";
    await markCustomerContacted(supabase, id, contactDate, notiz, ergebnis, wiedervorlageAm);
    await refreshCustomers();
    if (selectedId === id) loadHistory(id);
    setKontaktKundeId(null);
    // „Auftrag anlegen" führt direkt weiter ins Auftragsfenster – der Kontakt ist zu diesem
    // Zeitpunkt bereits geschrieben, es geht also nichts verloren, falls dort abgebrochen wird.
    if (ergebnis === "auftrag" && darf("auftraege.anlegen", "schreiben")) await neuenAuftragAnlegen(id);
  }
  async function markOpen(id: string) {
    await markCustomerOpen(supabase, id);
    await refreshCustomers();
  }
  async function setActive(id: string, active: boolean) {
    await setCustomerActive(supabase, id, active);
    await refreshCustomers();
  }
  async function deleteCustomerById(id: string) {
    await deleteCustomerRow(supabase, id);
    // Erst das Fenster schließen, DANN neu laden. Umgekehrt stand der Kunde nach dem Neuladen
    // nicht mehr in der Liste, das Fenster war aber noch offen und griff ins Leere – die ganze
    // Seite brach mit „This page couldn't load" ab (24.09.2026, beim Löschen der Laufkundschaft).
    setSelectedId(null);
    await refreshCustomers();
    await refreshOrders();
  }
  // Testkunde restlos löschen (Migration 60). Wie oben: erst das Fenster zu, dann neu laden –
  // und diesmal alles, woran der Kunde hing: Aufträge, Rechnungen, Lager, Fahrzeuge.
  async function testkundeRestlosLoeschen(id: string) {
    await testkundeLoeschen(supabase, id);
    setSelectedId(null);
    await refreshCustomers();
    await refreshOrders();
    await refreshTireStorages();
    neuLaden(qk.rechnungen(), qk.fahrzeuge());
  }
  async function updateCustomerFields(id: string, fields: Partial<Customer>) {
    const cust = customers.find((c) => c.id === id);
    await updateCustomerFieldsById(supabase, id, fields, cust?.address);
    await refreshCustomers();
  }

  // Die Adresse eines einzelnen Kunden neu suchen lassen. Der Rückgabewert sagt, ob etwas
  // gefunden wurde – das Kundenfenster zeigt den Befund selbst an, damit „nichts gefunden"
  // nicht als Fehler im roten Band erscheint. Ein Fehler ist es nämlich nicht.
  async function positionSuchen(id: string): Promise<boolean> {
    const cust = customers.find((c) => c.id === id);
    if (!cust?.address) return false;
    const gefunden = await positionNeuSuchen(supabase, id, cust.address);
    if (gefunden) await refreshCustomers();
    return gefunden;
  }
  async function addCustomer(fields: {
    name: string; address: string; phone_mobile: string; phone_landline: string; note: string;
    company: string; email: string; anrede: "" | "Herr" | "Frau";
    koordinate: { lat: number; lng: number } | null;
    auftragAnlegen: boolean;
    laufkundschaft: boolean;
    einmalkunde: boolean;
    testkunde: boolean;
  }) {
    const { id: createdId, lat } = await insertCustomer(supabase, fields);
    await refreshCustomers();
    // Ruft ein Kunde selbst an und wird dabei neu angelegt, ist meist auch schon klar, worum es
    // geht. Statt eines eigenen kleinen Auftragsformulars hier führt der Weg über dieselbe
    // Maske wie überall: Zeile anlegen, vollständiges Auftragsfenster öffnen.
    if (createdId && fields.auftragAnlegen && darf("auftraege.anlegen", "schreiben")) {
      // Kam der Weg über einen Klick in den Kalender, ist der Termin schon gewählt – er wartet
      // seit dem Klick in `terminFuerNeuenKunden` und wird jetzt eingesetzt. Danach wird er
      // gelöscht: Der nächste Kunde, der ohne Kalender angelegt wird, soll nicht die Uhrzeit
      // von vorgestern erben.
      const termin = terminFuerNeuenKunden;
      setTerminFuerNeuenKunden(null);
      await neuenAuftragAnlegen(createdId, termin);
    }
    return lat != null;
  }

  // Die E-Mail-Adresse aus der Rechnungs-Abhakliste landet beim KUNDEN, nicht am Auftrag.
  // Seit v119 über `kunde_email_ergaenzen()` (Migration 74): So darf auch der Techniker eine
  // fehlende Adresse eintragen – sonst ließe sich sein Auftrag mit „Rechnung nötig“ nicht
  // abschließen. Die Funktion ändert nur dieses eine Feld; eine Geokodierung entfällt damit.
  async function kundenEmailSpeichern(kundeId: string, email: string) {
    await kundeEmailErgaenzen(supabase, kundeId, email);
    neuLaden(qk.kunden());
  }

  return {
    addCustomer, deleteCustomerById, kontaktFesthalten, kundenEmailSpeichern, markOpen, positionSuchen, setActive,
    testkundeRestlosLoeschen, updateCustomerFields,
  };
}
