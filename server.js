const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Game constants ---

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

// --- Game state ---

let game = null;

function createPlayer(name) {
  return { name, hand: [], faceUp: [], faceDown: [] };
}

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function newGame() {
  const deck = makeDeck();
  const p1 = createPlayer("Player 1");
  const p2 = createPlayer("Player 2");
  for (const p of [p1, p2]) {
    p.faceDown = deck.splice(0, 3);
    p.faceUp = deck.splice(0, 3);
    p.hand = deck.splice(0, 3);
  }
  game = {
    p1, p2,
    drawPile: deck,
    discardPile: [],
    burned: [],
    currentPlayer: "p1",
    last7Constraint: null,
    winner: null,
    status: "Player 1's turn",
  };
}

// --- Game logic ---

function activeZone(player) {
  if (player.hand.length) return "hand";
  if (player.faceUp.length) return "faceUp";
  return "faceDown";
}

function isMagic(rank) {
  return ["A", "2", "3", "7", "10"].includes(rank);
}

function effectiveTopRank() {
  for (let i = game.discardPile.length - 1; i >= 0; i--) {
    const c = game.discardPile[i];
    if (c.rank !== "3") return c.asRank ?? c.rank;
  }
  return null;
}

function checkPlayable(cards) {
  const top = effectiveTopRank();
  if (!top) return true;
  if (cards.every(c => isMagic(c.rank))) return true;
  const nonMagic = cards.filter(c => !isMagic(c.rank));
  if (!nonMagic.length) return true;
  const vals = nonMagic.map(c => VALUE[c.rank]).sort((a, b) => a - b);
  const min = vals[0], max = vals[vals.length - 1];
  if (game.last7Constraint === "low") return max <= 7;
  if (game.last7Constraint === "high" && min < 7) return false;
  return min >= VALUE[top];
}

function isValidCombo(cards) {
  if (!cards.length) return false;
  if (cards.length === 1) return true;
  const ranks = cards.map(c => c.rank);
  if (new Set(ranks).size === 1) return true;
  if (cards.length >= 3) {
    const nonMagic = cards.filter(c => !isMagic(c.rank));
    if (!nonMagic.length) return true;
    const vals = [...new Set(nonMagic.map(c => VALUE[c.rank]))].sort((a, b) => a - b);
    return vals.every((v, i) => i === 0 || v === vals[i - 1] + 1);
  }
  return false;
}

function maybeBurnByFourOfKind() {
  const meaningful = game.discardPile.filter(c => c.rank !== "3");
  if (meaningful.length < 4) return false;
  const last4 = meaningful.slice(-4).map(c => c.asRank ?? c.rank);
  return new Set(last4).size === 1;
}

function refillHand(player) {
  while (player.hand.length < 3 && game.drawPile.length)
    player.hand.push(game.drawPile.shift());
}

function otherPlayer(role) {
  return role === "p1" ? "p2" : "p1";
}

// --- Actions ---

function handlePlay(role, selectedIdxs, sevenMode) {
  if (game.winner || game.currentPlayer !== role) return;
  const p = game[role];
  const zone = activeZone(p);
  const idxs = [...selectedIdxs].sort((a, b) => b - a);
  if (!idxs.length) return;

  // Take cards from zone
  let cards = [];
  if (zone === "faceDown") {
    if (idxs.length !== 1) return;
    cards = [p.faceDown.splice(idxs[0], 1)[0]];
  } else {
    cards = idxs.map(i => p[zone].splice(i, 1)[0]);
  }

  if (!isValidCombo(cards) || !checkPlayable(cards)) {
    // Invalid: put back and pick up pile
    if (zone === "faceDown") {
      p.hand.push(...game.discardPile.splice(0), ...cards);
    } else {
      p[zone].push(...cards);
      p.hand.push(...game.discardPile.splice(0));
    }
    game.status = "Invalid play — picked up pile";
    game.currentPlayer = otherPlayer(role);
    return;
  }

  // Apply card effects
  for (const c of cards) {
    if (c.rank === "7") {
      game.last7Constraint = (sevenMode === "high") ? "high" : "low";
    }
    if (c.rank === "A") {
      c.asRank = "A";
    }
    game.discardPile.push(c);
  }
  if (cards.some(c => c.rank === "2")) game.last7Constraint = null;

  let burned = false;
  if (cards.some(c => c.rank === "10") || maybeBurnByFourOfKind()) {
    game.burned.push(...game.discardPile.splice(0));
    game.last7Constraint = null;
    burned = true;
  }

  refillHand(p);

  if (!p.hand.length && !p.faceUp.length && !p.faceDown.length) {
    game.winner = p.name;
    game.status = `${p.name} wins!`;
    return;
  }

  if (!burned) game.currentPlayer = otherPlayer(role);
  game.status = burned
    ? "Pile burned — same player goes again"
    : `${game[game.currentPlayer].name}'s turn`;
}

function handlePickup(role) {
  if (game.winner || game.currentPlayer !== role) return;
  const p = game[role];
  p.hand.push(...game.discardPile.splice(0));
  game.currentPlayer = otherPlayer(role);
  game.status = `${p.name} picked up the pile`;
}

// --- Role-filtered view ---

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces))
    for (const iface of ifaces[name])
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
  return "localhost";
}

function viewFor(role) {
  const visible = (p) => ({
    name: p.name,
    activeZone: activeZone(p),
    handCount: p.hand.length,
    hand: p.hand,
    faceUp: p.faceUp,
    faceDown: p.faceDown.map(() => ({ rank: "", suit: "" })),
  });
  const hidden = (p) => ({
    name: p.name,
    activeZone: activeZone(p),
    handCount: p.hand.length,
    hand: p.hand.map(() => ({ rank: "", suit: "" })),
    faceUp: p.faceUp,
    faceDown: p.faceDown.map(() => ({ rank: "", suit: "" })),
  });
  const base = {
    currentPlayer: game.currentPlayer,
    status: game.status,
    winner: game.winner,
    drawCount: game.drawPile.length,
    burnCount: game.burned.length,
    discardPile: game.discardPile,
    last7Constraint: game.last7Constraint,
  };
  if (role === "p1") return { ...base, p1: visible(game.p1), p2: hidden(game.p2) };
  if (role === "p2") return { ...base, p1: hidden(game.p1), p2: visible(game.p2) };
  // spectator: both hidden
  return { ...base, p1: hidden(game.p1), p2: hidden(game.p2) };
}

// --- HTTP server ---

newGame();

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/info") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ ip: getLocalIP(), port: 8080 }));
  }

  if (req.url.startsWith("/api/state")) {
    const role = new URL(req.url, "http://x").searchParams.get("role") || "spectator";
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(viewFor(role)));
  }

  if (req.url === "/api/action" && req.method === "POST") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const msg = JSON.parse(body || "{}");
        const role = msg.role;
        if (msg.type === "new_game") newGame();
        else if (msg.type === "play") handlePlay(role, msg.selected || [], msg.sevenMode);
        else if (msg.type === "pickup") handlePickup(role);
      } catch {}
      res.end("ok");
    });
    return;
  }

  const file = req.url === "/" ? "index.html" : req.url.slice(1);
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) { res.statusCode = 404; return res.end("not found"); }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
  res.setHeader("content-type", types[ext] || "text/plain");
  fs.createReadStream(filePath).pipe(res);
});

server.listen(8080, () => {
  const ip = getLocalIP();
  console.log(`Local:   http://localhost:8080`);
  console.log(`Network: http://${ip}:8080`);
});
