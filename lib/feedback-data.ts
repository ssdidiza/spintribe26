import { supabaseAdmin } from "@/lib/supabase";
import { FeedbackCategory, FeedbackItem, FeedbackMessage, FeedbackStatus } from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;

type FeedbackItemRow = {
  id: string;
  user_strava_id: string;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  admin_summary?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type FeedbackVoteRow = {
  feedback_item_id: string;
  user_strava_id: string;
};

type FeedbackMessageRow = {
  id: number;
  feedback_item_id: string;
  user_strava_id: string;
  body: string;
  is_admin: boolean;
  created_at: string;
};

type UserNameRow = {
  strava_id: string;
  name: string;
};

function normalizeIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

export async function getFeedbackBoard(db: Db, currentUserId: string): Promise<FeedbackItem[]> {
  const { data: items, error: itemsError } = await db
    .from("feedback_items")
    .select("id,user_strava_id,title,body,category,status,admin_summary,last_message_at,created_at,updated_at")
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (itemsError) throw new Error(itemsError.message);
  if (!items?.length) return [];

  const itemRows = items as FeedbackItemRow[];
  const itemIds = itemRows.map((item) => item.id);

  const [votesResult, messagesResult] = await Promise.all([
    db
      .from("feedback_votes")
      .select("feedback_item_id,user_strava_id")
      .in("feedback_item_id", itemIds),
    db
      .from("feedback_messages")
      .select("id,feedback_item_id,user_strava_id,body,is_admin,created_at")
      .in("feedback_item_id", itemIds)
      .order("created_at", { ascending: true }),
  ]);

  if (votesResult.error) throw new Error(votesResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);

  const voteRows = (votesResult.data ?? []) as FeedbackVoteRow[];
  const messageRows = (messagesResult.data ?? []) as FeedbackMessageRow[];
  const userIds = normalizeIds([
    ...itemRows.map((item) => item.user_strava_id),
    ...messageRows.map((message) => message.user_strava_id),
  ]);

  const usersResult = userIds.length
    ? await db.from("users").select("strava_id,name").in("strava_id", userIds)
    : { data: [], error: null };

  if (usersResult.error) throw new Error(usersResult.error.message);

  const userNames = new Map(
    ((usersResult.data ?? []) as UserNameRow[]).map((user) => [String(user.strava_id), user.name])
  );
  const votesByItem = new Map<string, Set<string>>();
  for (const vote of voteRows) {
    const set = votesByItem.get(vote.feedback_item_id) ?? new Set<string>();
    set.add(String(vote.user_strava_id));
    votesByItem.set(vote.feedback_item_id, set);
  }

  const messagesByItem = new Map<string, FeedbackMessage[]>();
  for (const message of messageRows) {
    const mapped: FeedbackMessage = {
      id: String(message.id),
      feedbackItemId: String(message.feedback_item_id),
      userId: String(message.user_strava_id),
      authorName: userNames.get(String(message.user_strava_id)) ?? "Rider",
      body: message.body,
      isAdmin: message.is_admin,
      createdAt: message.created_at,
    };
    const list = messagesByItem.get(mapped.feedbackItemId) ?? [];
    list.push(mapped);
    messagesByItem.set(mapped.feedbackItemId, list);
  }

  return itemRows.map((item) => {
    const voters = votesByItem.get(item.id) ?? new Set<string>();
    return {
      id: item.id,
      userId: String(item.user_strava_id),
      authorName: userNames.get(String(item.user_strava_id)) ?? "Rider",
      title: item.title,
      body: item.body,
      category: item.category,
      status: item.status,
      adminSummary: item.admin_summary ?? undefined,
      voteCount: voters.size,
      hasVoted: voters.has(currentUserId),
      isOwn: String(item.user_strava_id) === currentUserId,
      messages: messagesByItem.get(item.id) ?? [],
      lastMessageAt: item.last_message_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
}
