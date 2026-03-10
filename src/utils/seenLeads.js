import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadSeenLeads(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveSeenLeads(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function hasBeenSeen(seenLeads, placeId) {
  return placeId in seenLeads;
}

export function markAsSeen(seenLeads, placeId, businessName) {
  seenLeads[placeId] = {
    name: businessName,
    first_seen: new Date().toISOString().split('T')[0],
    status: 'scored'
  };
}
