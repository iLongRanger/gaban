import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/geocoding.js';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const address = String(body.address ?? '').trim();

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to geocode address' }, { status: 400 });
  }
}
