import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#131313] flex flex-col">
      <header className="sticky top-0 z-40 glass-header px-5 py-4 flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#cac3d8] hover:text-[#cdbdff] transition-colors"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#7c4dff,#00e3fd)" }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9.5" />
              <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
              <line x1="12" y1="10.25" x2="12" y2="3.5" />
              <line x1="13.5" y1="10.5" x2="19.5" y2="7" />
              <line x1="13.5" y1="13.5" x2="19.5" y2="17" />
              <line x1="12" y1="13.75" x2="12" y2="20.5" />
              <line x1="10.5" y1="13.5" x2="4.5" y2="17" />
              <line x1="10.5" y1="10.5" x2="4.5" y2="7" />
            </svg>
          </div>
          <span className="text-xs font-bold tracking-widest uppercase">SpinTribe26</span>
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-5 py-10">
        {children}
      </main>

      <LegalFooter />
    </div>
  );
}
