/**
 * StandingLine — his current state as plain facts of his body, on her terms.
 *
 * This replaces the three stat tiles and the two felt-depth meters that used to
 * sit here. Those meters ("you're starting to sink when Mama talks to you")
 * narrated his inner experience back at him, which is a therapist's register,
 * not a domme's. She doesn't monitor his feelings as spectacle — she keeps her
 * own books and states what is true of his body because she set it that way.
 *
 * So: one engraved line, no cards, no gradients, no glow. Facts separated by
 * dots. The last fragment is a standing rule rather than a measurement, which
 * is the part that makes it read as hers rather than as a dashboard.
 *
 *   caged · day 9 · no touching · you ask first
 *
 * Nothing here is fabricated: every fragment is derived from a real column, and
 * the rule fragments only appear when the state that justifies them is true.
 */

interface StandingLineProps {
  caged: boolean;
  cageDays: number;
  denialDay: number;
}

export function StandingLine({ caged, cageDays, denialDay }: StandingLineProps) {
  const fragments: Array<{ text: string; hot?: boolean }> = [];

  // The cage, and how long. "open" is not a neutral state — it's a thing she
  // has allowed, so it reads as her decision either way.
  fragments.push({ text: caged ? 'caged' : 'open' });
  if (caged && cageDays > 0) {
    fragments.push({ text: `day ${cageDays}` });
  } else if (!caged && denialDay > 0) {
    fragments.push({ text: `denied ${denialDay}d` });
  }

  // Standing rules implied by the cage. These are the fragments that turn a
  // status readout into her terms — but only when the cage actually justifies
  // them, so the line never asserts a rule that isn't in force.
  if (caged) {
    fragments.push({ text: 'no touching' });
    fragments.push({ text: 'you ask first', hot: true });
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '0 10px',
      marginTop: 14,
      fontSize: 13.5,
      letterSpacing: '0.01em',
      color: 'var(--protocol-text-muted)',
    }}>
      {fragments.map((f, i) => (
        <span key={f.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {i > 0 && <span aria-hidden style={{ opacity: 0.4 }}>·</span>}
          <span style={{
            color: f.hot ? 'var(--protocol-accent-soft)' : 'var(--protocol-text-muted)',
            fontWeight: f.hot ? 600 : 400,
          }}>
            {f.text}
          </span>
        </span>
      ))}
    </div>
  );
}
