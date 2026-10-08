"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteOrderArticleById, insertOrderArticle, updateOrderArticleEndpreisById, updateOrderArticleQtyById,
  updateOrderArticleTextById,
} from "@/lib/api/articles";
import {
  deleteOrderById, insertOrder, updateOrderById, updateOrderFirmenfahrzeug, updateOrderStatusById,
  updateOrderTechnikerNotiz, updateOrderTermin,
} from "@/lib/api/orders";
import { currentArticlePrice, DEFAULT_VAT_RATE, terminTitel, todayStr } from "@/lib/helpers";
import { aenderungen, AUFTRAG_OFFLINE_FELDER, type AuftragFeld } from "@/lib/offline/ausgang";
import { ausgangAufnehmen } from "@/lib/offline/speicher";
import type { Article, ArticlePrice, Customer, Order, OrderArticle, OrderStatus, TireStorage } from "@/lib/types";
import type { Nachladen, NeuerTermin, OfflineOderDirekt } from "./typen";

// Die Handlungen am Auftrag (v127, Fahrplan C5 – aus app/page.tsx herausgelöst, nach dem Muster von
// useLagerAktionen und useFahrzeugAktionen): anlegen, ändern, Termin verschieben, Status, Notiz,
// Transporter, löschen und die Leistungen am Auftrag.
//
// Was am Auftrag offline gehen darf, läuft über `offlineOderDirekt` (CLAUDE.md: neue Schreibwege am
// Auftrag); die Absichten dafür baut `auftragsAbsicht` bzw. `positionsAbsicht`. Anlegen, Status und
// Löschen bleiben bewusst direkt („geht nur mit Netz“).

export type AuftragKontext = {
  supabase: SupabaseClient;
  customers: Customer[];
  orders: Order[];
  orderArticles: OrderArticle[];
  articles: Article[];
  articlePrices: ArticlePrice[];
  orderEmployees: Record<string, string[]>;
  tireStorages: TireStorage[];
  // Der im Kundenfenster gewählte Kunde – seine Historie wird nach dem Abschließen nachgeladen.
  selectedId: string | null;
  netzLos: () => boolean;
  auftragFinden: (id: string) => Order | undefined;
  auftragTitel: (id: string, was: string) => string;
  offlineOderDirekt: OfflineOderDirekt;
  setOrderEmployees: (orderId: string, employeeIds: string[]) => Promise<void>;
  refreshOrders: Nachladen;
  refreshOrderArticles: Nachladen;
  refreshTireStorages: Nachladen;
  refreshCustomers: Nachladen;
  loadHistory: (customerId: string) => void | Promise<void>;
  setFrischerAuftragId: (id: string | null) => void;
  setOffenerAuftragId: (id: string | null) => void;
};

export function useAuftragAktionen(k: AuftragKontext) {
  const {
    supabase, customers, orders, orderArticles, articles, articlePrices, orderEmployees, tireStorages, selectedId,
    netzLos, auftragFinden, auftragTitel, offlineOderDirekt, setOrderEmployees, refreshOrders, refreshOrderArticles,
    refreshTireStorages, refreshCustomers, loadHistory, setFrischerAuftragId, setOffenerAuftragId,
  } = k;

  // Eine Änderung an Feldern des Auftrags als Absicht – nur die wirklich geänderten Felder.
  function auftragsAbsicht(id: string, nachher: Partial<Record<AuftragFeld, unknown>>, was: string) {
    const vorher = auftragFinden(id) as unknown as Partial<Record<AuftragFeld, unknown>> | undefined;
    if (!vorher) throw new Error("Ohne Netz lässt sich nur ein Auftrag ändern, der auf diesem Gerät gespeichert ist.");
    const diff = aenderungen(vorher, nachher, AUFTRAG_OFFLINE_FELDER);
    return diff ? { inhalt: { art: "auftrag" as const, auftragId: id, ...diff }, titel: auftragTitel(id, was) } : null;
  }
  function positionsAbsicht(id: string, felder: Record<string, unknown>, was: string) {
    const pos = orderArticles.find((p) => p.id === id);
    if (!pos) throw new Error("Diese Leistung ist auf diesem Gerät nicht gespeichert.");
    const basis = Object.fromEntries(Object.keys(felder).map((k) => [k, (pos as unknown as Record<string, unknown>)[k] ?? null]));
    return { inhalt: { art: "position" as const, auftragId: pos.order_id, positionId: id, felder, basis }, titel: auftragTitel(pos.order_id, was) };
  }

  async function addOrderArticle(orderId: string, articleId: string, quantity: number, endpreisNetto: number | null, text: string | null) {
    await offlineOderDirekt(
      () => insertOrderArticle(supabase, articlePrices, orderId, articleId, quantity, endpreisNetto, text),
      () => {
        // Die Kennung entsteht auf dem Gerät: So lässt sich die neue Position offline auch gleich
        // wieder ändern, und ein doppelter Versand legt sie nicht zweimal an.
        const preis = currentArticlePrice(articlePrices.filter((p) => p.article_id === articleId));
        const name = articles.find((a) => a.id === articleId)?.short_name ?? "Leistung";
        return {
          inhalt: { art: "position_neu", auftragId: orderId, zeile: {
            id: crypto.randomUUID(), order_id: orderId, article_id: articleId, quantity,
            net_price: preis ? preis.net_price : 0, vat_rate: preis ? preis.vat_rate : DEFAULT_VAT_RATE,
            endpreis_netto: endpreisNetto, note: text,
          } },
          titel: auftragTitel(orderId, `${name} eingetragen`),
        };
      }
    );
    await refreshOrderArticles();
  }
  async function updateOrderArticleQty(id: string, quantity: number) {
    await offlineOderDirekt(() => updateOrderArticleQtyById(supabase, id, quantity), () => positionsAbsicht(id, { quantity }, "Menge"));
    await refreshOrderArticles();
  }
  async function updateOrderArticleEndpreis(id: string, endpreisNetto: number | null) {
    await offlineOderDirekt(() => updateOrderArticleEndpreisById(supabase, id, endpreisNetto), () => positionsAbsicht(id, { endpreis_netto: endpreisNetto }, "Endpreis"));
    await refreshOrderArticles();
  }
  async function updateOrderArticleText(id: string, text: string | null) {
    await offlineOderDirekt(() => updateOrderArticleTextById(supabase, id, text), () => positionsAbsicht(id, { note: text?.trim() || null }, "Text der Leistung"));
    await refreshOrderArticles();
  }
  async function removeOrderArticle(id: string) {
    await offlineOderDirekt(() => deleteOrderArticleById(supabase, id), () => positionsAbsicht(id, { deleted_at: new Date().toISOString() }, "Leistung entfernt"));
    await refreshOrderArticles();
  }

  // Mitarbeiter-Zuordnung läuft komplett über `order_employees` (Migration 11) – ein Auftrag kann
  // mehreren Mitarbeitern zugeordnet sein (z. B. bei umfangreichen Aufträgen). `assignedEmployeeIds`
  // ist deshalb überall eine Liste, auch wenn sie in vielen Fällen nur ein Element hat.
  async function addOrder(fields: { customerId: string; title: string; description: string; orderDate: string; time: string; endTime?: string; status: OrderStatus; assignedEmployeeIds: string[] }) {
    // Rückfallebene für alle Anlagemasken: bleibt der Titel leer, wird "Termin – ‹Kunde›"
    // eingesetzt. Die Masken belegen ihn zwar vor, aber so hängt es nicht daran, dass jede
    // einzelne daran denkt.
    const kunde = customers.find((c) => c.id === fields.customerId);
    const id = await insertOrder(supabase, { ...fields, title: fields.title.trim() || terminTitel(kunde?.name) });
    // Nur mit Auswahl: Ein Techniker, der anlegt (Migration 78), steht danach schon selbst darauf
    // (`auftrag_techniker_einteilen()`), und das Einteilen anderer ist nicht sein Recht.
    if (id && fields.assignedEmployeeIds.length > 0) await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
    // Die Id geht an den Aufrufer zurück, damit er den frisch angelegten Auftrag sofort öffnen
    // kann – ohne sie müsste er ihn in der Liste wiederfinden, was bei gleichnamigen Aufträgen
    // am selben Tag nicht eindeutig ist.
    return id;
  }
  // Ein Klick, ein Auftrag, ein Fenster: aus dem Karten-Popup heraus wird die Zeile mit
  // sinnvollen Vorgaben sofort angelegt (Titel "Termin – ‹Kunde›", heutiges Datum, Zustand
  // offen) und dann das vollständige Auftragsfenster geöffnet. Titel, Termin, Fahrzeug,
  // Mitarbeiter und Leistungen werden dort geändert – alles an einer Stelle, dieselbe Maske
  // wie bei jedem anderen Auftrag.
  //
  // `addOrder` wartet das Neuladen inzwischen wirklich ab (siehe `neuLaden`), sonst wäre die
  // frische Zeile im Zwischenspeicher noch nicht vorhanden und das Fenster bliebe zu.
  async function neuenAuftragAnlegen(kundenId: string, termin?: NeuerTermin | null) {
    const kunde = customers.find((c) => c.id === kundenId);
    const id = await addOrder({
      customerId: kundenId, title: terminTitel(kunde?.name), description: "",
      // Ohne Vorgabe wie bisher: heute, ohne Uhrzeit. Kommt der Auftrag aus dem Kalender, steht
      // der angeklickte Zeitpunkt schon drin – und der Block sitzt sofort dort, wohin geklickt
      // wurde, statt in der Leiste „ohne Uhrzeit" zu landen.
      orderDate: termin?.datum || todayStr(),
      time: termin?.von || "",
      // Ein Ende nur ZUSAMMEN mit einem Beginn: Die Datenbank lässt seit Migration 37 nichts
      // anderes zu, und ohne Beginn wäre es auch keine Aussage.
      endTime: termin?.von ? (termin.bis || "") : "",
      status: "offen", assignedEmployeeIds: [],
    });
    if (!id) return;
    setFrischerAuftragId(id);
    setOffenerAuftragId(id);
  }

  async function updateOrder(id: string, fields: {
    title: string; description: string; orderDate: string; time: string; endTime?: string; rechnungNoetig?: boolean;
    status: OrderStatus; assignedEmployeeIds: string[]; laufkunde?: { name: string; telefon: string; ort: string };
  }) {
    if (netzLos()) {
      // Ohne Netz (F1): Titel, Beschreibung, Termin, „Rechnung benötigt" und die Angaben zum
      // Laufkunden gehen in den Ausgangskorb. Mitarbeiter und Status nicht – das Konzept nimmt
      // sie bewusst aus (Einteilen ist nicht Sache vor Ort, ein Statuswechsel friert ein).
      const vorher = auftragFinden(id);
      const mitarbeiterVorher = [...(orderEmployees[id] ?? [])].sort().join(",");
      if (vorher && (vorher.status !== fields.status || mitarbeiterVorher !== [...fields.assignedEmployeeIds].sort().join(","))) {
        throw new Error("Ohne Netz lassen sich Mitarbeiter und Status nicht ändern. Titel, Beschreibung, Termin und Leistungen gehen offline.");
      }
      const a = auftragsAbsicht(id, {
        title: fields.title, description: fields.description || null, order_date: fields.orderDate,
        time: fields.time || null, end_time: fields.endTime || null,
        ...(fields.rechnungNoetig === undefined ? {} : { rechnung_noetig: fields.rechnungNoetig }),
        ...(fields.laufkunde === undefined ? {} : {
          laufkunde_name: fields.laufkunde.name.trim() || null,
          laufkunde_telefon: fields.laufkunde.telefon.trim() || null,
          laufkunde_ort: fields.laufkunde.ort.trim() || null,
        }),
      }, "Angaben");
      if (a) await ausgangAufnehmen(a.inhalt, a.titel);
      return;
    }
    await updateOrderById(supabase, id, fields);
    // Die Einteilung nur anfassen, wenn sie sich wirklich geändert hat. Zwei Gründe, und der
    // zweite ist der wichtigere:
    //
    // 1. `setOrderEmployees` löscht und schreibt neu – bei jedem Speichern ein Ab- und Anmelden
    //    derselben Personen, das jedes Mal im Protokoll landet.
    // 2. Seit Migration 41 darf ein TECHNIKER den Auftrag bearbeiten, aber weiterhin nicht die
    //    Einteilung (`order_employees`, Migration 15). Ohne diesen Vergleich wäre jedes
    //    Speichern durch einen Techniker an der Rechteprüfung gescheitert – obwohl er die
    //    Einteilung gar nicht angefasst hat.
    const vorher = [...(orderEmployees[id] ?? [])].sort();
    const nachher = [...fields.assignedEmployeeIds].sort();
    if (vorher.join(",") !== nachher.join(",")) await setOrderEmployees(id, fields.assignedEmployeeIds);
    await refreshOrders();
  }
  // Ein Termin wurde im Kalender gezogen (25.09.2026): nur Tag, Beginn und Ende.
  async function terminVerschieben(id: string, datum: string, von: string | null, bis: string | null) {
    await offlineOderDirekt(
      () => updateOrderTermin(supabase, id, { orderDate: datum, time: von, endTime: bis }),
      () => auftragsAbsicht(id, { order_date: datum, time: von || null, end_time: bis || null }, "Termin")
    );
    await refreshOrders();
  }
  // Zustandswechsel eines Auftrags. Welche Übergänge erlaubt sind, entscheidet der Trigger aus
  // Migration 20 – lehnt er ab, kommt der Grund als Fehlermeldung zurück und wird über die
  // zentrale Anzeige sichtbar (siehe lib/api/client.ts).
  async function updateOrderStatus(id: string, status: OrderStatus, grund?: { stornoGrund?: string; wiedereroeffnungsGrund?: string }) {
    await updateOrderStatusById(supabase, id, status, grund);
    await refreshOrders();
    // Abschließen lagert vorgemerkte Reifen aus, Wiedereröffnen holt sie zurück, Stornieren hebt
    // die Vormerkung auf – das tut die Datenbank (Migration 67). Hier nur nachladen.
    if (tireStorages.some((t) => t.entnahme_order_id === id)) await refreshTireStorages();
    // Beim Abschließen schreibt die Datenbank den Kontaktstand des Kunden fort (Migration 47).
    // Ohne dieses Nachladen stünde die Nadel bis zum nächsten Seitenaufruf noch auf dem alten
    // Zustand – die Änderung ist echt, nur nicht zu sehen, und das ist schlimmer als keine.
    if (status === "erledigt") {
      await refreshCustomers();
      const auftrag = orders.find((o) => o.id === id);
      if (auftrag && selectedId === auftrag.customer_id) loadHistory(auftrag.customer_id);
    }
  }

  async function setOrderFirmenfahrzeug(id: string, firmenfahrzeugId: string | null) {
    await updateOrderFirmenfahrzeug(supabase, id, firmenfahrzeugId);
    await refreshOrders();
  }
  async function updateTechnikerNotiz(id: string, notiz: string) {
    await offlineOderDirekt(
      () => updateOrderTechnikerNotiz(supabase, id, notiz),
      () => auftragsAbsicht(id, { techniker_notiz: notiz || null }, "Notiz")
    );
    await refreshOrders();
  }

  async function deleteOrder(id: string) {
    await deleteOrderById(supabase, id);
    await refreshOrders();
    if (tireStorages.some((t) => t.entnahme_order_id === id)) await refreshTireStorages();
  }

  return {
    addOrder, addOrderArticle, deleteOrder, neuenAuftragAnlegen, removeOrderArticle, setOrderFirmenfahrzeug,
    terminVerschieben, updateOrder, updateOrderArticleEndpreis, updateOrderArticleQty, updateOrderArticleText,
    updateOrderStatus, updateTechnikerNotiz,
  };
}
