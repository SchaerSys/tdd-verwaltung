import { meinKontext } from "@/lib/my";
import { pushAktiv, vapidPublicKey } from "@/lib/push";
import { PushSchalter } from "./PushSchalter";

export const dynamic = "force-dynamic";

export default async function MyEinstellungen() {
  await meinKontext();
  return (
    <div className="flex flex-col gap-3">
      <div className="panel">
        <div className="panel-h"><h3>Benachrichtigungen</h3></div>
        <div className="p-3 text-sm flex flex-col gap-2">
          <p className="text-muted">Du bekommst eine Nachricht, wenn ein Dienstplan veröffentlicht, ein Antrag entschieden oder dir eine Aufgabe zugeteilt wird. Der Inhalt ist verschlüsselt; der Push-Dienst deines Handy-Herstellers sieht nur, dass eine Nachricht kommt.</p>
          {pushAktiv() ? <PushSchalter publicKey={vapidPublicKey()!} /> : <span className="pill muted">Push ist auf diesem Server nicht eingerichtet.</span>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>App installieren</h3></div>
        <div className="p-3 text-sm text-muted flex flex-col gap-1">
          <div><b>Android (Chrome):</b> Menü ⋮ → „App installieren“ oder „Zum Startbildschirm hinzufügen“.</div>
          <div><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“. Benachrichtigungen erst nach dem Hinzufügen möglich (iOS 16.4+).</div>
          <div>Die App öffnet direkt „Heute“ mit Stempeln, Zeitkonto, Diensten und Aufgaben.</div>
        </div>
      </div>
    </div>
  );
}
