// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TerminWahlBlatt, terminWahlText } from "@/components/auftraege/TerminWahlBlatt";
import type { Order } from "@/lib/types";

// Termin aus dem Kalender wählen (v138): Monat → Tag → Uhrzeit → „Fertig“.

beforeAll(() => {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.HTMLElement.prototype.scrollIntoView ||= () => {};
});
afterEach(cleanup);

const auftrag = (id: string, order_date: string, time: string | null, felder: Partial<Order> = {}): Order => ({
  id, order_number: 1, customer_id: "c1", title: "Räderwechsel", description: null, status: "offen", order_date, time, end_time: null,
  techniker_notiz: null, firmenfahrzeug_id: null, completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null,
  cancel_reason: null, reopen_reason: null, rechnung_noetig: true, rechnung_erstellt_am: null, rechnung_erstellt_von: null,
  rechnung_nummer: null, laufkunde_name: null, laufkunde_telefon: null, deleted_at: null, created_at: "", updated_at: "", ...felder,
} as Order);

function blatt(onUebernehmen = vi.fn()) {
  render(<TerminWahlBlatt order={auftrag("neu", "2026-10-09", null)} start={{ datum: "2026-10-09", von: null, bis: null }}
    auftraege={[auftrag("a", "2026-10-14", "09:00"), auftrag("b", "2026-10-14", "11:00"), auftrag("x", "2026-10-15", "09:00", { status: "storniert" })]}
    zuordnungen={{ a: ["e1"] }} customers={[]} employees={[{ id: "e1", name: "Jan", profile_id: null, created_at: "" } as never]}
    terminIntervallMin={30} onUebernehmen={onUebernehmen} onClose={() => {}} />);
  return onUebernehmen;
}

describe("Termin aus dem Kalender", () => {
  it("zeigt den Monat mit Punkten für geplante Termine; blättern mit ‹ ›", () => {
    blatt();
    expect(screen.getByText("Oktober 2026")).toBeTruthy();
    const tag14 = screen.getByRole("button", { name: /^14\. Oktober, 2 Termine/ });
    expect(tag14.querySelectorAll(".monat-punkte span")).toHaveLength(2); // Jan + „niemand eingeteilt“
    expect(screen.getByRole("button", { name: /^15\. Oktober, 0 Termine/ })).toBeTruthy(); // storniert zählt nicht
    fireEvent.click(screen.getByRole("button", { name: "Monat vor" }));
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Fertig" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Tag wählen, Uhrzeit setzen (Ende wandert mit), „Fertig“ übernimmt", () => {
    const onUebernehmen = blatt();
    fireEvent.click(screen.getByRole("button", { name: /^20\. Oktober/ }));
    expect(screen.getByText("Dienstag, 20. Oktober 2026")).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Termin wählen" });
    fireEvent.change(within(dialog).getByLabelText("Von"), { target: { value: "10:30" } });
    expect((within(dialog).getByLabelText("Bis") as HTMLInputElement).value).toBe("11:00");
    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onUebernehmen).toHaveBeenCalledWith({ datum: "2026-10-20", von: "10:30", bis: "11:00" });
  });

  it("ohne Uhrzeit geht auch; „Bis“ vor „Von“ sperrt „Fertig“", () => {
    const onUebernehmen = blatt();
    fireEvent.click(screen.getByRole("button", { name: /^21\. Oktober/ }));
    const dialog = screen.getByRole("dialog", { name: "Termin wählen" });
    fireEvent.change(within(dialog).getByLabelText("Von"), { target: { value: "10:00" } });
    fireEvent.change(within(dialog).getByLabelText("Bis"), { target: { value: "09:00" } });
    expect((screen.getByRole("button", { name: "Fertig" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Von"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onUebernehmen).toHaveBeenCalledWith({ datum: "2026-10-21", von: null, bis: null });
    expect(terminWahlText({ datum: "2026-10-21", von: "10:00", bis: "10:30" })).toBe("Mi 21.10.2026 · 10:00 – 10:30 Uhr");
  });
});
