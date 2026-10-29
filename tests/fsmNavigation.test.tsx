// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MODULE } from "@/lib/module";
import { NAV_ZU_MERKER } from "@/lib/navGruppen";
import { FsmNavigation } from "@/components/FsmNavigation";

// Seitenleiste in Bereichen (v176): Klick auf die Überschrift klappt, „Alle zu/auf“, Merker, aktive Seite bleibt.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); });
const zeigen = (tab: Parameters<typeof FsmNavigation>[0]["tab"] = "settings", hinweis: string[] = []) => {
  const onTab = vi.fn();
  render(<FsmNavigation module={MODULE} tab={tab} hinweisDa={(t) => hinweis.includes(t)} onTab={onTab} />);
  return onTab;
};
const kopf = (titel: string) => screen.getAllByRole("button").find((b) => b.classList.contains("nav-gruppe-kopf") && b.textContent?.startsWith(titel))!;

describe("FsmNavigation", () => {
  it("zeigt Hauptseiten, Bereiche und eingerückte Seiten; Klick wechselt die Seite", () => {
    const onTab = zeigen();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(kopf("Unterwegs").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByText("Bestellliste"));
    expect(onTab).toHaveBeenCalledWith("bestellungen");
  });

  it("Überschrift klappt zu, zeigt Anzahl und Punkt, merkt es sich", () => {
    zeigen("dashboard", ["bestellungen"]);
    fireEvent.click(kopf("Lager"));
    expect(screen.queryByText("Bestellliste")).toBeNull();
    expect(kopf("Lager").getAttribute("aria-expanded")).toBe("false");
    expect(kopf("Lager").querySelector(".nav-gruppe-punkt")).toBeTruthy();
    expect(kopf("Lager").querySelector(".nav-gruppe-anz")?.textContent).toBe("2");
    expect(JSON.parse(localStorage.getItem(NAV_ZU_MERKER) || "[]")).toEqual(["Lager"]);
    cleanup();
    zeigen("dashboard");
    expect(screen.queryByText("Bestellliste")).toBeNull();
  });

  it("die aktive Seite bleibt im zugeklappten Bereich sichtbar", () => {
    localStorage.setItem(NAV_ZU_MERKER, JSON.stringify(["System"]));
    zeigen("settings");
    expect(screen.getByText("Einstellungen")).toBeTruthy();
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("Alle zu, dann Alle auf", () => {
    zeigen("dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Alle zu" }));
    expect(screen.queryByText("Termine")).toBeNull();
    expect(screen.queryByText("Einstellungen")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alle auf" }));
    expect(screen.getByText("Termine")).toBeTruthy();
    expect(screen.getByText("Einstellungen")).toBeTruthy();
  });
});
