/** Pitch zones per team half (percent Y on full pitch 0–100). */
export const ZONES = ['gk', 'def', 'mid', 'fwd'];

export const ZONE_LABELS = {
  gk: 'Kaleci',
  def: 'Defans',
  mid: 'Ortasaha',
  fwd: 'Forvet',
};

/** Default outfield distribution for N field players (no GK). */
const DEFAULT_OUTFIELD = {
  6: { def: 2, mid: 2, fwd: 2 },
  7: { def: 2, mid: 3, fwd: 2 },
  8: { def: 3, mid: 3, fwd: 2 },
};

export function defaultZoneCounts(playerCount, gkEnabled) {
  const base = { ...(DEFAULT_OUTFIELD[playerCount] || DEFAULT_OUTFIELD[7]) };
  return { gk: gkEnabled ? 1 : 0, ...base };
}

/** Y center for a zone on a given side. */
export function zoneY(side, zone) {
  const isA = side === 'A';
  const mapA = { gk: 94, def: 80, mid: 66, fwd: 54 };
  const mapB = { gk: 6, def: 20, mid: 34, fwd: 46 };
  return (isA ? mapA : mapB)[zone];
}

/** Which zone a pitch %Y belongs to for a side. */
export function hitTestZone(side, yPercent) {
  const isA = side === 'A';
  if (isA) {
    if (yPercent >= 88) return 'gk';
    if (yPercent >= 73) return 'def';
    if (yPercent >= 60) return 'mid';
    if (yPercent >= 50) return 'fwd';
    return null; // other half
  }
  if (yPercent <= 12) return 'gk';
  if (yPercent <= 27) return 'def';
  if (yPercent <= 40) return 'mid';
  if (yPercent <= 50) return 'fwd';
  return null;
}

export function hitTestSide(yPercent) {
  return yPercent >= 50 ? 'A' : 'B';
}

/**
 * Layout players of one team into absolute slots.
 * @param {'A'|'B'} side
 * @param {Array<{id:string,zone:string,fullName?:string,goals?:number,personId?:string,photoUrl?:string}>} players
 */
export function layoutTeam(side, players) {
  const byZone = { gk: [], def: [], mid: [], fwd: [] };
  for (const p of players) {
    const z = ZONES.includes(p.zone) ? p.zone : 'mid';
    byZone[z].push(p);
  }

  const slots = [];
  for (const zone of ZONES) {
    const list = byZone[zone];
    const y = zoneY(side, zone);
    const n = list.length;
    list.forEach((p, i) => {
      const x = n === 1 ? 50 : ((i + 1) / (n + 1)) * 100;
      slots.push({
        ...p,
        zone,
        side,
        x,
        y,
      });
    });
  }
  const hasGk = slots.some((s) => s.zone === 'gk');
  let n = hasGk ? 2 : 1;
  return slots.map((s) => {
    if (s.zone === 'gk') return { ...s, number: 1 };
    return { ...s, number: n++ };
  });
}

/** Move player into zone; redistribute. Returns new players array. */
export function movePlayerToZone(players, playerId, zone, { allowGk = true } = {}) {
  if (zone === 'gk' && !allowGk) return players;
  const next = players.map((p) => ({ ...p }));
  const target = next.find((p) => p.id === playerId);
  if (!target) return players;

  if (zone === 'gk') {
    // Only one GK: demote existing GK to def
    for (const p of next) {
      if (p.zone === 'gk' && p.id !== playerId) p.zone = 'def';
    }
  }
  target.zone = zone;
  return next;
}

export function ensureTeamPlayers(team, playerCount, side) {
  const counts = defaultZoneCounts(playerCount, team.gkEnabled);
  const existing = [...(team.players || [])];
  const byZone = { gk: [], def: [], mid: [], fwd: [] };
  for (const p of existing) {
    if (ZONES.includes(p.zone)) byZone[p.zone].push(p);
  }

  const result = [];
  for (const zone of ZONES) {
    const want = counts[zone] || 0;
    const have = byZone[zone];
    for (let i = 0; i < want; i++) {
      if (have[i]) {
        result.push({ ...have[i], zone });
      } else {
        result.push({
          id: crypto.randomUUID(),
          zone,
          fullName: '',
          goals: 0,
          personId: null,
          photoUrl: null,
        });
      }
    }
  }

  // Keep extras that overflow into mid if user had more via drag before count change
  // (playerCount is soft target for "empty" teams; drag can unbalance)
  team.players = result;
  return team;
}

/** Soft ensure: if empty, fill defaults; if already has players, keep counts from drag. */
export function syncTeamPlayers(team, playerCount) {
  if (!team.players || team.players.length === 0) {
    return ensureTeamPlayers(team, playerCount, 'A');
  }
  // Toggle GK on/off
  const hasGk = team.players.some((p) => p.zone === 'gk');
  if (team.gkEnabled && !hasGk) {
    team.players.unshift({
      id: crypto.randomUUID(),
      zone: 'gk',
      fullName: team.gkName || '',
      goals: 0,
      personId: null,
      photoUrl: null,
    });
  }
  if (!team.gkEnabled && hasGk) {
    team.players = team.players.filter((p) => p.zone !== 'gk');
  }
  return team;
}
