const MATCHES_KEY = 'hali-saha-matches-v2';
const PEOPLE_KEY = 'hali-saha-people-v1';
const EDITOR_KEY = 'hali-saha-editor-v1';
const VOTES_KEY = 'hali-saha-votes-v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadMatches() {
  const list = read(MATCHES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function saveMatches(matches) {
  write(MATCHES_KEY, matches);
}

export function upsertMatch(match) {
  const matches = loadMatches();
  const idx = matches.findIndex((m) => m.date === match.date);
  const now = new Date().toISOString();
  const next = {
    ...match,
    updatedAt: now,
    createdAt: idx >= 0 ? matches[idx].createdAt : now,
    id: idx >= 0 ? matches[idx].id : match.id || crypto.randomUUID(),
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
  saveMatches(loadMatches().filter((m) => m.date !== date));
}

export function loadPeople() {
  const list = read(PEOPLE_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function upsertPerson(person) {
  const people = loadPeople();
  const idx = people.findIndex((p) => p.id === person.id);
  const next = {
    ...person,
    id: person.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) people[idx] = { ...people[idx], ...next };
  else people.unshift(next);
  write(PEOPLE_KEY, people);
  return next;
}

export function getEditorSession() {
  return read(EDITOR_KEY, null);
}

export async function loginEditor(pin) {
  // Simple shared PIN for the group (local). Replace with Supabase Auth when cloud is enabled.
  const expected = localStorage.getItem('hali-saha-pin') || 'pazartesi';
  if (String(pin).trim() !== expected) return false;
  const session = { role: 'editor', at: Date.now() };
  write(EDITOR_KEY, session);
  return true;
}

export function logoutEditor() {
  localStorage.removeItem(EDITOR_KEY);
}

export function setGroupPin(pin) {
  localStorage.setItem('hali-saha-pin', String(pin).trim());
}

/**
 * Anonymous MOTM votes (local).
 * We store:
 *  - cast: { [matchId]: { [voterKey]: true } }  // who already voted (no candidate)
 *  - counts: { [matchId]: { [playerId]: number } }
 * Never store voter → candidate mapping.
 */
export function loadVoteState() {
  return read(VOTES_KEY, { cast: {}, counts: {} });
}

export function hasVoted(matchId, voterKey) {
  const s = loadVoteState();
  return !!(s.cast[matchId] && s.cast[matchId][voterKey]);
}

export function castAnonymousVote({ matchId, voterKey, candidateId, selfPlayerId }) {
  if (!voterKey || !candidateId || !matchId) {
    return { ok: false, error: 'Eksik bilgi' };
  }
  if (selfPlayerId && selfPlayerId === candidateId) {
    return { ok: false, error: 'Kendine oy veremezsin' };
  }
  const s = loadVoteState();
  s.cast[matchId] = s.cast[matchId] || {};
  if (s.cast[matchId][voterKey]) {
    return { ok: false, error: 'Bu maç için zaten oy kullandın' };
  }
  s.counts[matchId] = s.counts[matchId] || {};
  s.counts[matchId][candidateId] = (s.counts[matchId][candidateId] || 0) + 1;
  s.cast[matchId][voterKey] = true;
  write(VOTES_KEY, s);
  return { ok: true };
}

export function getVoteCounts(matchId) {
  const s = loadVoteState();
  return s.counts[matchId] || {};
}

/** Career goals + vote averages across matches. */
export function computeLeaderboards(matches) {
  const goals = new Map();
  const voteSum = new Map();
  const voteGames = new Map();

  for (const m of matches) {
    const counts = getVoteCounts(m.id);
    for (const team of [m.teamA, m.teamB]) {
      for (const p of team.players || []) {
        const key = p.personId || p.fullName?.trim() || p.id;
        if (!key) continue;
        const label = p.fullName?.trim() || 'İsimsiz';
        const g = goals.get(key) || { key, name: label, goals: 0, photoUrl: p.photoUrl };
        g.goals += Number(p.goals) || 0;
        if (p.fullName) g.name = p.fullName.trim();
        if (p.photoUrl) g.photoUrl = p.photoUrl;
        goals.set(key, g);

        if (counts[p.id] != null) {
          voteSum.set(key, (voteSum.get(key) || 0) + counts[p.id]);
          voteGames.set(key, (voteGames.get(key) || 0) + 1);
        }
      }
    }
  }

  const golKraligi = [...goals.values()]
    .filter((x) => x.goals > 0)
    .sort((a, b) => b.goals - a.goals);

  const oySiralamasi = [...voteSum.keys()]
    .map((key) => {
      const games = voteGames.get(key) || 1;
      const sum = voteSum.get(key) || 0;
      const g = goals.get(key);
      return {
        key,
        name: g?.name || key,
        photoUrl: g?.photoUrl,
        avg: sum / games,
        votes: sum,
        games,
      };
    })
    .sort((a, b) => b.avg - a.avg);

  return { golKraligi, oySiralamasi };
}

export function motmFromCounts(match, counts) {
  const teamPlayers = (team) => team.players || [];
  const best = (players) => {
    let top = null;
    let topVotes = -1;
    for (const p of players) {
      const v = counts[p.id] || 0;
      if (v > topVotes) {
        topVotes = v;
        top = p;
      }
    }
    return topVotes > 0 ? { player: top, votes: topVotes } : null;
  };
  const a = best(teamPlayers(match.teamA));
  const b = best(teamPlayers(match.teamB));
  let matchMotm = null;
  if (a && b) matchMotm = a.votes >= b.votes ? a : b;
  else matchMotm = a || b;
  return { teamA: a, teamB: b, match: matchMotm };
}
