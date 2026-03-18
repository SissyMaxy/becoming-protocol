export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-protocol-bg p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-protocol-text mb-6">Privacy Policy</h1>

      <div className="space-y-4 text-sm text-protocol-text-muted leading-relaxed">
        <p>
          Becoming Protocol accesses your WHOOP data (recovery scores, sleep metrics,
          workout data, and body measurements) solely to personalize your experience
          within the app.
        </p>

        <h2 className="text-lg font-semibold text-protocol-text mt-6">Your data is:</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Stored securely in our database</li>
          <li>Never shared with third parties</li>
          <li>Never sold</li>
          <li>Deletable by disconnecting your WHOOP account in Settings</li>
        </ul>

        <h2 className="text-lg font-semibold text-protocol-text mt-6">Data we access from WHOOP:</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Recovery scores (HRV, resting heart rate, SpO2)</li>
          <li>Sleep data (duration, stages, performance)</li>
          <li>Strain and workout data</li>
          <li>Body measurements (weight)</li>
        </ul>

        <p className="mt-6">
          This data is used to inform task intensity recommendations and wellness
          monitoring within the app. No biometric data is used for advertising or
          shared externally.
        </p>

        <p className="mt-6 text-xs text-protocol-text-muted/50">
          Last updated: March 2026
        </p>
      </div>
    </div>
  );
}
