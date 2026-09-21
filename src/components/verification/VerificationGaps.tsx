export function VerificationGaps({ gaps, onConfigure }: { gaps: string[]; onConfigure: () => void }) {
  if (gaps.length === 0) return null;
  return (
    <section className="verify-panel">
      <h2>Verification gaps</h2>
      <ul className="verify-gaps">
        {gaps.map((gap) => (
          <li key={gap}>⚠ {gap}</li>
        ))}
      </ul>
      <p className="verify-note">TDD runs during implementation. The VerificationEngine is the harness net after mutations or a manual run.</p>
      <button type="button" className="cap-filter-btn" onClick={onConfigure}>Configure verification</button>
    </section>
  );
}
