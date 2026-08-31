import '@/lib/loadEnv.js';
import { getDb } from '@/lib/db.js';
import { recordOpen } from '../../../../../../services/openTrackingService.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Smallest possible transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function pixelResponse() {
  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      // Without this the recipient's mail proxy caches the image and only the
      // first open of a thread would ever reach us.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

type RouteProps = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteProps) {
  const { token } = await params;

  // Always answer with the pixel, whatever happens below. A tracker that
  // returns 404 for a bad token tells a prober which tokens are real, and a
  // broken image in a prospect's inbox is worse than a missed open.
  try {
    const headers = request.headers;
    recordOpen({
      db: getDb(),
      token,
      secret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
      userAgent: headers.get('user-agent') || undefined,
      ip: headers.get('x-forwarded-for')?.split(',')[0].trim()
        || headers.get('x-real-ip')
        || undefined,
    });
  } catch {
    // Recording is best-effort; the image is not.
  }

  return pixelResponse();
}
