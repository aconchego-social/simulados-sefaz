import { S, store, initStore, onChange } from './store.js';
import { P1, P2, TAX, CORTE, DURACAO_PADRAO, ITENS_EDITAL } from './edital.js';

/* ===================== utilidades ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();
const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 7);
const pct = (a, b) => b ? Math.round(100 * a / b) : null;
const sgn = n => (n > 0 ? '+' : '') + n;
const fmtT = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtD = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ICON = {
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
  pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="12" r="2.5"/></svg>',
};
const CONF = { 1: 'Pouco', 2: 'Médio', 3: 'Muito' };
const MODOS = {
  prova: { nome: 'Prova cronometrada', tag: 'Com tempo' },
  final: { nome: 'Livre · gabarito no final', tag: 'Sem tempo' },
  item: { nome: 'Livre · comentário a cada item', tag: 'Sem tempo' },
};

/* ===================== índice do banco ===================== */
let Q = {}, SIMS = [], MATS = [];
function reindex() {
  Q = {}; SIMS = Object.values(S.bancos).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.id.localeCompare(b.id));
  for (const s of SIMS) for (const q of s.questoes) { q.sim = s.id; q._ctx = q.ctx ? (s.contextos || {})[q.ctx] : null; Q[q.id] = q; }
  MATS = [...P1, ...P2].filter(m => Object.values(Q).some(q => q.materia === m));
  for (const q of Object.values(Q)) if (!MATS.includes(q.materia)) MATS.push(q.materia);
}
const simById = id => S.bancos[id];
const simNome = id => (S.bancos[id] || {}).nome || id;
const st = qid => ((S.prog[Q[qid]?.sim] || {}).q || {})[qid] || {};
const hist = qid => st(qid).h || [];
function setQ(qid, patch) { patch.u = now(); store.setQ(Q[qid].sim, qid, patch); }
function assuntoCod(q) { return st(q.id).as || q.assunto_cod; }
function assuntoLabel(q) { const c = assuntoCod(q); const t = (TAX[q.materia] || []).find(x => x[0] === c); return t ? t[1] : (q.assunto || '—'); }
const bloco = q => q.bloco || (P1.includes(q.materia) ? 'P1' : 'P2');
const anulada = q => q.gabarito === 'X';

/* ===================== estatística ===================== */
// conf: conjunto de níveis de certeza considerados (0 = sem nível). Respostas fora do conjunto contam como "em branco".
function pick(qid, basis) { const h = hist(qid).filter(x => !x.anul); if (!h.length) return null; return basis === 'first' ? h[0] : h[h.length - 1]; }
function agg(qids, { basis = 'last', conf = null } = {}) {
  const r = { n: qids.length, res: 0, c: 0, e: 0, b: 0, fora: 0, nivel: { 0: [0, 0], 1: [0, 0], 2: [0, 0], 3: [0, 0] } };
  for (const id of qids) {
    const q = Q[id]; if (!q || anulada(q)) continue;
    const a = pick(id, basis); if (!a) continue;
    r.res++;
    if (a.r === 'B') { r.b++; continue; }
    const lv = a.c || 0; r.nivel[lv][0]++; if (a.ok) r.nivel[lv][1]++;
    if (conf && !conf.has(lv)) { r.fora++; continue; }
    a.ok ? r.c++ : r.e++;
  }
  r.liq = r.c - r.e; r.ac = pct(r.c, r.c + r.e);
  const firmes = r.nivel[2][0] + r.nivel[3][0], tot = firmes + r.nivel[1][0] + r.nivel[0][0];
  r.firmes = pct(firmes, tot); r.tot = tot;
  return r;
}
function sesScore(s, conf) {
  const by = { P1: { c: 0, e: 0, b: 0 }, P2: { c: 0, e: 0, b: 0 } }, lv = { 0: [0, 0], 1: [0, 0], 2: [0, 0], 3: [0, 0] };
  let c = 0, e = 0, b = 0, x = 0;
  for (const id of s.ord) {
    const q = Q[id]; if (!q) continue; if (anulada(q)) { x++; continue; }
    const r = s.resp[id] || {}; const B = by[bloco(q)];
    if (!r.r) { b++; B.b++; continue; }
    const ok = r.r === q.gabarito, l = r.c || 0; lv[l][0]++; if (ok) lv[l][1]++;
    if (conf && !conf.has(l)) { b++; B.b++; continue; }
    if (ok) { c++; B.c++; } else { e++; B.e++; }
  }
  return { c, e, b, x, liq: c - e, by, lv };
}

/* ===================== navegação ===================== */
let VIEW = { v: 'home' }, R = null, tick = null;
const app = () => $('#app');
function go(v, extra) {
  if (R && VIEW.v === 'run') leaveRun();
  VIEW = Object.assign({ v }, extra || {}); scrollTo(0, 0); render();
}
function render() {
  $('#nav').innerHTML = '';
  if (S.mode === 'firebase' && !S.user) return vLogin();
  if (!SIMS.length && !['dados', 'login'].includes(VIEW.v)) return vVazio();
  const f = { home: vHome, setup: vSetup, run: vRun, result: vResult, perf: vPerf, mat: vMat, rev: vRev, discs: vDiscs, disc: vDisc, dados: vDados, hist: vHist }[VIEW.v] || vHome;
  f();
}
function header(title, back = 'home') {
  return `<div class="hdr"><button class="icon" data-back="${back}" aria-label="Voltar">${ICON.left}</button><span class="sp"></span>${syncPill()}</div>${title ? `<h1>${title}</h1>` : ''}`;
}
function syncPill() {
  if (S.mode === 'local') return `<span class="pill">Salvo neste aparelho</span>`;
  return S.online ? `<span class="pill on">Sincronizado · ${esc((S.user || {}).nome || '')}</span>` : `<span class="pill">Offline · sincroniza depois</span>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-back]'); if (b) go(b.dataset.back, b.dataset.extra ? JSON.parse(b.dataset.extra) : undefined); });

/* ===================== telas simples ===================== */
function vLogin() {
  app().innerHTML = `<h1>Simulados SEFAZ-AL</h1><div class="card gap"><p>Entre com a sua conta Google para carregar as questões e sincronizar o progresso entre celular, tablet e computador.</p>
  <button class="btn pri" id="login">Entrar com Google</button><p class="mut xs" id="lerr"></p></div>`;
  $('#login').onclick = async () => { try { await store.login(); } catch (e) { $('#lerr').textContent = 'Não foi possível entrar: ' + (e.code || e.message); } };
}
function vVazio() {
  app().innerHTML = `<div class="hdr"><span class="brand"><i class="dot"></i>Simulados SEFAZ-AL</span><span class="sp"></span>${syncPill()}</div>
  <h1>Nenhum simulado carregado</h1><div class="card gap"><p>Importe o arquivo do banco de questões (<b>banco_completo.json</b>). Basta fazer isso uma vez: depois ele aparece em todos os seus aparelhos.</p>
  <button class="btn pri" data-go="dados">Importar banco</button></div>`;
  app().onclick = e => { if (e.target.dataset.go) go(e.target.dataset.go); };
}

function vHome() {
  const all = Object.keys(Q); const a = agg(all);
  const abertas = Object.values(S.ses).filter(s => s.status === 'andamento').sort((x, y) => (y.u || 0) - (x.u || 0));
  const nrev = all.filter(id => st(id).rev).length;
  app().innerHTML = `
  <div class="hdr"><span class="brand"><i class="dot"></i>Simulados SEFAZ-AL</span><span class="sp"></span>${syncPill()}</div>
  <h1>Bora treinar?</h1>
  <p class="mut">${SIMS.length} simulados · ${all.length} itens · prova em 20/12</p>
  <div class="kpis">
    <div class="kpi"><b>${a.c + a.e}</b><span>itens respondidos</span></div>
    <div class="kpi"><b>${a.ac ?? '—'}${a.ac != null ? '%' : ''}</b><span>de acerto</span></div>
    <div class="kpi"><b class="${a.liq < 0 ? 'neg' : ''}">${a.res ? sgn(a.liq) : '—'}</b><span>nota líquida</span></div>
    <div class="kpi"><b>${a.firmes ?? '—'}${a.firmes != null ? '%' : ''}</b><span>com certeza 2 ou 3</span></div>
  </div>
  ${abertas.length ? `<h2>Continuar</h2><div class="gap">${abertas.map(s => {
    const feitos = Object.values(s.resp || {}).filter(r => r.r).length;
    return `<div class="card row"><div class="sp"><span class="tag">${esc(MODOS[s.modo].nome)}</span><h3 style="margin-top:6px">${esc(s.nome)}</h3><div class="mut sm">${feitos} de ${s.ord.length} respondidos${s.dur ? ' · restam ' + fmtT(s.dur * 60 - (s.gasto || 0)) : ''}</div></div>
    <button class="btn pri" data-resume="${esc(s.id)}">Continuar</button><button class="btn ghost" data-drop="${esc(s.id)}" aria-label="Descartar">${ICON.x}</button></div>`;
  }).join('')}</div>` : ''}
  <h2>Novo treino</h2>
  <div class="grid">
    <button class="mode" data-m="prova"><span class="tag">Com tempo</span><b>Prova cronometrada</b><span class="mut sm">Um simulado inteiro com contagem regressiva de 4h30. Gabarito e comentários só no final.</span></button>
    <button class="mode" data-m="final"><span class="tag">Sem tempo</span><b>Livre · gabarito no final</b><span class="mut sm">Resolva quando puder, em quantas vezes quiser. Os comentários aparecem quando você encerrar.</span></button>
    <button class="mode" data-m="item"><span class="tag">Sem tempo</span><b>Livre · comentário a cada item</b><span class="mut sm">Respondeu, viu o gabarito e o comentário do professor na hora.</span></button>
  </div>
  <h2>Acompanhar</h2>
  <div class="grid">
    <button class="mode" data-v="perf"><b>Desempenho</b><span class="mut sm">Por matéria e assunto, com filtro de certeza e estratégia de prova.</span></button>
    <button class="mode" data-v="rev"><b>Para revisão (${nrev})</b><span class="mut sm">Itens marcados, com as suas anotações.</span></button>
    <button class="mode" data-v="hist"><b>Histórico</b><span class="mut sm">Provas e blocos encerrados.</span></button>
    <button class="mode" data-v="discs"><b>Discursivas</b><span class="mut sm">Escreva em até 30 linhas e compare com o espelho.</span></button>
    <button class="mode" data-v="dados"><b>Dados e conta</b><span class="mut sm">Importar simulados, backup, sair.</span></button>
  </div>`;
  app().onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) go('setup', { modo: b.dataset.m });
    if (b.dataset.v) go(b.dataset.v);
    if (b.dataset.resume) startRun(S.ses[b.dataset.resume]);
    if (b.dataset.drop) confirmBox('Descartar este treino? As respostas dele que ainda não foram corrigidas serão perdidas.', () => {
      const ss = S.ses[b.dataset.drop];
      for (const [qid, r] of Object.entries((ss && ss.resp) || {})) if (Q[qid] && (st(qid).p || {}).ses === ss.id) setQ(qid, { p: null });
      store.delSes(b.dataset.drop); render();
    });
  };
}

/* ===================== configuração de treino ===================== */
const SIT = [['todas', 'Todas'], ['nunca', 'Nunca respondidas'], ['erradas', 'Erradas ou em branco'], ['rev', 'Em revisão'], ['c1', 'Certeza 1'], ['c3e', 'Certeza 3 e errei'], ['c1a', 'Certeza 1 e acertei']];
function vSetup() {
  const m = VIEW.modo, P = S.prefs || {};
  let body;
  if (m === 'prova') {
    body = `<label class="f" for="s-sim">Simulado</label><select id="s-sim">${SIMS.map(s => `<option value="${esc(s.id)}" ${s.id === P.lastSim ? 'selected' : ''}>${esc(s.nome)} (${esc(s.data || '')})</option>`).join('')}</select>
    <label class="f" for="s-dur">Duração (minutos)</label><input id="s-dur" type="number" min="10" step="5" value="${P.dur || DURACAO_PADRAO}">
    <p class="mut xs">O edital prevê 4h30 (270 minutos) para as provas objetivas.</p>`;
  } else {
    const F = Object.assign({ sims: [], mats: [], ass: [], sit: 'todas', ord: 'seq', qtd: 0 }, VIEW.pre || P['filt_' + m] || {});
    const assOpts = F.mats.length === 1 ? (TAX[F.mats[0]] || []) : [];
    body = `<label class="f">Simulados <span class="xs">(nenhum marcado = todos)</span></label>
    <div class="chips" id="s-sims">${SIMS.map(s => `<button class="chip" aria-pressed="${F.sims.includes(s.id)}" data-x="${esc(s.id)}">${esc(s.nome.replace('Estratégia · ', ''))}</button>`).join('')}</div>
    <label class="f">Matérias <span class="xs">(nenhuma = todas)</span></label>
    <div class="chips" id="s-mats">${MATS.map(x => `<button class="chip" aria-pressed="${F.mats.includes(x)}" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    ${assOpts.length ? `<label class="f">Assuntos de ${esc(F.mats[0])} <span class="xs">(nenhum = todos)</span></label>
    <div class="chips" id="s-ass">${assOpts.map(([c, l]) => `<button class="chip" aria-pressed="${F.ass.includes(c)}" data-x="${esc(c)}">${esc(l)}</button>`).join('')}</div>` : '<p class="mut xs" style="margin-top:8px">Marque uma única matéria para escolher assuntos.</p>'}
    <label class="f">Situação</label>
    <div class="chips" id="s-sit">${SIT.map(([k, l]) => `<button class="chip" aria-pressed="${F.sit === k}" data-x="${k}">${l}</button>`).join('')}</div>
    <label class="f">Ordem</label>
    <div class="chips" id="s-ord"><button class="chip" aria-pressed="${F.ord !== 'rnd'}" data-x="seq">Como nos simulados</button><button class="chip" aria-pressed="${F.ord === 'rnd'}" data-x="rnd">Embaralhada</button></div>
    <label class="f" for="s-qtd">Quantidade</label>
    <select id="s-qtd">${[[0, 'Todas as filtradas'], [10, '10'], [20, '20'], [30, '30'], [50, '50'], [100, '100']].map(([v, l]) => `<option value="${v}" ${+F.qtd === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <p class="sm" style="margin-top:12px"><b id="s-count"></b></p>`;
  }
  app().innerHTML = header(MODOS[m].nome) + `<div class="card">${body}<div class="row" style="margin-top:18px"><button class="btn pri" id="go">Começar</button></div></div>`;
  const read = () => {
    const sel = id => [...document.querySelectorAll(`#${id} [aria-pressed=true]`)].map(b => b.dataset.x);
    return { sims: sel('s-sims'), mats: sel('s-mats'), ass: sel('s-ass'), sit: (sel('s-sit')[0] || 'todas'), ord: (sel('s-ord')[0] || 'seq'), qtd: +($('#s-qtd') || { value: 0 }).value };
  };
  const filtrar = F => Object.values(Q).filter(q => {
    if (F.sims.length && !F.sims.includes(q.sim)) return false;
    if (F.mats.length && !F.mats.includes(q.materia)) return false;
    if (F.ass.length && !F.ass.includes(assuntoCod(q))) return false;
    const a = pick(q.id, 'last'), s = st(q.id);
    switch (F.sit) {
      case 'nunca': return !hist(q.id).some(x => x.r !== 'B');
      case 'erradas': return a && (a.r === 'B' || !a.ok) && !anulada(q);
      case 'rev': return !!s.rev;
      case 'c1': return a && a.c === 1;
      case 'c3e': return a && a.c === 3 && !a.ok && a.r !== 'B';
      case 'c1a': return a && a.c === 1 && a.ok;
    }
    return true;
  }).map(q => q.id);
  const upd = () => { if (m !== 'prova') $('#s-count').textContent = filtrar(read()).length + ' item(ns) com esses filtros'; };
  upd();
  app().onclick = e => {
    const c = e.target.closest('.chip');
    if (c) {
      const g = c.parentElement.id;
      if (['s-sims', 's-mats', 's-ass'].includes(g)) c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true');
      else c.parentElement.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === c));
      if (g === 's-mats') { const F = read(); F.ass = []; VIEW.pre = F; vSetup(); return; }
      upd(); return;
    }
    if (e.target.id !== 'go') return;
    if (m === 'prova') {
      const sim = $('#s-sim').value, dur = Math.max(10, +$('#s-dur').value || DURACAO_PADRAO);
      store.setPrefs({ lastSim: sim, dur });
      const s = novaSes('prova', `${simNome(sim)} · ${simById(sim).data || ''}`, simById(sim).questoes.map(q => q.id), { dur, sims: [sim] });
      return startRun(s);
    }
    const F = read(); store.setPrefs({ ['filt_' + m]: F });
    let ids = filtrar(F); if (F.ord === 'rnd') ids = shuffle(ids); if (F.qtd) ids = ids.slice(0, F.qtd);
    if (!ids.length) return toast('Nenhum item com esses filtros.');
    const partes = [F.sims.length === 1 ? simNome(F.sims[0]) : F.sims.length ? F.sims.length + ' simulados' : 'Todos os simulados',
      F.mats.length === 1 ? F.mats[0] : F.mats.length ? F.mats.length + ' matérias' : null,
      F.ass.length ? F.ass.length + ' assunto(s)' : null, F.sit !== 'todas' ? SIT.find(x => x[0] === F.sit)[1] : null].filter(Boolean);
    startRun(novaSes(m, partes.join(' · '), ids, { sims: F.sims }));
  };
}
function novaSes(modo, nome, ord, extra) {
  const s = Object.assign({ id: 's' + uid(), modo, nome, ord, resp: {}, cur: 0, gasto: 0, ini: now(), status: 'andamento', u: now() }, extra);
  store.setSes(s); return s;
}

/* ===================== resolução ===================== */
function startRun(s, opts = {}) {
  clearInterval(tick);
  R = { ses: s, list: opts.list || s.ord, i: opts.i ?? (opts.review ? 0 : s.cur || 0), t0: now(), review: !!opts.review, nota: false, back: opts.back, done: {} };
  if (!R.review) syncExt(s);
  VIEW = { v: 'run' }; tick = setInterval(onTick, 1000); scrollTo(0, 0); render();
}
function bank() { // acumula tempo (só na prova cronometrada)
  if (!R || R.review || R.ses.modo !== 'prova') { if (R) R.t0 = now(); return; }
  const d = (now() - R.t0) / 1000; R.t0 = now();
  const qid = R.list[R.i]; const r = R.ses.resp[qid] || (R.ses.resp[qid] = {});
  r.s = (r.s || 0) + d; R.ses.gasto = (R.ses.gasto || 0) + d;
}
function saveSes() { R.ses.u = now(); store.setSes(R.ses); }
function leaveRun() { if (R && !R.review) { bank(); R.ses.cur = R.i; saveSes(); } clearInterval(tick); R = null; }
function onTick() {
  if (!R || R.review || R.ses.modo !== 'prova') return;
  const el = $('#timer'); if (!el) return;
  const left = R.ses.dur * 60 - (R.ses.gasto || 0) - (now() - R.t0) / 1000;
  el.lastChild.textContent = fmtT(left); el.classList.toggle('low', left < 900);
  if (left <= 0) { bank(); encerrar(true); }
}
function move(i) { if (!R || i < 0 || i >= R.list.length) return; bank(); R.i = i; R.nota = false; if (!R.review) syncExt(R.ses); if (!R.review) { R.ses.cur = i; saveSes(); } scrollTo(0, 0); vRun(); }
const revealedNow = qid => R.review || (R.ses.modo !== 'prova' && (R.ses.resp[qid] || {}).conf === true);

/* Itens respondidos em OUTRO treino livre depois que este começou aparecem aqui como já respondidos,
   para não serem resolvidos (e contados) de novo. A prova cronometrada fica isolada, como numa prova real. */
function syncExt(s) {
  if (s.modo === 'prova') return;
  for (const qid of s.ord) {
    const own = s.resp[qid];
    if (own && own.r && !own.ext) continue;
    const p = st(qid).p, h = hist(qid);
    const last = [...h].reverse().find(x => x.ses && x.ses !== s.id && x.t >= (s.ini || 0) && x.r !== 'B');
    if (p && p.r && p.ses !== s.id && S.ses[p.ses] && S.ses[p.ses].status === 'andamento') s.resp[qid] = { r: p.r, c: p.c || 0, ext: 'pend' };
    else if (last) s.resp[qid] = { r: last.r, c: last.c || 0, conf: true, ext: 'corr' };
    else if (own && own.ext) delete s.resp[qid];
  }
}
function pendente(qid, rr) { // resposta dada no modo "gabarito no final", ainda sem correção
  if (R.ses.modo !== 'final') return;
  setQ(qid, { p: rr.r ? { r: rr.r, c: rr.c || 0, ses: R.ses.id, t: now() } : null });
}
function corrigir(qids) { // registra no histórico e libera gabarito/comentário dos itens respondidos
  const s = R.ses, feitos = [];
  for (const qid of qids) {
    const r = s.resp[qid], q = Q[qid];
    if (!q || !r || !r.r || r.conf || r.ext) continue;
    r.conf = true; feitos.push(qid);
    const h = hist(qid).slice(); h.push({ t: now(), r: r.r, ok: r.r === q.gabarito, c: r.c || 0, m: s.modo, ses: s.id, anul: anulada(q) || undefined });
    setQ(qid, { h, p: null });
  }
  saveSes(); return feitos;
}
function abertosDe(filtro) { return R.ses.ord.filter(id => { const r = R.ses.resp[id]; return r && r.r && !r.conf && !r.ext && Q[id] && filtro(Q[id]); }); }
function corrigirSheet(motivo, materia) {
  const q = { materia: materia || Q[R.list[R.i]].materia }, mat = abertosDe(x => x.materia === q.materia), tudo = abertosDe(() => true);
  if (!tudo.length) return toast('Nenhum item respondido aguardando correção.');
  sheet(`${motivo ? `<p style="font-size:17px;font-weight:800">${esc(motivo)}</p>` : '<h3>Ver gabarito agora</h3>'}
  <p class="mut sm">Os itens corrigidos passam a mostrar gabarito e comentário e entram no seu desempenho. Os demais continuam escondidos.</p>
  <div class="gap" style="margin-top:12px">
    ${mat.length ? `<button class="btn pri" data-k="mat">Corrigir ${esc(q.materia)} (${mat.length})</button>` : ''}
    ${tudo.length !== mat.length ? `<button class="btn ${mat.length ? '' : 'pri'}" data-k="all">Corrigir tudo que respondi (${tudo.length})</button>` : ''}
    <button class="btn ghost" data-close>Agora não</button></div>`, e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const ids = corrigir(b.dataset.k === 'mat' ? mat : tudo); closeSheet(); parcial(ids);
  });
}
function parcial(ids) {
  const s = R.ses; let c = 0, e = 0; for (const id of ids) { const q = Q[id]; if (anulada(q)) continue; s.resp[id].r === q.gabarito ? c++ : e++; }
  sheet(`<h3>${ids.length} item(ns) corrigido(s)</h3>
  <div class="kpis"><div class="kpi"><b class="${c - e < 0 ? 'neg' : ''}">${sgn(c - e)}</b><span>líquido</span></div><div class="kpi"><b>${c}</b><span>certos</span></div><div class="kpi"><b>${e}</b><span>errados</span></div><div class="kpi"><b>${pct(c, c + e) ?? '—'}${c + e ? '%' : ''}</b><span>acerto</span></div></div>
  <div class="gap"><button class="btn pri" id="vc">Ver comentários desses itens</button><button class="btn ghost" data-close>Continuar resolvendo</button></div>`, ev => {
    if (ev.target.id === 'vc') { closeSheet(); startRun(s, { review: true, list: ids, back: R.i }); }
  });
}

function bubbles() {
  return R.list.map((id, i) => {
    const q = Q[id]; if (!q) return '';
    const r = R.ses.resp[id] || {}; let c = '';
    const rev = revealedNow(id);
    if (rev && r.r) c = anulada(q) ? 'x' : r.r === q.gabarito ? 'ok' : 'bad';
    else if (r.r) c = 'a';
    if (i === R.i) c += ' cur'; if (st(id).rev) c += ' rv';
    return `<button class="bub ${c}" data-i="${i}" aria-label="Item ${i + 1}">${i + 1}</button>`;
  }).join('');
}
function vRun() {
  const s = R.ses, qid = R.list[R.i], q = Q[qid];
  if (!q) { toast('Item não encontrado no banco.'); return go('home'); }
  const S1 = st(qid), r = s.resp[qid] || {}, rev = revealedNow(qid), lock = rev || !!r.ext;
  const feitos = Object.values(s.resp).filter(x => x.r).length;
  const modo = MODOS[s.modo];
  const cls = v => {
    if (!rev) return r.r === v ? 'aria-pressed="true"' : '';
    if (anulada(q)) return r.r === v ? 'aria-pressed="true"' : '';
    if (v === q.gabarito) return 'class="right"'; if (r.r === v) return 'class="wrong"'; return '';
  };
  const ok = r.r && r.r === q.gabarito;
  const verd = !rev ? '' : anulada(q) ? `<div class="verdict nil">Item ANULADO no gabarito definitivo${q.gabarito_preliminar ? ` (preliminar: ${q.gabarito_preliminar === 'C' ? 'Certo' : 'Errado'})` : ''} — não conta na nota.</div>`
    : !r.r ? `<div class="verdict nil">Em branco — gabarito: ${q.gabarito === 'C' ? 'Certo' : 'Errado'}</div>`
    : `<div class="verdict ${ok ? 'ok' : 'bad'}">${ok ? 'Você acertou' : 'Você errou'} — gabarito: ${q.gabarito === 'C' ? 'Certo' : 'Errado'}${r.c ? ` · certeza ${r.c} (${CONF[r.c].toLowerCase()})` : ''}${q.alterado ? ' · gabarito alterado no definitivo' : ''}</div>`;
  const ctx = q._ctx ? (plain(q._ctx).length > 420 ? `<details class="ctx" ${R.ctxOpen !== false ? 'open' : ''}><summary>Texto de apoio</summary>${q._ctx}</details>` : `<div class="ctx">${q._ctx}</div>`) : '';
  const titulo = R.review ? 'Revisão · ' + esc(s.nome) : esc(modo.nome) + (s.modo === 'prova' ? ' · ' + bloco(q) : '');
  app().innerHTML = `
  <div class="top">
    <div class="l1">
      <button class="icon" id="close" aria-label="Sair">${ICON.x}</button>
      <div class="sp"><div class="xs mut" style="font-weight:700">${titulo}</div><div style="font-weight:800">Item ${R.i + 1} de ${R.list.length}${R.review ? '' : ` · ${feitos} respondidos`}</div></div>
      ${s.modo === 'prova' && !R.review ? `<div class="timer" id="timer">${ICON.clock}<span>0:00</span></div>` : ''}
      ${s.modo === 'final' && !R.review ? `<button class="btn" id="corr" style="min-height:44px;padding:8px 12px">Corrigir</button>` : ''}
      <button class="icon" id="grid" aria-label="Mapa de itens">${ICON.grid}</button>
    </div>
    <div class="bubbles" id="bubs">${bubbles()}</div>
  </div>
  <div class="qcard">
    <div class="qhead"><span class="tag">${esc(q.materia)}</span><button class="asschip" id="ass" title="Trocar assunto">${esc(assuntoLabel(q))}</button>${q.nota_revisao ? '<span class="tag warn">nota de revisão</span>' : ''}${q.alterado && rev ? '<span class="tag warn">gabarito alterado</span>' : ''}</div>
    <div class="xs mut">Item ${q.n} · ${esc(simNome(q.sim))}</div>
    ${ctx}
    <div class="qtxt">${q.enunciado}</div>
  </div>
  <div class="ans">
    <button data-a="C" ${cls('C')} ${lock ? 'disabled' : ''}>Certo</button>
    <button data-a="E" ${cls('E')} ${lock ? 'disabled' : ''}>Errado</button>
  </div>
  ${r.ext && !R.review ? `<div class="nota">${r.ext === 'pend' ? 'Você já respondeu este item em outro treino com gabarito no final. Ele conta uma vez só e será corrigido lá.' : 'Você já respondeu e corrigiu este item em outro treino. Ele não será contado de novo.'}</div>` : ''}
  ${rev && !R.review ? '' : `<div class="conf"><div class="sm" style="font-weight:800">Quão seguro você está?</div><div class="opts">${[1, 2, 3].map(n => `<button data-c="${n}" aria-pressed="${r.c === n}" ${lock ? 'disabled' : ''}>${n}<small>${CONF[n]}</small></button>`).join('')}</div></div>`}
  <div class="tools">
    <button id="t-nota" aria-pressed="${!!(R.nota || S1.a1)}">${ICON.pen}Anotar</button>
    <button id="t-rev" aria-pressed="${!!S1.rev}">${ICON.flag}${S1.rev ? 'Em revisão' : 'Revisar'}</button>
    ${!lock && r.r ? `<button id="t-clear">Limpar</button>` : ''}
  </div>
  ${(R.nota || S1.a1) ? `<label class="f" for="a1">Minha anotação durante a resolução</label><textarea id="a1" placeholder="Raciocínio, dúvida, palavra-chave…">${esc(S1.a1 || '')}</textarea>` : ''}
  ${verd}
  ${rev ? `${q.nota_revisao ? `<div class="nota">${q.nota_revisao}</div>` : ''}<div class="com"><h3>Comentário do professor</h3>${q.comentario}</div>
  <label class="f" for="a2">Minha anotação após o comentário</label><textarea id="a2" placeholder="O que faltou? Qual a pegadinha?">${esc(S1.a2 || '')}</textarea>
  ${hist(qid).length > 1 ? `<p class="mut xs" style="margin-top:8px">Histórico: ${hist(qid).map(h => h.r === 'B' ? 'branco' : (h.ok ? '✓' : '✗') + (h.c ? h.c : '')).join(' · ')}</p>` : ''}` : ''}`;
  const last = R.i === R.list.length - 1;
  let main;
  if (R.review) main = last ? `<button class="btn pri" id="fim-rev">${s.status === 'andamento' ? 'Voltar a resolver' : 'Voltar ao resultado'}</button>` : `<button class="btn pri" id="next">Próximo</button>`;
  else if (s.modo === 'item' && !rev) main = `<button class="btn pri" id="confirm" ${r.r && r.c ? '' : 'disabled'}>${r.r && !r.c ? 'Marque a certeza' : 'Confirmar e ver comentário'}</button>`;
  else if (last) main = s.modo === 'item' ? `<button class="btn pri" id="fim-item">Concluir bloco</button>` : `<button class="btn pri" id="fim">${s.modo === 'final' ? 'Encerrar e corrigir' : 'Encerrar e ver resultado'}</button>`;
  else main = `<button class="btn pri" id="next">${s.modo === 'item' || rev || r.ext ? 'Próximo item' : r.r ? 'Confirmar e seguir' : 'Pular'}</button>`;
  $('#nav').innerHTML = `<nav class="nav"><div class="in"><button class="btn" id="prev" aria-label="Anterior" ${R.i ? '' : 'disabled'}>${ICON.left}</button>${main}</div></nav>`;
  const cur = $('#bubs .cur'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  onTick();
  let nt;
  app().oninput = e => {
    if (e.target.id !== 'a1' && e.target.id !== 'a2') return;
    const k = e.target.id, v = e.target.value; clearTimeout(nt); nt = setTimeout(() => setQ(qid, { [k]: v }), 600);
  };
  app().onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.i) return move(+b.dataset.i);
    if (b.dataset.a) { const rr = s.resp[qid] || (s.resp[qid] = {}); rr.r = rr.r === b.dataset.a && s.modo !== 'item' ? null : b.dataset.a; saveSes(); pendente(qid, rr); return vRun(); }
    if (b.dataset.c) { const rr = s.resp[qid] || (s.resp[qid] = {}); rr.c = +b.dataset.c; saveSes(); pendente(qid, rr); return vRun(); }
    if (b.id === 't-clear') { s.resp[qid] = { s: r.s }; saveSes(); pendente(qid, {}); return vRun(); }
    if (b.id === 'corr') return corrigirSheet();
    if (b.id === 't-nota') { R.nota = !R.nota; vRun(); const t = $('#a1'); if (t) t.focus(); return; }
    if (b.id === 't-rev') { setQ(qid, { rev: !S1.rev }); return vRun(); }
    if (b.id === 'ass') return assuntoSheet(q);
    if (b.id === 'grid') return gridSheet();
    if (b.id === 'close') { if (R.review) return s.status === 'andamento' ? startRun(s, { i: R.back ?? s.cur }) : go('result', { ses: s.id }); return go('home'); }
    if (e.target.closest('summary')) R.ctxOpen = !e.target.closest('details').open;
  };
  $('#nav').onclick = e => {
    const id = e.target.closest('button')?.id; if (!id) return;
    if (id === 'prev') move(R.i - 1);
    if (id === 'next') {
      const nq = Q[R.list[R.i + 1]];
      // fim de matéria no modo "gabarito no final": oferece a correção do bloco
      if (s.modo === 'final' && !R.review && nq && nq.materia !== q.materia && !R.done[q.materia] && abertosDe(x => x.materia === q.materia).length) {
        R.done[q.materia] = true; move(R.i + 1); return corrigirSheet(`Você chegou ao fim de ${q.materia}. Quer ver o gabarito e os comentários agora?`, q.materia);
      }
      move(R.i + 1);
    }
    if (id === 'confirm') confirmarItem(qid);
    if (id === 'fim') { const falta = R.list.filter(x => !(s.resp[x] || {}).r).length; confirmBox(`Encerrar ${s.modo === 'prova' ? 'a prova' : 'o bloco'}?${falta ? ` ${falta} item(ns) ficarão em branco.` : ''}`, () => encerrar(false)); }
    if (id === 'fim-item') encerrar(false);
    if (id === 'fim-rev') { if (s.status === 'andamento') startRun(s, { i: R.back ?? s.cur }); else go('result', { ses: s.id }); }
  };
}
function confirmarItem(qid) {
  const s = R.ses, r = s.resp[qid], q = Q[qid];
  r.conf = true; saveSes();
  const h = hist(qid).slice(); h.push({ t: now(), r: r.r, ok: r.r === q.gabarito, c: r.c || 0, m: 'item', ses: s.id, anul: anulada(q) || undefined });
  setQ(qid, { h, p: null }); vRun();
}
function encerrar(timeout) {
  const s = R.ses; bank(); clearInterval(tick);
  s.status = 'fim'; s.fim = now(); s.timeout = !!timeout;
  if (s.modo !== 'item') {
    for (const qid of s.ord) {
      const q = Q[qid]; if (!q) continue; const r = s.resp[qid] || {};
      if (r.ext || r.conf) continue;               // já contado (outro treino ou correção parcial)
      if (s.modo === 'final' && !r.r) continue;     // no treino livre, item não respondido não vira "branco"
      r.conf = true;
      const h = hist(qid).slice();
      h.push({ t: s.fim, r: r.r || 'B', ok: r.r === q.gabarito, c: r.r ? (r.c || 0) : 0, m: s.modo, s: r.s ? Math.round(r.s) : undefined, ses: s.id, anul: anulada(q) || undefined });
      setQ(qid, Object.assign({ h: JSON.parse(JSON.stringify(h)) }, s.modo === 'final' ? { p: null } : {}));
    }
  }
  store.setSes(s); R = null; go('result', { ses: s.id });
}
function gridSheet() {
  sheet(`<div class="row" style="margin-bottom:10px"><h3 class="sp">Mapa de itens</h3><button class="btn ghost" data-close>Fechar</button></div>
  <div class="legend"><span><i style="background:var(--dark)"></i>respondido</span><span><i style="background:var(--ok)"></i>acerto</span><span><i style="background:var(--bad)"></i>erro</span><span><i style="background:var(--warn);border-radius:6px"></i>revisão</span></div>
  <div class="qgrid" style="margin-top:12px">${bubbles()}</div>`, e => { const b = e.target.closest('[data-i]'); if (b) { closeSheet(); move(+b.dataset.i); } });
}
function assuntoSheet(q) {
  const cur = assuntoCod(q);
  sheet(`<h3>Assunto do item ${q.n}</h3><p class="mut sm">${esc(q.materia)} — conforme o edital. A classificação foi feita por mim; se discordar, troque aqui.</p>
  <div class="chips">${(TAX[q.materia] || []).map(([c, l]) => `<button class="chip" aria-pressed="${c === cur}" data-c="${esc(c)}">${esc(l)}</button>`).join('')}</div>
  <div class="row" style="margin-top:14px"><button class="btn ghost" data-close>Fechar</button></div>`, e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    setQ(q.id, { as: b.dataset.c === q.assunto_cod ? null : b.dataset.c }); closeSheet(); vRun();
  });
}
document.addEventListener('keydown', e => {
  if (VIEW.v !== 'run' || !R || /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase(), click = sel => { const b = document.querySelector(sel); if (b && !b.disabled) b.click(); };
  if (k === 'arrowright') move(R.i + 1); else if (k === 'arrowleft') move(R.i - 1);
  else if (k === 'c') click('[data-a=C]'); else if (k === 'e') click('[data-a=E]');
  else if ('123'.includes(k)) click(`[data-c="${k}"]`); else if (k === 'enter') click('#confirm, #next');
});
document.addEventListener('visibilitychange', () => { if (!R) return; if (document.hidden) { bank(); if (!R.review) { R.ses.cur = R.i; saveSes(); } } else R.t0 = now(); });

/* ===================== resultado ===================== */
function confTable(lv) {
  const rows = [3, 2, 1, 0].filter(l => lv[l][0]).map(l => {
    const [n, a] = lv[l], p = pct(a, n), saldo = a - (n - a);
    return `<tr><td>${l ? `Certeza ${l} · ${CONF[l]}` : 'Sem certeza marcada'}</td><td>${n}</td><td>${a}</td><td>${p}%</td><td class="${saldo < 0 ? 'neg' : 'pos'}">${sgn(saldo)}</td></tr>`;
  }).join('');
  return rows ? `<div class="card scroll"><table class="t"><thead><tr><th>Nível</th><th>Itens</th><th>Acertos</th><th>Acerto</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="mut xs" style="margin-top:8px">Saldo = acertos − erros naquele nível. Saldo negativo: na prova, deixar esses itens em branco teria rendido mais.</p></div>` : '';
}
function estrategias(lv) {
  const val = set => [0, 1, 2, 3].reduce((t, l) => t + (set.includes(l) ? lv[l][1] - (lv[l][0] - lv[l][1]) : 0), 0);
  const ops = [['Responder tudo', [0, 1, 2, 3]], ['Em branco os de certeza 1', [0, 2, 3]], ['Só certeza 2 e 3', [2, 3]], ['Só certeza 3', [3]]];
  const best = Math.max(...ops.map(o => val(o[1])));
  return `<div class="card scroll"><table class="t"><thead><tr><th>Estratégia</th><th>Nota líquida</th></tr></thead><tbody>${ops.map(([n, set]) => { const v = val(set); return `<tr><td>${n}${v === best ? ' <span class="tag">melhor</span>' : ''}</td><td class="${v < 0 ? 'neg' : ''}"><b>${sgn(v)}</b></td></tr>`; }).join('')}</tbody></table>
  <p class="mut xs" style="margin-top:8px">Itens sem certeza marcada entram como respondidos nas três primeiras linhas.</p></div>`;
}
function vResult() {
  const s = S.ses[VIEW.ses]; if (!s) return go('home');
  const sc = sesScore(s);
  const full = s.modo === 'prova' && s.ord.length >= 150;
  const byM = {}; for (const id of s.ord) { const q = Q[id]; if (q) (byM[q.materia] = byM[q.materia] || []).push(id); }
  const rowsM = Object.entries(byM).map(([m, ids]) => {
    let c = 0, e = 0, b = 0; for (const id of ids) { const q = Q[id]; if (anulada(q)) continue; const r = (s.resp[id] || {}).r; if (!r) b++; else r === q.gabarito ? c++ : e++; }
    return { m, c, e, b, n: ids.length, ac: pct(c, c + e), liq: c - e };
  }).sort((a, b) => (a.ac ?? 101) - (b.ac ?? 101));
  const cut = (v, min) => `<span class="${v >= min ? 'pos' : 'neg'}">${v >= min ? 'acima' : 'abaixo'} do mínimo (${min})</span>`;
  const titulo = s.modo === 'item' ? 'Bloco concluído' : s.timeout ? 'Tempo esgotado' : 'Resultado';
  app().innerHTML = header(titulo) + `
  <p class="mut">${esc(s.nome)} · ${fmtD(s.fim || now())}${s.modo === 'prova' ? ` · ${fmtT(s.gasto || 0)} de ${fmtT(s.dur * 60)}` : ''}</p>
  <div class="kpis">
    <div class="kpi"><b class="${sc.liq < 0 ? 'neg' : ''}">${sgn(sc.liq)}</b><span>nota líquida</span></div>
    <div class="kpi"><b>${sc.c}</b><span>certos</span></div><div class="kpi"><b>${sc.e}</b><span>errados</span></div><div class="kpi"><b>${sc.b}</b><span>em branco${sc.x ? ` · ${sc.x} anulado(s)` : ''}</span></div>
  </div>
  ${full ? `<div class="card gap"><h3>Corte do edital (item 8.11.5)</h3>
    <div>P1 · Conhecimentos básicos: <b>${sgn(sc.by.P1.c - sc.by.P1.e)}</b> — ${cut(sc.by.P1.c - sc.by.P1.e, CORTE.P1)}</div>
    <div>P2 · Conhecimentos específicos: <b>${sgn(sc.by.P2.c - sc.by.P2.e)}</b> — ${cut(sc.by.P2.c - sc.by.P2.e, CORTE.P2)}</div>
    <div>Total: <b>${sgn(sc.liq)}</b> — ${cut(sc.liq, CORTE.TOTAL)}</div>
    <p class="mut xs">Cada item vale 1 ponto e cada erro tira 1. Os mínimos não garantem classificação: só evitam a eliminação.</p></div>` : ''}
  <div class="row" style="margin:16px 0"><button class="btn pri" data-r="all">Ver comentários de todos</button><button class="btn" data-r="bad">Só erros e brancos</button><button class="btn" data-r="c3e">Certeza 3 e errei</button></div>
  <h2>Certeza × acerto</h2>${confTable(sc.lv) || '<div class="card empty">Nenhum nível de certeza marcado.</div>'}
  <h2>Qual estratégia rendia mais</h2>${estrategias(sc.lv)}
  <h2>Por matéria</h2><div class="card scroll"><table class="t"><thead><tr><th>Matéria</th><th>Itens</th><th>C</th><th>E</th><th class="hide-sm">Br</th><th>Líq.</th><th>Acerto</th></tr></thead><tbody>
  ${rowsM.map(r => `<tr><td>${esc(r.m)}</td><td>${r.n}</td><td>${r.c}</td><td>${r.e}</td><td class="hide-sm">${r.b}</td><td class="${r.liq < 0 ? 'neg' : ''}">${sgn(r.liq)}</td><td>${r.ac ?? '—'}${r.ac != null ? '%' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  app().onclick = e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const f = { all: () => true, bad: id => (s.resp[id] || {}).r !== Q[id].gabarito && !anulada(Q[id]), c3e: id => { const r = s.resp[id] || {}; return r.c === 3 && r.r && r.r !== Q[id].gabarito; } }[b.dataset.r];
    const list = s.ord.filter(id => Q[id] && f(id));
    if (!list.length) return toast('Nenhum item nesse filtro.');
    startRun(s, { review: true, list });
  };
}
function vHist() {
  const fins = Object.values(S.ses).filter(s => s.status === 'fim').sort((a, b) => b.fim - a.fim);
  app().innerHTML = header('Histórico') + (fins.length ? `<div class="card">${fins.map(s => { const sc = sesScore(s); return `<div class="li"><div class="x"><span class="tag">${esc(MODOS[s.modo].nome)}</span><h3 style="margin-top:6px">${esc(s.nome)}</h3><div class="mut sm">${fmtD(s.fim)} · ${s.ord.length} itens${s.modo === 'prova' ? ' · ' + fmtT(s.gasto || 0) : ''}</div></div><div style="text-align:right"><b class="${sc.liq < 0 ? 'neg' : ''}">${sgn(sc.liq)}</b><div class="mut xs">${sc.c}C ${sc.e}E</div></div><button class="btn" data-s="${esc(s.id)}">Abrir</button></div>`; }).join('')}</div>`
    : '<div class="card empty">Nada encerrado ainda.</div>');
  app().onclick = e => { const b = e.target.closest('[data-s]'); if (b) go('result', { ses: b.dataset.s }); };
}

/* ===================== desempenho ===================== */
function PF() {
  const p = S.prefs.perf || {};
  return { sims: p.sims || [], basis: p.basis || 'last', conf: new Set(p.conf || [0, 1, 2, 3]) };
}
function perfFilters() {
  const p = PF();
  return `<div class="card gap">
  <div><label class="f" style="margin-top:0">Simulados <span class="xs">(nenhum = todos)</span></label><div class="chips" id="p-sims">${SIMS.map(s => `<button class="chip" aria-pressed="${p.sims.includes(s.id)}" data-x="${esc(s.id)}">${esc(s.nome.replace('Estratégia · ', ''))}</button>`).join('')}</div></div>
  <div><label class="f">Contar itens respondidos com certeza</label><div class="chips" id="p-conf">${[[3, '3 · Muito'], [2, '2 · Médio'], [1, '1 · Pouco'], [0, 'Sem nível']].map(([l, t]) => `<button class="chip" aria-pressed="${p.conf.has(l)}" data-x="${l}">${t}</button>`).join('')}</div>
  <p class="mut xs" style="margin-top:6px">Os níveis desligados contam como em branco, como numa prova em que você não os marcaria.</p></div>
  <div><label class="f" for="p-basis">Resposta considerada</label><select id="p-basis"><option value="last" ${p.basis === 'last' ? 'selected' : ''}>A mais recente de cada item</option><option value="first" ${p.basis === 'first' ? 'selected' : ''}>A primeira (sem revisão)</option></select></div></div>`;
}
function bindPerf(rerender, rowClick) {
  app().onclick = e => {
    const c = e.target.closest('#p-sims .chip, #p-conf .chip');
    if (c) { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') !== 'true'); savePF(); return rerender(); }
    rowClick && rowClick(e);
  };
  app().onchange = e => { if (e.target.id === 'p-basis') { savePF(); rerender(); } };
}
function savePF() {
  const sel = id => [...document.querySelectorAll(`#${id} [aria-pressed=true]`)].map(b => b.dataset.x);
  const conf = sel('p-conf').map(Number);
  store.setPrefs({ perf: { sims: sel('p-sims'), conf: conf.length ? conf : [0, 1, 2, 3], basis: ($('#p-basis') || {}).value || 'last' } });
}
function perfTable(rows, key) {
  return `<div class="card scroll"><table class="t"><thead><tr><th>${key === 'mat' ? 'Matéria' : 'Assunto'}</th><th>Resp.</th><th>C</th><th>E</th><th>Líq.</th><th>Acerto</th><th class="hide-sm">Firmes</th></tr></thead><tbody>
  ${rows.map(r => { const t = r.tot || 1; return `<tr data-k="${esc(r.k)}"><td>${esc(r.label || r.k)}<div class="bar" title="Distribuição da certeza">${[3, 2, 1].map(l => `<i class="c${l}" style="width:${100 * r.nivel[l][0] / t}%"></i>`).join('')}</div></td><td>${r.c + r.e}</td><td>${r.c}</td><td>${r.e}</td><td class="${r.liq < 0 ? 'neg' : ''}">${sgn(r.liq)}</td><td>${r.ac ?? '—'}${r.ac != null ? '%' : ''}</td><td class="hide-sm">${r.firmes ?? '—'}${r.firmes != null ? '%' : ''}</td></tr>`; }).join('')}
  </tbody></table><div class="legend"><span><i class="c3"></i>certeza 3</span><span><i class="c2"></i>certeza 2</span><span><i class="c1"></i>certeza 1</span><span>"Firmes" = % respondida com certeza 2 ou 3</span></div>
  <p class="mut xs" style="margin-top:6px">Ordenado do menor para o maior acerto. Toque numa linha para ${key === 'mat' ? 'ver os assuntos' : 'treinar o assunto'}.</p></div>`;
}
function scopeIds() { const p = PF(); return Object.values(Q).filter(q => !p.sims.length || p.sims.includes(q.sim)); }
function vPerf() {
  const p = PF(), qs = scopeIds(), ids = qs.map(q => q.id), tot = agg(ids, p);
  const groups = {}; for (const q of qs) (groups[q.materia] = groups[q.materia] || []).push(q.id);
  const rows = Object.entries(groups).map(([k, g]) => Object.assign({ k }, agg(g, p))).filter(r => r.res).sort((a, b) => (a.ac ?? 101) - (b.ac ?? 101));
  const blocos = ['P1', 'P2'].map(b => Object.assign({ k: b }, agg(qs.filter(q => bloco(q) === b).map(q => q.id), p)));
  app().innerHTML = header('Desempenho') + perfFilters() + `
  <div class="kpis">
    <div class="kpi"><b>${tot.c + tot.e}</b><span>itens contados</span></div>
    <div class="kpi"><b>${tot.ac ?? '—'}${tot.ac != null ? '%' : ''}</b><span>de acerto</span></div>
    <div class="kpi"><b class="${tot.liq < 0 ? 'neg' : ''}">${tot.res ? sgn(tot.liq) : '—'}</b><span>nota líquida</span></div>
    <div class="kpi"><b>${tot.firmes ?? '—'}${tot.firmes != null ? '%' : ''}</b><span>respondidos com certeza 2 ou 3</span></div>
  </div>
  ${tot.res ? `<div class="card gap">${blocos.map(b => `<div><b>${b.k === 'P1' ? 'P1 · Conhecimentos básicos' : 'P2 · Conhecimentos específicos'}</b><div class="mut sm">${b.ac ?? '—'}${b.ac != null ? '%' : ''} de acerto · líquido ${sgn(b.liq)} em ${b.c + b.e + b.b + b.fora} itens respondidos</div></div>`).join('')}</div>
  <h2>Certeza × acerto</h2>${confTable(tot.nivel)}
  <h2>Qual estratégia rende mais</h2>${estrategias(tot.nivel)}
  <h2>Por matéria</h2>${perfTable(rows, 'mat')}` : '<div class="card empty">Ainda não há respostas nesse recorte.</div>'}`;
  bindPerf(vPerf, e => { const tr = e.target.closest('tr[data-k]'); if (tr) go('mat', { mat: tr.dataset.k }); });
}
function vMat() {
  const m = VIEW.mat, p = PF(); const qs = scopeIds().filter(q => q.materia === m);
  const groups = {}; for (const q of qs) (groups[assuntoCod(q)] = groups[assuntoCod(q)] || []).push(q.id);
  const lab = c => ((TAX[m] || []).find(x => x[0] === c) || [c, c])[1];
  const rows = Object.entries(groups).map(([k, g]) => Object.assign({ k, label: lab(k), n: g.length }, agg(g, p))).sort((a, b) => (a.res ? 0 : 1) - (b.res ? 0 : 1) || (a.ac ?? 101) - (b.ac ?? 101));
  const tot = agg(qs.map(q => q.id), p);
  const semItens = (TAX[m] || []).filter(([c]) => !groups[c]);
  app().innerHTML = `<div class="hdr"><button class="icon" data-back="perf" aria-label="Voltar">${ICON.left}</button><span class="sp"></span>${syncPill()}</div><h1>${esc(m)}</h1>
  <p class="mut">${qs.length} itens nos simulados · ${ITENS_EDITAL[m] || '?'} itens na prova · acerto ${tot.ac ?? '—'}${tot.ac != null ? '%' : ''} · líquido ${sgn(tot.liq)}</p>
  <div class="row" style="margin:12px 0"><button class="btn pri" id="tr-mat">Treinar ${esc(m)}</button><button class="btn" id="tr-mat-err">Só erros e brancos</button></div>
  ${perfTable(rows.map(r => Object.assign(r, { k: r.k })), 'ass')}
  ${semItens.length ? `<p class="mut sm" style="margin-top:12px">Assuntos do edital sem item nos simulados: ${semItens.map(x => esc(x[1])).join('; ')}.</p>` : ''}`;
  app().onclick = e => {
    const tr = e.target.closest('tr[data-k]');
    const start = (F, nome) => { const s = novaSes('item', nome, F, { sims: [] }); startRun(s); };
    if (tr) { const ids = groups[tr.dataset.k] || []; if (ids.length) start(ids, `${m} · ${lab(tr.dataset.k)}`); }
    if (e.target.id === 'tr-mat') start(qs.map(q => q.id), m);
    if (e.target.id === 'tr-mat-err') { const ids = qs.filter(q => { const a = pick(q.id); return a && (a.r === 'B' || !a.ok) && !anulada(q); }).map(q => q.id); if (!ids.length) return toast('Nenhum erro ou branco nessa matéria.'); start(ids, `${m} · erros e brancos`); }
  };
}

/* ===================== revisão ===================== */
function vRev() {
  const ids = Object.keys(Q).filter(id => st(id).rev);
  app().innerHTML = header('Para revisão') + (ids.length ? `<div class="row"><button class="btn pri" id="all">Treinar os ${ids.length}</button></div>
  <div class="card" style="margin-top:14px">${ids.map((id, i) => { const q = Q[id], s = st(id), a = pick(id); return `<div class="li"><div class="x"><div class="xs mut">${esc(q.materia)} · ${esc(assuntoLabel(q))} · item ${q.n} · ${esc(simNome(q.sim))}${a ? ` · ${a.r === 'B' ? 'branco' : a.ok ? 'acertou' : 'errou'}${a.c ? ' (certeza ' + a.c + ')' : ''}` : ''}</div>
  <div class="sm">${esc(plain(q.enunciado).slice(-200))}</div>${s.a1 ? `<div class="note"><b>Durante:</b> ${esc(s.a1)}</div>` : ''}${s.a2 ? `<div class="note"><b>Depois:</b> ${esc(s.a2)}</div>` : ''}</div><button class="btn" data-i="${i}">Abrir</button></div>`; }).join('')}</div>`
    : '<div class="card empty">Nenhum item marcado. Use o botão Revisar durante a resolução.</div>');
  app().onclick = e => {
    if (e.target.id === 'all') return startRun(novaSes('item', 'Itens em revisão', ids, {}));
    const b = e.target.closest('[data-i]'); if (b) startRun(novaSes('item', 'Itens em revisão', ids, {}), { i: +b.dataset.i });
  };
}

/* ===================== discursivas ===================== */
const discSt = (sim, did) => ((S.disc[sim] || {}).d || {})[did] || {};
function vDiscs() {
  app().innerHTML = header('Discursivas') + `<p class="mut">Na prova: 4 questões de 10 pontos (até 30 linhas cada), 4h30, aprovação com 20 pontos.</p>` + SIMS.filter(s => (s.discursivas || []).length).map(s => `<h2>${esc(s.nome)}</h2><div class="card">${s.discursivas.map(d => { const x = discSt(s.id, d.id); return `<div class="li"><div class="x"><b>${esc(d.materia)}</b><div class="mut sm">${x.txt ? linhas(x.txt) + ' linhas escritas' : 'Não iniciada'}${x.nota !== undefined && x.nota !== '' ? ' · nota ' + esc(x.nota) : ''}</div></div><button class="btn" data-d="${esc(s.id)}|${esc(d.id)}">Abrir</button></div>`; }).join('')}</div>`).join('');
  app().onclick = e => { const b = e.target.closest('[data-d]'); if (b) { const [sim, did] = b.dataset.d.split('|'); go('disc', { sim, did }); } };
}
const linhas = t => Math.ceil((t || '').length / 70) || 0;
function vDisc() {
  const s = simById(VIEW.sim), d = (s.discursivas || []).find(x => x.id === VIEW.did), x = discSt(s.id, d.id);
  const cnt = t => { const l = linhas(t); return `${(t || '').length} caracteres · ≈ ${l} de 30 linhas${l > 30 ? ' — passou do limite' : ''}`; };
  app().innerHTML = `<div class="hdr"><button class="icon" data-back="discs" aria-label="Voltar">${ICON.left}</button><span class="sp"></span>${syncPill()}</div>
  <div class="qcard"><div class="qhead"><span class="tag">Discursiva</span><span class="tag">${esc(d.materia)}</span></div><div class="disc qtxt">${d.enunciado}</div></div>
  <label class="f" for="dt">Sua resposta</label><textarea id="dt" style="min-height:320px">${esc(x.txt || '')}</textarea><p class="mut xs" id="dc">${cnt(x.txt)}</p>
  ${x.ver ? `<div class="com disc"><h3>Proposta de solução</h3>${d.proposta}</div>
  <label class="f" for="dn">Sua nota (0 a 10)</label><input id="dn" type="number" min="0" max="10" step="0.25" value="${esc(x.nota ?? '')}">
  <label class="f" for="do">O que faltou</label><textarea id="do">${esc(x.obs || '')}</textarea>` : `<button class="btn pri" id="ver" style="margin-top:10px">Ver proposta de solução</button>`}`;
  let t; const save = patch => { clearTimeout(t); t = setTimeout(() => store.setDisc(s.id, d.id, Object.assign(patch, { u: now() })), 600); };
  app().oninput = e => { const k = { dt: 'txt', dn: 'nota', do: 'obs' }[e.target.id]; if (!k) return; if (k === 'txt') $('#dc').textContent = cnt(e.target.value); save({ [k]: e.target.value }); };
  app().onclick = e => { if (e.target.id === 'ver') { store.setDisc(s.id, d.id, { ver: true, txt: $('#dt').value, u: now() }); vDisc(); } };
}

/* ===================== dados ===================== */
function vDados() {
  app().innerHTML = header('Dados e conta') + `
  <div class="card gap"><h3>Conta</h3><p class="sm">${S.mode === 'firebase' ? `Conectado como <b>${esc((S.user || {}).email || '')}</b>. Respostas, anotações e simulados sincronizam entre os seus aparelhos e ficam disponíveis offline.` : 'Modo local: os dados ficam só neste navegador. Configure o Firebase para sincronizar.'}</p>
  ${S.mode === 'firebase' ? '<button class="btn ghost" id="out">Sair da conta</button>' : ''}</div>
  <div class="card gap" style="margin-top:12px"><h3>Simulados carregados (${SIMS.length})</h3>
  ${SIMS.map(s => `<div class="row sm"><span class="sp">${esc(s.nome)} · ${esc(s.data || '')}</span><span class="mut">${s.questoes.length} itens</span></div>`).join('') || '<p class="mut sm">Nenhum.</p>'}
  <label class="f" for="imp">Importar banco de questões (.json)</label><input type="file" id="imp" accept=".json,application/json">
  <p class="mut xs">Aceita o arquivo completo ou um simulado avulso. Um simulado com o mesmo identificador é substituído (o seu progresso é mantido).</p></div>
  <div class="card gap" style="margin-top:12px"><h3>Backup do progresso</h3>
  <div class="row"><button class="btn" id="exp">Baixar backup</button><label class="btn" style="display:inline-flex;align-items:center">Restaurar backup<input type="file" id="bkp" accept=".json" hidden></label></div></div>`;
  app().onclick = async e => {
    if (e.target.id === 'out') store.signOut();
    if (e.target.id === 'exp') {
      const blob = new Blob([JSON.stringify({ app: 'simulados-sefaz', v: 2, em: now(), prog: S.prog, ses: S.ses, disc: S.disc, prefs: S.prefs })], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup-simulados-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
  };
  app().onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (e.target.id === 'imp') {
        const lista = Array.isArray(j) ? j : [j]; let n = 0;
        for (const b of lista) if (b && b.id && b.questoes) { toast(`Importando ${b.nome}…`); await store.saveBank(b); n++; }
        reindex(); toast(n + ' simulado(s) importado(s).'); vDados();
      } else {
        for (const [sim, p] of Object.entries(j.prog || {})) for (const [qid, v] of Object.entries(p.q || {})) store.setQ(sim, qid, v);
        for (const s of Object.values(j.ses || {})) store.setSes(s);
        for (const [sim, p] of Object.entries(j.disc || {})) for (const [did, v] of Object.entries(p.d || {})) store.setDisc(sim, did, v);
        toast('Backup restaurado.');
      }
    } catch (err) { console.error(err); toast('Arquivo não reconhecido.'); }
  };
}

/* ===================== camadas ===================== */
function sheet(html, onclick) {
  $('#layer').innerHTML = `<div class="sheet"><div class="box">${html}</div></div>`;
  $('#layer').onclick = e => { if (e.target.classList.contains('sheet') || e.target.closest('[data-close]')) return closeSheet(); onclick && onclick(e); };
}
function closeSheet() { $('#layer').innerHTML = ''; }
function confirmBox(msg, yes) { sheet(`<p style="font-size:17px;font-weight:700">${esc(msg)}</p><div class="row"><button class="btn pri" id="yes">Confirmar</button><button class="btn ghost" data-close>Cancelar</button></div>`, e => { if (e.target.id === 'yes') { closeSheet(); yes(); } }); }
let tT; function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 3000); }

/* ===================== início ===================== */
onChange(what => {
  if (what === 'all' || what === 'bancos') reindex();
  if (what === 'net') { const p = document.querySelector('.pill'); if (p) p.outerHTML = syncPill(); return; }
  if (VIEW.v === 'run' || VIEW.v === 'disc' || VIEW.v === 'setup') return; // não interromper quem está digitando/resolvendo
  render();
});
initStore(() => { VIEW = { v: 'login' }; render(); }).then(() => { reindex(); if (!(S.mode === 'firebase' && !S.user)) render(); });
