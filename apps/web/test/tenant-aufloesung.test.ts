import { describe, it, expect, beforeAll } from "vitest";
import { cookiesLesen, hostsAusUmgebung, tenantAusRohdaten } from "../src/lib/tenant-aufloesung";
import { signSession } from "../src/lib/session";
import { TENANT_VORARLBERG } from "@tdd/db";

const TIROL = "a1000000-0000-4000-a000-000000000001";
const SALZBURG = "a2000000-0000-4000-a000-000000000002";

describe("Mandanten-Aufloesung aus Rohdaten der Anfrage", () => {
  beforeAll(() => { process.env.SESSION_SECRET = "test-geheimnis-mindestens-16-zeichen"; });

  it("liest Cookies robust (erster Wert gewinnt, URL-kodiert)", () => {
    const c = cookiesLesen("a=1; b=x%3Ay; a=2; leer; =nix");
    expect(c.get("a")).toBe("1"); expect(c.get("b")).toBe("x:y"); expect(c.has("leer")).toBe(false);
  });

  it("Umgebung TENANT_HOSTS: nur gueltige Paare", () => {
    expect(hostsAusUmgebung(`tirol.tafelwerk.at=${TIROL}; kaputt=abc ; Salzburg.Tafelwerk.at = ${SALZBURG}`)).toEqual({ "tirol.tafelwerk.at": TIROL, "salzburg.careos.at": SALZBURG });
  });

  it("Reihenfolge: Session vor Geraet vor Host vor Standard", () => {
    const hosts = { "tirol.tafelwerk.at": TIROL };
    const session = signSession({ uid: "u", role: "ADMIN", tenantId: SALZBURG });
    // Session schlaegt Host
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_session=${session}` }, hosts)).toBe(SALZBURG);
    // Geraet schlaegt Host
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_geraet=${SALZBURG}:token123` }, hosts)).toBe(SALZBURG);
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at:3080", cookie: `tdd_station=${SALZBURG}:abc` }, hosts)).toBe(SALZBURG);
    // Host mit Port
    expect(tenantAusRohdaten({ host: "TIROL.careos.at:443", cookie: undefined }, hosts)).toBe(TIROL);
    // nichts passt: Standard
    expect(tenantAusRohdaten({ host: "unbekannt.example", cookie: "x=1" }, hosts)).toBe(TENANT_VORARLBERG);
    // Mandanten-Cookie (/m/<kurzname>) schlaegt Host, aber nur fuer bekannte aktive Mandanten
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_mandant=${SALZBURG}` }, hosts, new Set([SALZBURG]))).toBe(SALZBURG);
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_mandant=${SALZBURG}` }, hosts, new Set([TIROL]))).toBe(TIROL);
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_mandant=${SALZBURG}` }, hosts, null)).toBe(SALZBURG);
  });

  it("gefaelschte Session zaehlt nicht (Signatur), Geraete-Cookie ohne Praefix auch nicht", () => {
    const hosts = { "tirol.tafelwerk.at": TIROL };
    const payload = Buffer.from(JSON.stringify({ uid: "u", role: "ADMIN", tenantId: SALZBURG, exp: 9999999999 })).toString("base64url");
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: `tdd_session=${payload}.falsch` }, hosts)).toBe(TIROL);
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: "tdd_geraet=nurtoken" }, hosts)).toBe(TIROL);
    expect(tenantAusRohdaten({ host: "tirol.tafelwerk.at", cookie: "tdd_geraet=nicht-uuid:token" }, hosts)).toBe(TIROL);
  });
});
