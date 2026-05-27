import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Training insights are disabled for Strava API compliance." },
    { status: 410 }
  );
}
