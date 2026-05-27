import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — spera",
};

export default function CookiePolicy() {
  return (
    <article className="prose-legal">
      <h1>Cookie Policy</h1>
      <p className="effective">Effective date: 1 January 2026</p>

      <p>
        This Cookie Policy explains what cookies spera uses, why, and your choices.
      </p>

      <h2>1. What Are Cookies?</h2>
      <p>
        Cookies are small text files stored in your browser when you visit a website. They
        allow the site to remember information about your session.
      </p>

      <h2>2. Cookies We Use</h2>

      <h3>Strictly Necessary Cookies</h3>
      <p>
        These are essential for the Platform to function. They cannot be disabled.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Cookie name</th>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sb-*</code></td>
              <td>Supabase</td>
              <td>Authentication session token — keeps you logged in.</td>
              <td>Session / up to 7 days</td>
            </tr>
            <tr>
              <td><code>strava_state</code></td>
              <td>spera</td>
              <td>CSRF protection token during Strava OAuth flow.</td>
              <td>Session</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Analytics &amp; Tracking Cookies</h3>
      <p>
        We do <strong>not</strong> use Google Analytics, Facebook Pixel, or any other
        third-party tracking or advertising cookies.
      </p>

      <h2>3. Local Storage</h2>
      <p>
        We use the browser&apos;s <code>localStorage</code> API to persist your user
        preferences and cached state between sessions (via Zustand persist). This data
        never leaves your device except when you explicitly sync with our servers.
      </p>

      <h2>4. Your Choices</h2>
      <p>
        Because we only use strictly necessary cookies, no consent banner is required under
        POPIA or ePrivacy Directive guidance. You can clear all cookies and local storage at
        any time via your browser settings; doing so will sign you out of the Platform.
      </p>
      <ul>
        <li><strong>Chrome/Edge:</strong> Settings › Privacy and Security › Clear browsing data.</li>
        <li><strong>Firefox:</strong> Settings › Privacy &amp; Security › Cookies and Site Data.</li>
        <li><strong>Safari:</strong> Settings › Advanced › Privacy › Website Data.</li>
      </ul>

      <h2>5. Changes to This Policy</h2>
      <p>
        We will update this policy if we introduce new cookies. Significant changes will
        be communicated in-app.
      </p>

      <h2>6. Contact</h2>
      <p>
        spera &mdash; <a href="mailto:ssdidiza@gmail.com">ssdidiza@gmail.com</a>
      </p>
    </article>
  );
}
