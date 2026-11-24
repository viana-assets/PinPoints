// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, Customer, Order, OrderArticle } from "@/lib/types";

// Reklamationsauftrag anlegen (Migration 120, v193): Blatt und Einstieg in den Aufträgen. Erfundene Daten.
const api = vi.hoisted(() => ({
  fetchErledigteAuftraege: vi.fn(async () => ({ orders: [] as Order[], positionen: [] as OrderArticle[] })),
  fetchErledigtNachNummer: vi.fn(async () => null as Order | null),
  kundenNachKennzeichen: vi.fn(async () => [] as { customer_id: string; license_plate: string }[]),
  reklamationAnlegen: vi.fn(),
  REKLAMATION_AUSWAHL_MAX: 60,
}));
vi.mock("@/lib/api/reklamation", () => api);

import { ReklamationBlatt } from "@/components/auftraege/ReklamationBlatt";
import { AuftraegePanel } from "@/components/auftraege/AuftraegePanel";

const sb = {} as SupabaseClient;
const k = (id: string, extra: Partial<Customer> = {}) => ({ id, name: "", company: "Firma " + id, address: "Weg 1, 90402 Nürnberg", haupt_kunde_id: null,
  laufkundschaft: false, deleted_at: null, phone_mobile: null, phone_landline: null, ...extra }) as unknown as Customer;
const C1 = k("c1", { company: "Muster GmbH" });
const C2 = k("c2", { company: "Andere AG" });
const ART = [{ id: "w", short_name: "Radwechsel" }, { id: "v", short_name: "Ventil" }] as unknown as Article[];
const o = (id: string, extra: Partial<Order> = {}) => ({
  id, order_number: 441, customer_id: "c1", title: "Termin", description: null, status: "erledigt", order_date: "2026-10-12", time: "09:00", end_time: "10:00",
  techniker_notiz: null, firmenfahrzeug_id: null, completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  reopen_reason: null, rechnung_noetig: false, rechnung_erstellt_am: null, rechnung_erstellt_von: null, rechnung_nummer: null,
  laufkunde_name: null, laufkunde_telefon: null, laufkunde_ort: null, created_at: "", updated_at: "", deleted_at: null, ...extra,
}) as Order;
const pos = (order: string, art: string, menge = 1) => ({ id: order + art, order_id: order, article_id: art, quantity: menge, net_price: 10, vat_rate: 19, endpreis_netto: null, note: null, created_at: "", deleted_at: null }) as unknown as OrderArticle;
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("ReklamationBlatt", () => {
  it("mit vorgewähltem Auftrag: Grund wählen, anlegen", async () => {
    const anlegen = vi.fn(async () => {});
    render(<ReklamationBlatt supabase={sb} customers={[C1, C2]} articles={ART} vorgabe={{ order: o("o1"), positionen: [pos("o1", "w"), pos("o1", "v", 4)] }}
      onAnlegen={anlegen} onClose={() => {}} />);
    expect(screen.getByText(/#441 · 12\.10\.2026 · Muster GmbH/)).toBeTruthy();
    expect(screen.getByText("Radwechsel · 4× Ventil")).toBeTruthy();
    const knopf = screen.getByRole("button", { name: "Reklamation anlegen" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Vibration / Unwucht" }));
    fireEvent.change(screen.getByPlaceholderText(/Lenkrad vibriert/), { target: { value: "Lenkrad vibriert ab 100" } });
    expect(knopf.disabled).toBe(false);
    await act(async () => { fireEvent.click(knopf); });
    expect(anlegen).toHaveBeenCalledWith({ kundeId: "c1", vonId: "o1", grund: "vibration", text: "Lenkrad vibriert ab 100", ohneBezug: "" });
  });

  it("Suche nach Kunde zeigt seine erledigten Aufträge, Auswahl setzt den Bezug", async () => {
    api.fetchErledigteAuftraege.mockResolvedValueOnce({ orders: [o("alt", { order_number: 300, order_date: "2026-04-01" }), o("neu", { order_number: 441 })], positionen: [pos("neu", "w")] });
    const anlegen = vi.fn(async () => {});
    render(<ReklamationBlatt supabase={sb} customers={[C1, C2]} articles={ART} onAnlegen={anlegen} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Kunde, Kennzeichen oder Auftragsnummer/), { target: { value: "muster" } });
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: /Muster GmbH/ })); });
    expect(api.fetchErledigteAuftraege).toHaveBeenCalledWith(sb, ["c1"]);
    const liste = screen.getByRole("listbox", { name: "Erledigte Aufträge" });
    const zeilen = within(liste).getAllByRole("option");
    expect(zeilen[0].textContent).toMatch(/#441/);
    expect(zeilen[1].textContent).toMatch(/#300 · 1\.4\.2026/);
    fireEvent.click(zeilen[0]);
    fireEvent.click(screen.getByRole("button", { name: "Luftdruck / Ventil" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reklamation anlegen" })); });
    expect(anlegen).toHaveBeenCalledWith(expect.objectContaining({ kundeId: "c1", vonId: "neu", grund: "luftdruck" }));
  });

  it("Auftragsnummer wird in der Datenbank gesucht", async () => {
    vi.useFakeTimers();
    api.fetchErledigtNachNummer.mockResolvedValueOnce(o("n", { order_number: 77, customer_id: "c2" }));
    render(<ReklamationBlatt supabase={sb} customers={[C1, C2]} articles={ART} onAnlegen={async () => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Kunde, Kennzeichen oder Auftragsnummer/), { target: { value: "#77" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(api.fetchErledigtNachNummer).toHaveBeenCalledWith(sb, 77);
    expect(screen.getByRole("option", { name: /Auftrag #77/ }).textContent).toMatch(/Andere AG/);
  });

  it("ohne Bezugsauftrag: Kunde und Begründung sind Pflicht", async () => {
    const anlegen = vi.fn(async () => {});
    render(<ReklamationBlatt supabase={sb} customers={[C1, C2]} articles={ART} onAnlegen={anlegen} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ohne Bezugsauftrag" }));
    fireEvent.click(screen.getByRole("button", { name: "Sonstiges" }));
    const knopf = screen.getByRole("button", { name: "Reklamation anlegen" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Kunde suchen …"), { target: { value: "andere" } });
    fireEvent.click(screen.getByRole("option", { name: /Andere AG/ }));
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Arbeit vor Einführung der App/), { target: { value: "Arbeit vor der App" } });
    expect(knopf.disabled).toBe(false);
    await act(async () => { fireEvent.click(knopf); });
    expect(anlegen).toHaveBeenCalledWith({ kundeId: "c2", vonId: null, grund: "sonstiges", text: "", ohneBezug: "Arbeit vor der App" });
  });

  it("zeigt die Ablehnung der Datenbank", async () => {
    render(<ReklamationBlatt supabase={sb} customers={[C1]} articles={ART} vorgabe={{ order: o("o1"), positionen: [] }}
      onAnlegen={async () => { throw new Error("Der Bezugsauftrag gehört zu einem anderen Kunden."); }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sonstiges" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reklamation anlegen" })); });
    expect(screen.getByText("Der Bezugsauftrag gehört zu einem anderen Kunden.")).toBeTruthy();
  });
});

describe("Aufträge: Einstieg", () => {
  const panel = (onReklamation?: (o: Order | null) => void, orders: Order[] = [o("o1"), o("r1", { order_number: 442, art: "reklamation", reklamation_grund: "vibration", status: "offen", order_date: "2026-11-24" })]) =>
    render(<AuftraegePanel customers={[C1]} orders={orders} employees={[]} orderEmployees={{}} onNeuerAuftrag={async () => {}} onDelete={async () => {}}
      onEditEmployees={() => {}} leistungenText={() => ""} onOpenCustomer={() => {}} onOpenOrder={() => {}} onNavigate={() => {}} onCall={() => {}}
      isTechniker={false} darfAnlegen onReklamation={onReklamation} />);

  it("Pfeil neben „+ Auftrag“ bietet die Reklamation an", () => {
    const rek = vi.fn();
    panel(rek);
    fireEvent.click(screen.getByRole("button", { name: "Weitere Auftragsarten" }));
    fireEvent.click(screen.getByRole("button", { name: "Reklamation" }));
    expect(rek).toHaveBeenCalledWith(null);
  });
  it("ohne Recht kein Pfeil; Reklamationen tragen eine Marke", () => {
    panel(undefined);
    expect(screen.queryByRole("button", { name: "Weitere Auftragsarten" })).toBeNull();
    expect(screen.getAllByText("Reklamation").length).toBeGreaterThan(0);
  });
  it("Menü eines erledigten Auftrags: Reklamation zu diesem Auftrag", () => {
    const rek = vi.fn();
    panel(rek, [o("o1")]);
    fireEvent.click(screen.getByRole("button", { name: "Vergangene anzeigen · 1 abgeschlossen" }));
    fireEvent.click(screen.getByRole("button", { name: "Weitere Aktionen" }));
    fireEvent.click(screen.getByRole("button", { name: "Reklamation zu diesem Auftrag" }));
    expect(rek).toHaveBeenCalledWith(expect.objectContaining({ id: "o1" }));
  });
});
