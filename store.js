// Camada de dados: Firebase (sincroniza entre aparelhos, funciona offline) ou, sem configuração, armazenamento local.
import { firebaseConfig } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.5/';

/* ---------- IndexedDB mínimo (modo local) ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('simulados-sefaz', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const db = await idb(); return new Promise(r => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => r(t.result); t.onerror = () => r(undefined); }); }
async function kvSet(k, v) { const db = await idb(); return new Promise(r => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => r(); t.onerror = () => r(); }); }

function deepMerge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

/* Estado em memória espelhado do armazenamento */
export const S = { bancos: {}, prog: {}, ses: {}, disc: {}, prefs: {}, user: null, mode: 'local', online: navigator.onLine };
let listeners = [];
export const onChange = fn => listeners.push(fn);
const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });

let impl = null;

/* ---------- Implementação local ---------- */
const Local = {
  async init() {
    S.mode = 'local';
    const all = (await kvGet('estado')) || {};
    Object.assign(S, { bancos: {}, prog: all.prog || {}, ses: all.ses || {}, disc: all.disc || {}, prefs: all.prefs || {} });
    for (const b of ((await kvGet('bancos')) || [])) S.bancos[b.id] = b;
    emit('all');
  },
  _t: null,
  _save() { clearTimeout(this._t); this._t = setTimeout(() => kvSet('estado', { prog: S.prog, ses: S.ses, disc: S.disc, prefs: S.prefs }), 300); },
  async saveBank(b) { S.bancos[b.id] = b; await kvSet('bancos', Object.values(S.bancos)); emit('bancos'); },
  async deleteBank(id) { delete S.bancos[id]; await kvSet('bancos', Object.values(S.bancos)); emit('bancos'); },
  setQ(sim, qid, patch) { const p = S.prog[sim] || (S.prog[sim] = { q: {} }); p.q[qid] = Object.assign(p.q[qid] || {}, patch); this._save(); },
  setSes(s) { S.ses[s.id] = s; this._save(); },
  delSes(id) { delete S.ses[id]; this._save(); },
  setDisc(sim, did, patch) { const p = S.disc[sim] || (S.disc[sim] = { d: {} }); p.d[did] = Object.assign(p.d[did] || {}, patch); this._save(); },
  setPrefs(p) { Object.assign(S.prefs, p); this._save(); },
  async signOut() {},
};

/* ---------- Implementação Firebase ---------- */
let F = {};
const Fire = {
  async init(onNeedLogin) {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
    F.auth = auth; F.fs = fs;
    F.app = initializeApp(firebaseConfig);
    F.a = auth.getAuth(F.app);
    try { await auth.setPersistence(F.a, auth.indexedDBLocalPersistence); } catch (e) {}
    F.db = fs.initializeFirestore(F.app, { ignoreUndefinedProperties: true, localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    S.mode = 'firebase';
    try { await auth.getRedirectResult(F.a); } catch (e) { console.warn(e); }
    return new Promise(resolve => {
      auth.onAuthStateChanged(F.a, user => {
        S.user = user ? { uid: user.uid, nome: user.displayName, email: user.email } : null;
        if (!user) { onNeedLogin(); resolve(); return; }
        this._subscribe(); resolve();
      });
    });
  },
  async login() {
    const p = new F.auth.GoogleAuthProvider();
    try { await F.auth.signInWithPopup(F.a, p); }
    catch (e) { if (String(e.code).includes('popup')) await F.auth.signInWithRedirect(F.a, p); else throw e; }
  },
  async signOut() { await F.auth.signOut(F.a); location.reload(); },
  _p(...seg) { return F.fs.doc(F.db, 'users', S.user.uid, ...seg); },
  _c(name) { return F.fs.collection(F.db, 'users', S.user.uid, name); },
  _subscribe() {
    const { onSnapshot } = F.fs;
    let first = { bancos: 0, progresso: 0, sessoes: 0, disc: 0, config: 0 };
    const done = () => Object.values(first).every(Boolean);
    const sub = (name, fn) => onSnapshot(this._c(name), { includeMetadataChanges: false }, snap => {
      snap.docChanges().forEach(ch => fn(ch.type, ch.doc.id, ch.doc.data()));
      if (!first[name]) { first[name] = 1; if (done()) emit('all'); } else emit(name);
    }, err => { console.warn(name, err); first[name] = 1; emit('erro'); });
    sub('bancos', (t, id, d) => { if (t === 'removed') delete S.bancos[id]; else { try { S.bancos[id] = JSON.parse(d.json); } catch (e) {} } });
    sub('progresso', (t, id, d) => { if (t === 'removed') delete S.prog[id]; else S.prog[id] = d; });
    sub('sessoes', (t, id, d) => { if (t === 'removed') delete S.ses[id]; else S.ses[id] = d; });
    sub('disc', (t, id, d) => { if (t === 'removed') delete S.disc[id]; else S.disc[id] = d; });
    sub('config', (t, id, d) => { if (id === 'prefs' && t !== 'removed') S.prefs = d || {}; });
  },
  async saveBank(b) { await F.fs.setDoc(this._p('bancos', b.id), { nome: b.nome, ordem: b.ordem || 0, json: JSON.stringify(b) }); S.bancos[b.id] = b; emit('bancos'); },
  async deleteBank(id) { await F.fs.deleteDoc(this._p('bancos', id)); },
  setQ(sim, qid, patch) {
    const p = S.prog[sim] || (S.prog[sim] = { q: {} }); p.q = p.q || {};
    p.q[qid] = Object.assign(p.q[qid] || {}, patch);
    F.fs.setDoc(this._p('progresso', sim), { q: { [qid]: patch } }, { merge: true }).catch(e => console.warn(e));
  },
  setSes(s) { S.ses[s.id] = s; F.fs.setDoc(this._p('sessoes', s.id), JSON.parse(JSON.stringify(s))).catch(e => console.warn(e)); },
  delSes(id) { delete S.ses[id]; F.fs.deleteDoc(this._p('sessoes', id)).catch(() => {}); },
  setDisc(sim, did, patch) {
    const p = S.disc[sim] || (S.disc[sim] = { d: {} }); p.d = p.d || {};
    p.d[did] = Object.assign(p.d[did] || {}, patch);
    F.fs.setDoc(this._p('disc', sim), { d: { [did]: patch } }, { merge: true }).catch(e => console.warn(e));
  },
  setPrefs(pp) { Object.assign(S.prefs, pp); F.fs.setDoc(this._p('config', 'prefs'), pp, { merge: true }).catch(() => {}); },
};

export async function initStore(onNeedLogin) {
  addEventListener('online', () => { S.online = true; emit('net'); });
  addEventListener('offline', () => { S.online = false; emit('net'); });
  if (firebaseConfig && firebaseConfig.apiKey) {
    try { impl = Fire; await Fire.init(onNeedLogin); return; }
    catch (e) { console.warn('Firebase indisponível, usando modo local', e); }
  }
  impl = Local; await Local.init();
}
export const store = {
  login: () => impl.login && impl.login(),
  signOut: () => impl.signOut(),
  saveBank: b => impl.saveBank(b),
  deleteBank: id => impl.deleteBank(id),
  setQ: (s, q, p) => impl.setQ(s, q, p),
  setSes: s => impl.setSes(s),
  delSes: id => impl.delSes(id),
  setDisc: (s, d, p) => impl.setDisc(s, d, p),
  setPrefs: p => impl.setPrefs(p),
  merge: deepMerge,
};
