const $ = s => document.querySelector(s);
const cardTpl = $('#card-tpl').content.firstElementChild;

let role = null;
let snapshot = null;
let selected = [];

// --- Network ---

async function send(type, payload = {}) {
  await fetch('/api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, role, ...payload }),
  });
  await loadState();
}

async function loadState() {
  const r = await fetch(`/api/state?role=${role}`);
  snapshot = await r.json();
  render();
}

async function init() {
  try {
    const r = await fetch('/api/info');
    const { ip, port } = await r.json();
    $('#connect-url').textContent = `Other devices: http://${ip}:${port}`;
  } catch {
    $('#connect-url').textContent = '';
  }
}

// --- Join ---

$('#join-btn').onclick = async () => {
  role = $('#seat').value;
  selected = [];
  $('#join-screen').classList.add('hidden');
  $('#game').classList.remove('hidden');
  await loadState();
  setInterval(loadState, 1500);
};

// --- Card helper ---

function makeCard(c, i, selectable, isSelected) {
  const b = cardTpl.cloneNode(true);
  if (!c.rank) {
    b.classList.add('back');
  } else {
    b.textContent = c.rank + c.suit;
    if (c.suit === '♥' || c.suit === '♦') b.classList.add('red');
  }
  if (isSelected) b.classList.add('selected');
  b.disabled = !selectable;
  if (selectable) {
    b.onclick = () => {
      const z = snapshot[role].activeZone;
      if (z === 'faceDown') {
        selected = [i];
      } else {
        selected = selected.includes(i)
          ? selected.filter(x => x !== i)
          : [...selected, i];
      }
      render();
    };
  }
  return b;
}

// --- Player view ---

function renderPlayerView() {
  const me = snapshot[role];
  const isMyTurn = snapshot.currentPlayer === role && !snapshot.winner;
  const z = me.activeZone;
  const cards = me[z];

  // Determine if we need to show a 7 mode picker
  // (only relevant when playing a 7 and it's your turn)
  const has7Selected = selected.some(i => cards[i] && cards[i].rank === '7');

  $('#game').innerHTML = `
    <p class="status-line">${snapshot.status}</p>
    <div id="card-area" class="card-area"></div>
    ${has7Selected ? `
      <div class="seven-picker">
        7 mode:
        <button id="play-high">High (next must be ≥7)</button>
        <button id="play-low">Low (next must be ≤7)</button>
      </div>
    ` : `
      <div class="controls">
        <button id="play-btn"${!isMyTurn || !selected.length ? ' disabled' : ''}>Play Selected</button>
        <button id="pickup-btn"${!isMyTurn ? ' disabled' : ''}>Pick Up Pile</button>
      </div>
    `}
  `;

  cards.forEach((c, i) => {
    $('#card-area').appendChild(makeCard(c, i, isMyTurn, selected.includes(i)));
  });

  if (has7Selected) {
    $('#play-high').onclick = () => send('play', { selected, sevenMode: 'high' });
    $('#play-low').onclick = () => send('play', { selected, sevenMode: 'low' });
  } else {
    if ($('#play-btn')) $('#play-btn').onclick = () => send('play', { selected });
    if ($('#pickup-btn')) $('#pickup-btn').onclick = () => send('pickup');
  }
}

// --- Spectator view ---

function renderSpectatorView() {
  const { p1, p2, discardPile, drawCount, burnCount, status, currentPlayer, winner } = snapshot;

  $('#game').innerHTML = `
    <div class="spectator-layout">
      <div class="spec-player">
        <h2>${p1.name}${currentPlayer === 'p1' && !winner ? ' ▶' : ''}</h2>
        <div class="spec-hand-count">Hand: ${p1.handCount} card${p1.handCount !== 1 ? 's' : ''}</div>
        <div class="spec-zones">
          <div>
            <div class="label">Face Up</div>
            <div class="cards" id="fu1"></div>
          </div>
          <div>
            <div class="label">Face Down</div>
            <div class="cards" id="fd1"></div>
          </div>
        </div>
      </div>

      <div class="spec-center">
        <p class="status-line">${status}</p>
        <div class="piles">
          <div class="pile">
            <div class="label">Draw</div>
            <div class="pile-count">${drawCount}</div>
          </div>
          <div class="pile">
            <div class="label">Discard</div>
            <div class="cards" id="discard-pile"></div>
          </div>
          <div class="pile">
            <div class="label">Burned</div>
            <div class="pile-count">${burnCount}</div>
          </div>
        </div>
        <div class="controls">
          <button id="new-game-btn">New Game</button>
        </div>
      </div>

      <div class="spec-player">
        <h2>${p2.name}${currentPlayer === 'p2' && !winner ? ' ▶' : ''}</h2>
        <div class="spec-hand-count">Hand: ${p2.handCount} card${p2.handCount !== 1 ? 's' : ''}</div>
        <div class="spec-zones">
          <div>
            <div class="label">Face Up</div>
            <div class="cards" id="fu2"></div>
          </div>
          <div>
            <div class="label">Face Down</div>
            <div class="cards" id="fd2"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  p1.faceUp.forEach(c => $('#fu1').appendChild(makeCard(c, -1, false, false)));
  p1.faceDown.forEach(() => $('#fd1').appendChild(makeCard({ rank: '', suit: '' }, -1, false, false)));
  p2.faceUp.forEach(c => $('#fu2').appendChild(makeCard(c, -1, false, false)));
  p2.faceDown.forEach(() => $('#fd2').appendChild(makeCard({ rank: '', suit: '' }, -1, false, false)));
  discardPile.slice(-5).forEach(c => $('#discard-pile').appendChild(makeCard(c, -1, false, false)));

  $('#new-game-btn').onclick = () => { selected = []; send('new_game'); };
}

// --- Render dispatcher ---

function render() {
  if (!snapshot) return;
  if (role === 'spectator') renderSpectatorView();
  else renderPlayerView();
}

init();
