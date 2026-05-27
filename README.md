This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Strava Approval Notes

SpinTribe26 uses Strava for Team Vitality Cycling Club monthly distance challenges, tier leaderboards, and champ check-ins. The default OAuth scope is `activity:read`; set `STRAVA_SCOPES=activity:read_all` only if private activities are required and disclosed during Strava review.

To keep API usage low:

- `/api/strava/sync` caches the current athlete's monthly cycling activities and enforces a 10-minute server-side cooldown.
- Raw GPS coordinates are used only during sync to assign broad club zones, then discarded before the response and database write.
- `/api/strava/webhook` supports Strava webhook verification and invalidates cached sync state when activities change.
- `/profile` includes controls to disconnect Strava, remove cached ride data, or delete account data.

Required production environment variables:

```bash
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=https://your-domain.example/api/auth/strava/callback
STRAVA_WEBHOOK_VERIFY_TOKEN=
NEXTAUTH_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
