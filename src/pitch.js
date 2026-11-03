import { layoutTeam, ZONE_LABELS, ZONES, zoneY, hitTestSide, hitTestZone } from './zones.js';
import { formatShortName } from './names.js';

export function pitchSvg() {
  return `
    <svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="96" height="136" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.6"/>
      <line x1="2" y1="70" x2="98" y2="70" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="70" r="10" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/>
      <circle cx="50" cy="70" r="0.8" fill="rgba(255,255,255,0.7)"/>
      <rect x="22" y="2" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <rect x="34" y="2" width="32" height="10" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <path d="M 38 24 A 12 12 0 0 0 62 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
      <rect x="22" y="116" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <rect x="34" y="128" width="32" height="10" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="0.5"/>
      <path d="M 38 116 A 12 12 0 0 1 62 116" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
    </svg>
  `;
}

function zoneBandsHtml(side) {
  return ZONES.map((z) => {
    const y = zoneY(side, z);
    return `<div class="zone-band zone-band--${side}" data-side="${side}" data-zone="${z}" style="top:${y}%" title="${ZONE_LABELS[z]}"></div>`;
  }).join('');
}

export function renderPitch(container, match, options = {}) {
  const {
    interactive = true,
    showGoals = true,
    voteCounts = {},
  } = options;

  const slotsA = layoutTeam('A', match.teamA.players || []);
  const slotsB = layoutTeam('B', match.teamB.players || []);

  const playerHtml = (slot, team) => {
    const short = formatShortName(slot.fullName) || (interactive ? 'İsim' : '');
    const goals = Number(slot.goals) || 0;
    const ball = showGoals && goals > 0 ? `<span class="player__ball" title="${goals} gol">⚽${goals > 1 ? goals : ''}</span>` : '';
    const votes = voteCounts[slot.id] || 0;
    const star = votes > 0 ? `<span class="player__votes" title="${votes} oy">★${votes}</span>` : '';
    const photo = slot.photoUrl
      ? `<img class="player__photo" src="${escapeAttr(slot.photoUrl)}" alt="" />`
      : `<span class="player__num">${slot.number}</span>`;

    return `
      <div class="player ${slot.zone === 'gk' ? 'player--gk' : ''}"
        style="left:${slot.x}%;top:${slot.y}%;--kit:${team.color}"
        data-player-id="${slot.id}"
        data-side="${slot.side}"
        data-zone="${slot.zone}"
        ${interactive ? 'data-draggable="1"' : ''}>
        <div class="player__kit">${photo}${ball}${star}</div>
        <button type="button" class="player__name" data-edit-id="${slot.id}" ${interactive ? '' : 'tabindex="-1"'}>
          ${escapeHtml(short)}
        </button>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="pitch" id="pitch-surface">
      ${pitchSvg()}
      <div class="pitch__zones" aria-hidden="true">
        ${zoneBandsHtml('B')}
        ${zoneBandsHtml('A')}
      </div>
      <div class="pitch__players">
        ${slotsB.map((s) => playerHtml(s, match.teamB)).join('')}
        ${slotsA.map((s) => playerHtml(s, match.teamA)).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("'", '&#39;');
}

/**
 * Bind pointer drag on pitch. Calls onDrop({playerId, fromSide, toSide, toZone}).
 */
export function bindPitchInteractions(root, { canEdit, onEditName, onDrop }) {
  if (!canEdit) {
    root.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => e.preventDefault());
    });
    return;
  }

  root.querySelectorAll('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onEditName?.(btn.dataset.editId);
    });
  });

  const surface = root.querySelector('#pitch-surface');
  if (!surface) return;

  let drag = null;

  const onPointerDown = (e) => {
    const el = e.target.closest('.player[data-draggable]');
    if (!el) return;
    if (e.target.closest('[data-edit-id]')) return;

    e.preventDefault();
    const rect = surface.getBoundingClientRect();
    drag = {
      el,
      playerId: el.dataset.playerId,
      fromSide: el.dataset.side,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      offsetX: 0,
      offsetY: 0,
      rect,
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  };

  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    drag.el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    drag.el.style.zIndex = '20';
  };

  const onPointerUp = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { el, playerId, fromSide, moved, rect } = drag;
    el.classList.remove('is-dragging');
    el.style.transform = '';
    el.style.zIndex = '';

    if (moved) {
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const toSide = hitTestSide(y);
      let toZone = hitTestZone(toSide, y);
      if (!toZone) toZone = hitTestZone(fromSide, y) || 'mid';
      if (toSide === fromSide) {
        onDrop?.({ playerId, fromSide, toSide, toZone, y });
      }
    }

    drag = null;
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerUp);
}
