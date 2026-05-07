import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "SpinTribe26 — Team Vitality Challenge",
  description:
    "Track your monthly cycling challenge with Team Vitality. Strava-powered leaderboards and champion check-ins.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#131313",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${lexend.variable} antialiased`}>
        {/* Decorative background orbs — fixed, never intercept clicks */}
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(124,77,255,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
            transform: "translate(30%, -30%)",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(0,227,253,0.08) 0%, transparent 70%)",
            filter: "blur(60px)",
            transform: "translate(-30%, 30%)",
            zIndex: 0,
          }}
        />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
