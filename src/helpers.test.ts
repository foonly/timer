import { describe, expect, it } from "vitest";
import { formatClockTime, recordEditError, toDatetimeLocal } from "./helpers";

describe("formatClockTime", () => {
  it("zero-pads every component", () => {
    expect(formatClockTime(new Date(2026, 0, 2, 9, 5, 3).getTime())).toBe("09:05:03");
  });
});

describe("toDatetimeLocal", () => {
  it("zero-pads date and time", () => {
    expect(toDatetimeLocal(new Date(2026, 0, 2, 9, 5, 3).getTime())).toBe("2026-01-02T09:05:03");
  });
});

describe("recordEditError", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime();

  it("requires a start time, even for a running record", () => {
    expect(recordEditError(true, "", "", now)).not.toBe("");
    expect(recordEditError(true, "not a date", "", now)).not.toBe("");
  });

  it("rejects a future start on a running record", () => {
    expect(recordEditError(true, "2026-06-15T12:00:01", "", now)).not.toBe("");
    expect(recordEditError(true, "2026-06-15T11:00:00", "", now)).toBe("");
  });

  it("requires an end after the start on a stopped record", () => {
    expect(recordEditError(false, "2026-06-15T11:00:00", "", now)).not.toBe("");
    expect(recordEditError(false, "2026-06-15T11:00:00", "2026-06-15T11:00:00", now)).not.toBe("");
    expect(recordEditError(false, "2026-06-15T11:00:00", "2026-06-15T11:30:00", now)).toBe("");
  });
});
