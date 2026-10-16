/* The landing FAQ, stated once. Both consumers import this exact list:
 * the visible FAQ section (views/landing/sections/faq.tsx) and the
 * FAQPage structured data in the static HTML head (app/layout.tsx) —
 * search engines require the two to match, and one source of truth
 * is how we keep that true.
 *
 * Every answer must remain honest and answer-first: state what the app
 * actually does, no marketing hedging. */
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Where are my documents stored?",
    a: "On this device, and nowhere else. Lemniscate keeps your library in your browser's IndexedDB storage — no server, no account, no upload. A full backup can be exported (and restored) at any time from Settings, and erasing the room erases everything.",
  },
  {
    q: "Do I need an AI key to use it?",
    a: "No. The offline Anchor engine answers margin questions, summarizes chapters and builds study sets entirely on-device. Adding a key from OpenRouter, Google Gemini, xAI Grok, Groq, Mistral or Cerebras unlocks live model answers on that provider's free tier. The key lives in memory only and is cleared when the tab closes.",
  },
  {
    q: "Which file formats can I import?",
    a: "PDF, EPUB, DOCX, PPTX, Markdown, TXT and HTML. Every file is parsed in the browser; nothing is ever sent anywhere during import.",
  },
  {
    q: "What does the AI see of my books?",
    a: "Only the excerpt you ask about. A margin question sends the open chapter or the passage you selected, directly from your browser to the provider you chose. The one flow that can send a whole imported document — AI structure refinement — asks for your explicit consent first and can be declined permanently.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. After the first visit the app shell is cached: reading, annotations, bookmarks and the offline companions keep working with no network. Live model answers need a connection and fall back to the offline engines, labelled honestly, when there is none.",
  },
  {
    q: "What does it cost?",
    a: "Lemniscate is free, with no account and no tracking. The model catalogs default to each provider's free tier; if you connect your own key, any usage is between you and that provider.",
  },
];
