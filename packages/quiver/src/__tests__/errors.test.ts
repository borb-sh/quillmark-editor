import { describe, it, expect } from "vitest";
import { QuiverError } from "../errors.js";
import type { QuiverErrorCode } from "../errors.js";

const allCodes: QuiverErrorCode[] = [
  "invalid_ref",
  "quill_not_found",
  "quiver_invalid",
  "transport_error",
];

describe("QuiverError", () => {
  it("is instanceof Error and QuiverError for each code", () => {
    for (const code of allCodes) {
      const err = new QuiverError(code, `test message for ${code}`);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(QuiverError);
      expect(err.code).toBe(code);
      expect(err.message).toBe(`test message for ${code}`);
    }
  });

  it("has name QuiverError", () => {
    const err = new QuiverError("invalid_ref", "bad ref");
    expect(err.name).toBe("QuiverError");
  });

  it("forwards cause for native error chaining", () => {
    const cause = new Error("underlying cause");
    const err = new QuiverError("transport_error", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });

  it("accepts non-Error cause", () => {
    const cause = { code: 42, message: "raw cause" };
    const err = new QuiverError("transport_error", "wrapped", { cause });
    expect(err.cause).toBe(cause);
  });

  it("preserves payload fields: ref", () => {
    const err = new QuiverError("invalid_ref", "bad ref", { ref: "foo@^1" });
    expect(err.ref).toBe("foo@^1");
    expect(err.version).toBeUndefined();
    expect(err.quiverName).toBeUndefined();
  });

  it("preserves payload fields: version", () => {
    const err = new QuiverError("quill_not_found", "not found", { version: "2.0.0" });
    expect(err.version).toBe("2.0.0");
    expect(err.ref).toBeUndefined();
    expect(err.quiverName).toBeUndefined();
  });

  it("preserves payload fields: quiverName", () => {
    const err = new QuiverError("quiver_invalid", "bad quiver", { quiverName: "my-quiver" });
    expect(err.quiverName).toBe("my-quiver");
    expect(err.ref).toBeUndefined();
    expect(err.version).toBeUndefined();
  });

  it("preserves all payload fields together", () => {
    const cause = new Error("root");
    const err = new QuiverError("quiver_invalid", "full payload", {
      ref: "usaf_memo@1.2.3",
      version: "1.2.3",
      quiverName: "usaf",
      cause,
    });
    expect(err.ref).toBe("usaf_memo@1.2.3");
    expect(err.version).toBe("1.2.3");
    expect(err.quiverName).toBe("usaf");
    expect(err.cause).toBe(cause);
  });

  it("has undefined payload fields when not provided", () => {
    const err = new QuiverError("quill_not_found", "missing");
    expect(err.ref).toBeUndefined();
    expect(err.version).toBeUndefined();
    expect(err.quiverName).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});
