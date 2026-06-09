"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Bug, CheckCircle2, Lightbulb, Loader2, MessageSquare, Send, ThumbsUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { FeedbackCategory, FeedbackItem, FeedbackStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "bug", label: "Bug" },
  { value: "confusing", label: "Confusing" },
  { value: "request", label: "Request" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: FeedbackStatus[] = ["open", "planned", "shipped", "closed"];

function categoryIcon(category: FeedbackCategory) {
  if (category === "bug") return <Bug size={12} />;
  if (category === "idea" || category === "request") return <Lightbulb size={12} />;
  return <MessageSquare size={12} />;
}

// Status colors chosen to keep contrast on both light and dark surfaces.
function statusColor(status: FeedbackStatus) {
  if (status === "shipped") return "#16a34a";
  if (status === "planned") return "#ec4899";
  if (status === "closed") return "#71717a";
  return "#ff4b35";
}

export default function FeedbackBoard({ admin = false }: { admin?: boolean }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const reloadTimer = useRef<number | null>(null);

  const endpoint = admin ? "/api/admin/feedback" : "/api/feedback";

  const loadFeedback = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Feedback could not load");
      const data = await res.json();
      setItems(data.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback could not load");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      void loadFeedback();
    }, 250);
  }, [loadFeedback]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadFeedback();
    }, 0);

    const channel = supabase
      .channel(admin ? "feedback-admin-board" : "feedback-member-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_items" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_votes" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_messages" }, scheduleReload)
      .subscribe();

    return () => {
      window.clearTimeout(initialTimer);
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [admin, loadFeedback, scheduleReload]);

  async function submitFeedback() {
    if (!title.trim() || !body.trim()) return;
    setActing("new");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, category }),
      });
      if (!res.ok) throw new Error("Feedback could not be sent");
      setTitle("");
      setBody("");
      setCategory("idea");
      await loadFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback could not be sent");
    } finally {
      setActing(null);
    }
  }

  async function toggleVote(itemId: string) {
    setActing(`vote-${itemId}`);
    try {
      const res = await fetch(`/api/feedback/${itemId}/vote`, { method: "PATCH" });
      if (!res.ok) throw new Error("Vote could not be saved");
      await loadFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote could not be saved");
    } finally {
      setActing(null);
    }
  }

  async function sendMessage(itemId: string) {
    const message = messageDrafts[itemId]?.trim();
    if (!message) return;
    setActing(`message-${itemId}`);
    try {
      const res = await fetch(`/api/feedback/${itemId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
      if (!res.ok) throw new Error("Reply could not be sent");
      setMessageDrafts((drafts) => ({ ...drafts, [itemId]: "" }));
      await loadFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply could not be sent");
    } finally {
      setActing(null);
    }
  }

  async function updateStatus(itemId: string, status: FeedbackStatus) {
    setActing(`status-${itemId}`);
    try {
      const res = await fetch(`/api/admin/feedback/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status could not be saved");
      await loadFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status could not be saved");
    } finally {
      setActing(null);
    }
  }

  const sortedItems = [...items].sort((a, b) => b.voteCount - a.voteCount || Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));

  return (
    <section className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-foreground/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Beta Feedback</p>
          <p className="text-sm font-bold text-foreground">{admin ? "Suggestions queue" : "Send beta feedback"}</p>
        </div>
        <MessageSquare size={16} className="text-accent-foreground flex-shrink-0" />
      </div>

      {!admin && (
        <div className="p-5 space-y-3 border-b border-foreground/[0.06]">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORY_OPTIONS.map((option) => {
              const selected = category === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all"
                  style={{
                    borderColor: selected ? "rgba(255,75,53,0.45)" : "var(--border)",
                    color: selected ? "var(--accent-foreground)" : "var(--muted-foreground)",
                    background: selected ? "rgba(255,75,53,0.12)" : "var(--fill-soft)",
                  }}
                >
                  {categoryIcon(option.value)}
                  {option.label}
                </button>
              );
            })}
          </div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Short title"
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-accent-foreground/50"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Bug, confusing screen, or feature idea"
            className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-accent-foreground/50 resize-none"
          />
          <button
            type="button"
            onClick={submitFeedback}
            disabled={acting === "new" || !title.trim() || !body.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50"
          >
            {acting === "new" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send feedback
          </button>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="divide-y divide-foreground/[0.06]">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading feedback...</div>
        ) : sortedItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No feedback yet.</div>
        ) : (
          sortedItems.map((item) => {
            const latestAdminMessage = [...item.messages].reverse().find((message) => message.isAdmin);
            const canReply = admin || item.isOwn;
            const sendingMessage = acting === `message-${item.id}`;
            return (
              <article key={item.id} className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleVote(item.id)}
                    disabled={acting === `vote-${item.id}`}
                    className={cn(
                      "flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-black transition-colors",
                      item.hasVoted ? "border-accent-foreground/50 bg-accent-foreground/15 text-accent-foreground" : "border-foreground/10 bg-foreground/[0.04] text-muted-foreground"
                    )}
                    aria-label={item.hasVoted ? "Remove vote" : "Vote"}
                  >
                    <ThumbsUp size={13} />
                    {item.voteCount}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                        style={{
                          color: statusColor(item.status),
                          border: `1px solid ${statusColor(item.status)}55`,
                          background: `${statusColor(item.status)}16`,
                        }}
                      >
                        {item.status}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {categoryIcon(item.category)}
                        {item.category}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-foreground">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      {item.authorName} - {format(new Date(item.createdAt), "MMM d, HH:mm")}
                    </p>
                  </div>
                </div>

                {latestAdminMessage && (
                  <div className="rounded-xl border border-accent-foreground/25 bg-accent-foreground/10 px-3 py-2">
                    <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-accent-foreground">
                      <CheckCircle2 size={11} />
                      Admin response
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/85">{latestAdminMessage.body}</p>
                  </div>
                )}

                {item.messages.length > 0 && admin && (
                  <div className="space-y-2">
                    {item.messages.slice(-3).map((message) => (
                      <div key={message.id} className="border-l border-foreground/10 pl-3">
                        <p className="text-[10px] font-bold text-muted-foreground">
                          {message.isAdmin ? "Admin" : message.authorName} - {format(new Date(message.createdAt), "MMM d, HH:mm")}
                        </p>
                        <p className="mt-0.5 text-xs text-foreground/75">{message.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {admin && (
                  <label className="block">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Status</span>
                    <select
                      value={item.status}
                      onChange={(event) => updateStatus(item.id, event.target.value as FeedbackStatus)}
                      disabled={acting === `status-${item.id}`}
                      className="mt-1 w-full rounded-xl border border-foreground/10 bg-card px-2 py-2 text-xs font-bold text-foreground outline-none"
                    >
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                )}

                {canReply && (
                  <div className="flex gap-2">
                    <input
                      value={messageDrafts[item.id] ?? ""}
                      onChange={(event) => setMessageDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                      placeholder={admin ? "Admin response" : "Add context"}
                      className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-accent-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => sendMessage(item.id)}
                      disabled={sendingMessage || !messageDrafts[item.id]?.trim()}
                      className="inline-flex w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                      aria-label="Send reply"
                    >
                      {sendingMessage ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
