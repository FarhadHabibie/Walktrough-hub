import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app ships as a static bundle (desktop + inside the Android APK):
  // everything runs client-side, content is fetched from public wikis and
  // stored in the browser's IndexedDB. No server, no API routes.
  output: "export",
  // `next dev` otherwise drops a generated AGENTS.md into the repo root.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
