'use client';

import { useEffect, useState } from 'react';

type BusinessType = { id: string; label: string; vertical: string };
type Touch = { email_subject?: string; email_body?: string; dm?: string };
type Drafts = Record<string, Touch>;

const TOUCH_ORDER: { key: string; label: string }[] = [
  { key: 'touch_1_poke',  label: 'Touch 1A · Poke-the-bear' },
  { key: 'touch_1_route', label: 'Touch 1B · Routing question' },
  { key: 'touch_2',       label: 'Touch 2 · Social proof' },
  { key: 'touch_3',       label: 'Touch 3 · Give-first' },
  { key: 'touch_4',       label: 'Touch 4 · Breakup' },
];

export default function PreviewPage() {
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [vertical, setVertical] = useState('');
  const [generatedFor, setGeneratedFor] = useState('');

  useEffect(() => {
    fetch('/api/preview/outreach')
      .then((r) => r.json())
      .then((data) => {
        setTypes(data.types || []);
        if (data.types?.[0]) setSelected(data.types[0].id);
      })
      .catch(() => setError('Could not load business types.'));
  }, []);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/preview/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed.');
        return;
      }
      setDrafts(data.drafts);
      setVertical(data.vertical);
      setGeneratedFor(types.find((t) => t.id === selected)?.label || selected);
    } catch {
      setError('Generation failed. Check the server and try again.');
    } finally {
      setLoading(false);
    }
  }

  const touches = TOUCH_ORDER.map((t) => ({ ...t, touch: drafts?.[t.key] })).filter((t) => t.touch);

  return (
    <div className="boot">
      <div style={{ marginBottom: 6 }}>
        <div className="label" style={{ marginBottom: 6 }}>PREVIEW - 12</div>
        <h1 style={{ fontSize: 28, margin: 0 }}>Message preview</h1>
        <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
          Pick a business type and generate the exact 5-touch sequence a lead of that type would
          receive, using the same drafting engine your campaigns use.
        </p>
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      <section className="frame frame--brackets" style={{ padding: '18px 20px', marginBottom: 22 }}>
        <span className="br-tr" /><span className="br-bl" />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="label" htmlFor="preview-type">BUSINESS TYPE</label>
            <select
              id="preview-type"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading || types.length === 0}
              style={{
                minWidth: 240,
                padding: '9px 12px',
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={generate}
            disabled={loading || !selected}
            className="tag tag--accent"
            style={{
              cursor: loading ? 'wait' : 'pointer',
              padding: '10px 18px',
              fontSize: 12,
              border: 'none',
              opacity: loading || !selected ? 0.6 : 1,
            }}
          >
            {loading ? 'GENERATING…' : drafts ? 'REGENERATE' : 'GENERATE PREVIEW'}
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--mute)', margin: '14px 0 0' }}>
          Generated live · about one API call per generate. Real leads also personalize touch 1
          from their own reviews, so their opener may differ from this baseline.
        </p>
      </section>

      {error ? (
        <section className="frame frame--brackets" style={{ padding: '18px 20px', marginBottom: 22 }}>
          <span className="br-tr" /><span className="br-bl" />
          <div className="label" style={{ color: 'var(--warn)', marginBottom: 6 }}>COULD NOT GENERATE</div>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>{error}</p>
        </section>
      ) : null}

      {drafts && touches.length > 0 ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{generatedFor}</h2>
            <span className="tag tag--mute">vertical: {vertical}</span>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {touches.map(({ key, label, touch }) => (
              <article key={key} className="frame frame--brackets" style={{ padding: '16px 18px' }}>
                <span className="br-tr" /><span className="br-bl" />
                <div className="label" style={{ marginBottom: 12 }}>{label}</div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>EMAIL SUBJECT</div>
                    <div style={{ fontSize: 14, fontWeight: 650 }}>{touch!.email_subject}</div>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>EMAIL BODY</div>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                      {touch!.email_body}
                    </p>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 4 }}>DM VARIANT</div>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                      {touch!.dm}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {!drafts && !error && !loading ? (
        <section className="frame frame--brackets" style={{ padding: '22px 24px' }}>
          <span className="br-tr" /><span className="br-bl" />
          <h2 style={{ fontSize: 16, margin: 0 }}>No preview yet</h2>
          <p style={{ color: 'var(--mute)', fontSize: 13, margin: '8px 0 0' }}>
            Choose a business type above and hit Generate preview to see the full sequence.
          </p>
        </section>
      ) : null}
    </div>
  );
}
