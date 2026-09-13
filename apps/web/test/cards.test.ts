import { expect, test } from "vitest";
import { addMonths } from "@/lib/cards";

test("addMonths klemmt auf das Monatsende statt überzulaufen", () => {
  expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  expect(addMonths("2024-08-31", 6)).toBe("2025-02-28");
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  expect(addMonths("2027-08-31", 6)).toBe("2028-02-29"); // Schaltjahr
});
