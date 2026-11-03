/** Formation rows from own goal (bottom for teamA, mirrored for teamB). */
const FORMATIONS = {
  6: [2, 2, 2],
  7: [2, 3, 2],
  8: [3, 3, 2],
};

/**
 * Build absolute pitch positions (percent) for one team.
 * @param {'A'|'B'} side A = bottom half, B = top half
 * @param {number} playerCount
 * @param {boolean} gkEnabled
 */
export function buildSlots(side, playerCount, gkEnabled) {
  const rows = FORMATIONS[playerCount] || FORMATIONS[6];
  const slots = [];
  let index = 1;

  const halfRows = rows.length;
  // Field player Y bands within own half (0–50 top, 50–100 bottom)
  const isA = side === 'A';

  if (gkEnabled) {
    slots.push({
      id: `${side}-gk`,
      role: 'gk',
      number: 1,
      x: 50,
      y: isA ? 94 : 6,
    });
  }

  // rows[0] = defenders (closest to own GK), last = attackers (toward midfield)
  rows.forEach((count, rowIndex) => {
    const t = (rowIndex + 1) / (halfRows + 1);
    // Team A: from near own goal (high y) toward midfield (y~52)
    // Team B: from near own goal (low y) toward midfield (y~48)
    const y = isA ? 92 - t * 40 : 8 + t * 40;

    for (let i = 0; i < count; i++) {
      const x = ((i + 1) / (count + 1)) * 100;
      slots.push({
        id: `${side}-p${index}`,
        role: 'outfield',
        number: gkEnabled ? index + 1 : index,
        x,
        y,
      });
      index += 1;
    }
  });

  return slots;
}

export function pitchSvg() {
  return `
    <svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="96" height="136" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.6"/>
      <line x1="2" y1="70" x2="98" y2="70" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="70" r="10" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="70" r="0.8" fill="rgba(255,255,255,0.7)"/>
      <!-- Top penalty -->
      <rect x="22" y="2" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <rect x="34" y="2" width="32" height="10" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <path d="M 38 24 A 12 12 0 0 0 62 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
      <!-- Bottom penalty -->
      <rect x="22" y="116" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <rect x="34" y="128" width="32" height="10" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <path d="M 38 116 A 12 12 0 0 1 62 116" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
    </svg>
  `;
}

export function renderPitch(container, match, { interactive = true } = {}) {
  const slotsA = buildSlots('A', match.playerCount, match.teamA.gkEnabled);
  const slotsB = buildSlots('B', match.playerCount, match.teamB.gkEnabled);

  const nameMap = new Map();
  for (const p of match.teamA.players || []) nameMap.set(p.slot, p.name || '');
  for (const p of match.teamB.players || []) nameMap.set(p.slot, p.name || '');
  if (match.teamA.gkEnabled) nameMap.set('A-gk', match.teamA.gkName || '');
  if (match.teamB.gkEnabled) nameMap.set('B-gk', match.teamB.gkName || '');

  const playerHtml = (slot, team) => {
    const name = nameMap.get(slot.id) || '';
    const color = team.color;
    const editable = interactive
      ? `contenteditable="true" data-slot="${slot.id}" spellcheck="false"`
      : '';
    return `
      <button type="button" class="player ${slot.role === 'gk' ? 'player--gk' : ''}"
        style="left:${slot.x}%;top:${slot.y}%;--kit:${color}"
        data-slot="${slot.id}" ${interactive ? '' : 'tabindex="-1"'}>
        <span class="player__kit"><span class="player__num">${slot.number}</span></span>
        <span class="player__name" ${editable}>${escapeHtml(name) || (interactive ? 'İsim' : '')}</span>
      </button>
    `;
  };

  container.innerHTML = `
    <div class="pitch">
      ${pitchSvg()}
      <div class="pitch__players">
        ${slotsB.map((s) => playerHtml(s, match.teamB)).join('')}
        ${slotsA.map((s) => playerHtml(s, match.teamA)).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Collect player names from current pitch DOM into match object (mutates). */
export function collectNamesFromPitch(root, match) {
  const nodes = root.querySelectorAll('.player__name[data-slot]');
  const aPlayers = [];
  const bPlayers = [];

  nodes.forEach((el) => {
    const slot = el.dataset.slot;
    const name = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
    const placeholder = name === 'İsim' ? '' : name;

    if (slot === 'A-gk') {
      match.teamA.gkName = placeholder;
      return;
    }
    if (slot === 'B-gk') {
      match.teamB.gkName = placeholder;
      return;
    }
    if (slot.startsWith('A-')) {
      aPlayers.push({ slot, name: placeholder });
    } else if (slot.startsWith('B-')) {
      bPlayers.push({ slot, name: placeholder });
    }
  });

  match.teamA.players = aPlayers;
  match.teamB.players = bPlayers;
}
