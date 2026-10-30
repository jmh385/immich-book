import { formatDateRange, formatGroupLabel } from "../groupLabel";

describe("formatDateRange", () => {
  it("formats a single day", () => {
    expect(formatDateRange("2026-07-14", "2026-07-14", "en-GB")).toBe(
      "14 July 2026",
    );
  });

  it("formats a range within one month", () => {
    expect(formatDateRange("2026-07-14", "2026-07-21", "en-GB")).toBe(
      "14–21 July 2026",
    );
  });

  it("formats a range across months in the same year", () => {
    expect(formatDateRange("2026-07-14", "2026-08-03", "en-GB")).toBe(
      "14 July – 3 August 2026",
    );
  });

  it("formats a range across years", () => {
    expect(formatDateRange("2025-12-31", "2026-01-02", "en-GB")).toBe(
      "31 December 2025 – 2 January 2026",
    );
  });

  it("falls back to one side when only one date is known", () => {
    expect(formatDateRange("2026-07-14", null, "en-GB")).toBe("14 July 2026");
    expect(formatDateRange(null, "2026-07-14", "en-GB")).toBe("14 July 2026");
  });

  it("returns null without usable dates", () => {
    expect(formatDateRange(null, null, "en-GB")).toBeNull();
    expect(formatDateRange("not-a-date", "", "en-GB")).toBeNull();
  });

  it("uses the requested locale", () => {
    expect(formatDateRange("2026-07-14", "2026-07-14", "de-DE")).toBe(
      "14 Juli 2026",
    );
  });
});

describe("formatGroupLabel", () => {
  it("combines location, date range and people", () => {
    expect(
      formatGroupLabel({
        location: "Madeira",
        startDate: "2026-07-14",
        endDate: "2026-07-21",
        people: ["Alice", "Bob"],
      }),
    ).toBe("Madeira, 14–21 July 2026, with Alice & Bob");
  });

  it("omits missing facts", () => {
    expect(
      formatGroupLabel({ location: "Madeira", people: [] }),
    ).toBe("Madeira");
    expect(
      formatGroupLabel({
        startDate: "2026-07-14",
        endDate: "2026-07-14",
      }),
    ).toBe("14 July 2026");
    expect(formatGroupLabel({ people: ["Alice"] })).toBe("with Alice");
  });

  it("returns null when there is nothing to say", () => {
    expect(formatGroupLabel({})).toBeNull();
    expect(formatGroupLabel({ people: [] })).toBeNull();
  });
});
