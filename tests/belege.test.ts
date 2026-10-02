import { describe, expect, it } from "vitest";
import { BELEG_MAX_KANTE_PX, belegeNachArt, belegPfad, belegStand, unterschriftSatz, zielMasse } from "@/lib/belege";
import { belegZeile } from "@/lib/auskunft";
import { BELEG_ART_LABEL, BELEG_ARTEN } from "@/lib/constants";
import type { AuftragBeleg } from "@/lib/types";

// Foto und Unterschrift am Auftrag (E3, Migration 65, v105). Erfundene Daten.

const AUFTRAG = "11111111-2222-3333-4444-555555555555";

function beleg(id: string, art: AuftragBeleg["art"], zeit: string, beschriftung: string | null = null): AuftragBeleg {
  return {
    id, order_id: AUFTRAG, art, pfad: `${AUFTRAG}/${art}-${id}.jpg`, beschriftung,
    breite: 1600, hoehe: 1200, bytes: 300_000, created_at: zeit, created_by: null,
  };
}

describe("zielMasse", () => {
  it("verkleinert auf die lange Kante, Seitenverhältnis bleibt", () => {
    expect(zielMasse(4032, 3024)).toEqual({ breite: BELEG_MAX_KANTE_PX, hoehe: 1200 });
    expect(zielMasse(3024, 4032)).toEqual({ breite: 1200, hoehe: BELEG_MAX_KANTE_PX });
  });
  it("vergrößert nie", () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
    expect(zielMasse(1600, 900)).toEqual({ breite: 1600, hoehe: 900 });
  });
});

describe("belegPfad", () => {
  it("beginnt mit der Auftrags-Kennung – danach richten sich Speicherrechte und Prüfregel", () => {
    const p = belegPfad(AUFTRAG, "vorher", "ab12cd34", new Date("2026-10-05T09:31:07.123Z"), "jpg");
    expect(p).toBe(`${AUFTRAG}/vorher-20261005T093107-ab12cd34.jpg`);
    expect(p.split("/")[0]).toBe(AUFTRAG);
    // Migration 65: `length(pfad) > 37` – Kennung (36) plus Schrägstrich plus Dateiname.
    expect(p.length).toBeGreaterThan(37);
  });
  it("Unterschrift als PNG", () => {
    expect(belegPfad(AUFTRAG, "unterschrift", "x", new Date("2026-10-05T09:00:00Z"), "png")).toMatch(/\/unterschrift-20261005T090000-x\.png$/);
  });
});

describe("belegStand und belegeNachArt", () => {
  const liste = [
    beleg("3", "nachher", "2026-10-05T10:00:00Z"),
    beleg("1", "vorher", "2026-10-05T09:05:00Z", "Felge VL"),
    beleg("2", "vorher", "2026-10-05T09:00:00Z"),
    beleg("4", "unterschrift", "2026-10-05T10:05:00Z", "H. Muster"),
    beleg("5", "unterschrift", "2026-10-05T10:20:00Z", "Hans Muster"),
  ];
  it("zählt Fotos ohne Unterschriften, die jüngste Unterschrift gilt", () => {
    const s = belegStand(liste);
    expect(s.fotos).toBe(3);
    expect(s.unterschrift?.id).toBe("5");
    expect(belegStand([]).unterschrift).toBeNull();
  });
  it("gruppiert vorher → nachher → Schaden, je Gruppe nach Zeit, ohne leere Gruppen und ohne Unterschrift", () => {
    const g = belegeNachArt(liste);
    expect(g.map((x) => x.art)).toEqual(["vorher", "nachher"]);
    expect(g[0].belege.map((b) => b.id)).toEqual(["2", "1"]);
  });
});

describe("Texte", () => {
  it("Satz unter der Unterschrift", () => {
    expect(unterschriftSatz("1042", "2026-10-05")).toBe("Arbeiten zu Auftrag 1042 am 05.10.2026 ausgeführt, Fahrzeug übernommen.");
  });
  it("jede Art hat eine Beschriftung (und die Prüfregel in Migration 65 dieselben vier)", () => {
    expect(BELEG_ARTEN).toEqual(["vorher", "nachher", "schaden", "unterschrift"]);
    for (const a of BELEG_ARTEN) expect(BELEG_ART_LABEL[a]).toBeTruthy();
  });
  it("Zeile im Auskunftsauszug", () => {
    expect(belegZeile({ auftrag: 1042, art: "schaden", beschriftung: "Kratzer Felge", aufgenommen: "2026-10-05T09:00:00Z" }))
      .toEqual(["1042 · 05.10.2026", "Foto „Schaden“ – Kratzer Felge"]);
    expect(belegZeile({ auftrag: -3, art: "unterschrift", beschriftung: "Hans Muster", aufgenommen: "2026-10-05T09:00:00Z" }))
      .toEqual(["T3 · 05.10.2026", "Unterschrift (Hans Muster)"]);
  });
});

describe("speicherFehlerText", () => {
  it("die bekannten Meldungen der Storage-Schnittstelle auf Deutsch", async () => {
    const { speicherFehlerText } = await import("@/lib/api/belege");
    expect(speicherFehlerText("new row violates row-level security policy")).toBe("Keine Berechtigung, an diesem Auftrag Fotos abzulegen.");
    expect(speicherFehlerText("Bucket not found")).toMatch(/Migration 65/);
    expect(speicherFehlerText("The object exceeded the maximum allowed size")).toMatch(/3 MB/);
    expect(speicherFehlerText("Irgendwas")).toBe("Das Bild konnte nicht hochgeladen werden (Irgendwas).");
  });
});
