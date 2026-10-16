/**
 * Streaming provider tests — deterministic, fully mocked transports.
 * Verifies the bounded request lifecycle: connect deadline, idle deadline,
 * max duration, user-cancel distinction, malformed-stream failure, and the
 * happy path (deltas, tokens, reader cleanup).
 *
 * The mocks are signal-faithful: like the platform fetch, they reject on
 * abort and error their body streams, because the whole point of these
 * tests is that the deadline guard's aborts actually propagate.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { streamChat, ProviderError, setSessionKey } from "../src/lib/providers";
import type { ChatMessage } from "../src/lib/providers";

const MSGS: ChatMessage[] = [{ role: "user", content: "hello" }];

const realFetch = globalThis.fetch;
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
let fetchMock: FetchImpl | null = null;

/** A fetch that never answers but REJECTS when its signal aborts
 *  (exactly like the platform fetch). */
function hangingFetch(): FetchImpl {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
}

const encoder = new TextEncoder();

/** A fetch returning an SSE body of `chunks`. With `stall: true` the stream
 *  never closes after the chunks (simulates a stalled stream). On signal
 *  abort the body stream is ERRORED — pending reader.read() calls reject,
 *  matching real fetch-stream abort semantics. */
function sseFetch(chunks: string[], stall = false): FetchImpl {
  return (_url, init) =>
    Promise.resolve(
      (() => {
        let controller: ReadableStreamDefaultController<Uint8Array> | null =
          null;
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
            for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
            if (!stall) c.close();
          },
        });
        init?.signal?.addEventListener("abort", () => {
          try {
            controller?.error(new DOMException("Aborted", "AbortError"));
          } catch {
            /* already closed */
          }
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      })(),
    );
}

beforeEach(() => {
  setSessionKey("openrouter", "sk-or-v1-test");
  fetchMock = null;
  (globalThis as Record<string, unknown>).fetch = (url: string, init?: RequestInit) => {
    if (!fetchMock) throw new Error("no fetch mock installed");
    return fetchMock(url, init);
  };
});

afterEach(() => {
  fetchMock = null;
  (globalThis as Record<string, unknown>).fetch = realFetch;
});

describe("streamChat deadlines", () => {
  test("connect deadline: a fetch that never answers fails with timeout", async () => {
    fetchMock = hangingFetch();
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 40,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("timeout");
      expect((e as ProviderError).message).toContain("connection deadline");
    }
  });

  test("idle deadline: a stream that stalls mid-answer fails with timeout", async () => {
    fetchMock = sseFetch(
      [`data: ${JSON.stringify({ choices: [{ delta: { content: "par" } }] })}\n\n`],
      true, // stall: never closes, never sends more
    );
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 500,
        idleMs: 60,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("timeout");
      expect((e as ProviderError).message).toContain("stalled");
    }
  });

  test("max duration caps an endless stream", async () => {
    fetchMock = sseFetch(
      [`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`],
      true, // keeps trickling never — but idle is long so MAX fires first
    );
    // To keep data flowing (defeating the idle timer) we re-arm by sending
    // nothing more: max must still fire.
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 500,
        idleMs: 5000,
        maxMs: 80,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("timeout");
      expect((e as ProviderError).message).toContain("maximum duration");
    }
  });

  test("user cancellation is an AbortError, never a ProviderError timeout", async () => {
    const ctrl = new AbortController();
    fetchMock = hangingFetch();
    const p = streamChat(MSGS, "m", () => {}, ctrl.signal, {}, "openrouter", {
      connectMs: 10_000, // no deadline will fire
      idleMs: 10_000,
      maxMs: 10_000,
    });
    setTimeout(() => ctrl.abort(), 40);
    try {
      await p;
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).not.toBeInstanceOf(ProviderError);
      expect((e as Error).name).toBe("AbortError");
    }
  });
});

describe("streamChat parsing", () => {
  test("happy path: deltas arrive in order, tokens counted, stream completes", async () => {
    fetchMock = sseFetch([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { total_tokens: 7 } })}\n\n`,
      "data: [DONE]\n\n",
    ]);
    const seen: string[] = [];
    const res = await streamChat(
      MSGS,
      "m",
      (d) => seen.push(d),
      undefined,
      {},
      "openrouter",
      { connectMs: 1000, idleMs: 1000, maxMs: 5000 },
    );
    expect(seen).toEqual(["Hel", "lo"]);
    expect(res.text).toBe("Hello");
    expect(res.tokens).toBe(7);
  });

  test("persistently malformed frames fail loudly (server error)", async () => {
    fetchMock = sseFetch([
      "data: {not json\n\n",
      "data: {also not json\n\n",
      "data: {still not json\n\n",
      "data: {fourth bad frame\n\n",
      "data: [DONE]\n\n",
    ]);
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 1000,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("server");
      expect((e as ProviderError).message).toContain("malformed");
    }
  });

  test("an empty answer fails with the empty kind", async () => {
    fetchMock = sseFetch(["data: [DONE]\n\n"]);
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 1000,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("empty");
    }
  });

  test("HTTP errors surface as ProviderError with the right kind", async () => {
    fetchMock = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      );
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 1000,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("rate");
    }
  });

  test("in-stream provider errors are surfaced and sanitized", async () => {
    fetchMock = sseFetch([
      `data: ${JSON.stringify({ error: { message: "bad model sk-or-v1-test" } })}\n\n`,
      "data: [DONE]\n\n",
    ]);
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 1000,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      // the key echo is redacted, never surfaced
      expect((e as ProviderError).message).not.toContain("sk-or-v1-test");
    }
  });

  test("a huge single frame is bounded (server error, no memory blowup)", async () => {
    fetchMock = sseFetch(["data: " + "x".repeat(1_100_000) + "\n\n"]);
    try {
      await streamChat(MSGS, "m", () => {}, undefined, {}, "openrouter", {
        connectMs: 1000,
        idleMs: 1000,
        maxMs: 5000,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe("server");
      expect((e as ProviderError).message).toContain("size limit");
    }
  });
});
