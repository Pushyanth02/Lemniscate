import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CopySimple,
  Eraser,
  PaperPlaneTilt,
  Quotes,
  StopCircle,
} from "@phosphor-icons/react";
import { Badge, Button, IconBtn } from "../../components/ui";
import { usePrefs, toast } from "../../lib/store";
import {
  askLumaStream,
  LUMA_QUESTIONS,
  AiUnavailable,
  aiConfigured,
  offlineReasonText,
} from "../../lib/ai";
import type { ChatMsg, DocWithContent } from "../../lib/types";
import { cx, uid } from "../../lib/utils";
import { RichText, clipQuote } from "./rich-text";

/* ---------- Luma — streaming chat ---------- */

export function LumaChat({
  doc,
  chapterIndex,
  selection,
  seed,
}: {
  doc: DocWithContent;
  chapterIndex: number;
  selection: string | null;
  seed?: { question: string; nonce: number } | null;
}) {
  const motion = usePrefs((s) => s.prefs.reader.motion);
  // OpenRouter key status — synchronous peek at the in-memory key set via
  // `setSessionKey()` (typically from Settings). The Luma header pill
  // ("online" vs "Anchor engine") reflects whether a key is set.
  const serverOnline = aiConfigured();
  const storeKey = `lemniscate:luma:${doc.id}`;
  const chapterTitle =
    doc.contentJson.chapters[chapterIndex]?.title ?? "this chapter";
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        // Shape-check before trusting: a non-array or malformed entry (a
        // stray edit, another tool's write) must not crash the mount —
        // fall through to the greeting instead.
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (m): m is ChatMsg =>
              !!m &&
              typeof m === "object" &&
              (m as { role?: unknown }).role !== undefined &&
              typeof (m as { text?: unknown }).text === "string",
          )
        ) {
          return parsed;
        }
      }
    } catch {
      /* fresh thread */
    }
    return [
      {
        id: uid("m"),
        role: "assistant",
        at: Date.now(),
        text: `Hello, I’m Luma, reading “${doc.title}” beside you. Ask about this chapter, a passage, a word, or have me paint the scene.`,
      },
    ];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [lastOffline, setLastOffline] = useState<boolean | null>(null);
  const [lastReason, setLastReason] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror `messages` into a ref so `send` can read the latest history
  // without depending on `messages` in its deps. This keeps the
  // `regenerate` → `send` flow correct: `send` always sees the post-slice
  // state, not the stale closure value (which would re-send the old bot
  // response as context and duplicate the user message).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Scroll follows every message change, but localStorage persistence is
  // debounced: a streaming answer re-renders per token, and a synchronous
  // JSON.stringify + setItem per token janked low-end devices.
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: motion ? "smooth" : "auto",
      block: "end",
    });
  }, [messages, motion]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storeKey, JSON.stringify(messages.slice(-30)));
      } catch {
        /* full */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [messages, storeKey]);

  // A seeded question (e.g. the Scene Atlas' “Ask Luma”) lands in the
  // composer ready to edit or send — never auto-sent, the reader stays in
  // charge of the seminar's next word.
  useEffect(() => {
    if (!seed || busy) return;
    setInput(seed.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce]);

  // Streamed tokens land in a buffer and flush at most ~12×/second: a long
  // answer no longer re-renders (and re-parses) the whole transcript per
  // token. The flush is immediate on completion, abort and error, so no
  // delivered text is ever lost — only its render cadence is batched.
  const pendingRef = useRef<Map<string, string>>(new Map());
  const flushTimer = useRef<number | null>(null);
  const flush = useCallback(() => {
    if (flushTimer.current != null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (pendingRef.current.size === 0) return;
    const pending = pendingRef.current;
    pendingRef.current = new Map();
    setMessages((m) =>
      m.map((x) => {
        const chunk = pending.get(x.id);
        return chunk ? { ...x, text: x.text + chunk } : x;
      }),
    );
  }, []);
  // A pending flush must never outlive the chat (drawer closed mid-stream).
  useEffect(
    () => () => {
      if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    },
    [],
  );

  const append = useCallback(
    (msgId: string, chunk: string) => {
      pendingRef.current.set(
        msgId,
        (pendingRef.current.get(msgId) ?? "") + chunk,
      );
      if (flushTimer.current == null) {
        flushTimer.current = window.setTimeout(flush, 80);
      }
    },
    [flush],
  );

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput("");
      const userMsg: ChatMsg = {
        id: uid("m"),
        role: "user",
        text: q,
        at: Date.now(),
      };
      const botId = uid("m");
      setMessages((m) => [
        ...m,
        userMsg,
        { id: botId, role: "assistant", text: "", at: Date.now() },
      ]);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLastOffline(null);
      try {
        const history = messagesRef.current
          .filter((m) => m.text)
          .map((m) => ({ role: m.role, text: m.text }));
        const res = await askLumaStream(
          doc,
          chapterIndex,
          q,
          history,
          (chunk) => append(botId, chunk),
          ctrl.signal,
        );
        flush(); // land any tail still in the buffer before the status lines
        setModel(res.model ?? null);
        setLastOffline(res.offline);
        setLastReason(res.offline ? offlineReasonText(res.reason) : "");
      } catch (e) {
        flush(); // buffered tokens count as delivered text for the checks below
        if (ctrl.signal.aborted) {
          setMessages((m) =>
            m.map((x) =>
              x.id === botId && !x.text ? { ...x, text: "_Stopped._" } : x,
            ),
          );
        } else {
          const msg =
            e instanceof AiUnavailable
              ? e.message
              : "Luma lost the thread for a moment. Try again?";
          setMessages((m) =>
            m.map((x) => (x.id === botId && !x.text ? { ...x, text: msg } : x)),
          );
          if (e instanceof AiUnavailable) toast("error", msg);
        }
      } finally {
        flush(); // never leave the final tokens sitting in the buffer
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, doc, chapterIndex, append, flush],
  );

  const regenerate = useCallback(() => {
    const lastUser = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUser || busy) return;
    const idx = messagesRef.current.findIndex((x) => x.id === lastUser.id);
    // Slice off the last user message AND any bot response that followed it,
    // then synchronously update the ref so `send` reads the trimmed history.
    // `send` adds a fresh user message + bot placeholder, so keeping the old
    // user message would duplicate it in the UI.
    const trimmed = messagesRef.current.slice(0, idx);
    messagesRef.current = trimmed;
    setMessages(trimmed);
    void send(lastUser.text);
  }, [busy, send]);

  const clearThread = useCallback(() => {
    setMessages([
      {
        id: uid("m"),
        role: "assistant",
        at: Date.now(),
        text: `Fresh page. What shall we look at in “${chapterTitle}”?`,
      },
    ]);
    setModel(null);
    setLastOffline(null);
    try {
      localStorage.removeItem(storeKey);
    } catch {
      /* ignore */
    }
  }, [chapterTitle, storeKey]);

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  };

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 flex items-center gap-3 shrink-0 bg-ink-875/50">
        <span
          className={cx(
            "relative w-10 h-10 rounded-xl border flex items-center justify-center font-display italic text-lg shrink-0 transition-colors",
            busy
              ? "border-gold-400 bg-gold-500/20 text-gold-200"
              : "border-gold-700/60 bg-gold-500/10 text-gold-300",
          )}
        >
          L
          <span
            className={cx(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ink-875",
              busy ? "bg-warn-400 animate-pulse" : "bg-ok-500",
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-display text-mist-100 flex items-center gap-2 leading-tight">
            Luma
            {model ? (
              <span className="text-[10px] font-mono text-mist-500 truncate max-w-32">
                {model}
              </span>
            ) : (
              <Badge tone={serverOnline ? "gold" : "muted"}>
                {serverOnline ? "online" : "Anchor engine"}
              </Badge>
            )}
          </p>
          <p className="text-[11px] text-mist-500 truncate mt-0.5">
            grounded in “{chapterTitle}”
          </p>
        </div>
        <IconBtn label="Clear conversation" onClick={clearThread}>
          <Eraser className="w-4 h-4" />
        </IconBtn>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const streaming = busy && isLast && m.role === "assistant";
          return m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed bg-ink-750 border border-ink-600 text-mist-100 whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="group">
              <div className="rounded-2xl border border-gold-500/30 bg-ink-850 px-4 py-3.5 text-[13px] leading-relaxed text-mist-300">
                {!m.text ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-mist-500 py-1"
                    aria-label="Luma is thinking"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/60 animate-pulse [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/30 animate-pulse [animation-delay:240ms]" />
                  </span>
                ) : (
                  <>
                    <RichText text={m.text} />
                    {streaming && (
                      <span
                        className="inline-block w-1.75 h-3.75 bg-gold-400/80 ml-0.5 align-[-2px] animate-pulse rounded-sm"
                        aria-hidden
                      />
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 pl-1 min-h-6">
                {m.text && !streaming && (
                  <>
                    <button
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(m.text)
                          .then(() => toast("success", "Copied to clipboard."));
                      }}
                      className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-600 hover:text-gold-300 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <CopySimple className="w-3 h-3" />
                      Copy
                    </button>
                    {isLast && !busy && (
                      <button
                        onClick={regenerate}
                        className="text-[10px] font-body font-medium uppercase tracking-[0.14em] text-mist-600 hover:text-gold-300 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <ArrowsClockwise className="w-3 h-3" />
                        Regenerate
                      </button>
                    )}
                    {lastOffline !== null && isLast && (
                      <span className="text-[10px] font-body text-mist-600 ml-auto">
                        {lastOffline
                          ? `Anchor engine (${lastReason || "offline"})`
                          : "live model"}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div ref={endRef} />
      </div>

      {/* ask about the reader selection */}
      {selection && !busy && (
        <div className="px-4 sm:px-5 pb-2 shrink-0">
          <button
            onClick={() =>
              void send(`Explain this passage: “${clipQuote(selection)}”`)
            }
            className="w-full flex items-center gap-2.5 rounded-xl border border-gold-700/50 bg-gold-500/7 px-3 py-2.5 text-left hover:bg-gold-500/13 hover:border-gold-600/70 transition-all press"
          >
            <Quotes className="w-4 h-4 text-gold-400 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-body font-medium uppercase tracking-[0.14em] text-gold-400">
                Ask about your selection
              </span>
              <span className="block text-xs text-mist-400 italic font-literata truncate mt-0.5">
                “{selection}”
              </span>
            </span>
          </button>
        </div>
      )}

      {/* quick prompts — the single home for Luma's templates */}
      <div className="px-4 sm:px-5 pb-2 shrink-0">
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1"
          style={{ scrollbarWidth: "none" }}
        >
          {LUMA_QUESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              disabled={busy}
              className="shrink-0 text-[11px] font-body px-3 py-1.5 rounded-full border border-ink-600 text-mist-400 hover:border-gold-700 hover:text-gold-300 hover:bg-ink-750/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* composer */}
      <form
        className="px-4 sm:px-5 pb-5 pt-1.5 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-ink-600 bg-ink-850 focus-within:border-gold-600 focus-within:shadow-[0_0_0_3px_var(--acc-soft)] transition-all p-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about the text…"
            aria-label="Ask Luma"
            className="flex-1 bg-transparent resize-none outline-none text-sm text-mist-100 placeholder:text-mist-500 max-h-35 px-2 py-1.5 leading-relaxed"
          />
          {busy ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              aria-label="Stop answer"
              onClick={() => abortRef.current?.abort()}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="gold"
              size="sm"
              aria-label="Send question"
              disabled={!input.trim()}
            >
              <PaperPlaneTilt className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-mist-600 mt-1.5 px-1 hidden sm:block">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
