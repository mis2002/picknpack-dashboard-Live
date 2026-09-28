/* =====================================================================
   page.js — boot for Delhi Online / Gujarat / Karnataka / Summary pages.
   <body data-page="online|gujarat|karnataka|summary">
   ===================================================================== */
const PAGE = document.body.dataset.page;
/* the shared map (customer-map.js) opens invoice lists through this name */
if(typeof openInvoiceList !== 'function') window.openInvoiceList = (title, rows) => mvOpenInvoices(title, rows);
if(typeof registerDrill !== 'function') window.registerDrill = (title, rows, sub) => mvReg(title, rows, sub);
document.addEventListener('click', e => { const d = e.target.closest('[data-drill]'); if(!d) return; const x = MV_DRILL.get(d.dataset.drill); if(x) mvOpenInvoices(x.title, x.rows, x.sub); });
let DASH = null, P_TIMER = null;

function pStatus(ok, msg){ document.getElementById('syncStatus').innerHTML = `<span class="live-dot ${ok ? '' : 'err'}"></span>${msg}`; }
function pError(msg){ const b = document.getElementById('errBar'); b.innerHTML = `⚠️ ${escAttr(msg)}<br><br>Check your internet connection and press <b>Refresh</b>.`; b.classList.add('show'); }
function pBranding(){
  document.getElementById('brandLabel').textContent = ADMIN.brandName || 'PICK N PACK';
  const logo = document.getElementById('brandLogo'), icon = document.getElementById('sbLogo');
  logo.onload = () => logo.style.display = ''; logo.onerror = () => logo.style.display = 'none'; logo.src = ADMIN.logo || 'assets/logo.png?v=20260930';
  icon.onload = () => { icon.style.display = ''; document.querySelector('.sb-brand').style.display = 'none'; }; icon.onerror = () => icon.style.display = 'none'; icon.src = 'assets/logo-icon.png?v=20260930';
}
function pConfig(){
  if(PAGE === 'summary'){
    const locs = enabledLocs().map(l => l.key);
    QA_PAGE_LOCS = locs;
    return { title: 'Summary', pill: enabledLocs().map(l => l.name).join(' · '), desc: 'All active locations together: sales, customers, location comparison and geography.',
      cfg: { id: 'sum', locations: locs, rows: () => RAW_ROWS, showSp: true, filters: { sp: true, pin: true, cust: true, transfers: true } } };
  }
  const l = locByCode(PAGE);
  if(!l) return { error: 'Unknown dashboard.' };
  QA_PAGE_LOCS = [l.key];
  if(!l.enabled) return { title: l.name, pill: l.name, error: `${l.name} is switched off in Settings. An admin can enable it under Settings → Locations.` };
  return { title: l.name, pill: l.name, desc: l.code === 'online' ? 'Website and marketplace orders. Customers are identified by mobile number.' : `Sales and customers of ${l.name}.`,
    cfg: { id: 'loc', locations: [l.key], rows: () => RAW_ROWS, showSp: l.code !== 'online', filters: {} } };
}
function pHero(D){
  const net = D.cur.reduce((s, r) => s + r.net, 0), prev = D.prev.reduce((s, r) => s + r.net, 0);
  document.getElementById('heroFigTitle').textContent = 'Net sales · ' + D.P.label;
  document.getElementById('heroFig').textContent = fmtINR(net);
  const g = D.prev.length && prev ? (net - prev) / prev * 100 : null;
  document.getElementById('heroFigSub').textContent = `${fmtNum(D.cur.length)} orders` + (g === null ? '' : ` · ${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}% vs previous`);
}
function pTab(tab){
  document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === tab));
  if(DASH) DASH.setTab(tab);
  if(location.hash.replace('#', '') !== tab) history.replaceState(null, '', '#' + tab);
}
document.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => { pTab(b.dataset.stab); window.scrollTo({ top: 0, behavior: 'smooth' }); }));

function pDraw(){
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardBody').style.display = 'block';
  document.getElementById('errBar').classList.remove('show');
  if(!DASH){
    const P = pConfig();
    document.getElementById('dashTitle').textContent = P.title || '';
    document.getElementById('locPill').textContent = P.pill || '';
    document.getElementById('heroTitle').textContent = P.title || '';
    document.getElementById('heroSub').textContent = P.desc || '';
    document.title = 'Pick N Pack — ' + (P.title || 'Dashboard');
    if(P.error){ document.getElementById('dashRoot').innerHTML = `<div class="panel mv-empty"><h2>${escAttr(P.title || 'Not available')}</h2><p class="muted">${escAttr(P.error)}</p></div>`; return; }
    const hash = (location.hash || '').replace('#', '');
    P.cfg.tab = ['sales', 'customers', 'geo', 'forecast'].indexOf(hash) >= 0 ? hash : 'sales';
    P.cfg.onRender = pHero;
    DASH = createDash(document.getElementById('dashRoot'), P.cfg);
    document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === P.cfg.tab));
  }
  DASH.render();
}
async function pLoad(manual){
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spinning');
  if(manual) pStatus(true, 'Refreshing…');
  try{
    const before = RAW_ROWS.length;
    await fetchSheetRows(false);
    if(!DASH || DATA_HEALTH.full || DATA_HEALTH.downloaded || RAW_ROWS.length !== before) pDraw();
    pStatus(true, `Live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` + (DATA_HEALTH.downloaded && !DATA_HEALTH.full ? ` · ${fmtNum(DATA_HEALTH.downloaded)} new` : ''));
    if(manual) showToast(DATA_HEALTH.downloaded && !DATA_HEALTH.full ? `${fmtNum(DATA_HEALTH.downloaded)} new or changed invoices.` : 'Up to date.');
  }catch(err){
    console.error(err); pStatus(false, 'Connection error'); pError(err.message || String(err));
    if(!DASH) document.getElementById('loadingScreen').style.display = 'none';
  }finally{ btn.classList.remove('spinning'); }
}
document.getElementById('refreshBtn').addEventListener('click', () => pLoad(true));
document.getElementById('logoutBtn').addEventListener('click', () => { if(confirm('Log out?')) signOut(); });

async function pStart(){
  try{
    await requireUser();
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = CURRENT_USER.email;
    document.getElementById('avatarBadge').textContent = CURRENT_USER.email.slice(0, 2).toUpperCase();
    const [settings, cached] = await Promise.all([loadSharedSettings().catch(() => null), fetchCachedRows().catch(() => null)]);
    if(settings) ADMIN = settings;
    if(!userCan('sales')){ location.replace(homeFor() || 'index.html'); return; }   // Sales right needed for these dashboards
    pBranding(); navRender();
    if(cached){ pDraw(); pStatus(true, 'Checking for new invoices…'); }
    await pLoad(false);
    P_TIMER = setInterval(() => { if(!document.hidden) pLoad(false); }, Math.max(60, ADMIN.refreshSeconds || 300) * 1000);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) pLoad(false); });
    let rw = window.innerWidth;
    window.addEventListener('resize', () => { clearTimeout(pStart._r); pStart._r = setTimeout(() => { if(Math.abs(window.innerWidth - rw) > 60 && DASH){ rw = window.innerWidth; DASH.render(); } }, 250); });
  }catch(err){ console.error(err); document.getElementById('loadingScreen').style.display = 'none'; pError(err.message || String(err)); }
}
pStart();
