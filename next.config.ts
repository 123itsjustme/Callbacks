import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Vercel caps request bodies at 4.5MB; CV uploads are limited to 4MB client-side.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  serverExternalPackages: ["pdf-parse", "@react-pdf/renderer", "mammoth"],
};

export default nextConfig;
