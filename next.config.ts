import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "dgalywyr863hv.cloudfront.net" }, // Strava avatars
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : "*.supabase.co";

    const csp = [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its bootstrap scripts; no nonce configured
      "script-src 'self' 'unsafe-inline'",
      // Tailwind + Next.js inject inline styles
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Remote images: Strava avatars, DiceBear, Unsplash
      "img-src 'self' data: blob: https:",
      // API calls: Supabase (REST + WebSocket) and Strava
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://www.strava.com https://api.strava.com https://api-v3.strava.com`,
      // Google Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // No embedding this site in iframes
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
