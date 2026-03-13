'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Run {
  id: number;
  preset_name: string | null;
  status: string;
  phase: string | null;
  leads_found: number | null;
  log: string;
  started_at: string;
  completed_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  pending: 'bg-blue-100 text-blue-800',
};

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.round((e - s) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRuns = useCallback(async () => {
    const res = await fetch(`/api/runs?page=${page}&limit=20`);
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs);
      setTotal(data.total);
    }
  }, [page]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  function expandRun(run: Run) {
    eventSourceRef.current?.close();

    if (expandedId === run.id) {
      setExpandedId(null);
      setLogLines([]);
      return;
    }

    setExpandedId(run.id);
    setLogLines(run.log ? run.log.split('\n').filter(l => l) : []);

    if (run.status === 'running') {
      const es = new EventSource(`/api/runs/${run.id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        setLogLines(prev => [...prev, event.data]);
      };

      es.addEventListener('done', () => {
        es.close();
        fetchRuns();
      });

      es.onerror = () => {
        es.close();
      };
    }
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  async function handleCancel(runId: number) {
    await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
    fetchRuns();
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activeId = params.get('active');
    if (activeId) {
      const id = parseInt(activeId);
      fetch(`/api/runs/${id}`).then(res => res.json()).then(run => {
        if (run.id) {
          setExpandedId(run.id);
          setLogLines(run.log ? run.log.split('\n').filter((l: string) => l) : []);
          if (run.status === 'running') {
            const es = new EventSource(`/api/runs/${run.id}/stream`);
            eventSourceRef.current = es;
            es.onmessage = (event) => {
              setLogLines(prev => [...prev, event.data]);
            };
            es.addEventListener('done', () => {
              es.close();
              fetchRuns();
            });
            es.onerror = () => { es.close(); };
          }
        }
      });
    }
  }, []);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {runs.some(r => r.status === 'running') && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-yellow-800 font-medium">Pipeline running...</span>
          {runs.filter(r => r.status === 'running').map(r => (
            <button key={r.id} onClick={() => handleCancel(r.id)}
              className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
              Cancel
            </button>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Pipeline Runs</h2>

      <div className="space-y-2">
        {runs.map(run => (
          <div key={run.id} className="border border-gray-200 rounded-lg">
            <div
              onClick={() => expandRun(run)}
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[run.status] || ''}`}>
                  {run.status}
                </span>
                <span className="text-sm font-medium">{run.preset_name || 'Deleted preset'}</span>
                <span className="text-xs text-gray-500">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {run.leads_found !== null && <span>{run.leads_found} leads</span>}
                <span>{formatDuration(run.started_at, run.completed_at)}</span>
                <span>{expandedId === run.id ? '\u25B2' : '\u25BC'}</span>
              </div>
            </div>

            {expandedId === run.id && (
              <div className="border-t border-gray-200">
                <div ref={logRef}
                  className="bg-gray-900 text-green-400 p-4 font-mono text-xs max-h-96 overflow-y-auto">
                  {logLines.length === 0 ? (
                    <p className="text-gray-500">No log output yet...</p>
                  ) : (
                    logLines.map((line, i) => <div key={i}>{line}</div>)
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {runs.length === 0 && <p className="text-sm text-gray-400">No pipeline runs yet.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
