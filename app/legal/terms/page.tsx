import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — spera",
};

export default function TermsAndConditions() {
  return (
    <article className="prose-legal">
      <h1>Terms &amp; Conditions</h1>
      <p className="effective">Effective date: 1 January 2026</p>

      <p>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of the spera
        Team Vitality Challenge platform (&ldquo;the Platform&rdquo;). By creating an account
        or participating in the challenge you agree to these Terms. If you do not agree, do not
        use the Platform.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        The Platform is intended for adults aged 18 and over. By registering you confirm you
        meet this requirement and that all information you provide is accurate.
      </p>

      <h2>2. Challenge Rules</h2>
      <ul>
        <li>Monthly km targets are set per tier (200, 400, 800, or 1 000 km). Progress is calculated from Strava-recorded cycling activities only.</li>
        <li>Team Vitality champs are expected to attend two zone rides per month or ten annually. Champing and FTP Improver check-ins must be linked to a genuine Strava activity. Each Strava activity may only be logged once.</li>
        <li>Manipulating activity data, using GPS spoofing, or any other form of cheating will result in immediate account suspension.</li>
        <li>Tier changes are administered by platform operators and take effect at the start of the following month.</li>
      </ul>

      <h2>3. User Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Submit false, misleading, or fraudulent activity data.</li>
        <li>Attempt to access other users&apos; accounts or private data.</li>
        <li>Use the Platform for any purpose other than personal fitness tracking and challenge participation.</li>
        <li>Reverse-engineer, scrape, or automate requests to the Platform.</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        All content on the Platform, including the spera name, logo, challenge structure,
        zone database, and app interface, is owned by spera or its licensors.
        You may not reproduce or redistribute any content without prior written permission.
      </p>
      <p>
        You retain ownership of your own activity data. By connecting Strava you grant us a
        limited licence to display and process your activity data solely within the Platform.
      </p>

      <h2>5. Strava Integration</h2>
      <p>
        We access your Strava data under the permissions you grant when connecting your account.
        We request the minimum scope needed for club challenge progress and ride verification.
        You may revoke access from your Strava settings or disconnect in the app; doing so prevents
        further syncing and removes cached ride data from the Platform.
      </p>
      <p>
        Our use of the Strava API is governed by the{" "}
        <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer">
          Strava API Agreement
        </a>
        . Activity data displayed on this platform is sourced from Strava and attributed
        accordingly. This platform is not affiliated with or endorsed by Strava.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        The Platform is provided &ldquo;as is&rdquo; without warranties of any kind. To the
        maximum extent permitted by law, spera is not liable for:
      </p>
      <ul>
        <li>Any injury, illness, or harm arising from physical activity undertaken as part of the challenge.</li>
        <li>Loss of data, service interruptions, or technical errors.</li>
      </ul>
      <p>
        Physical activity carries inherent risk. See our{" "}
        <a href="/legal/health-disclaimer">Health Disclaimer</a>.
      </p>

      <h2>7. Account Termination</h2>
      <p>
        We reserve the right to suspend or terminate accounts that breach these Terms, without
        notice. You may close your account at any time by contacting us.
      </p>

      <h2>8. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the Republic of South Africa. Disputes shall be
        subject to the jurisdiction of South African courts.
      </p>

      <h2>9. Changes to These Terms</h2>
      <p>
        We may update these Terms. Continued use of the Platform after changes take effect
        constitutes acceptance of the revised Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        spera &mdash; <a href="mailto:ssdidiza@gmail.com">ssdidiza@gmail.com</a>
      </p>
    </article>
  );
}
