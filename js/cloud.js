/* =====================================================================
   cloud.js — everything that talks to Supabase
   • Login (Google or email link) + access check against app_users
   • Invoices: cached in this browser (IndexedDB), only NEW/CHANGED rows are downloaded
   • Shared Admin settings (salary, targets, photos, logo…) in the `settings` table
   • Users (Admin → Users): add / remove emails, roles
   Nothing here touches the old Google-Sheet dashboard or its browser storage.
   ===================================================================== */

let SB = null;                  // Supabase client
let CURRENT_USER = null;        // { email, role }
let RAW_ROWS = [];              // every active invoice (all locations); ALL_ROWS = RAW_ROWS filtered by location
let SYNC_INFO = null;           // last Zoho sync summary (admins only)

const LIVE_KEYS = {             // browser storage names used ONLY by this dashboard (the old one uses pnp_dashboard_*)
  settingsCache: 'pnp_live_admin_cache_v1',
  savedView: 'pnp_live_saved_view_v1',
  authStorage: 'pnp-live-auth',
  idb: 'pnp-live-db'
};
const INVOICE_COLS = 'invoice_no,invoice_date,customer,total,net,tax,profit,midap,salesperson,order_type,company_sales,place_of_supply,billing_code,location,status,updated_at';

function cloudReady(){
  if(!window.supabase || !window.supabase.createClient) throw new Error('Supabase library (js/vendor/supabase.js) did not load.');
  if(!CONFIG.SUPABASE_KEY || /PASTE/i.test(CONFIG.SUPABASE_KEY)) throw new Error('Supabase publishable key is missing. Open js/config.js on GitHub and paste it into SUPABASE_KEY.');
  if(!SB) SB = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: LIVE_KEYS.authStorage }
  });
  return SB;
}
const siteUrl = () => location.origin + location.pathname;

/* ============================ LOGIN ============================ */
function showGate(mode, info){
  const g = document.getElementById('loginGate');
  g.style.display = 'flex';
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('gateLogin').style.display = mode === 'login' ? '' : 'none';
  document.getElementById('gateNoAccess').style.display = mode === 'noaccess' ? '' : 'none';
  document.getElementById('gateSent').style.display = mode === 'sent' ? '' : 'none';
  if(mode === 'noaccess') document.getElementById('gateNoAccessEmail').textContent = info || '';
  if(mode === 'sent') document.getElementById('gateSentEmail').textContent = info || '';
  const msg = document.getElementById('gateMsg');
  msg.textContent = (mode === 'login' && info) ? info : ''; msg.style.display = msg.textContent ? '' : 'none';
}
function hideGate(){ document.getElementById('loginGate').style.display = 'none'; }

async function signInGoogle(){
  const { error } = await cloudReady().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } });
  if(error) showGate('login', 'Google login nahi hua: ' + error.message + ' (Supabase me Google provider chalu hai?)');
}
async function signInEmail(email){
  email = String(email || '').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ showGate('login', 'Sahi email daalein.'); return; }
  const { error } = await cloudReady().auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() } });
  if(error){ showGate('login', 'Login link nahi gaya: ' + error.message); return; }
  showGate('sent', email);
}
async function signOut(){
  try{ await cloudReady().auth.signOut(); }catch(e){}
  try{ await idbClear(); }catch(e){}
  location.href = siteUrl();
}

/* Resolves with CURRENT_USER once someone with access is logged in (shows the login screen until then) */
async function requireUser(){
  const sb = cloudReady();
  const { data: { session } } = await sb.auth.getSession();
  if(session) return checkAccess(session);
  showGate('login');
  return new Promise(resolve => {
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if(s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')){ sub.subscription.unsubscribe(); resolve(checkAccess(s)); }
    });
  });
}
async function checkAccess(session){
  const email = String(session.user.email || '').toLowerCase();
  const { data, error } = await cloudReady().from('app_users').select('email,role').eq('email', email).maybeSingle();
  if(error) throw new Error('Access check failed: ' + error.message);
  if(!data){ showGate('noaccess', email); return new Promise(()=>{}); }      // stays on the "no access" screen
  CURRENT_USER = { email, role: data.role };
  hideGate();
  return CURRENT_USER;
}
const isAdminUser = () => !!(CURRENT_USER && CURRENT_USER.role === 'admin');

/* ============================ BROWSER CACHE (IndexedDB) ============================ */
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(LIVE_KEYS.idb, 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('invoices', { keyPath: 'invoice_no' }); db.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbTx(store, mode, fn){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const out = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); res((typeof IDBRequest !== 'undefined' && out instanceof IDBRequest) ? out.result : out); };   // a request → its value (undefined if key is missing)
    t.onerror = () => rej(t.error);
  });
}
const idbAll = () => idbTx('invoices', 'readonly', s => s.getAll());
const idbPut = rows => idbTx('invoices', 'readwrite', s => { rows.forEach(r => s.put(r)); });
const idbGetMeta = k => idbTx('meta', 'readonly', s => s.get(k));
const idbSetMeta = (k, v) => idbTx('meta', 'readwrite', s => s.put(v, k));
async function idbClear(){ await idbTx('invoices', 'readwrite', s => s.clear()); await idbTx('meta', 'readwrite', s => s.clear()); }

/* ============================ INVOICES ============================ */
async function fetchChanged(since){
  const sb = cloudReady(), page = 1000; let out = [], from = 0;
  for(;;){
    let q = sb.from('invoices').select(INVOICE_COLS).order('updated_at', { ascending: true }).order('invoice_no', { ascending: true }).range(from, from + page - 1);
    if(since) q = q.gt('updated_at', since);
    const { data, error } = await q;
    if(error) throw new Error('Supabase: ' + error.message);
    out = out.concat(data || []);
    if(!data || data.length < page) break;
    from += page;
  }
  return out;
}
async function serverCount(){
  const { count, error } = await cloudReady().from('invoices').select('invoice_no', { count: 'exact', head: true });
  if(error) throw new Error('Supabase: ' + error.message);
  return count || 0;
}
const newestOf = (rows, start) => rows.reduce((m, r) => (r.updated_at && (!m || r.updated_at > m)) ? r.updated_at : m, start || null);

/* Downloads only what changed since the last visit; full download the first time (or after deletes) */
async function loadInvoices(forceFull){
  let cache = new Map(), since = null, cacheOk = true;
  if(!forceFull){
    try {
      (await idbAll() || []).forEach(r => cache.set(r.invoice_no, r));
      const m = await idbGetMeta('since');
      since = (typeof m === 'string' && /^\d{4}-\d{2}-\d{2}/.test(m)) ? m : null;       // only a real timestamp, never an object
      if(!since) cache = new Map();                                                           // no valid bookmark → start clean
    }
    catch(e){ cacheOk = false; cache = new Map(); since = null; }
  }
  const changed = await fetchChanged(since);
  changed.forEach(r => cache.set(r.invoice_no, r));
  let newest = newestOf(changed, since), full = !since, downloaded = changed.length;
  const count = await serverCount();
  if(count !== cache.size){                                  // rows were deleted on the server → start clean
    cache = new Map(); const all = await fetchChanged(null);
    all.forEach(r => cache.set(r.invoice_no, r)); newest = newestOf(all); full = true; downloaded = all.length;
    if(cacheOk){ try{ await idbClear(); await idbPut(all); }catch(e){ cacheOk = false; } }
  } else if(cacheOk && (changed.length || !since)){
    try{ await idbPut(changed); }catch(e){ cacheOk = false; }
  }
  if(cacheOk && newest){ try{ await idbSetMeta('since', newest); }catch(e){} }
  return { rows: [...cache.values()], downloaded, full, cacheOk };
}

/* Supabase row → the row shape every report already understands */
function toDashRow(x){
  const d = x.invoice_date ? new Date(x.invoice_date + 'T00:00:00') : null;
  const pending = x.profit === null || x.profit === undefined;
  const net = Number(x.net) || 0, total = Number(x.total);
  let type = String(x.order_type || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  if(type === 'CRR BY OWN') type = 'CRR';
  return {
    date: d, invoice: String(x.invoice_no || ''), customer: String(x.customer || 'Unknown').trim() || 'Unknown',
    total: isNaN(total) ? net : total, net, tax: Number(x.tax) || 0,
    profit: pending ? 0 : Number(x.profit) || 0, pp: pending, pnet: pending ? 0 : net,     // pp = profit pending; pnet = sales that have a profit
    salesperson: String(x.salesperson || 'Unknown').trim() || 'Unknown', ordertype: type,
    companysales: String(x.company_sales || 'NO').trim().toUpperCase(), midap: String(x.midap || '').trim(),
    state: normState(x.place_of_supply), pincode: normPin(x.billing_code),
    location: String(x.location || 'Unknown').trim() || 'Unknown', status: String(x.status || 'ACTIVE').toUpperCase()
  };
}

/* Last Zoho sync (sync_log is readable by admins only) */
async function loadSyncInfo(){
  if(!isAdminUser()) return null;
  try{
    const { data } = await cloudReady().from('sync_log').select('at,type,message').order('at', { ascending: false }).limit(20);
    const last = (data || []).find(x => x.type === 'summary');
    const err = (data || []).find(x => x.type === 'error');
    SYNC_INFO = { last, error: err && (!last || err.at > last.at) ? err : null };
  }catch(e){ SYNC_INFO = null; }
  return SYNC_INFO;
}

/* ============================ SHARED SETTINGS ============================ */
function mergeSettings(v){
  const s = Object.assign({}, DEFAULT_ADMIN_SETTINGS, v || {});
  const d = DEFAULT_ADMIN_SETTINGS.scoring, g = s.scoring || {};
  s.scoring = Object.assign({}, d, g, { wNbd: Object.assign({}, d.wNbd, g.wNbd), wCrr: Object.assign({}, d.wCrr, g.wCrr) });
  s.photos = s.photos || {}; s.custTargets = s.custTargets || {};
  return s;
}
async function loadSharedSettings(){
  const { data, error } = await cloudReady().from('settings').select('value,updated_at,updated_by').eq('key', 'admin').maybeSingle();
  if(error) throw new Error('Settings: ' + error.message);
  const s = mergeSettings(data && data.value);
  s._fromCloud = !!data; s._updatedBy = data && data.updated_by; s._updatedAt = data && data.updated_at;
  try{ localStorage.setItem(LIVE_KEYS.settingsCache, JSON.stringify(s)); }catch(e){}
  return s;
}
async function saveSharedSettings(value){
  const clean = Object.assign({}, value); delete clean._fromCloud; delete clean._updatedBy; delete clean._updatedAt;
  const { error } = await cloudReady().from('settings').upsert({ key: 'admin', value: clean, updated_at: new Date().toISOString(), updated_by: CURRENT_USER.email }, { onConflict: 'key' });
  if(error) throw new Error(error.message.indexOf('row-level security') >= 0 ? 'Sirf Admin settings save kar sakta hai.' : error.message);
  try{ localStorage.setItem(LIVE_KEYS.settingsCache, JSON.stringify(clean)); }catch(e){}
}
/* Settings of the OLD dashboard in this browser (read only — never changed) */
function oldDashboardSettings(){
  try{ const raw = localStorage.getItem('pnp_dashboard_admin_settings_v1'); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}

/* ============================ USERS ============================ */
async function listUsers(){
  const { data, error } = await cloudReady().from('app_users').select('email,role,added_at,added_by').order('added_at', { ascending: true });
  if(error) throw new Error(error.message); return data || [];
}
async function addUser(email, role){
  email = String(email || '').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Sahi email daalein.');
  const { error } = await cloudReady().from('app_users').upsert({ email, role: role === 'admin' ? 'admin' : 'viewer', added_by: CURRENT_USER.email }, { onConflict: 'email' });
  if(error) throw new Error(error.message.indexOf('row-level security') >= 0 ? 'Sirf Admin users jod sakta hai (owner ka role badla nahi ja sakta).' : error.message);
}
async function removeUser(email){
  const { error } = await cloudReady().from('app_users').delete().eq('email', email);
  if(error) throw new Error(error.message);
}
