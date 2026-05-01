'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push('/');
    } else {
      setError('AUTH REJECTED · check operator key');
      setPin('');
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        position: 'relative',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="frame frame--brackets boot"
        style={{ width: 340, padding: '28px 24px 22px', position: 'relative', zIndex: 1 }}
      >
        <span className="br-tr" /><span className="br-bl" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span
            style={{
              width: 28, height: 28,
              border: '1px solid var(--accent)',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
              borderRadius: 2,
            }}
          >
            ⌬
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.18em', fontWeight: 600 }}>
              GABAN
            </span>
            <span className="label" style={{ fontSize: 8 }}>OPERATOR · v1</span>
          </div>
          <span style={{ flex: 1 }} />
          <span className="pulse-dot" />
        </div>

        <div className="label" style={{ marginBottom: 8 }}>OPERATOR KEY</div>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          className="field numeric"
          style={{
            width: '100%',
            fontSize: 22,
            letterSpacing: '0.4em',
            textAlign: 'center',
            padding: '14px 12px',
          }}
          autoFocus
        />
        {error && (
          <div className="label" style={{ color: 'var(--danger)', marginTop: 10 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !pin}
          className="btn btn--primary"
          style={{
            width: '100%', marginTop: 16, justifyContent: 'center',
            opacity: loading || !pin ? 0.5 : 1,
            cursor: loading || !pin ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'AUTHENTICATING…' : 'UNLOCK CONSOLE →'}
        </button>

        <hr className="hr-fade" style={{ margin: '20px 0 14px' }} />
        <div className="label numeric" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--faint)' }}>
          <span>SECTOR / VAN</span>
          <span>0xGABAN</span>
        </div>
      </form>
    </div>
  );
}
