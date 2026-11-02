import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : undefined;

const nextConfig: NextConfig = {
  experimental: {
    // Photos are resized in the browser before upload, so 6 MB is a generous ceiling.
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    // Product and campaign photos are served from Supabase Storage.
    remotePatterns: supabaseUrl
      ? [{
          protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
          hostname: supabaseUrl.hostname,
          port: supabaseUrl.port,
          pathname: "/storage/v1/object/public/**",
        }]
      : [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
