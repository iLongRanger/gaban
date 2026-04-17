import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/web/lib/db.js';

describe('Database', () => {
  let db;

  before(() => {
    db = initDb(':memory:');
  });

  after(() => {
    db.close();
  });

  it('creates leads table with all columns', () => {
    const columns = db.pragma('table_info(leads)').map(c => c.name);
    assert.ok(columns.includes('place_id'));
    assert.ok(columns.includes('business_name'));
    assert.ok(columns.includes('subtypes'));
    assert.ok(columns.includes('reviews_data'));
    assert.ok(columns.includes('factor_scores'));
    assert.ok(columns.includes('status'));
    assert.ok(columns.includes('week'));
  });

  it('creates outreach_drafts table with UNIQUE constraint', () => {
    const columns = db.pragma('table_info(outreach_drafts)').map(c => c.name);
    assert.ok(columns.includes('lead_id'));
    assert.ok(columns.includes('style'));
    assert.ok(columns.includes('edited_email_body'));
    assert.ok(columns.includes('selected'));
  });

  it('creates lead_notes table', () => {
    const columns = db.pragma('table_info(lead_notes)').map(c => c.name);
    assert.ok(columns.includes('lead_id'));
    assert.ok(columns.includes('content'));
    assert.ok(columns.includes('created_at'));
  });

  it('enforces unique place_id on leads', () => {
    const now = new Date().toISOString();
    const sql = 'INSERT INTO leads (place_id, business_name, type, address, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.prepare(sql).run('test_1', 'Test Biz', 'restaurant', '123 Main', 49.2, -122.9, 5.0, 80, '{}', 'good', 'new', '2026-W11', now, now);

    assert.throws(() => {
      db.prepare(sql).run('test_1', 'Dupe Biz', 'restaurant', '456 Main', 49.2, -122.9, 5.0, 70, '{}', 'ok', 'new', '2026-W11', now, now);
    });
  });
});

describe('Outreach tables', () => {
  let db;

  before(() => {
    db = initDb(':memory:');
  });

  after(() => {
    db.close();
  });

  it('creates campaigns table', () => {
    const columns = db.pragma('table_info(campaigns)').map(c => c.name);
    for (const col of ['id', 'name', 'preset_id', 'status', 'daily_cap',
      'start_date', 'end_date', 'timezone', 'send_window_start',
      'send_window_end', 'send_days', 'touch_styles', 'created_at', 'updated_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates campaign_leads table with unique (campaign_id, lead_id)', () => {
    const columns = db.pragma('table_info(campaign_leads)').map(c => c.name);
    for (const col of ['id', 'campaign_id', 'lead_id', 'status', 'touch_count',
      'added_at', 'last_touch_at', 'completed_at', 'outcome']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
    const indexes = db.pragma('index_list(campaign_leads)');
    assert.ok(indexes.some(i => i.unique === 1), 'missing unique index');
  });

  it('creates email_sends table', () => {
    const columns = db.pragma('table_info(email_sends)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'touch_number', 'template_style',
      'subject', 'body', 'recipient_email', 'gmail_message_id', 'gmail_thread_id',
      'scheduled_for', 'sent_at', 'status', 'error_message', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates email_events table', () => {
    const columns = db.pragma('table_info(email_events)').map(c => c.name);
    for (const col of ['id', 'send_id', 'type', 'detected_at', 'raw_payload']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates suppression_list table with unique email_hash', () => {
    const columns = db.pragma('table_info(suppression_list)').map(c => c.name);
    for (const col of ['id', 'email_hash', 'domain', 'reason', 'source', 'added_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
    const now = new Date().toISOString();
    db.prepare('INSERT INTO suppression_list (email_hash, reason, source, added_at) VALUES (?, ?, ?, ?)')
      .run('abc123', 'unsubscribed', 'click', now);
    assert.throws(() => {
      db.prepare('INSERT INTO suppression_list (email_hash, reason, source, added_at) VALUES (?, ?, ?, ?)')
        .run('abc123', 'unsubscribed', 'click', now);
    });
  });

  it('creates meetings table', () => {
    const columns = db.pragma('table_info(meetings)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'scheduled_for', 'kind',
      'notes', 'completed', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates contracts table', () => {
    const columns = db.pragma('table_info(contracts)').map(c => c.name);
    for (const col of ['id', 'campaign_lead_id', 'signed_date', 'value_monthly',
      'notes', 'created_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });

  it('creates system_settings table', () => {
    const columns = db.pragma('table_info(system_settings)').map(c => c.name);
    for (const col of ['key', 'value', 'updated_at']) {
      assert.ok(columns.includes(col), `missing column ${col}`);
    }
  });
});
