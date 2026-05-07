import { NextRequest, NextResponse } from "next/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL        = "llama-3.1-8b-instant"; // free tier, very fast

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const { ftp, monthlyKm, targetKm, rides, avgKm, zoneName } = body;

  const prompt = buildPrompt({ ftp, monthlyKm, targetKm, rides, avgKm, zoneName });

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a concise cycling coach. Give 3 sharp, actionable training tips based on the athlete data provided. Format as a JSON array of objects with 'title' (4 words max) and 'tip' (1–2 sentences). No preamble. Only output the JSON array.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Groq error:", txt);
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content ?? "[]";

    // Extract JSON array from the response (strip any markdown fences)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const insights: { title: string; tip: string }[] = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : [];

    return NextResponse.json({ insights });
  } catch (e) {
    console.error("AI insights error:", e);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}

function buildPrompt({
  ftp,
  monthlyKm,
  targetKm,
  rides,
  avgKm,
  zoneName,
}: {
  ftp?: number;
  monthlyKm?: number;
  targetKm?: number;
  rides?: number;
  avgKm?: number;
  zoneName?: string;
}) {
  const parts: string[] = [];
  if (ftp)       parts.push(`FTP: ${ftp}W`);
  if (monthlyKm) parts.push(`Monthly km so far: ${monthlyKm} km (target: ${targetKm ?? "unknown"} km)`);
  if (rides)     parts.push(`Rides this month: ${rides}, avg ${avgKm ?? "?"} km each`);
  if (zoneName)  parts.push(`Primary training zone: ${zoneName}`);
  return parts.length
    ? `Athlete data — ${parts.join(", ")}. Give 3 training tips.`
    : "No specific data available. Give 3 general cycling training tips.";
}
