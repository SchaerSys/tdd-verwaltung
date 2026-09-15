import { expect, test } from "vitest";
import { normalizeNfcId } from "@/lib/nfc";

test("NFC-Kennung: Web NFC, USB-Leser und Handeingabe landen bei derselben Schreibweise", () => {
  expect(normalizeNfcId("04:a3:2b:1c:5d:6e:80")).toBe("04A32B1C5D6E80");
  expect(normalizeNfcId("04A32B1C5D6E80")).toBe("04A32B1C5D6E80");
  expect(normalizeNfcId(" 04 a3 2b 1c 5d 6e 80 ")).toBe("04A32B1C5D6E80");
  expect(normalizeNfcId("")).toBeNull();
  expect(normalizeNfcId(null)).toBeNull();
  expect(normalizeNfcId("xyz")).toBeNull(); // kein Hex uebrig
});
