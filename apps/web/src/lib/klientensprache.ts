/**
 * Zweisprachige Klient:innen-Texte (8): Karte und Bescheid tragen neben Deutsch die Sprache der
 * Person (Auswahlliste "Sprache"). Kurze, feste Saetze – keine automatische Uebersetzung.
 * Arabisch: nur in HTML-Drucken (Karte/Etikett); im PDF-Bescheid fehlt die Schriftformung, dort
 * bleibt der arabische Absatz weg (Hinweis im Text).
 */
export type SprachCode = "de" | "tr" | "ar" | "uk" | "en";

export const SPRACHE_CODE: Record<string, SprachCode> = {
  deutsch: "de", "türkisch": "tr", tuerkisch: "tr", arabisch: "ar", ukrainisch: "uk", englisch: "en", russisch: "uk",
};
export function sprachCode(label: string | null | undefined): SprachCode {
  return SPRACHE_CODE[(label ?? "").trim().toLowerCase()] ?? "de";
}

export const T: Record<Exclude<SprachCode, "de">, Record<string, string>> = {
  tr: {
    karte: "Yetki kartı", gueltigBis: "geçerlilik", gruppe: "Grup", nummer: "No.", mitbringen: "Lütfen her gıda dağıtımında yanınızda getirin.",
    bescheid: "Yetki kartı kararı", positiv: "Başvurunuz OLUMLU sonuçlandı.", berechtigt: "Yetki kartı almaya hak kazandınız.",
    vorzeigen: "Lütfen bu kararı (aslını veya çıktısını) yetkili dağıtım noktasına getirin. Kartınızı orada alacaksınız.", gruss: "Saygılarımızla",
    mailPositiv: "Başvurunuz olumlu sonuçlandı. Kararınız ektedir. Yetki kartınızı almak için lütfen yetkili dağıtım noktasına getirin.",
  },
  en: {
    karte: "Entitlement card", gueltigBis: "valid until", gruppe: "Group", nummer: "No.", mitbringen: "Please bring this card to every food distribution.",
    bescheid: "Decision on your entitlement card", positiv: "Your application has been APPROVED.", berechtigt: "You are entitled to receive an entitlement card.",
    vorzeigen: "Please bring this decision (original or printout) to your distribution point. You will receive your card there.", gruss: "Kind regards",
    mailPositiv: "Your application has been approved. The decision is attached. Please bring it to your distribution point to receive your entitlement card.",
  },
  uk: {
    karte: "Картка отримувача", gueltigBis: "дійсна до", gruppe: "Група", nummer: "№", mitbringen: "Будь ласка, беріть картку на кожну видачу продуктів.",
    bescheid: "Рішення щодо картки отримувача", positiv: "Вашу заяву СХВАЛЕНО.", berechtigt: "Ви маєте право отримати картку отримувача.",
    vorzeigen: "Будь ласка, принесіть це рішення (оригінал або роздруківку) до вашого пункту видачі. Там ви отримаєте картку.", gruss: "З повагою",
    mailPositiv: "Вашу заяву схвалено. Рішення додається. Будь ласка, принесіть його до пункту видачі, щоб отримати картку.",
  },
  ar: {
    karte: "بطاقة الاستحقاق", gueltigBis: "صالحة حتى", gruppe: "المجموعة", nummer: "الرقم", mitbringen: "يرجى إحضار البطاقة في كل توزيع للمواد الغذائية.",
    bescheid: "قرار بشأن بطاقة الاستحقاق", positiv: "تمت الموافقة على طلبك.", berechtigt: "يحق لك الحصول على بطاقة الاستحقاق.",
    vorzeigen: "يرجى إحضار هذا القرار (الأصل أو نسخة مطبوعة) إلى نقطة التوزيع المختصة، وستحصل هناك على بطاقتك.", gruss: "مع أطيب التحيات",
    mailPositiv: "تمت الموافقة على طلبك. القرار مرفق. يرجى إحضاره إلى نقطة التوزيع للحصول على بطاقة الاستحقاق.",
  },
};

/** Text in der Zweitsprache oder null bei Deutsch. */
export function t2(code: SprachCode, key: string): string | null {
  if (code === "de") return null;
  return T[code]?.[key] ?? null;
}
/** Im PDF (pdf-lib, ohne arabische Schriftformung) nur Latein/Kyrillisch. */
export function pdfFaehig(code: SprachCode): boolean { return code === "tr" || code === "en" || code === "uk"; }
