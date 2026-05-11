const $ = (s) => document.querySelector(s);
const cardTpl = document.querySelector("#card-template").content.firstElementChild;
let role = "p1";
let snapshot = null;
let selected = [];

async function send(type, payload = {}) {
  await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, role, ...payload }) });
  await loadState();
}

async function loadState() {
  const r = await fetch(`/api/state?role=${role}`);
  snapshot = await r.json();
  render();
}

function renderPlayer(target, p, you = false) {
  const zone = p.activeZone;
  target.innerHTML = `<h2>${p.name}${you ? " (You)" : ""}</h2><div class='small'>Active: ${zone}</div>
    <div class='zone'><strong>Hand (${p.hand.length})</strong><div class='cards hand'></div></div>
    <div class='zone'><strong>Face Up (${p.faceUp.length})</strong><div class='cards up'></div></div>
    <div class='zone'><strong>Face Down (${p.faceDown.length})</strong><div class='cards down'></div></div>`;

  const place = (arr, cls, hidden, zoneName) => {
    const wrap = target.querySelector(`.${cls}`);
    arr.forEach((c, i) => {
      const b = cardTpl.cloneNode(true);
      if (hidden) { b.classList.add("back"); b.textContent = ""; }
      else {
        b.textContent = c.rank + c.suit;
        if (c.suit === "♥" || c.suit === "♦") b.classList.add("red");
      }
      if (you && snapshot.currentTurn === role && zone === zoneName && selected.includes(i)) b.classList.add("selected");
      b.onclick = () => {
        if (!(you && snapshot.currentTurn === role && zone === zoneName)) return;
        if (zoneName === "faceDown") selected = [i];
        else selected = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i];
        render();
      };
      wrap.appendChild(b);
    });
  };

  place(p.hand, "hand", !you, "hand");
  place(p.faceUp, "up", false, "faceUp");
  place(p.faceDown, "down", true, "faceDown");
}

function render() {
  if (!snapshot) return;
  $("#status").textContent = snapshot.status;
  $("#draw").textContent = `${snapshot.drawCount} cards`;
  $("#burn").textContent = `${snapshot.burnCount} cards`;
  $("#discard").textContent = snapshot.discard.map((c) => c.rank + c.suit).join(" ");
  const you = role === "p2" ? snapshot.p2 : snapshot.p1;
  const opp = role === "p2" ? snapshot.p1 : snapshot.p2;
  renderPlayer($("#you"), you, role !== "spectator");
  renderPlayer($("#opp"), opp, false);
}

$("#join").onclick = async () => { role = $("#seat").value; selected = []; await loadState(); };
$("#new-game").onclick = () => send("new_game");
$("#play").onclick = () => send("play", { selected });
$("#pickup").onclick = () => send("pickup");

loadState();
setInterval(loadState, 1500);
