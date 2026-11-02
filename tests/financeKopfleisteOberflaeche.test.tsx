// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";

// v187: Kopfleiste, Statuszeile, Zahlen in der Seitenleiste, Journal (Partner, Excel, PDF, Beleg zuordnen, Belegbild),
// Buchen am Handy. Alle Namen und Zahlen erfunden.
const E = vi.hoisted(() => ({
  wirtschaftsjahr: 2026, rechtsform: "einzel", gewinnermittlung: "euer", kontenrahmen: "skr03", besteuerung: "regel", versteuerung: "soll",
  voranmeldung: "monat", dauerfrist: true, r13b_empfaenger: false, innergemeinschaftlich: false, rechnungen_umfang: "alle", ohne_ausweis: "ust",
  start_datum: "2026-01-01", wj_beginn_monat: 1, sammelposten: false,
}));
const konto = (nummer: number, bezeichnung: string, kategorie: string) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const api = vi.hoisted(() => ({
  fetchFinEinstellungen: vi.fn(async (): Promise<unknown> => ({ status: "da", einstellungen: E })),
  fetchFinKonten: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinSteuerschluessel: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinPersonenkonten: vi.fn(async (): Promise<unknown[]> => [{ nummer: 70001, art: "kreditor", sammel: false, name: "Reifengroßhandel Nord", kundennummer: null,
    customer_id: null, lieferant_id: null, anschrift: null, ust_id: null, vortrag: 0 }]),
  fetchFinBelege: vi.fn(async (): Promise<unknown[]> => [1, 2, 3].map((i) => ({ id: `e${i}`, lieferant_id: null, belegdatum: "2026-10-01", belegnummer: null, text: null,
    faellig_am: null, posten: [], datei_pfad: null, datei_typ: null, datei_name: null, status: "entwurf", brutto: null, buchung_id: null, bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01" }))),
  fetchFinBankumsaetze: vi.fn(async (): Promise<unknown[]> => [{ status: "offen" }, { status: "offen" }, { status: "zugeordnet" }]),
  fetchFinRechnungenStand: vi.fn(async () => ({ vorgaenge: [], anderswo: [], rechnungen: [] })),
  fetchFinFestschreibungen: vi.fn(async (): Promise<unknown[]> => [{ jahr: 2026, monat: 1, am: "x" }, { jahr: 2026, monat: 2, am: "x" }]),
  fetchFinUstStand: vi.fn(async () => ({ eingerichtet: false })),
  fetchFinLieferanten: vi.fn(async (): Promise<unknown[]> => [{ id: "L1", name: "Würth", ust_id: null, konto: null, steuer: null, aktiv: true }]),
  fetchFinBuchungBelegbilder: vi.fn(async (): Promise<unknown[]> => [{ pfad: "b1/1-foto.jpg", name: "foto.jpg", typ: "image/jpeg" }]),
  finBelegDateiLink: vi.fn(async (_s: unknown, pfad: string) => `https://beleg.test/${pfad}`),
  finBuchen: vi.fn(async () => ({ id: "neu1", jahr: 2026, nr: 41 })),
  finBuchungDateiHochladen: vi.fn(async () => undefined),
  finLieferantAnlegen: vi.fn(async (_s: unknown, l: { name: string }) => ({ id: "L9", name: l.name, ust_id: null, konto: null, steuer: null, aktiv: true })),
  finBelegSpeichern: vi.fn(async () => "B9"),
  finBelegDateiHochladen: vi.fn(async () => "B9/foto.jpg"),
  finBelegBuchen: vi.fn(async () => ({ nr: 42, brutto: 23.8 })),
  fetchFinBuchungen: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinKostenstellen: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinAbgehakt: vi.fn(async (): Promise<unknown[]> => []),
  fetchFinMahnungen: vi.fn(async (): Promise<unknown[]> => []),
  saveFinEinstellungen: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/finance", () => api);
vi.mock("@/lib/api/betrieb", () => ({ fetchBetrieb: vi.fn(async () => ({ firma: "Testbetrieb", inhaber: "" })) }));
vi.mock("@/lib/belegBild", () => ({ bildVerkleinern: vi.fn(async (f: Blob) => ({ blob: f, breite: 10, hoehe: 10 })) }));
const download = vi.hoisted(() => ({ dateiHerunterladen: vi.fn() }));
vi.mock("@/lib/download", () => download);

import { FinanceKopfleiste, FinanceStatuszeile, useFinanceStand } from "@/components/finance/FinanceKopfleiste";
import { FinanceNavigation } from "@/components/finance/FinanceNavigation";
import { FinanceJournalArbeitsplatz } from "@/components/finance/FinanceJournalArbeitsplatz";
import { FinanceHandyBuchen } from "@/components/finance/FinanceHandyBuchen";
import { FinanceBereich, type FinanceAnsicht } from "@/components/finance/FinanceBereich";
import { useState } from "react";
import { FINANCE_SEITEN } from "@/lib/finance/seiten";
import { XLSX_TYP } from "@/lib/finance/xlsx";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";
import type { FinEinstellungen, FinEinstellungen as Einst } from "@/lib/finance/einstellungen";

const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: "ich" } } } }) } } as unknown as SupabaseClient;
const alles = () => true;
const mit = (kind: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{kind}</QueryClientProvider>);
beforeEach(() => {
  localStorage.clear();
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:vorschau"), revokeObjectURL: vi.fn() });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Kopfleiste", () => {
  function leiste(aktivSeite = "uebersicht") {
    const p = { onJahr: vi.fn(), onPeriode: vi.fn(), onSuchziel: vi.fn(), onNeu: vi.fn() };
    mit(<FinanceKopfleiste supabase={supabase} jahr={2026} laufend={2026} periode="jahr" e={E as Einst} seiten={FINANCE_SEITEN} darf={alles}
      aktivSeite={aktivSeite} {...p} />);
    return p;
  }

  it("Wirtschaftsjahr, Periode, Kontenrahmen und Versteuerung", () => {
    const p = leiste();
    expect(screen.getByText("SKR03 · Soll-Versteuerung")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Wirtschaftsjahr"), { target: { value: "2025" } });
    expect(p.onJahr).toHaveBeenCalledWith(2025);
    fireEvent.change(screen.getByLabelText("Periode"), { target: { value: "q1" } });
    expect(p.onPeriode).toHaveBeenCalledWith("q1");
    expect(within(screen.getByLabelText("Periode")).getByRole("option", { name: "Oktober 2026" })).toBeTruthy();
  });

  it("Suche: Seite, Konto, Person, Journal – mit Pfeil und Enter", async () => {
    api.fetchFinKonten.mockResolvedValueOnce([konto(1200, "Bank", "geld"), konto(4530, "Laufende Kfz-Kosten (Kraftstoff)", "aufwand")]);
    const p = leiste();
    const feld = screen.getByLabelText("Finance durchsuchen");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "reifen" } });
    expect(await screen.findByRole("option", { name: /70001 Reifengroßhandel Nord/ })).toBeTruthy();
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(p.onSuchziel).toHaveBeenCalledWith({ art: "person", nummer: 70001 });
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "ba" } });
    await screen.findByRole("option", { name: /1200 Bank/ });
    fireEvent.keyDown(feld, { key: "ArrowDown" });
    fireEvent.keyDown(feld, { key: "Enter" });
    expect(p.onSuchziel).toHaveBeenLastCalledWith({ art: "konto", konto: 1200 });
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: "ba" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /„ba“ im Journal suchen/ }));
    expect(p.onSuchziel).toHaveBeenLastCalledWith({ art: "journal", text: "ba" });
  });

  it("F2 springt in die Suche, N öffnet die Schnellbuchung – nicht auf „Buchungen“, nicht beim Tippen", () => {
    const p = leiste();
    fireEvent.keyDown(window, { key: "F2" });
    expect(document.activeElement).toBe(screen.getByLabelText("Finance durchsuchen"));
    fireEvent.keyDown(screen.getByLabelText("Finance durchsuchen"), { key: "n" });
    expect(p.onNeu).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "N" });
    expect(p.onNeu).toHaveBeenCalledTimes(1);
    cleanup();
    const q = leiste("buchungen");
    fireEvent.keyDown(document.body, { key: "n" });
    expect(q.onNeu).not.toHaveBeenCalled();
  });
});

describe("Statuszeile und Zahlen in der Seitenleiste", () => {
  function Zeile({ onSeite, onMonate }: { onSeite: (s: string) => void; onMonate: () => void }) {
    const stand = useFinanceStand(supabase, 2026, "2026-10-30", alles);
    return <FinanceStatuszeile supabase={supabase} jahr={2026} heute="2026-10-30" stand={stand} darf={alles} onSeite={onSeite} onMonate={onMonate} />;
  }
  it("Belegeingang, Bank, festgeschrieben bis – je ein Sprung", async () => {
    const onSeite = vi.fn(), onMonate = vi.fn();
    mit(<Zeile onSeite={onSeite} onMonate={onMonate} />);
    fireEvent.click((await screen.findByText("3 offen")).closest("button")!);
    expect(onSeite).toHaveBeenCalledWith("belege");
    fireEvent.click((await screen.findByText("2 Umsätze nicht zugeordnet")).closest("button")!);
    expect(onSeite).toHaveBeenLastCalledWith("bank");
    fireEvent.click((await screen.findByText("Februar 2026")).closest("button")!);
    expect(onMonate).toHaveBeenCalled();
    expect(screen.getByText(/F2 Suche · N Schnellbuchung/)).toBeTruthy();
  });
  it("Seitenleiste: 3 an Belege, 2 an Bank", async () => {
    mit(<FinanceNavigation seiten={FINANCE_SEITEN} aktiv="uebersicht" onSeite={() => {}} supabase={supabase} jahr={2026} darf={alles} />);
    expect(await screen.findByLabelText("3 offen")).toBeTruthy();
    expect(await screen.findByLabelText("2 offen")).toBeTruthy();
  });
});

// ---------------------------------------------------------------- Journal
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand"): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1000, "Kasse", "geld"), k(1200, "Bank", "geld"), k(1360, "Geldtransit", "geld"), k(1576, "Vorsteuer 19 %", "steuer"), k(1600, "Verbindlichkeiten", "verbindlichkeit"),
  k(1890, "Privateinlagen", "privat"), k(3400, "Wareneingang 19 % Vorsteuer"), k(4530, "Laufende Kfz-Kosten (Kraftstoff)"), k(4580, "Sonstige Kfz-Kosten"),
  k(4650, "Bewirtungskosten"), k(4985, "Werkzeuge und Kleingeräte"), k(8400, "Erlöse 19 %", "erloes")];
const z = (seite: "S" | "H", konto: number, betrag: number, personenkonto: number | null = null): FinZeile =>
  ({ posten: 1, seite, konto, betrag, ist_steuer: false, steuerschluessel: null, personenkonto });
const b = (nr: number, datum: string, text: string, zeilen: FinZeile[], extra: Partial<FinBuchung> = {}): FinBuchung => ({ id: `b${nr}`, jahr: 2026, nr, datum, text, beleg: null,
  quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: `${datum}T08:00:00Z`, fin_buchungszeilen: zeilen, ...extra });
const BUCHUNGEN = [b(1, "2026-01-08", "Tanken", [z("S", 4530, 78.4), z("H", 1000, 78.4)]),
  b(2, "2026-02-10", "Reifen Nord", [z("S", 3400, 654.5), z("H", 1600, 654.5, 70001)]),
  b(3, "2026-04-03", "Werkzeug", [z("S", 4985, 30), z("H", 1200, 30)])];
const PERSONEN = [{ nummer: 70001, art: "kreditor" as const, sammel: false, name: "Reifengroßhandel Nord", kundennummer: null, customer_id: null, lieferant_id: null, anschrift: null, ust_id: null, vortrag: 0 }];
const zeilenKeys = () => screen.getAllByRole("row").filter((r) => r.dataset.key).map((r) => r.dataset.key);

describe("Journal v187", () => {
  function journal(extra: Partial<Parameters<typeof FinanceJournalArbeitsplatz>[0]> = {}) {
    return mit(<FinanceJournalArbeitsplatz buchungen={BUCHUNGEN} konten={KONTEN} schluessel={[]} fest={[]} jahr={2026} laedt={false} darfBuchen
      onNeu={() => {}} onOeffnen={() => {}} personen={PERSONEN} firma="Testbetrieb" stand="30.10.2026" {...extra} />);
  }
  it("Anfangsfilter aus der Kopfleiste, Quartal, Partner", () => {
    journal({ start: { von: "2026-01-01", bis: "2026-03-31" } });
    expect(zeilenKeys()).toEqual(["b1", "b2"]);
    expect((screen.getByLabelText("Zeitraum") as HTMLSelectElement).value).toBe("q1");
    fireEvent.change(screen.getByLabelText("Partner"), { target: { value: "70001" } });
    expect(zeilenKeys()).toEqual(["b2"]);
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(zeilenKeys()).toEqual(["b1", "b2", "b3"]);
  });
  it("Excel und PDF", () => {
    journal();
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(download.dateiHerunterladen).toHaveBeenCalledWith("journal_2026.xlsx", expect.any(Uint8Array), XLSX_TYP);
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    const d = screen.getByRole("dialog", { name: "Buchungsjournal 2026" });
    expect(d.textContent).toMatch(/Testbetrieb/);
    expect(d.textContent).toMatch(/Reifen Nord/);
    expect(d.textContent).toMatch(/Summe Umsatz/);
  });
  it("Markierte: Beleg zuordnen und Excel", async () => {
    const onBelegZuordnen = vi.fn(async (ids: string[]) => `Beleg an ${ids.length} Buchungen gehängt.`);
    journal({ onBelegZuordnen });
    const tabelle = screen.getByRole("region", { name: "Journal 2026" });
    fireEvent.keyDown(tabelle, { key: "Home" });
    fireEvent.keyDown(tabelle, { key: " " });
    fireEvent.keyDown(tabelle, { key: "ArrowDown" });
    fireEvent.keyDown(tabelle, { key: " " });
    const datei = new File(["x"], "quittung.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Beleg den markierten Buchungen zuordnen"), { target: { files: [datei] } });
    await waitFor(() => expect(onBelegZuordnen).toHaveBeenCalledWith(["b1", "b2"], datei));
    expect(await screen.findByText("Beleg an 2 Buchungen gehängt.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Markierte als Excel" }));
    expect(download.dateiHerunterladen).toHaveBeenCalledWith("journal_2026.xlsx", expect.any(Uint8Array), XLSX_TYP);
  });
  it("rechts das Belegbild, F4 öffnet es", async () => {
    const offen = vi.spyOn(window, "open").mockImplementation(() => null);
    journal({ supabase });
    const bild = await screen.findByRole("img", { name: "Beleg foto.jpg" });
    expect(bild.getAttribute("src")).toBe("https://beleg.test/b1/1-foto.jpg");
    expect(api.fetchFinBuchungBelegbilder).toHaveBeenCalledWith(supabase, "b3");
    fireEvent.keyDown(document.body, { key: "F4" });
    expect(offen).toHaveBeenCalledWith("https://beleg.test/b1/1-foto.jpg", "_blank", "noopener");
    expect(screen.getByText(/F4 Beleg/)).toBeTruthy();
    offen.mockRestore();
  });
});

// ---------------------------------------------------------------- Buchen am Handy
describe("Buchen am Handy", () => {
  function maske(e: Partial<Einst> = {}, rechte = { buchen: true, belege: true }, buchungen: FinBuchung[] = []) {
    const p = { onGebucht: vi.fn(), onClose: vi.fn(), onAusfuehrlich: vi.fn() };
    mit(<FinanceHandyBuchen supabase={supabase} jahr={2026} heute="2026-10-30" einstellungen={{ ...(E as Einst), ...e } as FinEinstellungen} konten={KONTEN}
      schluessel={[{ kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 }]}
      buchungen={buchungen} kostenstellen={[{ id: "k1", art: "kost1", nummer: "T1", bezeichnung: "VW T6.1", aktiv: true, firmenfahrzeug_id: null } as never]}
      rechte={rechte} {...p} />);
    return p;
  }
  const chip = (gruppe: string, name: string) => within(screen.getByRole("radiogroup", { name: gruppe })).getByRole("radio", { name });

  it("Foto, Betrag, Tanken, bar, Transporter: Vorschau, dann fin_buchen und das Foto an die Buchung", async () => {
    const p = maske();
    const foto = new File(["jpg"], "shell.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Beleg fotografieren"), { target: { files: [foto] } });
    expect(screen.getByRole("img", { name: "Beleg" }).getAttribute("src")).toBe("blob:vorschau");
    fireEvent.change(screen.getByLabelText("Betrag brutto"), { target: { value: "78,40" } });
    fireEvent.click(chip("Wofür", "Tanken"));
    fireEvent.change(screen.getByPlaceholderText("z. B. Shell, Würth"), { target: { value: "Shell" } });
    fireEvent.click(chip("Bezahlt mit", "Bar (Kasse)"));
    fireEvent.click(chip("Transporter", "VW T6.1"));
    expect(screen.getByText("SO WIRD GEBUCHT")).toBeTruthy();
    expect(screen.getByText(/„Tanken · Shell“/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    await waitFor(() => expect(api.finBuchen).toHaveBeenCalledWith(supabase, { datum: "2026-10-30", text: "Tanken · Shell", beleg: "",
      posten: [{ soll: 4530, haben: 1000, betrag: 78.4, steuer: "vst19", kost1: "T1" }] }));
    await waitFor(() => expect(api.finBuchungDateiHochladen).toHaveBeenCalledWith(supabase, "neu1", foto, "shell.jpg"));
    expect(await screen.findByText("Gebucht als Nr. 2026-41.")).toBeTruthy();
    expect(p.onGebucht).toHaveBeenCalledWith("Gebucht als Nr. 2026-41.");
    expect((screen.getByLabelText("Betrag brutto") as HTMLInputElement).value).toBe("");
  });

  it("Firmenkarte bucht gegen Geldtransit; ohne Vorsteuer auf Wunsch", async () => {
    maske();
    fireEvent.change(screen.getByLabelText("Betrag brutto"), { target: { value: "4,50" } });
    fireEvent.click(chip("Wofür", "Parken"));
    fireEvent.click(chip("Bezahlt mit", "Firmenkarte"));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/Geldtransit – den Umsatz/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    await waitFor(() => expect(api.finBuchen).toHaveBeenCalledWith(supabase, expect.objectContaining({
      text: "Parken", posten: [{ soll: 4580, haben: 1360, betrag: 4.5, steuer: null, kost1: null }] })));
    expect(api.finBuchungDateiHochladen).not.toHaveBeenCalled();
  });

  it("Noch offen: Lieferant neu anlegen, Beleg anlegen und buchen – ohne Transporter", async () => {
    maske();
    fireEvent.change(screen.getByLabelText("Betrag brutto"), { target: { value: "23,80" } });
    fireEvent.click(chip("Wofür", "Material"));
    fireEvent.click(chip("Bezahlt mit", "Noch offen"));
    expect((chip("Transporter", "VW T6.1") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Buchen" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Name des Lieferanten"), { target: { value: "Werkzeug Schmidt" } });
    fireEvent.click(screen.getByRole("button", { name: "Buchen" }));
    await waitFor(() => expect(api.finBelegBuchen).toHaveBeenCalledWith(supabase, "B9", null, null));
    expect(api.finLieferantAnlegen).toHaveBeenCalledWith(supabase, { name: "Werkzeug Schmidt", ust_id: null, konto: 3400, steuer: "vst19" });
    expect(api.finBelegSpeichern).toHaveBeenCalledWith(supabase, null, { lieferant_id: "L9", belegdatum: "2026-10-30", belegnummer: null, text: "Material",
      faellig_am: null, posten: [{ konto: 3400, betrag: 23.8, steuer: "vst19" }] });
    expect(api.finBuchen).not.toHaveBeenCalled();
    expect(await screen.findByText("Gebucht als Nr. 2026-42 – offen beim Lieferanten Werkzeug Schmidt.")).toBeTruthy();
  });

  it("GmbH: kein „Privat ausgelegt“; Kleinunternehmer: keine Vorsteuer; anderes Jahr: kein Buchen", () => {
    maske({ rechtsform: "gmbh", besteuerung: "klein" });
    expect(within(screen.getByRole("radiogroup", { name: "Bezahlt mit" })).queryByRole("radio", { name: "Privat ausgelegt" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    cleanup();
    mit(<FinanceHandyBuchen supabase={supabase} jahr={2025} heute="2026-10-30" einstellungen={E as unknown as FinEinstellungen} konten={KONTEN} schluessel={[]}
      buchungen={[]} kostenstellen={[]} rechte={{ buchen: true, belege: false }} onGebucht={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Betrag brutto"), { target: { value: "5" } });
    expect(screen.getByText(/Wirtschaftsjahr 2026 wählen/)).toBeTruthy();
  });

  it("Heute von dir gebucht; Anderes … öffnet die Kontosuche", async () => {
    const heute = new Date(2026, 9, 30, 9, 0, 0).toISOString();
    maske({}, { buchen: true, belege: false }, [b(7, "2026-10-30", "Parken · Parkhaus Hbf", [z("S", 4580, 4.5), z("H", 1000, 4.5)], { erstellt_von: "ich", erstellt_am: heute })]);
    expect(await screen.findByText("Parken · Parkhaus Hbf")).toBeTruthy();
    expect(screen.getByText("HEUTE VON DIR GEBUCHT")).toBeTruthy();
    fireEvent.click(chip("Wofür", "Anderes …"));
    expect(screen.getByLabelText("Konto suchen")).toBeTruthy();
    await act(async () => {});
  });
});

// ---------------------------------------------------------------- Im Bereich: Sprünge aus der Kopfleiste
describe("FinanceBereich mit Kopfleiste", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 30, 10, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); });
  function Bereich({ onJahr }: { onJahr: (j: number) => void }) {
    const [seite, setSeite] = useState<FinanceAnsicht>("uebersicht");
    const [jahr, setJahr] = useState(2026);
    return <FinanceBereich supabase={supabase} seite={seite} onSeite={setSeite} darf={alles} wechselbar={false} onSystemWahl={() => {}}
      jahr={jahr} onJahr={(j) => { onJahr(j); setJahr(j); }} />;
  }
  const suchen = async (text: string, treffer: RegExp) => {
    const feld = screen.getByLabelText("Finance durchsuchen");
    fireEvent.focus(feld);
    fireEvent.change(feld, { target: { value: text } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: treffer }));
  };

  it("Schnellbuchung springt nach Buchungen – der Sprung gilt nur einmal; Suche öffnet das Kontoblatt; WJ wechselt", async () => {
    api.fetchFinKonten.mockResolvedValue([konto(1000, "Kasse", "geld"), konto(4530, "Laufende Kfz-Kosten (Kraftstoff)", "aufwand")]);
    const onJahr = vi.fn();
    mit(<Bereich onJahr={onJahr} />);
    expect(await screen.findByText("Belegeingang:")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "+ Schnellbuchung (N)" }));
    expect(await screen.findByRole("dialog", { name: "Schnellbuchung" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await suchen("Einstell", /Einstellungen/);
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeTruthy();
    await suchen("Buchung", /^Buchungen/);
    expect(await screen.findByRole("tab", { name: "Journal", selected: true })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await suchen("4530", /4530 Laufende Kfz-Kosten/);
    expect(await screen.findByRole("tab", { name: "Kontoblatt", selected: true })).toBeTruthy();
    expect(await screen.findByText("4530 Laufende Kfz-Kosten (Kraftstoff)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Wirtschaftsjahr"), { target: { value: "2025" } });
    expect(onJahr).toHaveBeenCalledWith(2025);
    expect(await screen.findByText(/Wirtschaftsjahr 2025/)).toBeTruthy();
    api.fetchFinKonten.mockReset();
    api.fetchFinKonten.mockImplementation(async () => []);
  });
});
