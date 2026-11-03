// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ansprechpartner, AuftragFahrzeug, Customer, Vehicle } from "@/lib/types";

// Ansprechpartner im Kundenfenster und „Steht bei“ am Fahrzeug (Migration 117, v189). Erfundene Daten.
const api = vi.hoisted(() => ({
  ansprechpartnerAnlegen: vi.fn(async () => ({ id: "neu" })), ansprechpartnerAendern: vi.fn(async () => undefined),
  ansprechpartnerLoeschen: vi.fn(async () => undefined), ansprechpartnerKarte: vi.fn(async () => undefined),
  kundeAufKarte: vi.fn(async () => undefined), fahrzeugAnsprechpartner: vi.fn(async () => undefined), fetchAnsprechpartner: vi.fn(),
}));
vi.mock("@/lib/api/ansprechpartner", () => api);
vi.mock("@/lib/api/adressen", () => ({ sucheAdressen: vi.fn(async () => []) }));

import { AnsprechpartnerKarte } from "@/components/kunden/AnsprechpartnerKarte";
import { FahrzeugeBlock } from "@/components/auftraege/FahrzeugeBlock";

const sb = {} as SupabaseClient;
const FIRMA = { id: "f1", name: "", company: "Beispiel GmbH", address: "Firmenweg 1, Nürnberg", auf_karte: true, laufkundschaft: false } as unknown as Customer;
const ap = (id: string, extra: Partial<Ansprechpartner> = {}): Ansprechpartner => ({
  id, customer_id: "f1", anrede: "Herr", name: "Person " + id, funktion: null, telefon: null, email: null, address: null, lat: null, lng: null,
  geo_genauigkeit: null, auf_karte: false, notiz: null, sortierung: 1, ...extra,
});
const fz = (id: string, kz: string, apId: string | null = null): Vehicle => ({ id, customer_id: "f1", license_plate: kz, make_model: null, ansprechpartner_id: apId }) as unknown as Vehicle;
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AnsprechpartnerKarte", () => {
  it("listet Ansprechpartner mit Adresse, Fahrzeugen und Kartenschalter", () => {
    render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben darfLoeschen
      aps={[ap("a", { address: "Weg 2", auf_karte: true, funktion: "Fuhrpark", telefon: "0911 1" }), ap("b")]} fahrzeuge={[fz("v1", "N-AB 1", "a")]} />));
    expect(screen.getByText("Ansprechpartner (2)")).toBeTruthy();
    expect(screen.getByText("Weg 2")).toBeTruthy();
    expect(screen.getByText("ohne eigene Adresse")).toBeTruthy();
    expect(screen.getByText("Fahrzeuge: N-AB 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Herr Person a anrufen" }).getAttribute("href")).toBe("tel:09111");
    fireEvent.click(screen.getByRole("button", { name: "Karte an" }));
    expect(api.ansprechpartnerKarte).toHaveBeenCalledWith(sb, "a", false);
  });
  it("Firmenadresse von der Karte nehmen", () => {
    render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben darfLoeschen aps={[]} fahrzeuge={[]} />));
    const schalter = screen.getByRole("button", { name: /Firmenadresse auf der Karte/ });
    expect(schalter.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(schalter);
    expect(api.kundeAufKarte).toHaveBeenCalledWith(sb, "f1", false);
  });
  it("ohne Schreibrecht und ohne Ansprechpartner keine Karte; fehlende Migration als Hinweis", () => {
    const { container } = render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben={false} darfLoeschen={false} aps={[]} fahrzeuge={[]} />));
    expect(container.innerHTML).toBe("");
    cleanup();
    render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben darfLoeschen={false} aps={[]} fahrzeuge={[]} fehlt />));
    expect(screen.getByText(/ab Migration 117/)).toBeTruthy();
  });
  it("neu anlegen: Name Pflicht, Karte erst mit Adresse, Fahrzeug anhaken", async () => {
    render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben darfLoeschen aps={[]} fahrzeuge={[fz("v1", "N-AB 1")]} />));
    fireEvent.click(screen.getByRole("button", { name: "+ Ansprechpartner" }));
    const speichern = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(speichern.disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Auf der Karte/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Vor- und Nachname"), { target: { value: "Eva Weg" } });
    fireEvent.change(screen.getByPlaceholderText("Straße Nr., PLZ Ort"), { target: { value: "Weg 2, Fürth" } });
    fireEvent.click(screen.getByRole("button", { name: /Auf der Karte/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(speichern.disabled).toBe(false);
    fireEvent.click(speichern);
    await vi.waitFor(() => expect(api.fahrzeugAnsprechpartner).toHaveBeenCalledWith(sb, "v1", "neu"));
    expect(api.ansprechpartnerAnlegen).toHaveBeenCalledWith(sb, "f1", expect.objectContaining({ name: "Eva Weg", address: "Weg 2, Fürth", auf_karte: true }), 0, null);
  });
  it("löschen fragt nach", async () => {
    render(mitQuery(<AnsprechpartnerKarte supabase={sb} kunde={FIRMA} darfSchreiben darfLoeschen aps={[ap("a")]} fahrzeuge={[]} />));
    fireEvent.click(screen.getByText("Herr Person a"));
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByText(/behalten den Ort als einmalige Adresse/)).toBeTruthy();
    const knoepfe = screen.getAllByRole("button", { name: "Löschen" });
    fireEvent.click(knoepfe[knoepfe.length - 1]);
    await vi.waitFor(() => expect(api.ansprechpartnerLoeschen).toHaveBeenCalledWith(sb, "a"));
  });
});

describe("FahrzeugeBlock – Steht bei", () => {
  it("ordnet ein Fahrzeug einem Ansprechpartner zu", () => {
    const zuordnen = vi.fn(async () => {});
    const v = fz("v1", "N-AB 1");
    const af = { id: "af1", order_id: "o", vehicle_id: "v1", kilometerstand: null, fahrzeug: v } as unknown as AuftragFahrzeug & { fahrzeug: Vehicle };
    render(<FahrzeugeBlock fahrzeuge={[af]} alleFahrzeuge={[v]} onFahrzeugHinzufuegen={vi.fn(async () => {})} onFahrzeugAnlegen={vi.fn(async () => {})}
      onKilometerstand={vi.fn(async () => {})} onFahrzeugEntfernen={vi.fn(async () => {})}
      ansprechpartner={[{ id: "a", name: "Herr Person a" }]} onFahrzeugAnsprechpartner={zuordnen} />);
    fireEvent.change(screen.getByLabelText("Ansprechpartner des Fahrzeugs"), { target: { value: "a" } });
    expect(zuordnen).toHaveBeenCalledWith("v1", "a");
  });
  it("gesperrt nur der Name", () => {
    const v = fz("v1", "N-AB 1", "a");
    const af = { id: "af1", order_id: "o", vehicle_id: "v1", kilometerstand: null, fahrzeug: v } as unknown as AuftragFahrzeug & { fahrzeug: Vehicle };
    render(<FahrzeugeBlock fahrzeuge={[af]} alleFahrzeuge={[v]} gesperrt onFahrzeugHinzufuegen={vi.fn(async () => {})} onFahrzeugAnlegen={vi.fn(async () => {})}
      onKilometerstand={vi.fn(async () => {})} onFahrzeugEntfernen={vi.fn(async () => {})}
      ansprechpartner={[{ id: "a", name: "Herr Person a" }]} onFahrzeugAnsprechpartner={vi.fn(async () => {})} />);
    expect(screen.queryByLabelText("Ansprechpartner des Fahrzeugs")).toBeNull();
    expect(screen.getByText("Herr Person a")).toBeTruthy();
  });
});
