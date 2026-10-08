// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FahrzeugeBlock } from "@/components/auftraege/FahrzeugeBlock";
import { VehicleRow } from "@/components/kunden/VehicleSection";
import { VerkaufsreifenBlatt } from "@/components/lager/VerkaufsreifenBlatt";
import { ArticleAssignPanel } from "@/components/auftraege/ArticleAssignPanel";
import { KartenKundeKarte } from "@/components/karte/KartenKundeKarte";
import { einkaufspreiseErgaenzen, VERKAUFSREIFEN_SPALTEN } from "@/lib/api/verkaufsreifen";
import type { Article, AuftragFahrzeug, OrderArticle, Vehicle, Verkaufsreifen, VerkaufsreifenFelder } from "@/lib/types";

// v125 (Migration 77): Die neuen Unterrechte schalten in der Oberfläche ab, was die Datenbank
// ohnehin ablehnen würde – damit niemand auf einen Knopf drückt, der nur eine Fehlermeldung bringt.

const fahrzeug = { id: "v1", customer_id: "c1", license_plate: "N-AB 1", make_model: "VW Golf", tire_size: "205/55 R16", note: null } as unknown as Vehicle;
const zeile = { id: "af1", order_id: "o1", vehicle_id: "v1", kilometerstand: null, created_at: "", fahrzeug } as unknown as AuftragFahrzeug & { fahrzeug: Vehicle | null };

const posten = {
  id: "r1", zustand: "neu", breite: 205, querschnitt: 55, zoll: 16, kennung: null, hersteller: "Muster", modell: null,
  saison: "sommer", dot: null, profiltiefe_mm: null, felge: null, runflat: false, xl: false, eprel: null,
  preis_netto: 80, ek_netto: 50, bestand: 4, reserviert: 0, verkauft: 0, warehouse_id: "w1", storage_slot_id: null,
  notiz: null, created_at: "", updated_at: "",
} as Verkaufsreifen;

function blatt(teil: Partial<Parameters<typeof VerkaufsreifenBlatt>[0]> = {}) {
  const onSpeichern = vi.fn(async (_f: VerkaufsreifenFelder, _id: string | null) => {});
  render(
    <VerkaufsreifenBlatt
      posten={posten} warehouses={[{ id: "w1", name: "Lager" } as never]} storageSlots={[]} platzBelegt={new Set()}
      vorgabeLagerId="w1" darfSchreiben darfLoeschen={false}
      onSpeichern={onSpeichern} onLoeschen={async () => {}} onClose={() => {}}
      {...teil}
    />
  );
  return onSpeichern;
}

describe("Unterrechte in der Oberfläche", () => {
  afterEach(cleanup);

  it("FahrzeugeBlock: ohne „Fahrzeuge anlegen“ kein Feld für ein neues Kennzeichen", () => {
    const props = {
      fahrzeuge: [zeile], alleFahrzeuge: [fahrzeug],
      onFahrzeugHinzufuegen: async () => {}, onFahrzeugAnlegen: async () => {},
      onKilometerstand: async () => {}, onFahrzeugEntfernen: async () => {},
    };
    render(<FahrzeugeBlock {...props} />);
    expect(screen.getByLabelText("Neues Kennzeichen")).toBeTruthy();
    cleanup();
    render(<FahrzeugeBlock {...props} darfAnlegen={false} />);
    expect(screen.queryByLabelText("Neues Kennzeichen")).toBeNull();
  });

  it("Kundenfenster: ohne Recht kein „Bearbeiten“, ohne Löschrecht kein „Löschen“", () => {
    const props = { vehicle: fahrzeug, tireStorages: [], storageSlots: [], warehouses: [], onUpdate: () => {}, onDelete: () => {} };
    render(<VehicleRow {...props} darfAendern={false} />);
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
    cleanup();
    render(<VehicleRow {...props} darfLoeschen={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy();
  });

  it("Verkaufsreifen: ohne „Einkaufspreise sehen“ fehlt das Feld", () => {
    blatt({ darfEkLesen: false, darfEkSchreiben: false });
    expect(screen.queryByText("Einkauf je Stück")).toBeNull();
    cleanup();
    blatt();
    expect(screen.getByText("Einkauf je Stück")).toBeTruthy();
  });

  it("Verkaufsreifen: ohne „Einkaufspreise eintragen“ geht der Einkauf beim Speichern nicht mit", async () => {
    const onSpeichern = blatt({ darfEkSchreiben: false });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSpeichern).toHaveBeenCalled());
    expect("ek_netto" in onSpeichern.mock.calls[0][0]).toBe(false);
    cleanup();
    const mitEk = blatt();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(mitEk).toHaveBeenCalled());
    expect(mitEk.mock.calls[0][0].ek_netto).toBe(50);
  });

  it("lib/api: die Spaltenliste lässt den Einkauf weg, die Funktion trägt ihn nach", async () => {
    expect(VERKAUFSREIFEN_SPALTEN.split(",")).not.toContain("ek_netto");
    expect(VERKAUFSREIFEN_SPALTEN.split(",")).toContain("herkunft_satz_id");
    const rpc = vi.fn(async () => ({ data: [{ id: "r1", ek_netto: "49.90" }], error: null }));
    const supabase = { rpc } as unknown as SupabaseClient;
    const { ek_netto: _weg, ...ohne } = posten;
    void _weg;
    const mit = await einkaufspreiseErgaenzen(supabase, [ohne, { ...ohne, id: "r2" }]);
    expect(rpc).toHaveBeenCalledWith("verkaufsreifen_einkaufspreise");
    expect(mit.map((x) => x.ek_netto)).toEqual([49.9, null]);
    expect(await einkaufspreiseErgaenzen(supabase, [])).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("Leistungen: ohne „Lagergebühr anpassen“ (Migration 78) steht die Lagergebühr eines Satzes fest", () => {
    const artikel = { id: "a1", short_name: "Einlagerung je Monat", abrechnungsart: "lagergebuehr", active: true } as unknown as Article;
    const zeile = { id: "z1", order_id: "o1", article_id: "a1", quantity: 6, net_price: 8, vat_rate: 19, endpreis_netto: null, note: null,
      created_at: "", deleted_at: null, lager_satz_id: "t1" } as unknown as OrderArticle;
    const props = {
      orderId: "o1", articles: [artikel], articlePrices: [], rows: [zeile], rechnungNoetig: true,
      onAdd: async () => {}, onUpdateQty: async () => {}, onUpdateEndpreis: async () => {}, onUpdateText: async () => {}, onRemove: async () => {},
    };
    render(<ArticleAssignPanel {...props} darfLagergebuehr={false} />);
    expect(screen.queryByRole("button", { name: "Eins mehr" })).toBeNull();
    fireEvent.click(screen.getByText("Einlagerung je Monat"));
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull();
    cleanup();
    render(<ArticleAssignPanel {...props} />);
    expect(screen.getByRole("button", { name: "Eins mehr" })).toBeTruthy();
  });

  it("Karte: ohne „Kontakte eintragen“ und „Aufträge anlegen“ fehlen beide Knöpfe", () => {
    const kunde = { id: "c1", name: "Muster", address: "Hauptstr. 1", phone_mobile: null, phone_landline: null } as never;
    const props = {
      kunde, zustand: "red", naechster: null, naechsterMitarbeiter: [], anker: { current: null }, onSchliessen: () => {}, onAnrufen: () => {}, onNavigation: () => {},
      onKundenfenster: () => {}, onDeaktivieren: () => {}, onPositionSetzen: () => {},
    } as unknown as Parameters<typeof KartenKundeKarte>[0];
    render(<KartenKundeKarte {...props} />);
    expect(screen.queryByTitle("Kontakt festhalten")).toBeNull();
    expect(screen.queryByTitle("Auftrag anlegen")).toBeNull();
    cleanup();
    render(<KartenKundeKarte {...props} onKontakt={() => {}} onAuftrag={() => {}} />);
    expect(screen.getByTitle("Kontakt festhalten")).toBeTruthy();
    expect(screen.getByTitle("Auftrag anlegen")).toBeTruthy();
  });
});
