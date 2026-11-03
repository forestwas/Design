import './styles.css';
import { renderPitch, collectNamesFromPitch, buildSlots } from './pitch.js';
import { loadMatches, upsertMatch, getMatchByDate, deleteMatch } from './history.js';
import { downloadShareCard } from './export.js';
import { nearestMonday, formatTrMonday, snapToMonday, shiftMonday } from './dates.js';

const DEFAULT_A = '#c8102e';
const DEFAULT_B = '#1a3a6b';

function emptyTeam(name, color) {
  return {
    name,
    color,
    gkEnabled: false,
    gkName: '',
    players: [],
  };
}

function createMatch(date = nearestMonday()) {
  return {
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
}

function ensurePlayerSlots(match) {
  const sync = (side, team) => {
    const slots = buildSlots(side, match.playerCount, team.gkEnabled).filter(
      (s) => s.role === 'outfield',
    );
    const prev = new Map((team.players || []).map((p) => [p.slot, p.name]));
    team.players = slots.map((s) => ({
      slot: s.id,
      name: prev.get(s.id) || '',
    }));
  };
  sync('A', match.teamA);
  sync('B', match.teamB);
}

let state = {
  match: createMatch(),
  toast: '',
};

function syncFromSaved() {
  const saved = getMatchByDate(state.match.date);
  if (saved) {
    state.match = structuredClone(saved);
  } else {
    const fresh = createMatch(state.match.date);
    fresh.playerCount = state.match.playerCount;
    fresh.teamA = { ...state.match.teamA, players: [], gkName: state.match.teamA.gkEnabled ? state.match.teamA.gkName : '' };
    fresh.teamB = { ...state.match.teamB, players: [], gkName: state.match.teamB.gkEnabled ? state.match.teamB.gkName : '' };
    // Keep names/colors/gk toggles when only flipping empty Mondays
    fresh.teamA.name = state.match.teamA.name;
    fresh.teamA.color = state.match.teamA.color;
    fresh.teamA.gkEnabled = state.match.teamA.gkEnabled;
    fresh.teamB.name = state.match.teamB.name;
    fresh.teamB.color = state.match.teamB.color;
    fresh.teamB.gkEnabled = state.match.teamB.gkEnabled;
    fresh.scoreA = null;
    fresh.scoreB = null;
    state.match = fresh;
  }
  ensurePlayerSlots(state.match);
}

// Boot: load nearest Monday if saved
(() => {
  const date = nearestMonday();
  const saved = getMatchByDate(date);
  state.match = saved ? structuredClone(saved) : createMatch(date);
  ensurePlayerSlots(state.match);
})();

const app = document.getElementById('app');

function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    if (state.toast === msg) {
      state.toast = '';
      const el = document.querySelector('.toast');
      if (el) el.remove();
    }
  }, 2200);
}

function readFormIntoMatch() {
  const root = app;
  const dateInput = root.querySelector('#match-date');
  if (dateInput?.value) {
    state.match.date = snapToMonday(dateInput.value);
  }
  state.match.playerCount = Number(root.querySelector('#player-count')?.value || 7);
  state.match.teamA.name = root.querySelector('#team-a-name')?.value?.trim() || 'Kırmızı';
  state.match.teamB.name = root.querySelector('#team-b-name')?.value?.trim() || 'Lacivert';
  state.match.teamA.color = root.querySelector('#team-a-color')?.value || DEFAULT_A;
  state.match.teamB.color = root.querySelector('#team-b-color')?.value || DEFAULT_B;
  state.match.teamA.gkEnabled = !!root.querySelector('#gk-a')?.checked;
  state.match.teamB.gkEnabled = !!root.querySelector('#gk-b')?.checked;

  const sa = root.querySelector('#score-a')?.value;
  const sb = root.querySelector('#score-b')?.value;
  state.match.scoreA = sa === '' || sa == null ? null : Number(sa);
  state.match.scoreB = sb === '' || sb == null ? null : Number(sb);

  const pitch = root.querySelector('#pitch-root');
  if (pitch) collectNamesFromPitch(pitch, state.match);
}

function render() {
  const m = state.match;
  const matches = loadMatches();
  const scoreLabel =
    m.scoreA != null && m.scoreB != null ? `${m.scoreA} – ${m.scoreB}` : 'vs';

  app.innerHTML = `
    <div class="page">
      <header class="topbar">
        <div>
          <p class="eyebrow">Her Pazartesi</p>
          <h1>Halı Saha Kadro</h1>
        </div>
        <div class="topbar__actions">
          <button type="button" class="btn btn--ghost" id="btn-prev-week" title="Önceki Pazartesi">‹</button>
          <button type="button" class="btn btn--ghost" id="btn-next-week" title="Sonraki Pazartesi">›</button>
          <button type="button" class="btn btn--primary" id="btn-save">Kaydet</button>
          <button type="button" class="btn btn--accent" id="btn-export">PNG İndir</button>
        </div>
      </header>

      <div class="layout">
        <aside class="panel">
          <section class="panel__block">
            <h2>Maç</h2>
            <label class="field">
              <span>Pazartesi</span>
              <input type="date" id="match-date" value="${m.date}" />
              <small>${formatTrMonday(m.date)}</small>
            </label>
            <label class="field">
              <span>Kişi sayısı (kaleci hariç)</span>
              <select id="player-count">
                <option value="6" ${m.playerCount === 6 ? 'selected' : ''}>6</option>
                <option value="7" ${m.playerCount === 7 ? 'selected' : ''}>7</option>
                <option value="8" ${m.playerCount === 8 ? 'selected' : ''}>8</option>
              </select>
            </label>
            <div class="score-row">
              <label class="field field--compact">
                <span>Skor A</span>
                <input type="number" id="score-a" min="0" max="99" value="${m.scoreA ?? ''}" placeholder="—" />
              </label>
              <span class="score-sep">:</span>
              <label class="field field--compact">
                <span>Skor B</span>
                <input type="number" id="score-b" min="0" max="99" value="${m.scoreB ?? ''}" placeholder="—" />
              </label>
            </div>
          </section>

          <section class="panel__block">
            <h2>Takım A (alt)</h2>
            <label class="field">
              <span>İsim</span>
              <input type="text" id="team-a-name" value="${escapeAttr(m.teamA.name)}" maxlength="24" />
            </label>
            <label class="field field--inline">
              <span>Renk</span>
              <input type="color" id="team-a-color" value="${m.teamA.color}" />
            </label>
            <label class="toggle">
              <input type="checkbox" id="gk-a" ${m.teamA.gkEnabled ? 'checked' : ''} />
              <span>Kaleci var (kiralanmıyor)</span>
            </label>
          </section>

          <section class="panel__block">
            <h2>Takım B (üst)</h2>
            <label class="field">
              <span>İsim</span>
              <input type="text" id="team-b-name" value="${escapeAttr(m.teamB.name)}" maxlength="24" />
            </label>
            <label class="field field--inline">
              <span>Renk</span>
              <input type="color" id="team-b-color" value="${m.teamB.color}" />
            </label>
            <label class="toggle">
              <input type="checkbox" id="gk-b" ${m.teamB.gkEnabled ? 'checked' : ''} />
              <span>Kaleci var (kiralanmıyor)</span>
            </label>
          </section>

          <section class="panel__block">
            <div class="history-head">
              <h2>Geçmiş</h2>
            </div>
            <ul class="history" id="history-list">
              ${
                matches.length === 0
                  ? '<li class="history__empty">Henüz kayıt yok</li>'
                  : matches
                      .map((item) => {
                        const active = item.date === m.date ? 'is-active' : '';
                        const sc =
                          item.scoreA != null && item.scoreB != null
                            ? `${item.scoreA}–${item.scoreB}`
                            : 'skor yok';
                        return `
                          <li>
                            <button type="button" class="history__item ${active}" data-date="${item.date}">
                              <span class="history__date">${formatTrMonday(item.date)}</span>
                              <span class="history__meta">${escapeHtml(item.teamA.name)} ${sc} ${escapeHtml(item.teamB.name)}</span>
                            </button>
                            <button type="button" class="history__del" data-delete="${item.date}" title="Sil" aria-label="Sil">×</button>
                          </li>`;
                      })
                      .join('')
              }
            </ul>
          </section>
        </aside>

        <main class="stage">
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
          <p class="hint">Oyuncu ismine tıkla ve yaz. Kartı PNG olarak indirip WhatsApp’a at.</p>
        </main>
      </div>
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ''}
    </div>
  `;

  renderPitch(document.getElementById('pitch-root'), m, { interactive: true });
  bindEvents();
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

function bindEvents() {
  const rerenderPreserve = () => {
    readFormIntoMatch();
    ensurePlayerSlots(state.match);
    render();
  };

  document.getElementById('player-count')?.addEventListener('change', rerenderPreserve);
  document.getElementById('gk-a')?.addEventListener('change', rerenderPreserve);
  document.getElementById('gk-b')?.addEventListener('change', rerenderPreserve);
  document.getElementById('team-a-color')?.addEventListener('input', rerenderPreserve);
  document.getElementById('team-b-color')?.addEventListener('input', rerenderPreserve);
  document.getElementById('team-a-name')?.addEventListener('change', rerenderPreserve);
  document.getElementById('team-b-name')?.addEventListener('change', rerenderPreserve);
  document.getElementById('score-a')?.addEventListener('change', () => {
    readFormIntoMatch();
    render();
  });
  document.getElementById('score-b')?.addEventListener('change', () => {
    readFormIntoMatch();
    render();
  });

  document.getElementById('match-date')?.addEventListener('change', (e) => {
    readFormIntoMatch();
    state.match.date = snapToMonday(e.target.value);
    syncFromSaved();
    render();
  });

  document.getElementById('btn-prev-week')?.addEventListener('click', () => {
    readFormIntoMatch();
    state.match.date = shiftMonday(state.match.date, -1);
    syncFromSaved();
    render();
  });

  document.getElementById('btn-next-week')?.addEventListener('click', () => {
    readFormIntoMatch();
    state.match.date = shiftMonday(state.match.date, 1);
    syncFromSaved();
    render();
  });

  document.getElementById('btn-save')?.addEventListener('click', () => {
    readFormIntoMatch();
    ensurePlayerSlots(state.match);
    state.match = upsertMatch(structuredClone(state.match));
    showToast('Maç kaydedildi');
  });

  document.getElementById('btn-export')?.addEventListener('click', async () => {
    readFormIntoMatch();
    ensurePlayerSlots(state.match);
    // Blank empty name plates for a cleaner WhatsApp card
    document.querySelectorAll('.player__name').forEach((el) => {
      if ((el.textContent || '').trim() === 'İsim') el.textContent = '';
    });
    try {
      const card = document.getElementById('share-card');
      await downloadShareCard(card, `hali-saha-${state.match.date}.png`);
      showToast('PNG indirildi');
    } catch (err) {
      console.error(err);
      showToast('PNG alınamadı');
    } finally {
      render();
    }
  });

  document.querySelectorAll('.history__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      const saved = getMatchByDate(date);
      if (saved) {
        state.match = structuredClone(saved);
        ensurePlayerSlots(state.match);
        render();
      }
    });
  });

  document.querySelectorAll('.history__del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const date = btn.dataset.delete;
      deleteMatch(date);
      if (state.match.date === date) {
        state.match = createMatch(date);
        ensurePlayerSlots(state.match);
      }
      showToast('Kayıt silindi');
    });
  });

  // Clear placeholder on focus
  document.querySelectorAll('.player__name[contenteditable]').forEach((el) => {
    el.addEventListener('focus', () => {
      if (el.textContent.trim() === 'İsim') el.textContent = '';
    });
    el.addEventListener('blur', () => {
      if (!el.textContent.trim()) el.textContent = 'İsim';
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
    });
  });

  // Clicking kit focuses name
  document.querySelectorAll('.player').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.player__name')) return;
      const name = btn.querySelector('.player__name');
      name?.focus();
    });
  });
}

render();
