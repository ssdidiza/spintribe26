import Link from "next/link";

const LINKS = [
  { href: "/legal/privacy",            label: "Privacy Policy" },
  { href: "/legal/terms",              label: "Terms & Conditions" },
  { href: "/legal/health-disclaimer",  label: "Health Disclaimer" },
  { href: "/legal/cookies",            label: "Cookie Policy" },
];

export default function LegalFooter() {
  return (
    <footer className="w-full border-t border-white/[0.06] mt-auto py-6 px-5">
      <div className="mx-auto max-w-lg md:max-w-3xl flex flex-col items-center gap-3">
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[11px] text-[#cac3d8]/60 hover:text-[#cdbdff] transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-[10px] text-[#cac3d8]/30 text-center">
          &copy; {new Date().getFullYear()} SpinTribe26. Participate at your own risk.{" "}
          Not medical advice.
        </p>
      </div>
    </footer>
  );
}
