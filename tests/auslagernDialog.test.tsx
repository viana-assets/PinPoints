// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuslagernDialog } from "@/components/lager/AuslagernDialog";
import type { Article, ArticlePrice, Order, TireStorage } from "@/lib/types";
import { todayStr } from "@/lib/helpers";

// Auslagern erst beim Abschließen (Migration 67, v111): Mit einem Auftrag wird nur vorgemerkt.

const satz: TireStorage = {
  id: "t1", storage_slot_id: "s1", customer_id: "c1", vehicle_id: null, saison: "winter",
  erfassungsart: "sammel", anzahl_raeder: 4, dot_date: null, profiltiefe_mm: null, note: null,
  created_at: "2026-04-01T08:00:00Z", updated_at: "", removed_at: null, entnahme_order_id: null, order_id: "alt",
};
const auftrag = (id: string, nr: number, datum: string): Order =>
  ({ id, order_number: nr, order_date: datum, title: "Räderwechsel", customer_id: "c1", status: "offen" } as unknown as Order);
const gebuehr = { id: "a1", short_name: "Einlagerung je Monat", abrechnungsart: "lagergebuehr", active: true } as unknown as Article;
const preis = { id: "p1", article_id: "a1", net_price: 5, vat_rate: 19, valid_from: "2020-01-01" } as unknown as ArticlePrice;

function zeige(teil: Partial<Parameters<typeof AuslagernDialog>[0]> = {}) {
  const onAuslagern = vi.fn(async () => {});
  render(
    <AuslagernDialog
      satz={satz} kunde={undefined} fahrzeug={undefined} slot={undefined} warehouse={undefined}
      gebuehrArtikel={[gebuehr]} articlePrices={[preis]}
      offeneAuftraege={[auftrag("o1", 101, "2099-12-20")]} vorschlagAuftragId="o1" vorgemerktFuer={null}
      onAbbrechen={() => {}} onAuslagern={onAuslagern} onAuftragOeffnen={() => {}} onZuruecknehmen={async () => {}}
      {...teil}
    />
  );
  return onAuslagern;
}

describe("AuslagernDialog", () => {
  afterEach(cleanup);

  it("merkt für den Auftrag vor und rechnet die Monate bis zum Termin", () => {
    const onAuslagern = zeige();
    expect(screen.getByText(/Termin/)).toBeTruthy();
    fireEvent.click(screen.getByText("Vormerken und berechnen"));
    expect(onAuslagern).toHaveBeenCalledWith(expect.objectContaining({ auftragId: "o1", sofort: false, neuerAuftrag: false, artikelId: "a1" }));
  });

  it("lagert ohne Auftrag sofort aus, ohne Gebühr", () => {
    const onAuslagern = zeige();
    fireEvent.change(screen.getByLabelText("Mit welchem Auftrag?"), { target: { value: "sofort" } });
    fireEvent.click(screen.getByText("Jetzt auslagern"));
    expect(onAuslagern).toHaveBeenCalledWith({ auftragId: null, neuerAuftrag: false, sofort: true, artikelId: null, menge: 0 });
  });

  it("bietet den Auftrag, in dem eingelagert wurde, nicht an und belegt dann „sofort“ vor", () => {
    zeige({ satz: { ...satz, order_id: "o1" }, offeneAuftraege: [auftrag("o1", 101, todayStr())] });
    const auswahl = screen.getByLabelText("Mit welchem Auftrag?") as HTMLSelectElement;
    expect(auswahl.value).toBe("sofort");
    expect([...auswahl.options].map((o) => o.value)).toEqual(["neu", "sofort"]);
  });

  it("bietet dem Techniker keinen neuen Auftrag an (v119) – ohne offenen Auftrag steht „sofort“ vorn", () => {
    zeige({ offeneAuftraege: [], vorschlagAuftragId: null, darfNeuerAuftrag: false });
    const auswahl = screen.getByLabelText("Mit welchem Auftrag?") as HTMLSelectElement;
    expect(auswahl.value).toBe("sofort");
    expect([...auswahl.options].map((o) => o.value)).toEqual(["sofort"]);
  });

  it("zeigt bei einem vorgemerkten Satz nur den Weg zum Auftrag und zum Zurücknehmen", () => {
    const onZuruecknehmen = vi.fn(async () => {});
    zeige({ satz: { ...satz, entnahme_order_id: "o1" }, vorgemerktFuer: auftrag("o1", 101, "2099-12-20"), onZuruecknehmen });
    expect(screen.getByText("Zum Auslagern vorgemerkt")).toBeTruthy();
    expect(screen.queryByLabelText("Mit welchem Auftrag?")).toBeNull();
    fireEvent.click(screen.getByText("Vormerkung zurücknehmen"));
    expect(onZuruecknehmen).toHaveBeenCalled();
  });

  it("ohne „Lagergebühr anpassen“ (Migration 78): kein „Ohne Gebühr“, Monate fest", () => {
    const onAuslagern = zeige({ darfGebuehrAnpassen: false });
    expect(screen.queryByLabelText("Ohne Gebühr")).toBeNull();
    const menge = screen.getByLabelText("Menge (Monate)") as HTMLInputElement;
    expect(menge.disabled).toBe(true);
    fireEvent.click(screen.getByText("Vormerken und berechnen"));
    expect(onAuslagern).toHaveBeenCalledWith(expect.objectContaining({ artikelId: "a1", menge: Number(menge.value) }));
  });

  it("ohne „Reifen auslagern“ (Migration 78): nur der Hinweis, kein Vormerken und kein Zurücknehmen", () => {
    zeige({ darfAuslagern: false });
    expect(screen.getByText(/Auslagern ist für deine Rolle nicht freigegeben/)).toBeTruthy();
    expect(screen.queryByText("Vormerken und berechnen")).toBeNull();
    cleanup();
    zeige({ darfAuslagern: false, vorgemerktFuer: auftrag("o1", 101, "2099-12-20") });
    expect(screen.queryByText("Vormerkung zurücknehmen")).toBeNull();
    expect(screen.getByText("Auftrag öffnen")).toBeTruthy();
  });
});
