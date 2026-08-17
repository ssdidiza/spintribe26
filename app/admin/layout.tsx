import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Link
        href="/admin/rides"
        className="fixed right-4 top-4 z-[70] rounded-full border border-border bg-background/90 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground shadow-sm backdrop-blur hover:bg-muted"
      >
        Club rides
      </Link>
    </>
  );
}
