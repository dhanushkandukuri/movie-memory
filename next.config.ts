import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every page in this app is per-user
  // (it reads the session cookie), so there is nothing to prerender. Keeping
  // the classic dynamic rendering model lets pages call `redirect()` before
  // streaming starts, which gives real 307 redirects for auth checks.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Google profile photos.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
