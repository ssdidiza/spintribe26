import { LESSON_CURRENCY } from "@/lib/lessons";

export type LessonServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LessonService = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
};

export function serializeLessonService(row: LessonServiceRow): LessonService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    durationMinutes: Number(row.duration_minutes ?? 60),
    priceCents: Number(row.price_cents ?? 0),
    currency: row.currency ?? LESSON_CURRENCY,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
  };
}
