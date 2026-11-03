import './styles.css';
import { renderPitch, bindPitchInteractions } from './pitch.js';
import { downloadShareCard } from './export.js';
import { nearestMonday, formatTrMonday, snapToMonday, shiftMonday } from './dates.js';
import { syncTeamPlayers, movePlayerToZone, ensureTeamPlayers, ZONE_LABELS } from './zones.js';
import { formatShortName } from './names.js';
import {
  loadMatches,
  upsertMatch,
  getMatchByDate,
  deleteMatch,
  loadPeople,
  upsertPerson,
  getEditorSession,
  loginEditor,
  logoutEditor,
  castAnonymousVote,
  hasVoted,
  getVoteCounts,
  computeLeaderboards,
  motmFromCounts,
} from './store.js';

const DEFAULT_A = '#c8102e';
const DEFAULT_B = '#1a3a6b';

function emptyTeam(name, color) {
  return {
    name,
    color,
    gkEnabled: false,
    players: [],
  };
}

function createMatch(date = nearestMonday()) {
  const m = {
    id: crypto.randomUUID(),
    date,
    playerCount: 7,
    teamA: emptyTeam('Kırmızı', DEFAULT_A),
    teamB: emptyTeam('Lacivert', DEFAULT_B),
    scoreA: null,
    scoreB: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  syncTeamPlayers(m.teamA, m.playerCount);
  syncTeamPlayers(m.teamB, m.playerCount);
  return m;
}

function prepareMatch(m) {
  syncTeamPlayers(m.teamA, m.playerCount);
  syncTeamPlayers(m.teamB, m.playerCount);
  return m;
}

const params = new URLSearchParams(location.search);
const readonlyShare = params.get('view') === 'share';

let state = {
  match: prepareMatch(getMatchByDate(nearestMonday()) || createMatch()),
  toast: '',
  tab: 'mac', // mac | gecmis | lig | oy
  modal: null, // { type: 'name'|'login'|'vote'|'person', ... }
  editor: getEditorSession(),
};

const canEdit = () => !readonlyShare && !!state.editor;

const app = document.getElementById('app');

function showToast(msg) {
  state.toast = msg;
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function findPlayer(id) {
  for (const side of ['teamA', 'teamB']) {
    const p = state.match[side].players.find((x) => x.id === id);
    if (p) return { player: p, side };
  }
  return null;
}

function openNameModal(playerId) {
  if (!canEdit()) return;
  const found = findPlayer(playerId);
  if (!found) return;
  state.modal = {
    type: 'name',
    playerId,
    fullName: found.player.fullName || '',
    goals: found.player.goals || 0,
    personId: found.player.personId || '',
  };
  render();
}

function render() {
  const m = state.match;
  const matches = loadMatches();
  const votes = getVoteCounts(m.id);
  const motm = motmFromCounts(m, votes);
  const boards = computeLeaderboards(matches);
  const people = loadPeople();
  const editing = canEdit();
  const scoreLabel =
    m.scoreA != null && m.scoreB != null ? `${m.scoreA} – ${m.scoreB}` : 'vs';

  app.innerHTML = `
    <div class="page ${readonlyShare ? 'page--share' : ''}">
      <header class="topbar">
        <div>
          <p class="eyebrow">Her Pazartesi</p>
          <h1>Halı Saha</h1>
        </div>
        <div class="topbar__actions">
          ${
            readonlyShare
              ? '<span class="badge">Salt okunur</span>'
              : editing
                ? `<button type="button" class="btn btn--ghost" id="btn-logout">Çıkış</button>`
                : `<button type="button" class="btn btn--primary" id="btn-login">Giriş</button>`
          }
          <button type="button" class="btn btn--accent" id="btn-export">PNG</button>
        </div>
      </header>

      ${
        readonlyShare
          ? ''
          : `<nav class="tabs">
        <button type="button" class="tab ${state.tab === 'mac' ? 'is-active' : ''}" data-tab="mac">Maç</button>
        <button type="button" class="tab ${state.tab === 'gecmis' ? 'is-active' : ''}" data-tab="gecmis">Geçmiş</button>
        <button type="button" class="tab ${state.tab === 'lig' ? 'is-active' : ''}" data-tab="lig">Krallık</button>
        <button type="button" class="tab ${state.tab === 'oy' ? 'is-active' : ''}" data-tab="oy">Oy</button>
      </nav>`
      }

      <div class="layout">
        ${
          state.tab === 'mac' || readonlyShare
            ? `
        <aside class="panel ${editing ? '' : 'panel--readonly'}">
          <section class="panel__block">
            <div class="week-nav">
              <button type="button" class="btn btn--ghost" id="btn-prev" ${editing || readonlyShare ? '' : ''}>‹</button>
              <div class="week-nav__label">
                <input type="date" id="match-date" value="${m.date}" ${editing ? '' : 'disabled'} />
                <small>${formatTrMonday(m.date)}</small>
              </div>
              <button type="button" class="btn btn--ghost" id="btn-next">›</button>
            </div>
            <label class="field">
              <span>Kişi (kaleci hariç)</span>
              <select id="player-count" ${editing ? '' : 'disabled'}>
                <option value="6" ${m.playerCount === 6 ? 'selected' : ''}>6</option>
                <option value="7" ${m.playerCount === 7 ? 'selected' : ''}>7</option>
                <option value="8" ${m.playerCount === 8 ? 'selected' : ''}>8</option>
              </select>
            </label>
            <div class="score-row">
              <label class="field field--compact">
                <span>Skor A</span>
                <input type="number" id="score-a" min="0" max="99" value="${m.scoreA ?? ''}" ${editing ? '' : 'disabled'} />
              </label>
              <span class="score-sep">:</span>
              <label class="field field--compact">
                <span>Skor B</span>
                <input type="number" id="score-b" min="0" max="99" value="${m.scoreB ?? ''}" ${editing ? '' : 'disabled'} />
              </label>
            </div>
          </section>

          <section class="panel__block">
            <h2>Takım A · alt</h2>
            <label class="field"><span>İsim</span>
              <input type="text" id="team-a-name" value="${escapeAttr(m.teamA.name)}" ${editing ? '' : 'disabled'} /></label>
            <label class="field field--inline"><span>Renk</span>
              <input type="color" id="team-a-color" value="${m.teamA.color}" ${editing ? '' : 'disabled'} /></label>
            <label class="toggle"><input type="checkbox" id="gk-a" ${m.teamA.gkEnabled ? 'checked' : ''} ${editing ? '' : 'disabled'} />
              <span>Kaleci var</span></label>
          </section>

          <section class="panel__block">
            <h2>Takım B · üst</h2>
            <label class="field"><span>İsim</span>
              <input type="text" id="team-b-name" value="${escapeAttr(m.teamB.name)}" ${editing ? '' : 'disabled'} /></label>
            <label class="field field--inline"><span>Renk</span>
              <input type="color" id="team-b-color" value="${m.teamB.color}" ${editing ? '' : 'disabled'} /></label>
            <label class="toggle"><input type="checkbox" id="gk-b" ${m.teamB.gkEnabled ? 'checked' : ''} ${editing ? '' : 'disabled'} />
              <span>Kaleci var</span></label>
          </section>

          ${
            editing
              ? `<div class="panel__actions">
                  <button type="button" class="btn btn--primary btn--block" id="btn-save">Kaydet</button>
                  <button type="button" class="btn btn--ghost btn--block" id="btn-share-link">Paylaşım linki</button>
                </div>
                <p class="hint-inline">Yuvarlağı sürükle → Kaleci / Defans / Ortasaha / Forvet. İsme dokun → düzenle.</p>`
              : `<p class="hint-inline">Düzenlemek için giriş yap. Paylaşılan link salt okunur.</p>`
          }

          ${
            motm.match
              ? `<section class="panel__block motm-card">
                  <h2>Maçın Oyuncusu</h2>
                  <p class="motm-name">${escapeHtml(formatShortName(motm.match.player.fullName) || '—')} · ${motm.match.votes} oy</p>
                  <p class="motm-sub">A: ${motm.teamA ? escapeHtml(formatShortName(motm.teamA.player.fullName)) : '—'} · B: ${motm.teamB ? escapeHtml(formatShortName(motm.teamB.player.fullName)) : '—'}</p>
                </section>`
              : ''
          }
        </aside>`
            : ''
        }

        ${
          state.tab === 'mac' || readonlyShare
            ? `<main class="stage">
          <div id="share-card" class="share-card">
            <div class="share-card__header">
              <div class="share-card__brand">HALI SAHA</div>
              <div class="share-card__date">${formatTrMonday(m.date)}</div>
            </div>
            <div class="share-card__scoreboard">
              <div class="team-tag" style="--kit:${m.teamA.color}">
                <span class="team-tag__dot"></span>
                <span class="team-tag__name">${escapeHtml(m.teamA.name)}</span>
              </div>
              <div class="scoreboard__score">${scoreLabel}</div>
              <div class="team-tag team-tag--right" style="--kit:${m.teamB.color}">
                <span class="team-tag__name">${escapeHtml(m.teamB.name)}</span>
                <span class="team-tag__dot"></span>
              </div>
            </div>
            <div class="share-card__meta">${m.playerCount}v${m.playerCount}${m.teamA.gkEnabled || m.teamB.gkEnabled ? ' · GK' : ''}</div>
            <div id="pitch-root"></div>
            <div class="share-card__footer">Kadrolar · WhatsApp</div>
          </div>
        </main>`
            : ''
        }

        ${
          state.tab === 'gecmis'
            ? `<section class="sheet">
              <h2>Geçmiş maçlar</h2>
              <ul class="history">
                ${
                  matches.length === 0
                    ? '<li class="history__empty">Henüz kayıt yok</li>'
                    : matches
                        .map((item) => {
                          const sc =
                            item.scoreA != null && item.scoreB != null
                              ? `${item.scoreA}–${item.scoreB}`
                              : 'skor yok';
                          const scorers = [...(item.teamA.players || []), ...(item.teamB.players || [])]
                            .filter((p) => (p.goals || 0) > 0)
                            .map((p) => `${formatShortName(p.fullName)} ⚽${p.goals}`)
                            .join(' · ');
                          return `<li class="history-row">
                            <button type="button" class="history__item" data-date="${item.date}">
                              <span class="history__date">${formatTrMonday(item.date)}</span>
                              <span class="history__meta">${escapeHtml(item.teamA.name)} ${sc} ${escapeHtml(item.teamB.name)}</span>
                              ${scorers ? `<span class="history__goals">${escapeHtml(scorers)}</span>` : ''}
                            </button>
                            ${editing ? `<button type="button" class="history__del" data-delete="${item.date}">×</button>` : ''}
                          </li>`;
                        })
                        .join('')
                }
              </ul>
            </section>`
            : ''
        }

        ${
          state.tab === 'lig'
            ? `<section class="sheet">
              <h2>Gol krallığı</h2>
              <ol class="board">
                ${
                  boards.golKraligi.length === 0
                    ? '<li class="history__empty">Gol kaydı yok</li>'
                    : boards.golKraligi
                        .slice(0, 20)
                        .map(
                          (r, i) =>
                            `<li><span class="board__rank">${i + 1}</span><span class="board__name">${escapeHtml(formatShortName(r.name))}</span><span class="board__stat">⚽ ${r.goals}</span></li>`,
                        )
                        .join('')
                }
              </ol>
              <h2>Oy ortalaması</h2>
              <ol class="board">
                ${
                  boards.oySiralamasi.length === 0
                    ? '<li class="history__empty">Oy yok</li>'
                    : boards.oySiralamasi
                        .slice(0, 20)
                        .map(
                          (r, i) =>
                            `<li><span class="board__rank">${i + 1}</span><span class="board__name">${escapeHtml(formatShortName(r.name))}</span><span class="board__stat">★ ${r.avg.toFixed(2)}</span></li>`,
                        )
                        .join('')
                }
              </ol>
            </section>`
            : ''
        }

        ${
          state.tab === 'oy'
            ? `<section class="sheet">
              <h2>Maçın adamı oyu</h2>
              <p class="hint-inline">Oylar anonim. Kim kime oy verdi saklanmaz. Kendine oy yok.</p>
              <label class="field"><span>Sen kimsin? (oy kullanan)</span>
                <select id="voter-select">
                  <option value="">Seç…</option>
                  ${[...(m.teamA.players || []), ...(m.teamB.players || [])]
                    .filter((p) => p.fullName?.trim())
                    .map(
                      (p) =>
                        `<option value="${p.id}">${escapeHtml(p.fullName)}</option>`,
                    )
                    .join('')}
                </select>
              </label>
              <label class="field"><span>Kime oy?</span>
                <select id="candidate-select">
                  <option value="">Seç…</option>
                  ${[...(m.teamA.players || []), ...(m.teamB.players || [])]
                    .filter((p) => p.fullName?.trim())
                    .map((p) => `<option value="${p.id}">${escapeHtml(p.fullName)}</option>`)
                    .join('')}
                </select>
              </label>
              <button type="button" class="btn btn--accent btn--block" id="btn-cast-vote">Oyunu kullan</button>
              <h3 class="subhead">Bu maç oyları (sadece toplam)</h3>
              <ul class="board">
                ${
                  Object.keys(votes).length === 0
                    ? '<li class="history__empty">Henüz oy yok</li>'
                    : Object.entries(votes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([id, c]) => {
                          const f = findPlayer(id);
                          const name = f?.player.fullName || id;
                          return `<li><span class="board__name">${escapeHtml(formatShortName(name))}</span><span class="board__stat">★ ${c}</span></li>`;
                        })
                        .join('')
                }
              </ul>
              ${people.length ? `<p class="hint-inline">Kayıtlı kişi: ${people.length}</p>` : ''}
            </section>`
            : ''
        }
      </div>
    </div>
    ${renderModal()}
  `;

  if (state.tab === 'mac' || readonlyShare) {
    const pitchRoot = document.getElementById('pitch-root');
    renderPitch(pitchRoot, m, {
      interactive: editing,
      showGoals: true,
      voteCounts: votes,
    });
    bindPitchInteractions(pitchRoot, {
      canEdit: editing,
      onEditName: openNameModal,
      onDrop: ({ playerId, fromSide, toZone }) => {
        const teamKey = fromSide === 'A' ? 'teamA' : 'teamB';
        const team = state.match[teamKey];
        team.players = movePlayerToZone(team.players, playerId, toZone, {
          allowGk: team.gkEnabled,
        });
        // If dropped to gk while disabled, ignore handled in movePlayerToZone
        showToast(`${ZONE_LABELS[toZone]} · yerleşti`);
        render();
      },
    });
  }

  bindGlobal();
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'login') {
    return `<div class="modal"><div class="modal__card">
      <h2>Editör girişi</h2>
      <p class="hint-inline">Grup PIN (varsayılan: <code>pazartesi</code>)</p>
      <label class="field"><span>PIN</span><input type="password" id="login-pin" autocomplete="current-password" /></label>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" id="modal-cancel">Vazgeç</button>
        <button type="button" class="btn btn--primary" id="modal-login">Giriş</button>
      </div>
    </div></div>`;
  }
  if (state.modal.type === 'name') {
    const people = loadPeople();
    return `<div class="modal"><div class="modal__card">
      <h2>Oyuncu</h2>
      <label class="field"><span>Ad Soyad</span>
        <input type="text" id="edit-fullname" value="${escapeAttr(state.modal.fullName)}" placeholder="Ahmet Yılmaz" /></label>
      <label class="field"><span>Gol (bu maç)</span>
        <input type="number" id="edit-goals" min="0" max="20" value="${state.modal.goals}" /></label>
      <label class="field"><span>Kayıtlı kişilerden seç</span>
        <select id="edit-person">
          <option value="">—</option>
          ${people.map((p) => `<option value="${p.id}" ${state.modal.personId === p.id ? 'selected' : ''}>${escapeHtml(p.fullName)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Foto (opsiyonel)</span>
        <input type="file" id="edit-photo" accept="image/*" /></label>
      <label class="toggle"><input type="checkbox" id="edit-save-person" checked />
        <span>Kişiyi kaydet (sonradan seçmek için)</span></label>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" id="modal-cancel">Vazgeç</button>
        <button type="button" class="btn btn--primary" id="modal-save-name">Tamam</button>
      </div>
    </div></div>`;
  }
  return '';
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

function readForm() {
  const dateEl = document.getElementById('match-date');
  if (dateEl?.value) state.match.date = snapToMonday(dateEl.value);
  const pc = document.getElementById('player-count');
  if (pc) {
    const next = Number(pc.value);
    if (next !== state.match.playerCount) {
      state.match.playerCount = next;
      ensureTeamPlayers(state.match.teamA, next, 'A');
      ensureTeamPlayers(state.match.teamB, next, 'B');
    }
  }
  const aName = document.getElementById('team-a-name');
  const bName = document.getElementById('team-b-name');
  if (aName) state.match.teamA.name = aName.value.trim() || 'Kırmızı';
  if (bName) state.match.teamB.name = bName.value.trim() || 'Lacivert';
  const aColor = document.getElementById('team-a-color');
  const bColor = document.getElementById('team-b-color');
  if (aColor) state.match.teamA.color = aColor.value;
  if (bColor) state.match.teamB.color = bColor.value;
  const gkA = document.getElementById('gk-a');
  const gkB = document.getElementById('gk-b');
  if (gkA) state.match.teamA.gkEnabled = gkA.checked;
  if (gkB) state.match.teamB.gkEnabled = gkB.checked;
  const sa = document.getElementById('score-a');
  const sb = document.getElementById('score-b');
  if (sa) state.match.scoreA = sa.value === '' ? null : Number(sa.value);
  if (sb) state.match.scoreB = sb.value === '' ? null : Number(sb.value);
  prepareMatch(state.match);
}

function bindGlobal() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById('btn-login')?.addEventListener('click', () => {
    state.modal = { type: 'login' };
    render();
  });
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    logoutEditor();
    state.editor = null;
    showToast('Çıkış yapıldı');
    render();
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    state.modal = null;
    render();
  });
  document.getElementById('modal-login')?.addEventListener('click', async () => {
    const pin = document.getElementById('login-pin')?.value || '';
    const ok = await loginEditor(pin);
    if (!ok) {
      showToast('PIN hatalı');
      return;
    }
    state.editor = getEditorSession();
    state.modal = null;
    showToast('Editör olarak giriş yapıldı');
    render();
  });

  document.getElementById('modal-save-name')?.addEventListener('click', async () => {
    const id = state.modal.playerId;
    const found = findPlayer(id);
    if (!found) return;
    let fullName = document.getElementById('edit-fullname')?.value?.trim() || '';
    const goals = Number(document.getElementById('edit-goals')?.value || 0);
    const personId = document.getElementById('edit-person')?.value || '';
    const savePerson = document.getElementById('edit-save-person')?.checked;
    const file = document.getElementById('edit-photo')?.files?.[0];

    if (personId) {
      const people = loadPeople();
      const person = people.find((p) => p.id === personId);
      if (person) {
        fullName = person.fullName;
        found.player.photoUrl = person.photoUrl || found.player.photoUrl;
        found.player.personId = person.id;
      }
    }

    found.player.fullName = fullName;
    found.player.goals = goals;

    if (file) {
      const dataUrl = await readFileAsDataUrl(file, 160);
      found.player.photoUrl = dataUrl;
    }

    if (savePerson && fullName) {
      const person = upsertPerson({
        id: found.player.personId || crypto.randomUUID(),
        fullName,
        photoUrl: found.player.photoUrl || null,
      });
      found.player.personId = person.id;
    }

    state.modal = null;
    render();
  });

  document.getElementById('edit-person')?.addEventListener('change', (e) => {
    const people = loadPeople();
    const person = people.find((p) => p.id === e.target.value);
    if (person) {
      const nameInput = document.getElementById('edit-fullname');
      if (nameInput) nameInput.value = person.fullName;
    }
  });

  const rerender = () => {
    if (!canEdit()) return;
    readForm();
    render();
  };

  document.getElementById('player-count')?.addEventListener('change', rerender);
  document.getElementById('gk-a')?.addEventListener('change', rerender);
  document.getElementById('gk-b')?.addEventListener('change', rerender);
  document.getElementById('team-a-color')?.addEventListener('input', rerender);
  document.getElementById('team-b-color')?.addEventListener('input', rerender);
  document.getElementById('team-a-name')?.addEventListener('change', rerender);
  document.getElementById('team-b-name')?.addEventListener('change', rerender);
  document.getElementById('score-a')?.addEventListener('change', rerender);
  document.getElementById('score-b')?.addEventListener('change', rerender);

  document.getElementById('match-date')?.addEventListener('change', (e) => {
    if (!canEdit()) return;
    readForm();
    state.match.date = snapToMonday(e.target.value);
    const saved = getMatchByDate(state.match.date);
    state.match = saved ? prepareMatch(structuredClone(saved)) : prepareMatch(createMatch(state.match.date));
    render();
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    const date = shiftMonday(state.match.date, -1);
    const saved = getMatchByDate(date);
    state.match = saved ? prepareMatch(structuredClone(saved)) : prepareMatch(createMatch(date));
    render();
  });
  document.getElementById('btn-next')?.addEventListener('click', () => {
    const date = shiftMonday(state.match.date, 1);
    const saved = getMatchByDate(date);
    state.match = saved ? prepareMatch(structuredClone(saved)) : prepareMatch(createMatch(date));
    render();
  });

  document.getElementById('btn-save')?.addEventListener('click', () => {
    if (!canEdit()) return;
    readForm();
    state.match = upsertMatch(structuredClone(state.match));
    showToast('Maç kaydedildi');
    render();
  });

  document.getElementById('btn-share-link')?.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?view=share`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Salt okunur link kopyalandı');
    } catch {
      prompt('Paylaşım linki:', url);
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', async () => {
    try {
      await downloadShareCard(
        document.getElementById('share-card') || document.querySelector('.share-card'),
        `hali-saha-${state.match.date}.png`,
      );
      showToast('PNG indirildi');
    } catch (err) {
      console.error(err);
      // If not on mac tab, switch briefly
      state.tab = 'mac';
      render();
      requestAnimationFrame(async () => {
        try {
          await downloadShareCard(document.getElementById('share-card'), `hali-saha-${state.match.date}.png`);
          showToast('PNG indirildi');
        } catch (e2) {
          showToast('PNG alınamadı');
        }
      });
    }
  });

  document.querySelectorAll('.history__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const saved = getMatchByDate(btn.dataset.date);
      if (saved) {
        state.match = prepareMatch(structuredClone(saved));
        state.tab = 'mac';
        render();
      }
    });
  });
  document.querySelectorAll('.history__del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMatch(btn.dataset.delete);
      if (state.match.date === btn.dataset.delete) {
        state.match = prepareMatch(createMatch(btn.dataset.delete));
      }
      showToast('Silindi');
      render();
    });
  });

  document.getElementById('btn-cast-vote')?.addEventListener('click', () => {
    const voterKey = document.getElementById('voter-select')?.value;
    const candidateId = document.getElementById('candidate-select')?.value;
    if (!voterKey || !candidateId) {
      showToast('Seçimleri doldur');
      return;
    }
    if (hasVoted(state.match.id, voterKey)) {
      showToast('Bu maç için zaten oy kullandın');
      return;
    }
    const res = castAnonymousVote({
      matchId: state.match.id,
      voterKey,
      candidateId,
      selfPlayerId: voterKey,
    });
    showToast(res.ok ? 'Oy kaydedildi (anonim)' : res.error);
    render();
  });
}

function readFileAsDataUrl(file, maxSide = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Boot: migrate v1 matches lightly if present
(() => {
  try {
    const v1 = JSON.parse(localStorage.getItem('hali-saha-matches') || 'null');
    if (Array.isArray(v1) && v1.length && loadMatches().length === 0) {
      // skip complex migrate — user starts fresh on v2
    }
  } catch {
    /* ignore */
  }
})();

render();
