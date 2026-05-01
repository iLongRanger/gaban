const FACTORS = [
  { key: 'size',                label: 'Size signals',       max: 20 },
  { key: 'cleanliness_pain',    label: 'Cleanliness pain',   max: 20 },
  { key: 'location',            label: 'Location',           max: 15 },
  { key: 'online_presence',     label: 'Online presence',    max: 15 },
  { key: 'business_age',        label: 'Business age',       max: 15 },
  { key: 'no_current_cleaner',  label: 'No current cleaner', max: 15 },
];

interface ScoreBreakdownProps {
  factorScores: Record<string, number>;
  totalScore: number;
}

export default function ScoreBreakdown({ factorScores, totalScore }: ScoreBreakdownProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        <span className="numeric" style={{ fontSize: 40, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
          {totalScore}
        </span>
        <span className="label numeric">/ 100 · COMPOSITE</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FACTORS.map(({ key, label, max }) => {
          const score = factorScores[key] ?? 0;
          const pct = Math.min(100, Math.round((score / max) * 100));
          return (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 56px', gap: 12, alignItems: 'center' }}>
              <span className="label" style={{ color: 'var(--ink-2)' }}>{label}</span>
              <div style={{ position: 'relative', height: 4, background: 'var(--line)', borderRadius: 1 }}>
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: pct + '%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent-glow)',
                    transition: 'width 400ms ease',
                  }}
                />
                <div
                  style={{
                    position: 'absolute', top: -3, bottom: -3,
                    left: `calc(${pct}% - 1px)`,
                    width: 2, background: 'var(--accent)',
                  }}
                />
              </div>
              <span className="label numeric" style={{ textAlign: 'right', color: 'var(--ink)' }}>
                {score}/{max}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
