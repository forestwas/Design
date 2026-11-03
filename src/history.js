const STORAGE_KEY = 'hali-saha-matches';

export function loadMatches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMatches(matches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}

/** Upsert by Monday date string (YYYY-MM-DD). */
export function upsertMatch(match) {
  const matches = loadMatches();
  const idx = matches.findIndex((m) => m.date === match.date);
  const now = new Date().toISOString();
  const next = {
    ...match,
    updatedAt: now,
    createdAt: idx >= 0 ? matches[idx].createdAt : now,
    id: idx >= 0 ? matches[idx].id : crypto.randomUUID(),
  };
  if (idx >= 0) matches[idx] = next;
  else matches.unshift(next);
  matches.sort((a, b) => (a.date < b.date ? 1 : -1));
  saveMatches(matches);
  return next;
}

export function getMatchByDate(date) {
  return loadMatches().find((m) => m.date === date) || null;
}

export function deleteMatch(date) {
  const matches = loadMatches().filter((m) => m.date !== date);
  saveMatches(matches);
  return matches;
}
