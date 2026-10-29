// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddCustomerForm } from "@/components/kunden/AddCustomerForm";

// v172: Bei „Firma“ ist die Firma Pflicht, der Ansprechpartner freiwillig.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function zeigen() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
  const onAdd = vi.fn(async (_f: Record<string, unknown>) => { void _f; return true; });
  render(<AddCustomerForm onAdd={onAdd} kunden={[]} />);
  return onAdd;
}

describe("Neuer Kunde als Firma", () => {
  it("legt eine Firma ohne Ansprechpartner an", async () => {
    const onAdd = zeigen();
    fireEvent.click(screen.getByRole("button", { name: "Firma" }));
    expect(screen.getByText("Ansprechpartner")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("z. B. Müller GmbH"), { target: { value: "Muster GmbH" } });
    fireEvent.change(screen.getByPlaceholderText(/Straße Hausnummer/), { target: { value: "Weg 1, 90000 Ort" } });
    fireEvent.click(screen.getByRole("button", { name: /Kunde anlegen/ }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: "", company: "Muster GmbH" });
  });

  it("ohne Firma kein Anlegen, auch wenn ein Ansprechpartner dasteht", async () => {
    const onAdd = zeigen();
    fireEvent.click(screen.getByRole("button", { name: "Firma" }));
    fireEvent.change(screen.getByPlaceholderText("Vor- und Nachname"), { target: { value: "Artur" } });
    fireEvent.change(screen.getByPlaceholderText(/Straße Hausnummer/), { target: { value: "Weg 1, 90000 Ort" } });
    expect(screen.getByText("Firma ist Pflicht")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kunde anlegen/ }));
    expect(await screen.findByText("Bitte Firma angeben.")).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("privat bleibt der Name Pflicht", () => {
    zeigen();
    fireEvent.change(screen.getByPlaceholderText(/Straße Hausnummer/), { target: { value: "Weg 1, 90000 Ort" } });
    expect(screen.getByText("Name ist Pflicht")).toBeTruthy();
  });
});
