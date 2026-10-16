import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Production builds must surface type errors. */

  /* Production build isolation: `next build` normally shares .next with the
   * dev server, which can corrupt the dev cache mid-session. Setting
   * NEXT_DIST_DIR (e.g. .next-build) keeps a manual production build off the
   * dev server's turf; unset, everything stays stock. */
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  /* Static export for optimal client-side CDN performance on Vercel. */
  output: "export",

  /* Static export cannot run the image optimizer server, so photographic
     assets (hero art) ship as-is; SVG art stays inline components. */
  images: { unoptimized: true },

  /* Never ship browser source maps: they expose source structure for zero
     runtime benefit in a client-only app. */
  productionBrowserSourceMaps: false,

  /* Allow local dev origins plus the preview hosts the sandbox serves
     the dev server under, so font/dev assets aren't cross-origin blocked. */
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.space-z.ai"],
};

export default nextConfig;
