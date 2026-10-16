// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Finance F0 (v145): Systemmarke, Systemauswahl und Einstellungsformular.
const api = vi.hoisted(() => ({
  saveFinEinstellungen: vi.fn(async () => undefined),
  fetchFinEinstellungen: vi.fn(async () => ({ status: "da", einstellungen: null })),
}));
vi.mock("@/lib/api/finance", () => api);

import { SystemMarke } from "@/components/system/SystemMarke";
import { SystemWahl } from "@/components/system/SystemWahl";
import { FinanceBereich, FinanceEinstellungen } from "@/components/finance/FinanceBereich";
import { FINANCE_SEITEN, FINANCE_WEITERE_GRUPPEN, financeWeitereGruppen } from "@/lib/finance/seiten";
import { SYSTEME, sichtbareSysteme } from "@/lib/systeme";
import { finVorgabe } from "@/lib/finance/einstellungen";

const supabase = {} as SupabaseClient;
const mitQuery = (kind: ReactNode) => <QueryClientProvider client={new QueryClient()}>{kind}</QueryClientProvider>;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SystemMarke", () => {
  it("ohne zweites System nur der Name, kein Knopf", () => {
    render(<SystemMarke klasse="nav-brand" system={SYSTEME[0]} wechselbar={false} onWechseln={() => {}} />);
    expect(screen.getByRole("heading").textContent).toMatch(/MR Assistent · FSM/);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("mit Finance-Recht ein Knopf, der die Auswahl öffnet", () => {
    const auf = vi.fn();
    render(<SystemMarke klasse="app-brand" system={SYSTEME[1]} wechselbar onWechseln={auf} />);
    fireEvent.click(screen.getByRole("button", { name: /System wechseln – aktiv: Finance/ }));
    expect(auf).toHaveBeenCalledOnce();
  });
});

describe("SystemWahl", () => {
  it("CRM ist ausgegraut, Finance wählbar", () => {
    const waehlen = vi.fn();
    render(<SystemWahl systeme={sichtbareSysteme(() => true)} aktiv="fsm" istSuperAdmin onWaehlen={waehlen} onClose={() => {}} />);
    const crm = screen.getByRole("button", { name: /^CRM/ }) as HTMLButtonElement;
    expect(crm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Finance/ }));
    expect(waehlen).toHaveBeenCalledWith("finance");
    expect(screen.getByText(/nur der Superadmin/)).toBeTruthy();
  });
});

describe("FinanceEinstellungen", () => {
  const vorgabe = finVorgabe(2026, "2026-10-13");

  it("speichert die Vorgabe beim ersten Mal", async () => {
    render(mitQuery(<FinanceEinstellungen supabase={supabase} gespeichert={null} bereit vorgabe={vorgabe} darfAendern />));
    expect(screen.getByText(/noch nichts gespeichert/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Gespeichert.")).toBeTruthy();
    expect(api.saveFinEinstellungen).toHaveBeenCalledWith(supabase, vorgabe);
  });

  it("Kleinunternehmer graut Soll/Ist und Zeitraum aus; GmbH stellt auf Bilanz", async () => {
    render(mitQuery(<FinanceEinstellungen supabase={supabase} gespeichert={vorgabe} bereit vorgabe={vorgabe} darfAendern />));
    const speichern = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    expect(speichern.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Kleinunternehmer § 19/ }));
    const ist = within(screen.getByRole("radiogroup", { name: "Versteuerung" })).getByRole("radio", { name: /^Ist/ }) as HTMLButtonElement;
    expect(ist.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^GmbH/ }));
    expect(screen.getByRole("radio", { name: /^Bilanz/ }).getAttribute("aria-checked")).toBe("true");
    expect(speichern.disabled).toBe(false);
    fireEvent.click(speichern);
    await screen.findByText("Gespeichert.");
    expect(api.saveFinEinstellungen).toHaveBeenCalledWith(supabase, expect.objectContaining({ besteuerung: "klein", rechtsform: "gmbh", gewinnermittlung: "bilanz" }));
  });

  it("EÜR für eine GmbH: Hinweis und kein Speichern", () => {
    render(mitQuery(<FinanceEinstellungen supabase={supabase} gespeichert={null} bereit vorgabe={vorgabe} darfAendern />));
    fireEvent.click(screen.getByRole("radio", { name: /^GmbH/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^EÜR/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/bilanzieren/);
    expect((screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ohne Recht nur ansehen", () => {
    render(mitQuery(<FinanceEinstellungen supabase={supabase} gespeichert={vorgabe} bereit vorgabe={vorgabe} darfAendern={false} />));
    expect(screen.getByText(/Nur ansehen/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Speichern" })).toBeNull();
    expect((screen.getByRole("radio", { name: /^SKR04/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Fehler beim Speichern: Meldung, Entwurf bleibt", async () => {
    api.saveFinEinstellungen.mockRejectedValueOnce(new Error("nein"));
    render(mitQuery(<FinanceEinstellungen supabase={supabase} gespeichert={vorgabe} bereit vorgabe={vorgabe} darfAendern />));
    fireEvent.click(screen.getByRole("radio", { name: /^SKR04/ }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/hat nicht geklappt/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^SKR04/ }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("Finance › Weitere (v162)", () => {
  it("jede Seite außer den vier unten steht in einer Gruppe; Fehlende landen in „Sonstiges“", () => {
    const zweit = FINANCE_SEITEN.filter((x) => !x.primaer && x.key !== "uebersicht");
    const vergeben = FINANCE_WEITERE_GRUPPEN.flatMap((g) => g.seiten);
    expect([...vergeben].sort()).toEqual(zweit.map((x) => x.key).sort());
    expect(financeWeitereGruppen([{ ...zweit[0], key: "neu" as never }]).at(-1)).toMatchObject({ titel: "Sonstiges" });
  });

  it("Kacheln nach Gruppen, System wechseln bei „System“", () => {
    const onSeite = vi.fn();
    const wahl = vi.fn();
    render(mitQuery(<FinanceBereich supabase={supabase} seite="mehr" onSeite={onSeite} darf={() => true} wechselbar onSystemWahl={wahl} />));
    const titel = screen.getAllByText(/^[A-ZÄÖÜ ]+$/).map((e) => e.textContent);
    expect(titel).toEqual(["ZAHLUNGEN", "BUCHFÜHRUNG", "STEUERN UND AUSWERTUNGEN", "JAHRESENDE UND KANZLEI", "SYSTEM"]);
    fireEvent.click(screen.getByRole("button", { name: /^Steuern/ }));
    expect(onSeite).toHaveBeenCalledWith("steuern");
    const system = screen.getByText("SYSTEM").parentElement!;
    fireEvent.click(within(system).getByRole("button", { name: /System wechseln/ }));
    expect(wahl).toHaveBeenCalledOnce();
  });
});

