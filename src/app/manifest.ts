import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lemniscate — Open the reading room",
    short_name: "Lemniscate",
    description:
      "A local-first AI reading room where documents become living, interactive experiences. Free models from OpenRouter, Gemini, Grok, Groq and more; your library never leaves your device.",
    start_url: "/",
    display: "standalone",
    /* Single source of truth for the app's near-black: the viewport
       themeColor in layout.tsx (#13100a, ink-950 family). */
    background_color: "#13100a",
    theme_color: "#13100a",
    categories: ["books", "education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
