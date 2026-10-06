"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, ArticlePrice, Customer, EingelagertesRad, OrderArticle, StorageSlot, Warehouse } from "@/lib/types";
import type { AuftragAnlegen, Nachladen, NeuLaden, OfflineOderDirekt } from "./typen";
import { type AuslagernWahl } from "@/components/lager/AuslagernDialog";
import { insertOrderArticle } from "@/lib/api/articles";
import { type RadFelder, deleteRadById, deleteStorageSlotById, deleteWarehouseById, insertRad, insertStorageSlot, insertStorageSlotsBulk, insertWarehouse, radZuZeile, removeTireAssignmentById, satzVormerken, setAnzahlRaeder, setErfassungsart, satzNotizenSpeichern, tauschAnlegen, updateRadById, updateSlotGroesse, updateTireStorageDetails, updateWarehouseById, upsertTireAssignment, vormerkungZuruecknehmen } from "@/lib/api/lager";
import { formatDate, terminTitel, todayStr } from "@/lib/helpers";
import { istVorgemerkt } from "@/lib/lagerVormerkung";
import type { SatzNotizen } from "@/lib/lagerNotizen";
import { type MitnehmenEintrag } from "@/lib/mitnehmen";
import { qk } from "@/lib/queries/keys";
import { type StapelSchritt, stapelSchritte } from "@/lib/stapelAuslagern";
import { auftragsNr } from "@/lib/testkunde";
import { type Erfassungsart, type Order, type PlatzGroesse, type RadPosition, type Saison, type TireStorage } from "@/lib/types";
import { useState } from "react";

export type LagerKontext = {
  supabase: SupabaseClient;
  // Der Regalbestand (ohne Tausch-Sätze), alle Sätze, die hereinkommenden, und der Stand vor den
  // Offline-Absichten (für die Radmessung).
  tireStorages: TireStorage[];
  alleSaetze: TireStorage[];
  kommtReinSaetze: TireStorage[];
  tireStoragesGeladen: TireStorage[];
  eingelagerteRaeder: EingelagertesRad[];
  storageSlots: StorageSlot[];
  warehouses: Warehouse[];
  customers: Customer[];
  orders: Order[];
  articles: Article[];
  articlePrices: ArticlePrice[];
  orderArticles: OrderArticle[];
  orderArticlesFor: (orderId: string) => OrderArticle[];
  addOrder: AuftragAnlegen;
  setOffenerAuftragId: (id: string | null) => void;
  neuLaden: NeuLaden;
  offlineOderDirekt: OfflineOderDirekt;
  refreshWarehouses: Nachladen;
  refreshStorageSlots: Nachladen;
  refreshTireStorages: Nachladen;
  refreshOrderArticles: Nachladen;
};

// Die Lager-Handlungen der Startseite (v113, Fahrplan C5): Lager und Plätze verwalten, ein- und
// auslagern, vormerken (Migration 67), Reifentausch (Migration 69), Einlagerung am Auftrag und die
// Räder. Bis v112 standen sie mitten in app/page.tsx; dort steht jetzt nur noch der Aufruf.
//
// Reine Verschiebung: Die Funktionen sind dieselben, sie bekommen ihre Abhängigkeiten nur als
// Kontext statt aus dem Rumpf von HomePage. Was sie brauchen, steht in `LagerKontext`.

export function useLagerAktionen(k: LagerKontext) {
  const {
    supabase, tireStorages, alleSaetze, kommtReinSaetze, tireStoragesGeladen, eingelagerteRaeder, storageSlots, warehouses,
    customers, orders, articles, articlePrices, orderArticles, orderArticlesFor, addOrder, setOffenerAuftragId, neuLaden,
    offlineOderDirekt, refreshWarehouses, refreshStorageSlots, refreshTireStorages, refreshOrderArticles,
  } = k;
  // ---------------------------------------------------------------- Lager-Modul
  async function addWarehouse(fields: { name: string; address: string; note: string }): Promise<string | undefined> {
    const id = await insertWarehouse(supabase, fields);
    await refreshWarehouses();
    return id;
  }
  async function updateWarehouse(id: string, fields: { name: string; address: string; note: string }) {
    await updateWarehouseById(supabase, id, fields);
    await refreshWarehouses();
  }
  async function deleteWarehouse(id: string) {
    await deleteWarehouseById(supabase, id);
    await refreshWarehouses();
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function addStorageSlot(warehouseId: string, code: string) {
    await insertStorageSlot(supabase, warehouseId, code);
    await refreshStorageSlots();
  }
  // Bulk-Anlage von Lagerplätzen nach einer Nummerierungslogik (Präfix + Start/Ende + Stellen),
  // z. B. Präfix "A", 1–20, 2-stellig → A-01 … A-20. Wird sowohl beim Anlegen eines neuen Lagers
  // als auch später zum Nachrüsten weiterer Plätze verwendet.
  async function addStorageSlotsBulk(warehouseId: string, codes: string[], groesse: PlatzGroesse = "normal") {
    await insertStorageSlotsBulk(supabase, warehouseId, codes, groesse);
    await refreshStorageSlots();
  }
  // Fachgröße umstellen (E12, Migration 64).
  async function slotGroesseSetzen(id: string, groesse: PlatzGroesse) {
    await updateSlotGroesse(supabase, id, groesse);
    await refreshStorageSlots();
  }
  async function deleteStorageSlot(id: string) {
    await deleteStorageSlotById(supabase, id);
    await refreshStorageSlots();
    await refreshTireStorages();
  }
  async function assignTire(fields: { id?: string; storageSlotId: string; customerId: string; dotDate: string; profiltiefeMm: string; note: string; vehicleId?: string | null; saison?: Saison | null; radNotizen?: SatzNotizen }) {
    const id = await upsertTireAssignment(supabase, fields);
    await refreshTireStorages();
    return id;
  }
  // Das Herausgeben eines Satzes geht seit Migration 46 durch EINEN Dialog – egal, ob es an
  // der Regalwand oder im Auftragsfenster angestoßen wurde. Vorher war es ein stiller
  // Datenbankschreibvorgang; genau dabei ging die Lagergebühr verloren, weil niemand mehr
  // gefragt wurde, wie viele Monate der Satz denn nun gelegen hat.
  //
  // Ausgenommen bleibt der Fall „ich habe mich beim Einlagern vertan": Wer den Satz entfernt,
  // den er im selben Auftrag HEUTE erst angelegt hat, korrigiert einen Fehler und schuldet
  // dafür nichts.
  //
  // Beides muss zutreffen, und bis zum 21.09.2026 prüfte der Code keines von beidem: Das
  // Auftragsfenster übergab pauschal „ohne Dialog". Ein Satz, der seit acht Monaten im Regal
  // lag und zu einem alten Auftrag gehörte, ging damit über den Knopf „Einlagerung entfernen"
  // kostenlos hinaus – ohne Gebühr, ohne `entnahme_order_id`, ohne dass jemand gefragt wurde.
  // Über die Regalwand lief derselbe Vorgang die ganze Zeit richtig.
  //
  // Die Entscheidung steht deshalb jetzt HIER und nicht mehr am Aufrufer: Ein Aufrufer, der
  // sich vertut, kostet Geld, und man sieht es ihm nicht an.
  const [auslagernSatzId, setAuslagernSatzId] = useState<string | null>(null);
  // Stapel-Auslagern (E7): die Sätze eines Tages der Reihe nach. Die Liste und welche Aufträge schon
  // eine Lagergebühr tragen, stehen beim Öffnen fest.
  const [stapel, setStapel] = useState<{ datum: string; schritte: StapelSchritt[]; mitGebuehr: Set<string> } | null>(null);
  function stapelOeffnen(datum: string, eintraege: MitnehmenEintrag[]) {
    const gebuehrArtikel = new Set(articles.filter((a) => a.abrechnungsart === "lagergebuehr").map((a) => a.id));
    const mitGebuehr = new Set(orderArticles.filter((z) => !z.deleted_at && gebuehrArtikel.has(z.article_id)).map((z) => z.order_id));
    setStapel({ datum, schritte: stapelSchritte(eintraege, storageSlots, warehouses), mitGebuehr });
  }
  const [auslagernAusAuftragId, setAuslagernAusAuftragId] = useState<string | null>(null);
  // Für welche Sätze ist gerade der Etikettendruck offen (17.09.2026)? Eine Liste, weil aus dem
  // Lager heraus auch mehrere auf einmal gedruckt werden können.
  const [etikettSatzIds, setEtikettSatzIds] = useState<string[]>([]);

  async function removeTireAssignment(id: string, ausAuftragId?: string | null) {
    const satz = alleSaetze.find((t) => t.id === id);
    // Ein Tausch-Satz (Migration 69) lag nie im Regal: Entfernen verwirft ihn, ohne Gebühr.
    if (satz?.kommt_rein) {
      await removeTireAssignmentById(supabase, id, null);
      await refreshTireStorages();
      return;
    }
    const heuteAngelegt = !!satz && satz.created_at.slice(0, 10) === todayStr();
    const eigenerSatz = !!satz && !!ausAuftragId && satz.order_id === ausAuftragId;

    if (heuteAngelegt && eigenerSatz) {
      await removeTireAssignmentById(supabase, id, null);
      await refreshTireStorages();
      return;
    }
    if (ausAuftragId) setAuslagernAusAuftragId(ausAuftragId);
    setAuslagernSatzId(id);
  }

  // Der eine Weg nach außen: vormerken (oder ohne Auftrag sofort auslagern), Gebühr buchen,
  // Auftrag notfalls anlegen. Die Reihenfolge ist Absicht – zuerst muss der Auftrag existieren,
  // sonst hat die Gebühr kein Zuhause und `entnahme_order_id` zeigte auf nichts.
  //
  // Seit Migration 67 (v111) geht ein Satz mit Auftrag erst beim ABSCHLIESSEN dieses Auftrags
  // heraus; bis dahin ist er vorgemerkt und liegt im Regal. Das erledigt die Datenbank.
  async function auslagernAusfuehren(satzId: string, wahl: AuslagernWahl) {
    const satz = tireStorages.find((t) => t.id === satzId);
    let auftragId = wahl.auftragId;

    if (wahl.neuerAuftrag && satz) {
      const kunde = customers.find((c) => c.id === satz.customer_id);
      auftragId = await addOrder({
        customerId: satz.customer_id, title: terminTitel(kunde?.name), description: "",
        orderDate: todayStr(), time: "", status: "offen", assignedEmployeeIds: [],
      });
    }

    if (wahl.sofort || !auftragId) await removeTireAssignmentById(supabase, satzId, null);
    else await satzVormerken(supabase, satzId, auftragId);
    if (auftragId && !wahl.sofort && wahl.artikelId && wahl.menge > 0) {
      // Beim Auslagern gibt es keinen Freitext: Die Lagergebühr ist ein benannter Artikel
      // mit Monaten als Menge, und was sie beschreibt, steht im Artikelstamm. Sie hängt am Satz
      // (`lager_satz_id`), damit sie beim Zurücknehmen der Vormerkung mitgeht.
      await insertOrderArticle(supabase, articlePrices, auftragId, wahl.artikelId, wahl.menge, null, null, satzId);
      await refreshOrderArticles();
    }
    await refreshTireStorages();
    setAuslagernSatzId(null);
    setAuslagernAusAuftragId(null);
    // Ein frisch angelegter Auftrag wird geöffnet: Sonst hätte man gerade eine Rechnungszeile
    // erzeugt, die nirgends zu sehen ist.
    if (wahl.neuerAuftrag && auftragId) setOffenerAuftragId(auftragId);
  }

  // „vorgemerkt · 1234 am 08.10." – im Lager und im Kundenfenster (Migration 67).
  function vormerkungText(satz: TireStorage): string | null {
    if (!istVorgemerkt(satz)) return null;
    const o = orders.find((x) => x.id === satz.entnahme_order_id);
    const tausch = kommtReinSaetze.some((k) => k.tausch_fuer === satz.id) ? " · Tausch" : "";
    return (o ? `vorgemerkt · ${auftragsNr(o.order_number)} am ${formatDate(o.order_date)}` : "vorgemerkt") + tausch;
  }

  // Reifentausch (Migration 69): Der neue Satz kommt auf den Platz des vorgemerkten. Vorgeschlagen
  // wird dasselbe Auto und die andere Saison – der übliche Wechsel im Frühjahr und Herbst.
  async function tauschStarten(order: Order, altSatzId: string) {
    const alt = tireStorages.find((t) => t.id === altSatzId);
    if (!alt) return;
    const andere: Saison | null = alt.saison === "winter" ? "sommer" : alt.saison === "sommer" ? "winter" : null;
    await tauschAnlegen(supabase, alt, order.id, { vehicleId: alt.vehicle_id, saison: andere });
    await refreshTireStorages();
  }

  // Die Vormerkung zurücknehmen (Migration 67): Der Satz bleibt einfach liegen, die zugehörige
  // Lagergebühr geht vom Auftrag.
  async function vormerkungAufheben(satzId: string) {
    const satz = tireStorages.find((t) => t.id === satzId);
    if (!satz?.entnahme_order_id || satz.removed_at) return;
    await vormerkungZuruecknehmen(supabase, satzId, satz.entnahme_order_id);
    await refreshTireStorages();
    await refreshOrderArticles();
    setAuslagernSatzId(null);
    setAuslagernAusAuftragId(null);
  }

  // ------------------------------------------------------- Einlagerung am Auftrag (Migration 22)
  // Die aktive Einlagerung eines Auftrags. "Aktiv" heißt: noch nicht ausgelagert
  // (`removed_at is null`) – die Historie eines Lagerplatzes bleibt davon unberührt.
  //
  // Eine LISTE und kein einzelner Satz (17.09.2026): Seit Migration 44 trägt ein Auftrag
  // mehrere Fahrzeuge, und damit gehören mehrere Sätze ins Regal. Die Datenbank ließ das immer
  // zu – eindeutig ist der PLATZ (ein aktiver Satz je Platz, Migration 15), nicht der Auftrag.
  // Eingeschränkt hat nur dieses `find` hier.
  //
  // Dazu die Tausch-Sätze dieses Auftrags (Migration 69): Sie werden hier wie jede Einlagerung
  // erfasst (Fahrzeug, Saison, Profil) und kommen beim Abschließen auf ihren Platz.
  function einlagerungenZuAuftrag(orderId: string): TireStorage[] {
    return alleSaetze
      .filter((t) => t.order_id === orderId && !t.removed_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  // Steht auf diesem Auftrag eine Lagergebühr? Das heißt: Hier wurde AUSGELAGERT und die
  // Monate werden berechnet – nicht, dass ein Lagerplatz zu belegen wäre. Seit Migration 46
  // ist das Kennzeichen eine Abrechnungsart, kein Lagerplatz-Zwang mehr.
  function auftragHatLagergebuehr(orderId: string): boolean {
    return orderArticlesFor(orderId).some(
      (pos) => articles.find((a) => a.id === pos.article_id)?.abrechnungsart === "lagergebuehr"
    );
  }
  // Mit `einlagerungId` zieht GENAU DIESER Satz auf den neuen Platz, ohne entsteht ein neuer.
  //
  // Vorher suchte diese Funktion sich den Satz selbst („den einen dieses Auftrags") und zog ihn
  // um. Bei zwei Autos war das falsch herum: Wer den zweiten Satz einlagern wollte, verschob
  // den ersten. Welcher Satz gemeint ist, weiß nur die Maske – also sagt sie es.
  async function einlagernFuerAuftrag(order: Order, lagerplatzId: string, einlagerungId?: string) {
    await upsertTireAssignment(supabase, {
      id: einlagerungId,
      storageSlotId: lagerplatzId,
      customerId: order.customer_id,
      dotDate: "", profiltiefeMm: "", note: "",
      orderId: order.id,
    });
    await refreshTireStorages();
  }

  // Fahrzeug und Saison am eingelagerten Satz (Migration 30). Eigener Weg neben
  // `einlagernFuerAuftrag`: dort geht es um den Lagerplatz, hier um die Beschreibung des
  // Satzes. Beides zusammenzulegen hieße, bei jeder Saisonänderung den Platz erneut zu
  // schreiben.
  async function einlagerungAngabenAendern(einlagerungId: string, felder: { vehicleId?: string | null; saison?: Saison | null; profiltiefeMm?: string }) {
    await updateTireStorageDetails(supabase, einlagerungId, felder);
    await refreshTireStorages();
  }

  // ---------------------------------------------------------------- Räder (Migration 33)
  //
  // Sammelmessung oder Einzelerfassung – nie beides. Das Umschalten räumt in der richtigen
  // Reihenfolge auf (siehe setErfassungsart in lib/api/lager.ts), damit niemand in eine
  // Fehlermeldung der Datenbank läuft.
  async function erfassungsartSetzen(einlagerungId: string, art: Erfassungsart) {
    await setErfassungsart(supabase, einlagerungId, art);
    await Promise.all([refreshTireStorages(), neuLaden(qk.eingelagerteRaeder())]);
  }
  async function anzahlRaederSetzen(einlagerungId: string, anzahl: number) {
    await setAnzahlRaeder(supabase, einlagerungId, anzahl);
    await refreshTireStorages();
  }
  // Ein Rad je Position: Gibt es die Position schon, wird sie geändert, sonst angelegt. Das
  // Unterscheiden gehört hierher und nicht in die Oberfläche – dort wüsste man es nur, wenn
  // man dieselbe Liste noch einmal durchsucht.
  //
  // Steht der Satz noch auf „ein Wert für den Satz", stellt das erste gemessene Rad ihn um
  // (v98 im Fenster, seit v101 hier an EINER Stelle – auch für den Weg ohne Netz, F1).
  async function radSpeichern(einlagerungId: string, position: RadPosition, felder: Partial<RadFelder>) {
    const satz = tireStoragesGeladen.find((t) => t.id === einlagerungId);
    const umstellen = !!satz && (satz.erfassungsart ?? "sammel") !== "einzeln";
    const vorhanden = eingelagerteRaeder.find((r) => r.tire_storage_id === einlagerungId && r.position === position);
    await offlineOderDirekt(
      async () => {
        if (umstellen) {
          await setErfassungsart(supabase, einlagerungId, "einzeln");
          await refreshTireStorages();
        }
        if (vorhanden && !vorhanden.id.startsWith("offline-")) await updateRadById(supabase, vorhanden.id, felder);
        else await insertRad(supabase, einlagerungId, { ...felder, position });
      },
      () => {
        const { position: _p, ...zeile } = radZuZeile(felder) as Record<string, unknown>;
        void _p;
        const basis = vorhanden ? Object.fromEntries(Object.keys(zeile).map((k) => [k, (vorhanden as unknown as Record<string, unknown>)[k] ?? null])) : null;
        return {
          inhalt: { art: "rad", satzId: einlagerungId, position, radId: vorhanden?.id ?? null, felder: zeile, basis, umstellen },
          titel: `Radmessung ${position}`,
        };
      }
    );
    await neuLaden(qk.eingelagerteRaeder());
  }
  // Notizen am Satz (Migration 71, v115): zum Satz und je Rad. Gehen wie die Radmessung auch ohne
  // Netz – es ist derselbe Handgriff am selben Reifen.
  async function satzNotizenSetzen(satzId: string, felder: SatzNotizen) {
    const satz = alleSaetze.find((t) => t.id === satzId);
    const basis = Object.fromEntries(Object.keys(felder).map((k) => [k, (satz as unknown as Record<string, unknown> | undefined)?.[k] ?? null]));
    await offlineOderDirekt(
      () => satzNotizenSpeichern(supabase, satzId, felder),
      () => ({ inhalt: { art: "satz", satzId, felder, basis }, titel: "Notiz am Reifensatz" }),
    );
    await refreshTireStorages();
  }
  async function radEntfernen(radId: string) {
    await deleteRadById(supabase, radId);
    await neuLaden(qk.eingelagerteRaeder());
  }

  return { addStorageSlot, addStorageSlotsBulk, addWarehouse, anzahlRaederSetzen, assignTire, auftragHatLagergebuehr, auslagernAusAuftragId, auslagernAusfuehren, auslagernSatzId, deleteStorageSlot, deleteWarehouse, einlagernFuerAuftrag, einlagerungAngabenAendern, einlagerungenZuAuftrag, erfassungsartSetzen, etikettSatzIds, radEntfernen, radSpeichern, removeTireAssignment, satzNotizenSetzen, setAuslagernAusAuftragId, setAuslagernSatzId, setEtikettSatzIds, setStapel, slotGroesseSetzen, stapel, stapelOeffnen, tauschStarten, updateWarehouse, vormerkungAufheben, vormerkungText };
}
