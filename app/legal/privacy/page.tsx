import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — spera",
};

export default function PrivacyPolicy() {
  return (
    <article className="prose-legal">
      <h1>Privacy Policy</h1>
      <p className="effective">Effective date: 1 January 2026</p>

      <p>
        spera (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the
        spera Team Vitality Challenge platform. This policy explains what personal
        information we collect, why we collect it, and your rights over that data. It applies
        to all users regardless of location and is intended to comply with the Protection of
        Personal Information Act (POPIA), GDPR, and similar frameworks.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address, and encrypted password when you register.</li>
        <li><strong>Strava data:</strong> if you connect Strava, we receive your Strava athlete profile (name, profile photo), and cycling activity data needed for the challenge (distance, duration, date, activity type, kudos, and activity ID) via the official Strava API.</li>
        <li><strong>Challenge data:</strong> tier selection, champion session logs, zone submissions, and notes you enter.</li>
        <li><strong>Technical data:</strong> browser type, IP address, and session tokens stored in browser cookies for authentication purposes.</li>
        <li><strong>FTP / fitness data:</strong> functional threshold power (FTP) values fetched from your Strava profile if available. Route GPS points are used only server-side to match broad club zones and are not returned to the browser or stored as raw coordinates.</li>
      </ul>
      <p>We do <strong>not</strong> sell your data, serve third-party advertising, or share data with analytics providers.</p>

      <h2>2. How We Use Your Data</h2>
      <ul>
        <li>To authenticate you and maintain your session securely.</li>
        <li>To display Team Vitality monthly distance progress, tier leaderboard rankings, and champ check-in proof.</li>
        <li>To enable zone check-ins and champion session tracking.</li>
        <li>To send transactional emails (e.g. email confirmation on sign-up).</li>
      </ul>

      <h2>3. Data Retention</h2>
      <p>
        Your account data is retained for as long as your account is active. Activity data
        pulled from Strava is cached to reduce Strava API calls and not permanently archived beyond your
        account lifetime. You may disconnect Strava or request deletion at any time (see Section 6).
      </p>

      <h2>4. Third-Party Services</h2>
      <ul>
        <li>
          <strong>Strava API:</strong> governed by the{" "}
          <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer">Strava API Agreement</a>
          {" "}and{" "}
          <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener noreferrer">Strava&apos;s Privacy Policy</a>
          . You may revoke access via your Strava settings or the in-app disconnect control at any time.
        </li>
        <li><strong>Supabase:</strong> our database and authentication provider. Data is stored on Supabase-managed infrastructure.</li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        We use strictly necessary session cookies for authentication. We do not use advertising
        or tracking cookies. See our <a href="/legal/cookies">Cookie Policy</a> for details.
      </p>

      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate data.</li>
        <li>Request deletion of your account and associated data.</li>
        <li>Withdraw consent for Strava data access by using the in-app disconnect control or revoking the integration in Strava.</li>
        <li>Lodge a complaint with the Information Regulator (South Africa) or your local data protection authority.</li>
      </ul>
      <p>
        To exercise any right, email us at{" "}
        <a href="mailto:ssdidiza@gmail.com">ssdidiza@gmail.com</a>.
      </p>

      <h2>7. Security</h2>
      <p>
        Passwords are hashed by Supabase Auth and never stored in plain text. All data is
        transmitted over HTTPS. We implement reasonable technical and organisational measures
        to protect your data, but no system is 100% secure.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this policy. Material changes will be notified by email or via an
        in-app notice at least 14 days before taking effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        spera &mdash; <a href="mailto:ssdidiza@gmail.com">ssdidiza@gmail.com</a>
      </p>
    </article>
  );
}
