const FACTORS = [
  { key: 'size', label: 'Size Signals', max: 20 },
  { key: 'cleanliness_pain', label: 'Cleanliness Pain', max: 20 },
  { key: 'location', label: 'Location', max: 15 },
  { key: 'online_presence', label: 'Online Presence', max: 15 },
  { key: 'business_age', label: 'Business Age', max: 15 },
  { key: 'no_current_cleaner', label: 'No Current Cleaner', max: 15 },
];

interface ScoreBreakdownProps {
  factorScores: Record<string, number>;
  totalScore: number;
}

export default function ScoreBreakdown({ factorScores, totalScore }: ScoreBreakdownProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl font-bold">{totalScore}</span>
        <span className="text-gray-500 text-sm">/ 100</span>
      </div>
      {FACTORS.map(({ key, label, max }) => {
        const score = factorScores[key] ?? 0;
        const pct = Math.round((score / max) * 100);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-40 shrink-0">{label}</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: pct + '%' }}
              />
            </div>
            <span className="text-xs text-gray-500 w-12 text-right">{score}/{max}</span>
          </div>
        );
      })}
    </div>
  );
}
