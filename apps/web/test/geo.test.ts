import { describe, expect, test } from "vitest";
import { zerlegen, zusammensetzen } from "@/lib/geo";

const s = (id: string, art: string, lat: number | null = 47, lng: number | null = 9.7) => ({ id, art, lat, lng });

describe("Routenoptimierung: Zerlegen und Zusammensetzen", () => {
  test("Lieferungen bleiben am Ende, Stopps ohne Koordinaten ganz hinten", () => {
    const z = zerlegen([s("a", "ABHOLUNG"), s("l1", "LIEFERUNG"), s("b", "ABHOLUNG", null, null), s("c", "ABHOLUNG"), s("l2", "LIEFERUNG")]);
    expect(z.beweglich.map((x) => x.id)).toEqual(["a", "c"]);
    expect(z.ende.map((x) => x.id)).toEqual(["l1", "l2"]);
    expect(z.ohneKoordinaten.map((x) => x.id)).toEqual(["b"]);
  });
  test("Trip-Reihenfolge mit festem Start und Ziel wird auf die beweglichen Stopps abgebildet", () => {
    const beweglich = [s("a", "ABHOLUNG"), s("b", "ABHOLUNG"), s("c", "ABHOLUNG")];
    // Punkte: [Start, a, b, c, Ziel] -> OSRM sagt: Start, c, a, b, Ziel
    const neu = zusammensetzen(beweglich, [0, 3, 1, 2, 4], true, [s("l", "LIEFERUNG")], [s("x", "ABHOLUNG", null, null)]);
    expect(neu.map((x) => x.id)).toEqual(["c", "a", "b", "l", "x"]);
  });
  test("ohne Start: erster Punkt ist ein beweglicher Stopp", () => {
    const beweglich = [s("a", "ABHOLUNG"), s("b", "ABHOLUNG")];
    const neu = zusammensetzen(beweglich, [1, 0, 2], false, [s("l", "LIEFERUNG")], []);
    expect(neu.map((x) => x.id)).toEqual(["b", "a", "l"]);
  });
});
