import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import { SperaIcon } from "@/components/SperaLogo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--card)", boxShadow: "inset 0 0 0 1px var(--hairline-strong)" }}
          >
            <SperaIcon className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold tracking-widest uppercase">spera</span>
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-5 py-10">
        {children}
      </main>

      <LegalFooter />
    </div>
  );
}
