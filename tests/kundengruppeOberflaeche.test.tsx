// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AuftragFahrzeug, Customer, Vehicle } from "@/lib/types";
import { HauptkundeBlatt, KundengruppeKarte } from "@/components/kunden/KundengruppeKarte";
import { FahrzeugeBlock } from "@/components/auftraege/FahrzeugeBlock";

// Kundengruppen (Migration 101, v165): Karte im Kundenfenster, Zuordnen über das Menü, Halter am Fahrzeug im Auftrag.
const k = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id, name: "Kontakt " + id, company: null, address: "Musterweg 1", haupt_kunde_id: null, deleted_at: null, laufkundschaft: false,
  einmalkunde: false, testkunde: false, active: true, kundennummer: null, ...extra,
}) as unknown as Customer;
const H = k("h", { company: "Gruppe Beispiel" });
const U1 = k("u1", { company: "Eins gGmbH", haupt_kunde_id: "h" });
const U2 = k("u2", { company: "Zwei GmbH", haupt_kunde_id: "h" });
const X = k("x", { name: "Fremd" });
const ALLE = [H, U1, U2, X];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("KundengruppeKarte", () => {
  it("ohne Gruppe keine Karte", () => {
    const { container } = render(<KundengruppeKarte kunde={X} kunden={ALLE} darfAendern onSpeichern={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
  it("Unterdebitor: Hauptkunde öffnen und lösen", () => {
    const speichern = vi.fn(async () => {});
    const oeffnen = vi.fn();
    render(<KundengruppeKarte kunde={U1} kunden={ALLE} darfAendern onSpeichern={speichern} onOeffnen={oeffnen} />);
    fireEvent.click(screen.getByText("Unterdebitor von Gruppe Beispiel"));
    expect(oeffnen).toHaveBeenCalledWith("h");
    fireEvent.click(screen.getByRole("button", { name: "Lösen" }));
    expect(speichern).toHaveBeenCalledWith({ haupt_kunde_id: null });
  });
  it("Hauptkunde: Unterdebitoren stehen da, ohne Recht kein Lösen", () => {
    render(<KundengruppeKarte kunde={H} kunden={ALLE} darfAendern={false} onSpeichern={vi.fn()} />);
    expect(screen.getByText(/Hauptkunde von 2 Unterdebitoren/)).toBeTruthy();
    expect(screen.getByText("Eins gGmbH")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lösen" })).toBeNull();
  });
});

describe("HauptkundeBlatt", () => {
  it("bietet nur zulässige Hauptkunden an und speichert die Wahl", async () => {
    const speichern = vi.fn(async () => {});
    const zu = vi.fn();
    render(<HauptkundeBlatt kunde={X} kunden={ALLE} onSpeichern={speichern} onClose={zu} />);
    fireEvent.change(screen.getByLabelText("Kunde suchen"), { target: { value: "e" } });
    const treffer = screen.getAllByRole("option");
    // Unterdebitoren kommen nicht in Frage – nur der Hauptkunde selbst.
    expect(treffer).toHaveLength(1);
    expect(treffer[0].textContent).toContain("Hauptkunde · 2 Unterdebitoren");
    fireEvent.click(treffer[0]);
    expect(speichern).toHaveBeenCalledWith({ haupt_kunde_id: "h" });
    await vi.waitFor(() => expect(zu).toHaveBeenCalled());
  });
});

describe("FahrzeugeBlock mit Kundengruppe", () => {
  const fz = (id: string, kunde: string, kz: string): Vehicle => ({ id, customer_id: kunde, license_plate: kz, make_model: null, tire_size: null, note: null }) as unknown as Vehicle;
  const v1 = fz("v1", "u1", "N-AB 1");
  const v2 = fz("v2", "u2", "N-AB 2");
  const am: (AuftragFahrzeug & { fahrzeug: Vehicle | null })[] = [{ id: "af1", order_id: "o", vehicle_id: "v1", kilometerstand: null, fahrzeug: v1 } as unknown as AuftragFahrzeug & { fahrzeug: Vehicle }];
  const gruppe = [{ id: "h", name: "Gruppe Beispiel" }, { id: "u1", name: "Eins gGmbH" }, { id: "u2", name: "Zwei GmbH" }];
  function zeigen(extra: Partial<Parameters<typeof FahrzeugeBlock>[0]> = {}) {
    const p = {
      fahrzeuge: am, alleFahrzeuge: [v1, v2], gruppe,
      onFahrzeugHinzufuegen: vi.fn(async () => {}), onFahrzeugAnlegen: vi.fn(async () => {}), onKilometerstand: vi.fn(async () => {}),
      onFahrzeugEntfernen: vi.fn(async () => {}), onFahrzeugHalter: vi.fn(async () => {}), ...extra,
    };
    render(<FahrzeugeBlock {...p} />);
    return p;
  }
  it("Halter umhängen", () => {
    const p = zeigen();
    const wahl = screen.getByLabelText("Halter des Fahrzeugs") as HTMLSelectElement;
    expect(wahl.value).toBe("u1");
    fireEvent.change(wahl, { target: { value: "u2" } });
    expect(p.onFahrzeugHalter).toHaveBeenCalledWith("v1", "u2");
  });
  it("Auswahl nennt den Halter, neues Kennzeichen erst mit gewählter Firma", () => {
    const p = zeigen();
    expect(screen.getByRole("option", { name: /N-AB 2.*Zwei GmbH/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Neues Kennzeichen"), { target: { value: "N-XY 9" } });
    const knopf = screen.getByRole("button", { name: "+ anlegen" }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Neues Fahrzeug gehört zu"), { target: { value: "u2" } });
    fireEvent.click(knopf);
    expect(p.onFahrzeugAnlegen).toHaveBeenCalledWith(expect.stringMatching(/N-XY ?9/), "u2");
  });
  it("ohne Recht nur der Name", () => {
    zeigen({ onFahrzeugHalter: undefined });
    expect(screen.queryByLabelText("Halter des Fahrzeugs")).toBeNull();
    expect(screen.getByText("Eins gGmbH", { selector: "b" })).toBeTruthy();
  });
  it("ohne Gruppe wie bisher", () => {
    const p = zeigen({ gruppe: undefined });
    expect(screen.queryByLabelText("Halter des Fahrzeugs")).toBeNull();
    fireEvent.change(screen.getByLabelText("Neues Kennzeichen"), { target: { value: "N-XY 9" } });
    fireEvent.click(screen.getByRole("button", { name: "+ anlegen" }));
    expect(p.onFahrzeugAnlegen).toHaveBeenCalledWith(expect.stringMatching(/N-XY ?9/), undefined);
  });
});
