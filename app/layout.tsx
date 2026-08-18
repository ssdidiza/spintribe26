import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import ThemeInit from "@/components/ThemeInit";
import "./globals.css";

// Runs before paint to set the theme (system default, or the user's stored
// override) so there's no flash of the wrong theme. Mirrors lib/theme.ts.
const THEME_BOOTSTRAP = `(function(){try{var k="spintribe-theme";var c=localStorage.getItem(k);if(c!=="light"&&c!=="dark"&&c!=="system")c="system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d){e.classList.add("dark")}else{e.classList.remove("dark")}e.style.colorScheme=d?"dark":"light"}catch(_){}})();`;

export const metadata: Metadata = {
  title: "SpinTribe Cycling Coaching | Johannesburg",
  description:
    "Book one-to-one cycling coaching in Johannesburg, pay securely, and receive email and calendar reminders.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SpinTribe",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",   // honours safe-area-inset on notched iPhones
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#020202" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <ThemeInit />
        {/* Carbon texture and the SpinTribe pulse stay fixed behind the app.
            Both adapt to the active theme via tokens in globals.css. */}
        <div aria-hidden className="app-texture pointer-events-none fixed inset-0 z-0" />
        <div aria-hidden className="app-pulse pointer-events-none fixed bottom-0 right-0 z-0" />
        <div className="relative z-10">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
