const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const state = {
  players: [createPlayer("Player 1"), createPlayer("Player 2")],
  drawPile: [],
  discardPile: [],
  burned: [],
  currentPlayer: 0,
  selected: [],
  pending7Mode: null,
  last7Constraint: null, // "high" or "low"
  pendingAValue: null,
  winner: null,
};

function createPlayer(name) {
  return { name, hand: [], faceUp: [], faceDown: [] };
}

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r, id: crypto.randomUUID() });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function init() {
  state.drawPile = makeDeck();
  for (const p of state.players) {
    p.faceDown = state.drawPile.splice(0, 3);
    p.faceUp = state.drawPile.splice(0, 3);
    p.hand = state.drawPile.splice(0, 3);
  }
  render();
}

function activeZone(player) {
  if (player.hand.length) return "hand";
  if (player.faceUp.length) return "faceUp";
  return "faceDown";
}

function isMagic(rank) {
  return ["A", "2", "3", "7", "10"].includes(rank);
}

function effectiveTopRank() {
  for (let i = state.discardPile.length - 1; i >= 0; i--) {
    const c = state.discardPile[i];
    if (c.rank !== "3") return c.asRank ?? c.rank;
  }
  return null;
}

function checkPlayable(cards) {
  const top = effectiveTopRank();
  if (!top) return { ok: true };

  const allMagic = cards.every((c) => isMagic(c.rank));
  if (allMagic) return { ok: true };

  const nonMagic = cards.filter((c) => !isMagic(c.rank));
  if (!nonMagic.length) return { ok: true };

  const vals = nonMagic.map((c) => VALUE[c.rank]).sort((a, b) => a - b);
  const min = vals[0], max = vals[vals.length - 1];

  let targetTop = VALUE[top];
  if (state.last7Constraint === "low") {
    if (max > 7) return { ok: false, reason: "7 low active: must play 7 or lower." };
    return { ok: true };
  }
  if (state.last7Constraint === "high") {
    if (min < 7) return { ok: false, reason: "7 high active: must play 7 or higher." };
  }

  if (min >= targetTop) return { ok: true };
  return { ok: false, reason: `Need ${top} or higher.` };
}

function isValidCombo(cards) {
  if (!cards.length) return { ok: false, reason: "No cards selected." };
  const ranks = cards.map((c) => c.rank);
  const nonMagic = cards.filter((c) => !isMagic(c.rank));

  if (cards.length === 1) return { ok: true };

  if (new Set(ranks).size === 1) return { ok: true };

  if (cards.length >= 3) {
    if (!nonMagic.length) return { ok: true };
    const vals = [...new Set(nonMagic.map((c) => VALUE[c.rank]))].sort((a, b) => a - b);
    const straight = vals.every((v, i) => i === 0 || v === vals[i - 1] + 1);
    if (straight) return { ok: true };
  }

  return { ok: false, reason: "Play same rank or straight of 3+ (magic can be included)." };
}

function takeFromZone(player, idxs) {
  const zone = activeZone(player);
  if (zone === "faceDown") {
    if (idxs.length !== 1) return { cards: [], zone, reason: "Face-down turn: play one random card by clicking it." };
    const [i] = idxs;
    const card = player.faceDown.splice(i, 1)[0];
    return { cards: [card], zone };
  }
  const src = player[zone];
  idxs.sort((a, b) => b - a);
  const cards = idxs.map((i) => src.splice(i, 1)[0]);
  return { cards, zone };
}

function maybeBurnByFourOfKind() {
  const meaningful = state.discardPile.filter((c) => c.rank !== "3");
  if (meaningful.length < 4) return false;
  const last4 = meaningful.slice(-4).map((c) => c.asRank ?? c.rank);
  return new Set(last4).size === 1;
}

function refillHand(player) {
  while (player.hand.length < 3 && state.drawPile.length) player.hand.push(state.drawPile.shift());
}

function playSelected() {
  if (state.winner) return;
  const p = state.players[state.currentPlayer];
  const idxs = state.selected;
  const snapshot = JSON.parse(JSON.stringify(p));

  const picked = takeFromZone(p, [...idxs]);
  if (picked.reason) return alert(picked.reason);
  const cards = picked.cards;

  if (!cards.length) return;

  const combo = isValidCombo(cards);
  if (!combo.ok) {
    Object.assign(p, snapshot);
    return alert(combo.reason);
  }
  const playable = checkPlayable(cards);
  if (!playable.ok) {
    if (picked.zone === "faceDown") {
      p.hand.push(...state.discardPile.splice(0), ...cards);
    } else {
      Object.assign(p, snapshot);
      p.hand.push(...state.discardPile.splice(0));
    }
    state.selected = [];
    return render(playable.reason + " Picked up pile.");
  }

  for (const c of cards) {
    if (c.rank === "A") {
      const choice = prompt("A is wild. Choose rank (2-10,J,Q,K,A):", "A") || "A";
      c.asRank = RANKS.includes(choice) ? choice : "A";
    }
    if (c.rank === "7") {
      const mode = prompt("7 mode? type 'high' or 'low'", "low");
      state.last7Constraint = mode === "high" ? "high" : "low";
    }
    state.discardPile.push(c);
  }

  if (cards.some((c) => c.rank === "2")) state.last7Constraint = null;

  let burned = false;
  if (cards.some((c) => c.rank === "10") || maybeBurnByFourOfKind()) {
    state.burned.push(...state.discardPile.splice(0));
    state.last7Constraint = null;
    burned = true;
  }

  refillHand(p);
  state.selected = [];

  if (!p.hand.length && !p.faceUp.length && !p.faceDown.length) {
    state.winner = p.name;
    return render(`${p.name} wins!`);
  }

  if (!burned) state.currentPlayer = (state.currentPlayer + 1) % 2;
  render(burned ? "Pile burned. Same player goes again." : undefined);
}

function pickupPile() {
  const p = state.players[state.currentPlayer];
  p.hand.push(...state.discardPile.splice(0));
  state.selected = [];
  state.currentPlayer = (state.currentPlayer + 1) % 2;
  render(`${p.name} picked up the pile.`);
}

function endTurn() {
  state.selected = [];
  state.currentPlayer = (state.currentPlayer + 1) % 2;
  render();
}

function render(msg) {
  document.getElementById("status").textContent = msg || (state.winner ? `Winner: ${state.winner}` : `${state.players[state.currentPlayer].name}'s turn`);
  document.getElementById("draw-count").textContent = `${state.drawPile.length} cards`;
  document.getElementById("discard").textContent = state.discardPile.map(showCard).join(" ");
  document.getElementById("burned").textContent = `${state.burned.length} cards burned`;

  state.players.forEach((p, pi) => {
    const el = document.getElementById(`player-${pi}`);
    const zone = activeZone(p);
    el.innerHTML = `<h2>${p.name} ${state.currentPlayer === pi ? "(Current)" : ""}</h2>
      <p class='small'>Active zone: ${zone}</p>
      <div class='row'><strong>Hand (${p.hand.length})</strong><div class='cards' data-zone='hand'></div></div>
      <div class='row'><strong>Face Up (${p.faceUp.length})</strong><div class='cards' data-zone='faceUp'></div></div>
      <div class='row'><strong>Face Down (${p.faceDown.length})</strong><div class='cards' data-zone='faceDown'></div></div>`;

    ["hand", "faceUp", "faceDown"].forEach((z) => {
      const wrap = el.querySelector(`[data-zone='${z}']`);
      p[z].forEach((c, i) => {
        const btn = document.getElementById("card-template").content.firstElementChild.cloneNode(true);
        const selectable = state.currentPlayer === pi && activeZone(p) === z && !state.winner;
        btn.disabled = !selectable;
        btn.classList.toggle("back", z === "faceDown");
        btn.textContent = z === "faceDown" ? "🂠" : showCard(c);
        if (["♥", "♦"].includes(c.suit)) btn.classList.add("red");
        const key = `${pi}-${z}-${i}`;
        if (state.selected.includes(i) && state.currentPlayer === pi && activeZone(p) === z) btn.classList.add("selected");
        btn.onclick = () => {
          if (!selectable) return;
          if (activeZone(p) === "faceDown") {
            state.selected = [i];
          } else {
            state.selected = state.selected.includes(i) ? state.selected.filter((x) => x !== i) : [...state.selected, i];
          }
          render();
        };
        wrap.appendChild(btn);
      });
    });
  });
}

function showCard(c) {
  const r = c.rank;
  return `${r}${c.suit}`;
}

document.getElementById("play-selected").onclick = playSelected;
document.getElementById("pickup").onclick = pickupPile;
document.getElementById("end-turn").onclick = endTurn;

init();
