export function Schritte({ aktiv }: { aktiv: number }) {
  const s = ["Stammdaten", "E-Mail (SMTP)", "Host & DNS", "Admin einladen"];
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      {s.map((n, i) => <span key={n} className={`pill ${i + 1 === aktiv ? "good" : i + 1 < aktiv ? "muted" : ""}`}>{i + 1}. {n}</span>)}
    </div>
  );
}
