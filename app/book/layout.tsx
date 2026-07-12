import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SpinTribe Coaching - Book a Cycling Session",
  description:
    "Book SpinTribe Coaching cycling sessions and performance blocks in Johannesburg with secure PayFast checkout, calendar invites, and optional SpinTribe account linking.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}

