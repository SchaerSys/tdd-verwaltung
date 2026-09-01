export const STAFF_TYPES = ["ANGESTELLT", "ZIVILDIENER", "EHRENAMT", "FAHRER"] as const;

export const STAFF_TYPE_LABEL: Record<string, string> = {
  ANGESTELLT: "Angestellte:r", ZIVILDIENER: "Zivildiener", EHRENAMT: "Ehrenamtlich", FAHRER: "Fahrer:in",
};
