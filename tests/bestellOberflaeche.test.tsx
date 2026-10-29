// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bestellwunsch, Customer, Employee, Firmenfahrzeug, Order } from "@/lib/types";

// Bestellliste (Migration 104, v173): Blatt „Fehlt was?“ und Seite – wer welche Knöpfe sieht und was geschrieben wird.
const api = vi.hoisted(() => ({
  bestellwunschAnlegen: vi.fn(async () => undefined),
  bestellwunschAendern: vi.fn(async () => undefined),
  bestellwunschLoeschen: vi.fn(async () => undefined),
  bestellStandSetzen: vi.fn(async () => undefined),
  bestellPlusSetzen: vi.fn(async () => undefined),
  bestellFotoHochladen: vi.fn(async () => ({ pfad: "p1/x.jpg", breite: 10, hoehe: 10 })),
  bestellFotoVerwerfen: vi.fn(async () => undefined),
  bestellFotoLinks: vi.fn(async () => ({})),
  fetchBestellwuensche: vi.fn(async () => []),
}));
vi.mock("@/lib/api/bestellungen", () => api);

import { BestellBlatt } from "@/components/bestellung/BestellBlatt";
import { BestellPanel } from "@/components/bestellung/BestellPanel";

const supabase = {} as SupabaseClient;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const w = (id: string, text: string, z: Partial<Bestellwunsch> = {}): Bestellwunsch => ({
  id, text, menge: null, dringend: false, fuer: "allgemein", firmenfahrzeug_id: null, kunde_id: null, auftrag_id: null,
  foto_pfad: null, foto_breite: null, foto_hoehe: null, status: "offen", notiz: null, grund: null,
  erstellt_von: "tech", created_at: "2026-10-28T08:00:00Z", geaendert_am: "2026-10-28T08:00:00Z", status_am: null, status_von: null, plus: [], ...z,
});
const transporter = [{ id: "t1", kennzeichen: "N-MR 1", bezeichnung: "Transporter 1", aktiv: true }] as Firmenfahrzeug[];
const kunden = [{ id: "k1", name: "Artur", company: "Muster GmbH", address: "Weg 1" }] as Customer[];
const orders = [{ id: "o1", customer_id: "k1", order_number: 12, order_date: "2026-10-30", time: "09:00", title: "Termin", status: "offen", deleted_at: null }] as unknown as Order[];
const mit = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("Blatt „Fehlt was?“", () => {
  it("Pflicht ist nur der Text; geschrieben werden Menge, dringend, Transporter, Kunde und Auftrag aus dem Auftrag", async () => {
    const onFertig = vi.fn();
    mit(<BestellBlatt supabase={supabase} ich="tech" wuensche={[]} transporter={transporter} kunden={kunden} orders={orders}
      vorbelegung={{ kundeId: "k1", auftragId: "o1" }} onPlus={vi.fn()} onFertig={onFertig} onClose={vi.fn()} />);
    const knopf = screen.getByRole("button", { name: "Auf die Bestellliste" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Schlagschrauber-Nuss/), { target: { value: "Ventile TR414" } });
    fireEvent.change(screen.getByPlaceholderText("z. B. 2 Stück"), { target: { value: "1 Beutel" } });
    fireEvent.click(screen.getByRole("button", { name: "Dringend" }));
    expect(screen.getByText("Muster GmbH")).toBeTruthy();
    fireEvent.click(knopf);
    await waitFor(() => expect(api.bestellwunschAnlegen).toHaveBeenCalled());
    expect(api.bestellwunschAnlegen).toHaveBeenCalledWith(supabase, {
      text: "Ventile TR414", menge: "1 Beutel", dringend: true, fuer: "transporter", firmenfahrzeug_id: "t1", kunde_id: "k1", auftrag_id: "o1",
    });
    expect(onFertig).toHaveBeenCalledWith("Eingetragen – das Büro bekommt eine Push-Meldung.");
  });

  it("warnt bei gleichem offenen Eintrag und bietet „+1“ statt doppelt", async () => {
    const onPlus = vi.fn(async () => undefined);
    mit(<BestellBlatt supabase={supabase} ich="tech2" wuensche={[w("a", "Schlagschrauber-Nuss 17 mm, lang")]} transporter={[]} kunden={kunden} orders={orders}
      onPlus={onPlus} onFertig={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Schlagschrauber-Nuss/), { target: { value: "Nuss 17 mm" } });
    expect(screen.getByText(/Schon offen:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+1 – brauche ich auch" }));
    await waitFor(() => expect(onPlus).toHaveBeenCalledWith("a"));
    expect(api.bestellwunschAnlegen).not.toHaveBeenCalled();
  });
});

describe("Seite Bestellliste", () => {
  const employees = [{ id: "e1", name: "Paul", profile_id: "tech" }] as Employee[];
  const liste = [w("a", "Nuss 17 mm", { dringend: true }), w("b", "Ventile", { erstellt_von: "andere" }), w("c", "Handschuhe", { status: "bestellt", notiz: "Würth" })];
  const zeigen = (ich: string, verwalter: boolean) => mit(<BestellPanel supabase={supabase} ich={ich} verwalter={verwalter} darfSchreiben
    wuensche={liste} laedt={false} fehler={null} employees={employees} kunden={kunden} orders={orders} transporter={transporter}
    onNeu={vi.fn()} onBearbeiten={vi.fn()} onOpenOrder={vi.fn()} onOpenCustomer={vi.fn()} />);

  it("Techniker: nur meine offenen, ändern/löschen eigener, kein Stand", () => {
    zeigen("tech", false);
    expect(screen.getByText("Nuss 17 mm")).toBeTruthy();
    expect(screen.queryByText("Ventile")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bestellt" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ändern" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nur meine" }));
    const karte = screen.getByText("Ventile").closest(".bw-karte") as HTMLElement;
    expect(within(karte).getByRole("button", { name: "+1 brauche ich auch" })).toBeTruthy();
    expect(within(karte).queryByRole("button", { name: "Ändern" })).toBeNull();
  });

  it("Admin: markieren und mit Lieferant als bestellt setzen", async () => {
    zeigen("admin", true);
    const boxen = screen.getAllByRole("button", { name: "Für Sammelaktion markieren" });
    expect(boxen).toHaveLength(2);
    boxen.forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole("button", { name: "Als bestellt markieren …" }));
    fireEvent.change(screen.getByPlaceholderText("z. B. Würth, Lieferung Do"), { target: { value: "Würth" } });
    fireEvent.click(screen.getByRole("button", { name: "Als bestellt markieren" }));
    await waitFor(() => expect(api.bestellStandSetzen).toHaveBeenCalled());
    expect(api.bestellStandSetzen).toHaveBeenCalledWith(supabase, ["a", "b"], "bestellt", { notiz: "Würth" });
  });

  it("Admin: „nicht nötig“ verlangt einen Grund", async () => {
    zeigen("admin", true);
    const karte = screen.getByText("Ventile").closest(".bw-karte") as HTMLElement;
    fireEvent.click(within(karte).getByRole("button", { name: "Nicht nötig" }));
    const ok = screen.getAllByRole("button", { name: "Nicht nötig" }).at(-1) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("z. B. liegt noch im Lager"), { target: { value: "liegt im Lager" } });
    fireEvent.click(ok);
    await waitFor(() => expect(api.bestellStandSetzen).toHaveBeenCalledWith(supabase, ["b"], "nicht_noetig", { grund: "liegt im Lager" }));
  });
});
