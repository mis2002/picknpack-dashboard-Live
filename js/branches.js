/* =====================================================================
   branches.js — Online & Branches dashboard (Delhi- Online, Gujarat, Karnataka)
   Sales only: no salesperson, no CRR/NBD, no scoring. Profit shows only where entered.
   ===================================================================== */
const B_LOCS = ['Delhi- Online', 'Gujarat', 'Karnataka'];
let BV = null, B_TAB = 'overview', B_SEL_OVERVIEW = null, B_TIMER = null;

function bSetStatus(ok, msg){ document.getElementById('syncStatus').innerHTML = `<span class="live-dot ${ok ? '' : 'err'}"></span>${msg}`; }
function bError(msg){ const b = document.getElementById('errBar'); b.innerHTML = `⚠️ ${escAttr(msg)}<br><br>Check your internet and press <b>Refresh</b>.`; b.classList.add('show'); }

function bBranding(){
  document.getElementById('brandLabel').textContent = ADMIN.brandName || 'PICK N PACK';
  const logo = document.getElementById('brandLogo'), icon = document.getElementById('sbLogo');
  logo.onload = () => logo.style.display = ''; logo.onerror = () => logo.style.display = 'none';
  logo.src = ADMIN.logo || 'assets/logo.png?v=20260925c';
  icon.onload = () => { icon.style.display = ''; document.querySelector('.sb-brand').style.display = 'none'; }; icon.onerror = () => icon.style.display = 'none';
  icon.src = 'assets/logo-icon.png?v=20260925c';
}

/* hero shows the total of what is on screen */
function bHero(D, V){
  const net = D.cur.reduce((s, r) => s + r.net, 0), prev = D.prev.reduce((s, r) => s + r.net, 0);
  const title = B_TAB === 'overview' ? 'Online & Branches' : B_TAB === 'customers' ? 'Customers' : B_TAB;
  document.getElementById('bHeroTitle').textContent = title;
  document.getElementById('bHeroSub').textContent = B_TAB === 'overview'
    ? 'Website, marketplace and branch sales together. Pick locations and a period below.'
    : B_TAB === 'customers' ? 'Every customer of the selected locations — search by name or phone.'
    : `Everything about ${B_TAB}: channels, bill sizes, new vs returning customers, states and top buyers.`;
  document.getElementById('bHeroFigTitle').textContent = 'Net sales · ' + D.P.label;
  document.getElementById('bHeroFig').textContent = fmtINR(net);
  const g = D.prev.length && prev ? (net - prev) / prev * 100 : null;
  document.getElementById('bHeroFigSub').textContent = `${fmtNum(D.cur.length)} invoices` + (g === null ? '' : ` · ${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}% vs previous`);
  const h = DATA_HEALTH || {};
  const here = RAW_ROWS.filter(r => B_LOCS.indexOf(r.location) >= 0);
  document.getElementById('dataHealth').textContent = ` · ${fmtNum(here.length)} invoices in these locations` + (h.voided ? ` · void invoices not counted` : '');
}

function bSwitch(tab){
  B_TAB = tab;
  document.querySelectorAll('[data-btab]').forEach(b => b.classList.toggle('active', b.dataset.btab === tab));
  if(!BV) return;
  if(B_LOCS.indexOf(tab) >= 0){                         // a single location's deep dive
    if(!B_SEL_OVERVIEW) B_SEL_OVERVIEW = new Set(BV.sel);
    BV.sel = new Set([tab]);
  } else if(B_SEL_OVERVIEW){ BV.sel = B_SEL_OVERVIEW; B_SEL_OVERVIEW = null; }
  BV.setTab(tab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-btab]').forEach(b => b.addEventListener('click', () => bSwitch(b.dataset.btab)));

async function bLoad(manual, full){
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spinning');
  if(manual) bSetStatus(true, 'Refreshing…');
  try{
    await fetchSheetRows(full);                           // fills RAW_ROWS (all locations, cached in the browser)
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('dashboardBody').style.display = 'block';
    document.getElementById('errBar').classList.remove('show');
    if(!BV){
      BV = createMultiView(document.getElementById('mvRootBranches'), { id: 'mvb', locations: B_LOCS, defaultLocs: B_LOCS, rows: () => RAW_ROWS, tabs: true, startTab: 'overview', onRender: bHero });
    }
    BV.render();
    bSetStatus(true, `Live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` + (DATA_HEALTH.downloaded && !DATA_HEALTH.full ? ` · ${fmtNum(DATA_HEALTH.downloaded)} new` : ''));
    if(manual) showToast(DATA_HEALTH.downloaded && !DATA_HEALTH.full ? `${fmtNum(DATA_HEALTH.downloaded)} new or changed invoices.` : 'Up to date.');
  }catch(err){
    console.error(err); bSetStatus(false, 'Connection error'); bError(err.message || String(err));
    document.getElementById('loadingScreen').style.display = 'none';
  }finally{ btn.classList.remove('spinning'); }
}
document.getElementById('refreshBtn').addEventListener('click', () => bLoad(true));
document.getElementById('logoutBtn').addEventListener('click', () => { if(confirm('Logout karein?')) signOut(); });

async function bStart(){
  try{
    await requireUser();
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = CURRENT_USER.email;
    document.getElementById('avatarBadge').textContent = CURRENT_USER.email.slice(0, 2).toUpperCase();
    try{ ADMIN = await loadSharedSettings(); }catch(e){ console.warn(e); }
    bBranding();
    await bLoad(false);
    B_TIMER = setInterval(() => { if(!document.hidden) bLoad(false); }, Math.max(60, ADMIN.refreshSeconds || 300) * 1000);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) bLoad(false); });
    window.addEventListener('resize', () => { clearTimeout(bStart._r); bStart._r = setTimeout(() => BV && BV.render(), 250); });
  }catch(err){
    console.error(err); document.getElementById('loadingScreen').style.display = 'none'; bError(err.message || String(err));
  }
}
bStart();
