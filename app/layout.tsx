import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "spera - Team Vitality Challenge",
  description:
    "Track Team Vitality monthly cycling goals, leaderboards, and champion ride check-ins.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "spera",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",   // honours safe-area-inset on notched iPhones
  themeColor: "#020202",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${lexend.variable} antialiased`}>
        {/* Carbon texture and the Spera pulse stay fixed behind the app. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.035) 25%, transparent 25%) 0 0 / 28px 28px, linear-gradient(225deg, rgba(255,255,255,0.025) 25%, transparent 25%) 0 0 / 28px 28px",
            opacity: 0.58,
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-0 right-0 w-[560px] h-[560px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,59,48,0.22) 0%, transparent 66%)",
            filter: "blur(86px)",
            transform: "translate(34%, 34%)",
            zIndex: 0,
          }}
        />
        <div className="relative z-10">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
