const http = require('http');
const fs = require('fs');
const path = require('path');

const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS = ["♠","♥","♦","♣"];
const V = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
let game;

function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({rank:r,suit:s});for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function P(name){return {name,hand:[],faceUp:[],faceDown:[]};}
function zone(p){return p.hand.length?"hand":p.faceUp.length?"faceUp":"faceDown";}
function magic(r){return ["A","2","3","7","10"].includes(r);}
function topRank(){for(let i=game.discard.length-1;i>=0;i--){const c=game.discard[i];if(c.rank!=="3")return c.asRank||c.rank;}return null;}
function fourKind(){const m=game.discard.filter(c=>c.rank!=="3"); if(m.length<4)return false; const r=m.slice(-4).map(c=>c.asRank||c.rank); return new Set(r).size===1;}
function refill(p){while(p.hand.length<3&&game.draw.length)p.hand.push(game.draw.shift());}
function validCombo(cards){ if(!cards.length) return false; if(cards.length===1)return true; const rs=cards.map(c=>c.rank); if(new Set(rs).size===1)return true; if(cards.length>=3){const nm=cards.filter(c=>!magic(c.rank)); if(!nm.length)return true; const vals=[...new Set(nm.map(c=>V[c.rank]))].sort((a,b)=>a-b); return vals.every((v,i)=>i===0||v===vals[i-1]+1);} return false; }
function playable(cards){const t=topRank(); if(!t)return true; if(cards.every(c=>magic(c.rank)))return true; const nm=cards.filter(c=>!magic(c.rank)); if(!nm.length)return true; const vals=nm.map(c=>V[c.rank]).sort((a,b)=>a-b); const min=vals[0],max=vals.at(-1); if(game.seven==="low") return max<=7; if(game.seven==="high" && min<7) return false; return min>=V[t];}

function newGame(){ game={p1:P("Player 1"),p2:P("Player 2"),draw:makeDeck(),discard:[],burn:[],turn:"p1",status:"Player 1 turn",seven:null,winner:null}; for (const p of [game.p1,game.p2]){p.faceDown=game.draw.splice(0,3);p.faceUp=game.draw.splice(0,3);p.hand=game.draw.splice(0,3);} }
function viewFor(role){ const me = role==="p2"?game.p2:game.p1; const opp = role==="p2"?game.p1:game.p2; const mask = (p,show)=>({name:p.name,activeZone:zone(p),hand:show?p.hand:p.hand.map(()=>({rank:"",suit:""})),faceUp:p.faceUp,faceDown:p.faceDown.map(()=>({rank:"",suit:""}))}); return {currentTurn:game.turn,status:game.status,drawCount:game.draw.length,burnCount:game.burn.length,discard:game.discard,p1: role==="p1"?mask(me,true):mask(opp,false),p2: role==="p1"?mask(opp,false):mask(me,true)};}

function act(role, msg){ if(msg.type==='new_game'){newGame();return;} if(role!==game.turn)return; const p=role==='p1'?game.p1:game.p2; if(msg.type==='pickup'){p.hand.push(...game.discard.splice(0)); game.turn=role==='p1'?'p2':'p1'; game.status=`${p.name} picked up`;return;} if(msg.type==='play'){const z=zone(p); const idx=[...(msg.selected||[])].sort((a,b)=>b-a); if(!idx.length)return; let cards=[]; if(z==='faceDown'){if(idx.length!==1)return; cards=[p.faceDown.splice(idx[0],1)[0]];} else cards=idx.map(i=>p[z].splice(i,1)[0]); if(!validCombo(cards)||!playable(cards)){ if(z==='faceDown') p.hand.push(...game.discard.splice(0),...cards); else {p[z].push(...cards); p.hand.push(...game.discard.splice(0));} game.status='Invalid play; picked up pile'; return; } for(const c of cards){ if(c.rank==='A') c.asRank='A'; if(c.rank==='7') game.seven='low'; game.discard.push(c);} if(cards.some(c=>c.rank==='2')) game.seven=null; let burned=false; if(cards.some(c=>c.rank==='10')||fourKind()){game.burn.push(...game.discard.splice(0)); game.seven=null; burned=true;} refill(p); if(!p.hand.length&&!p.faceUp.length&&!p.faceDown.length){game.status=`${p.name} wins`;return;} if(!burned) game.turn=role==='p1'?'p2':'p1'; game.status=burned?'Burned pile: same player again':`${(game.turn==='p1'?game.p1:game.p2).name} turn`; }}

if(!game) newGame();

const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/state')){ const role=new URL(req.url,'http://x').searchParams.get('role')||'spectator'; res.setHeader('content-type','application/json'); return res.end(JSON.stringify(viewFor(role))); }
  if(req.url==='/api/action' && req.method==='POST'){ let body=''; req.on('data',d=>body+=d); req.on('end',()=>{ try{const msg=JSON.parse(body||'{}'); act(msg.role||'spectator',msg);}catch{} res.end('ok');}); return; }
  const file=req.url==='/'?'index.html':req.url.slice(1); const p=path.join(__dirname,file); if(!fs.existsSync(p)){res.statusCode=404;return res.end('not found');}
  const ext=path.extname(p); const types={'.html':'text/html','.js':'application/javascript','.css':'text/css'}; res.setHeader('content-type',types[ext]||'text/plain'); fs.createReadStream(p).pipe(res);
});

server.listen(8080,()=>console.log('Open http://localhost:8080'));
