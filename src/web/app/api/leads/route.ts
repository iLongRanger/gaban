import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';

export function GET(request: NextRequest) {
  const db = getDb();
  const url = new URL(request.url);
  const week = url.searchParams.get('week');
  const status = url.searchParams.get('status');
  const sort = url.searchParams.get('sort') || 'total_score';
  const order = url.searchParams.get('order') || 'DESC';
  const search = url.searchParams.get('search');

  let query = 'SELECT * FROM leads WHERE 1=1';
  const params: unknown[] = [];

  if (week) {
    query += ' AND week = ?';
    params.push(week);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += ' AND (business_name LIKE ? OR address LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }

  const allowedSorts = ['total_score', 'distance_km', 'business_name', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'total_score';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
  query += ' ORDER BY ' + sortCol + ' ' + sortOrder;

  const leads = db.prepare(query).all(...params);
  return NextResponse.json(leads);
}
