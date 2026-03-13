import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db.js';
import { addLogListener, removeLogListener, getActiveRunId } from '@/lib/pipelineRunner';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = parseInt(id);
  const db = getDb();

  const run = db.prepare('SELECT status, log FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!run) {
    return new Response('Run not found', { status: 404 });
  }

  const lastEventId = parseInt(request.headers.get('Last-Event-ID') || '0');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lineIndex = 0;

      if (run.log) {
        const lines = run.log.split('\n').filter((l: string) => l);
        for (const line of lines) {
          lineIndex++;
          if (lineIndex > lastEventId) {
            controller.enqueue(encoder.encode(`id: ${lineIndex}\ndata: ${line}\n\n`));
          }
        }
      }

      if (run.status !== 'running' || getActiveRunId() !== runId) {
        controller.enqueue(encoder.encode(`event: done\ndata: ${run.status}\n\n`));
        controller.close();
        return;
      }

      const listener = (chunk: string) => {
        const lines = chunk.split('\n').filter(l => l);
        for (const line of lines) {
          lineIndex++;
          controller.enqueue(encoder.encode(`id: ${lineIndex}\ndata: ${line}\n\n`));
        }
      };

      addLogListener(runId, listener);

      request.signal.addEventListener('abort', () => {
        removeLogListener(runId, listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
