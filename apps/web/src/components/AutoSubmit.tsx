"use client";
import { useRef } from "react";

/** Huelle um ein Auswahlfeld: Aenderung schickt das umgebende Formular ab (Server Action). */
export function AutoSubmit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} onChange={() => ref.current?.closest("form")?.requestSubmit()} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
