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
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 17.944h4.172" />
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
