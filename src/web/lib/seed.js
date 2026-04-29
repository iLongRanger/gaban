import { initDb } from './db.js';

const db = initDb();

const now = new Date().toISOString();
const week = '2026-W11';

const leads = [
  {
    place_id: 'seed_1',
    business_name: 'Metro Fitness Gym',
    type: 'gym',
    address: '456 Royal Ave, New Westminster, BC',
    lat: 49.201,
    lng: -122.912,
    distance: 1.2,
    score: 92,
    factors: {
      size: 19,
      cleanliness_pain: 20,
      location: 14,
      online_presence: 13,
      business_age: 13,
      no_current_cleaner: 13,
    },
    reasoning: 'High cleanliness pain in reviews, very close to office, large facility.',
  },
  {
    place_id: 'seed_2',
    business_name: 'Pacific Rim Restaurant',
    type: 'restaurant',
    address: '789 Columbia St, New Westminster, BC',
    lat: 49.204,
    lng: -122.907,
    distance: 2.1,
    score: 85,
    factors: {
      size: 16,
      cleanliness_pain: 18,
      location: 13,
      online_presence: 14,
      business_age: 12,
      no_current_cleaner: 12,
    },
    reasoning: 'Multiple reviews mention dirty washrooms, strong online presence.',
  },
  {
    place_id: 'seed_3',
    business_name: 'Sunrise Yoga Studio',
    type: 'yoga_studio',
    address: '321 6th St, New Westminster, BC',
    lat: 49.209,
    lng: -122.916,
    distance: 3.5,
    score: 74,
    factors: {
      size: 12,
      cleanliness_pain: 14,
      location: 12,
      online_presence: 12,
      business_age: 12,
      no_current_cleaner: 12,
    },
    reasoning: 'Growing studio, some cleanliness concerns in reviews.',
  },
  {
    place_id: 'seed_4',
    business_name: 'Valley Medical Clinic',
    type: 'medical_clinic',
    address: '555 12th St, New Westminster, BC',
    lat: 49.198,
    lng: -122.92,
    distance: 4.8,
    score: 68,
    factors: {
      size: 14,
      cleanliness_pain: 10,
      location: 11,
      online_presence: 11,
      business_age: 11,
      no_current_cleaner: 11,
    },
    reasoning: 'Medical facility with moderate signals, decent proximity.',
  },
];

const draftStyles = ['curious_neighbor', 'value_lead', 'compliment_question'];

for (const l of leads) {
  db.prepare(
    `INSERT OR IGNORE INTO leads (place_id, business_name, type, address, latitude, longitude, distance_km, total_score, factor_scores, reasoning, status, week, reviews_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, '[]', ?, ?)`
  ).run(
    l.place_id,
    l.business_name,
    l.type,
    l.address,
    l.lat,
    l.lng,
    l.distance,
    l.score,
    JSON.stringify(l.factors),
    l.reasoning,
    week,
    now,
    now
  );

  const row = db.prepare('SELECT id FROM leads WHERE place_id = ?').get(l.place_id);
  for (const style of draftStyles) {
    db.prepare(
      `INSERT OR IGNORE INTO outreach_drafts (lead_id, style, email_subject, email_body, dm, selected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      row.id,
      style,
      style + ' subject for ' + l.business_name,
      'Hi! This is a ' + style + ' email draft for ' + l.business_name + '. It would reference their ' + l.type + ' business and proximity.',
      'Quick ' + style + ' DM for ' + l.business_name,
      now,
      now
    );
  }
}

console.log('Seeded ' + leads.length + ' leads with drafts.');
db.close();
