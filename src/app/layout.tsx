import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { FAQ_ITEMS } from "../lib/faq";

const SITE_URL = "https://lemniscate.app";
const SITE_DESCRIPTION =
  "A local-first AI reading room where documents become living, interactive experiences. Your library lives in your browser; AI features send only the excerpts you ask about, directly to the provider you choose.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: "Lemniscate",
      alternateName: "Lemniscate reading room",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Local-first document library (PDF, EPUB, DOCX, PPTX, Markdown, TXT, HTML)",
        "Offline NLP engine: summaries, study sets, quizzes, flashcards",
        "Margin AI companion with citations from the open book",
        "Long-form writing companion with background job queue",
        "Free AI models from OpenRouter, Gemini, Grok, Groq, Mistral, Cerebras",
        "Reader typography controls, annotations, bookmarks, focus mode",
      ],
      creator: {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Lemniscate",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.svg`,
      },
      description:
        "Maker of the Lemniscate local-first AI reading room. No accounts, no tracking; documents stay on the reader's device.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Lemniscate",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
    },
    {
      /* Mirrors the visible FAQ section on the landing (lib/faq.ts is the
         single source for both) — structured data must match on-page
         content, and here it does by construction. */
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      url: `${SITE_URL}/#faq`,
      inLanguage: "en",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lemniscate — Open the reading room",
    template: "%s — Lemniscate",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Lemniscate",
  keywords: [
    "Lemniscate",
    "reading room",
    "AI companion",
    "local-first",
    "PDF reader",
    "EPUB reader",
    "literary assistant",
    "free AI models",
    "OpenRouter",
    "Gemini",
    "Grok",
    "Groq",
    "Mistral",
    "offline reading",
    "IndexedDB",
  ],
  authors: [{ name: "Lemniscate" }],
  creator: "Lemniscate",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Lemniscate — Open the reading room",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Lemniscate",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "An open book on a dark obsidian ground, champagne light rising from its pages as an infinity symbol: the Lemniscate local-first AI reading room",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lemniscate — Open the reading room",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.jpg",
        alt: "The Lemniscate local-first AI reading room: an open book under champagne light",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#13100a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Defense-in-depth CSP: with zero HTML sinks in the app this is a
            second layer against future regressions — connect-src pins the
            network to the six AI providers (the only origins the key ever
            travels to). Fonts are self-hosted from /fonts, so no font CDN
            appears in style-src or font-src.

            'unsafe-eval' is required only by the dev server (React refresh
            and HMR runtime); the production build ships without it. The
            static-export model cannot use nonces or the header-based CSP
            a server would set, so 'unsafe-inline' for scripts/styles stays
            (Next's inline hydration bootstrap requires it) — documented in
            the security notes of AUDIT_REMEDIATION_REPORT.md. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={
            process.env.NODE_ENV === "production"
              ? String.raw`default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://api.x.ai https://api.groq.com https://api.mistral.ai https://api.cerebras.ai; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'`
              : String.raw`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://api.x.ai https://api.groq.com https://api.mistral.ai https://api.cerebras.ai; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'`
          }
        />
        <style>{`
          :root {
            --font-display: "Cormorant Garamond", "EB Garamond", Garamond, Georgia, serif;
            --font-body: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
            --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
          }
        `}</style>
        {/* Preload the three above-the-fold latin faces (each woff2 is the
            one variable file its family ships per style — headings, body,
            and the italic display of the hero quote). font-display: swap
            keeps text visible; the preloads move the swap earlier so the
            first paint of the landing hero lands with its real faces. */}
        <link
          rel="preload"
          href="/fonts/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtK.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1Q.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/co3ZmX5slCNuHLi8bLeY9MK7whWMhyjYrEtImSo.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
        {/* Offline shell: register the service worker after first load.
            Production only — in dev, Turbopack HMR owns the network and the
            worker's cache-first behavior would fight it. Best-effort; a
            failed registration never affects the page. */}
        {process.env.NODE_ENV === "production" ? (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}",
            }}
          />
        ) : null}
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
