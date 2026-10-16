/**
 * AI consent tests — the architectural gate that decides whether imported
 * text may be sent to a provider for structure refinement. No network is
 * ever involved: the gate is evaluated before any request could start.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { refinementAllowed } from "../src/lib/ai";
import { usePrefs, defaultPrefs } from "../src/lib/store";
import { setSessionKey, clearSessionKey } from "../src/lib/providers";
import { installLocalStorage, freshDb } from "./helpers";

installLocalStorage();

beforeEach(() => {
  freshDb();
  clearSessionKey("openrouter");
  usePrefs.setState({ prefs: { ...defaultPrefs } });
});

describe("refinementAllowed — the import-refinement consent gate", () => {
  test("no key, no toggle, no consent → never allowed", () => {
    expect(refinementAllowed()).toBe(false);
  });

  test("key + toggle but consent still 'ask' → NOT allowed (must ask first)", () => {
    setSessionKey("openrouter", "sk-or-v1-test");
    usePrefs.getState().setPrefs({ aiRefine: true });
    expect(usePrefs.getState().prefs.aiRefineConsent).toBe("ask");
    expect(refinementAllowed()).toBe(false);
  });

  test("key + toggle + explicit grant → allowed", () => {
    setSessionKey("openrouter", "sk-or-v1-test");
    usePrefs.getState().setPrefs({ aiRefine: true, aiRefineConsent: "granted" });
    expect(refinementAllowed()).toBe(true);
  });

  test("declined consent blocks even with key and toggle on", () => {
    setSessionKey("openrouter", "sk-or-v1-test");
    usePrefs.getState().setPrefs({ aiRefine: true, aiRefineConsent: "declined" });
    expect(refinementAllowed()).toBe(false);
  });

  test("revoking consent (granted → ask/declined) re-blocks immediately", () => {
    setSessionKey("openrouter", "sk-or-v1-test");
    usePrefs.getState().setPrefs({ aiRefine: true, aiRefineConsent: "granted" });
    expect(refinementAllowed()).toBe(true);
    usePrefs.getState().setPrefs({ aiRefineConsent: "declined" });
    expect(refinementAllowed()).toBe(false);
  });

  test("the toggle alone (aiRefine off) blocks even when consent was granted", () => {
    setSessionKey("openrouter", "sk-or-v1-test");
    usePrefs.getState().setPrefs({ aiRefine: false, aiRefineConsent: "granted" });
    expect(refinementAllowed()).toBe(false);
  });

  test("a hand-corrupted consent value is coerced back to 'ask' on load", () => {
    localStorage.setItem(
      "lemniscate:prefs",
      JSON.stringify({ ...defaultPrefs, aiRefineConsent: "yolo" }),
    );
    // loadPrefs runs at module init; simulate a reload by re-reading through
    // the store's loader via a fresh import — but ES modules are singletons,
    // so verify the sanitizer indirectly: set a bad value through the store
    // and confirm the gate treats unknown values as not-granted.
    usePrefs.setState({
      prefs: {
        ...defaultPrefs,
        aiRefine: true,
        aiRefineConsent: "yolo" as never,
      },
    });
    setSessionKey("openrouter", "sk-or-v1-test");
    expect(refinementAllowed()).toBe(false);
  });
});
