/* ---------- lightweight rich text (bold, italics, quotes, bullets) ---------- */

export function InlineRich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={i} className="font-semibold text-mist-100">
              {p.slice(2, -2)}
            </strong>
          );
        if (p.startsWith("_") && p.endsWith("_") && p.length > 2)
          return (
            <em key={i} className="opacity-75">
              {p.slice(1, -1)}
            </em>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = text.split("\n");
  return (
    <div className="space-y-2">
      {blocks.map((ln, i) => {
        if (ln.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-gold-600/70 pl-3 my-1 italic opacity-90 font-literata leading-relaxed"
            >
              <InlineRich text={ln.slice(2)} />
            </blockquote>
          );
        }
        if (ln.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2.5">
              <span className="text-gold-500 shrink-0 leading-relaxed mt-0.5">
                ·
              </span>
              <span className="flex-1">
                <InlineRich text={ln.slice(2)} />
              </span>
            </div>
          );
        }
        if (!ln.trim()) return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="leading-relaxed">
            <InlineRich text={ln} />
          </p>
        );
      })}
    </div>
  );
}

export function clipQuote(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
