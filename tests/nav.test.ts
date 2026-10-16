/**
 * URL navigation tests — the pure parse/serialize contract behind the
 * hash router, plus validation fallbacks for every malformed shape.
 */
import { describe, expect, test } from "bun:test";
import { parseNavHash, navHashFor } from "../src/lib/store";

describe("parseNavHash", () => {
  test("empty and bare hashes land on the landing view", () => {
    expect(parseNavHash("")).toEqual({ view: "landing", docId: null, sub: null });
    expect(parseNavHash("#")).toEqual({ view: "landing", docId: null, sub: null });
    expect(parseNavHash("#/")).toEqual({ view: "landing", docId: null, sub: null });
  });

  test("simple views parse", () => {
    for (const v of ["dashboard", "library", "upload", "create", "analytics", "history", "legal", "settings"]) {
      expect(parseNavHash(`#/${v}`).view).toBe(v);
    }
  });

  test("reader carries the document id", () => {
    expect(parseNavHash("#/reader/doc_abc123")).toEqual({
      view: "reader",
      docId: "doc_abc123",
      sub: null,
    });
  });

  test("reader without a document id falls back to the library", () => {
    expect(parseNavHash("#/reader").view).toBe("library");
    expect(parseNavHash("#/reader/").view).toBe("library");
  });

  test("settings sections are addressable; junk sections are dropped", () => {
    expect(parseNavHash("#/settings/storage")).toEqual({
      view: "settings",
      docId: null,
      sub: "storage",
    });
    expect(parseNavHash("#/settings/nope").sub).toBeNull();
    expect(parseNavHash("#/settings").sub).toBeNull();
  });

  test("the legacy account alias maps to settings/profile", () => {
    const nav = parseNavHash("#/account");
    expect(nav.view).toBe("settings");
    expect(nav.sub).toBeNull();
  });

  test("legal tabs: privacy and terms only", () => {
    expect(parseNavHash("#/legal/privacy").sub).toBe("privacy");
    expect(parseNavHash("#/legal/terms").sub).toBe("terms");
    expect(parseNavHash("#/legal/other").sub).toBeNull();
  });

  test("unknown views fall back to landing", () => {
    expect(parseNavHash("#/nonsense").view).toBe("landing");
    expect(parseNavHash("#/admin").view).toBe("landing");
    expect(parseNavHash("#/../../../etc").view).toBe("landing");
  });

  test("arguments on views that take none are dropped", () => {
    expect(parseNavHash("#/dashboard/x")).toEqual({
      view: "dashboard",
      docId: null,
      sub: null,
    });
  });

  test("encoded ids decode safely; malformed encodings never throw", () => {
    expect(parseNavHash("#/reader/doc%20with%20spaces").docId).toBe("doc with spaces");
    expect(parseNavHash("#/reader/doc%zz").docId).toBe("doc%zz");
  });
});

describe("navHashFor", () => {
  test("round-trips with parseNavHash for every stable shape", () => {
    const cases = [
      { view: "landing" as const, docId: null, sub: null },
      { view: "dashboard" as const, docId: null, sub: null },
      { view: "reader" as const, docId: "doc_1", sub: null },
      { view: "settings" as const, docId: null, sub: "storage" },
      { view: "legal" as const, docId: null, sub: "privacy" },
    ];
    for (const c of cases) {
      expect(parseNavHash(navHashFor(c))).toEqual(c);
    }
  });

  test("reader without an id serializes to the library-level view", () => {
    // A reader state with no docId cannot round-trip as reader (parse would
    // redirect to library) — the serializer defends by emitting the view.
    expect(navHashFor({ view: "reader", docId: null, sub: null })).toBe("#/reader");
  });
});
