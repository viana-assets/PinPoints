// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChatFenster } from "@/components/chat/ChatFenster";
import { ChatBlase } from "@/components/chat/ChatBlase";
import { PlatzBlatt } from "@/components/lager/PlatzBlatt";
import type { ChatBezug, ChatNachricht, ChatPerson } from "@/lib/chat";

// Der Team-Chat in der Oberfläche (Migration 80, v129).

beforeAll(() => {
  window.matchMedia ||= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.HTMLElement.prototype.scrollIntoView ||= () => {};
});
afterEach(cleanup);

const personen: ChatPerson[] = [
  { id: "ich", name: "Vitali", rolle: "admin" },
  { id: "jan", name: "Jan", rolle: "techniker" },
];
const auftrag: ChatBezug = { art: "auftrag", id: "o1", titel: "Auftrag #114 · Räderwechsel", unter: "Uwe Brenner · Do 8.10." };
const nachrichten: ChatNachricht[] = [
  { id: "n1", autor: "jan", text: "@Vitali was soll ich berechnen?", bezug_art: "auftrag", bezug_id: "o1", bezug_titel: auftrag.titel, bezug_unter: auftrag.unter, erwaehnt: ["ich"], created_at: new Date().toISOString() },
  { id: "n2", autor: "ich", text: "12,50 je Rad", bezug_art: "kunde", bezug_id: "c1", bezug_titel: "Kunde gelöscht", bezug_unter: null, erwaehnt: [], created_at: new Date().toISOString() },
];

function fenster(teil: Partial<Parameters<typeof ChatFenster>[0]> = {}) {
  const props = {
    nachrichten, laedt: false, fehler: null, personen, ichId: "ich", darfSchreiben: true, online: true,
    bezug: null, onBezug: vi.fn(), vorschlaege: () => [auftrag],
    onSenden: vi.fn(async () => {}), kannOeffnen: () => true, onBezugOeffnen: vi.fn(), onClose: vi.fn(),
    ...teil,
  };
  render(<ChatFenster {...props} />);
  return props;
}

describe("Team-Chat", () => {
  it("zeigt Name, Karte und Erwähnung; die Karte öffnet den Auftrag, eine gelöschte nichts", () => {
    const p = fenster();
    expect(screen.getByText("Jan")).toBeTruthy();
    expect(screen.getByText("@Vitali").className).toBe("ch-at");
    fireEvent.click(screen.getByText("Auftrag #114 · Räderwechsel"));
    expect(p.onBezugOeffnen).toHaveBeenCalledWith(expect.objectContaining({ art: "auftrag", id: "o1" }));
    expect(screen.getByText("Kunde gelöscht").closest("button")).toBeNull();
  });

  it("@ schlägt Personen vor, die Auswahl landet im Text und als Erwähnung", async () => {
    const p = fenster();
    const feld = screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
    fireEvent.change(feld, { target: { value: "Danke @J", selectionStart: 8 } });
    fireEvent.click(screen.getByRole("option", { name: /Jan/ }));
    expect(feld.value).toBe("Danke @Jan ");
    fireEvent.change(feld, { target: { value: "Danke @Jan erledigt", selectionStart: 19 } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await waitFor(() => expect(p.onSenden).toHaveBeenCalledWith({ text: "Danke @Jan erledigt", bezug: null, erwaehnt: ["jan"] }));
  });

  it("die angehängte Karte geht mit und lässt sich entfernen; „+“ hängt eine an", () => {
    const p = fenster({ bezug: auftrag });
    fireEvent.click(screen.getByRole("button", { name: "Karte entfernen" }));
    expect(p.onBezug).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Auftrag oder Kunde anhängen" }));
    fireEvent.change(screen.getByLabelText("Auftrag oder Kunde suchen"), { target: { value: "114" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Karte anhängen" })).getByText("Auftrag #114 · Räderwechsel"));
    expect(p.onBezug).toHaveBeenCalledWith(auftrag);
  });

  it("ohne Netz gesperrt, ohne Schreibrecht nur lesen", () => {
    fenster({ online: false });
    fireEvent.change(screen.getByLabelText("Nachricht"), { target: { value: "hallo" } });
    expect((screen.getByRole("button", { name: "Senden" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Ohne Netz/)).toBeTruthy();
    cleanup();
    fenster({ darfSchreiben: false });
    expect(screen.queryByLabelText("Nachricht")).toBeNull();
    expect(screen.getByText(/nur mitlesen|mitlesen, aber nicht schreiben/)).toBeTruthy();
  });

  it("die Blase zeigt die Zahl, ab 100 als 99+", () => {
    render(<ChatBlase zahl={3} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Team-Chat, 3 ungelesen" })).toBeTruthy();
    cleanup();
    render(<ChatBlase zahl={0} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Team-Chat" }).textContent).toBe("");
    cleanup();
    render(<ChatBlase zahl={150} onClick={() => {}} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("Lagerplatz: „In den Chat“ nur mit dem Recht", () => {
    const props = {
      slot: { id: "p1", warehouse_id: "w1", code: "A-11", note: null, created_at: "" }, wo: "Hauptlager", satz: null, kunde: null, fahrzeug: null,
      raeder: [], gruende: [], verlauf: [], customers: [], raederFuer: () => [], lagergebuehrJeMonat: null,
      canAssign: false, canDelete: false, onClose: () => {}, onAuslagern: () => {}, onBearbeiten: () => {}, onEtikett: () => {},
      onAufkleber: () => {}, onLoeschen: () => {},
    };
    render(<PlatzBlatt {...props} />);
    expect(screen.queryByRole("button", { name: "In den Chat" })).toBeNull();
    cleanup();
    const onInDenChat = vi.fn();
    render(<PlatzBlatt {...props} onInDenChat={onInDenChat} />);
    fireEvent.click(screen.getByRole("button", { name: "In den Chat" }));
    expect(onInDenChat).toHaveBeenCalled();
  });
});
