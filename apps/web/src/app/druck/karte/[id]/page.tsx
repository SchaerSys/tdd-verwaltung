import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import bwipjs from "bwip-js/node";
import { cards, persons, locations } from "@tdd/db";
import { formatCardNumber } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { fmtDate } from "@/lib/format";

async function barcode(cardNumber: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    bcid: "ean13",
    text: cardNumber.slice(0, 12), // Prüfziffer wird von bwip-js ergänzt
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
    backgroundcolor: "FFFFFF",
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

export default async function DruckPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "card:manage")) redirect("/dashboard");

  const { id } = await params;
  const rows = await db()
    .select({
      number: cards.cardNumber, validTo: cards.validTo, status: cards.status,
      personId: persons.id, first: persons.firstName, last: persons.lastName,
      photoRef: persons.photoRef, ausgabeNumber: persons.ausgabeNumber, gruppe: persons.gruppe,
      loc: locations.name, locType: locations.type,
    })
    .from(cards)
    .innerJoin(persons, eq(cards.personId, persons.id))
    .innerJoin(locations, eq(cards.locationId, locations.id))
    .where(eq(cards.id, id))
    .limit(1);
  const c = rows[0];
  if (!c) notFound();

  const bc = await barcode(c.number);
  const isLaden = c.locType === "LADEN";
  const gruppe = c.gruppe;
  const nummer = c.ausgabeNumber;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
      <div className="no-print" style={{ display: "flex", gap: 10, width: "100%", maxWidth: 560, justifyContent: "space-between" }}>
        <Link href="/karten" className="btn ghost">← Zurück</Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="pill muted">{isLaden ? "Etikett (Laden)" : "Plastikkarte · Zebra ZC350"}</span>
          <PrintButton />
        </div>
      </div>

      {isLaden ? (
        // Etikett für Läden
        <div className="print-card" style={{ width: "70mm", background: "#fff", color: "#111", border: "1px solid #ddd", borderRadius: 6, padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.1)" }}>
          <div style={{ fontSize: 11, fontWeight: 800 }}>Tischlein deck dich</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{c.first} {c.last}</div>
          <div style={{ fontSize: 10, color: "#555" }}>gültig bis {fmtDate(c.validTo)}</div>
          {nummer != null ? <div style={{ fontSize: 10, color: "#111", marginTop: 2 }}>Gruppe <b>{gruppe}</b> · Nr. <b>{nummer}</b></div> : null}
          <img src={bc} alt="Barcode" style={{ width: "100%", marginTop: 8 }} />
        </div>
      ) : (
        // PVC-Karte (CR80) für Ausgabestellen
        <div className="print-card" style={{ width: "85.6mm", height: "54mm", background: "#fff", color: "#111", border: "1px solid #ddd", borderRadius: "3mm", padding: "4mm 5mm", boxShadow: "0 2px 8px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, letterSpacing: "-.02em" }}>Tischlein deck dich</div>
              <div style={{ fontSize: 9, color: "#666" }}>{c.loc}</div>
            </div>
            <div style={{ width: "16mm", height: "16mm", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: "1.5mm", overflow: "hidden", display: "grid", placeItems: "center", fontSize: 8, color: "#999" }}>
              {c.photoRef ? <img src={`/foto/${c.personId}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "Foto"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{c.first} {c.last}</div>
            {nummer != null ? <div style={{ fontSize: 10, color: "#111", marginTop: "1mm" }}>Gruppe <b>{gruppe}</b> · Nummer <b>{nummer}</b></div> : null}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <img src={bc} alt="Barcode" style={{ height: "12mm" }} />
            <div style={{ fontSize: 9, color: "#555", textAlign: "right" }}>gültig bis<br /><b>{fmtDate(c.validTo)}</b></div>
          </div>
        </div>
      )}

      <div className="no-print" style={{ fontSize: 12, color: "var(--muted)" }}>
        Kartennummer: <span className="mono">{formatCardNumber(c.number)}</span>
      </div>
    </div>
  );
}
