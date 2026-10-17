import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
      { protocol: "https", hostname: "**.fandom.com" },
      { protocol: "https", hostname: "**.wiki.gg" },
      { protocol: "https", hostname: "minecraft.wiki" },
    ],
  },
};

export default nextConfig;
