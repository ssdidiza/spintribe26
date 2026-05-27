import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health Disclaimer â€” spera",
};

export default function HealthDisclaimer() {
  return (
    <article className="prose-legal">
      <h1>Health &amp; Medical Disclaimer</h1>
      <p className="effective">Effective date: 1 January 2026</p>

      <div
        className="rounded-2xl p-4 mb-6"
        style={{
          background: "rgba(255,160,0,0.08)",
          border: "1px solid rgba(255,160,0,0.25)",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: "#ffb74d" }}>
          Important: spera does not provide medical advice. The content on this
          platform is for informational and motivational purposes only.
        </p>
      </div>

      <h2>1. Not Medical Advice</h2>
      <p>
        Nothing on the spera platform, including leaderboard data, champion session
        logs, or FTP zones, constitutes medical advice,
        diagnosis, or treatment. Always seek the advice of a qualified healthcare provider
        before beginning any new exercise programme, particularly if you have a pre-existing
        medical condition.
      </p>

      <h2>2. Consult a Physician Before Participating</h2>
      <p>You should consult your doctor before participating in the challenge if you:</p>
      <ul>
        <li>Have a cardiovascular condition, hypertension, or a history of heart disease.</li>
        <li>Are pregnant or postpartum.</li>
        <li>Have musculoskeletal injuries or chronic pain.</li>
        <li>Are over 40 and have been sedentary for an extended period.</li>
        <li>Have diabetes, asthma, or any other condition affected by physical exertion.</li>
        <li>Are taking medication that may affect heart rate, blood pressure, or balance.</li>
      </ul>

      <h2>3. Participate at Your Own Risk</h2>
      <p>
        All physical activity carries inherent risk, including the risk of injury or death.
        By participating in the spera challenge you acknowledge that you do so
        voluntarily and at your own risk. You assume full responsibility for your safety
        during all activities, including outdoor cycling, indoor training, and zone sessions.
      </p>

      <h2>4. FTP &amp; Power Zones</h2>
      <p>
        FTP (Functional Threshold Power) values and derived power zones are displayed as
        informational reference data sourced from Strava. Training at high intensity can
        be dangerous without appropriate fitness base and medical clearance. Always listen
        to your body and stop exercising immediately if you experience chest pain, dizziness,
        shortness of breath, or unusual discomfort.
      </p>

      <h2>5. Limitation of Liability</h2>
      <p>
        spera, its operators, and contributors accept no responsibility or liability
        for any injury, illness, adverse health outcome, or death arising from participation
        in any activity connected with this platform. This disclaimer forms part of our{" "}
        <a href="/legal/terms">Terms &amp; Conditions</a>.
      </p>

      <h2>6. Emergency</h2>
      <p>
        If you or someone around you experiences a medical emergency during activity, stop
        immediately and call your local emergency services.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about this disclaimer: <a href="mailto:ssdidiza@gmail.com">ssdidiza@gmail.com</a>
      </p>
    </article>
  );
}
