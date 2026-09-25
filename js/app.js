/* =====================================================================
   app.js — buttons, filters, admin panel, loading, boot
   Wires the UI to state, loads data, starts auto-refresh.
   ===================================================================== */
/* ---------------------- Populate filter controls ---------------------- */
function populateLocationOptions(){
  const sel = document.getElementById('locFilter'); if(!sel) return;
  const locs = [...new Set(CONFIG.LOCATIONS.concat((DATA_HEALTH && DATA_HEALTH.locations) || []))];
  const count = l => RAW_ROWS.filter(r => r.location === l).length;
  sel.innerHTML = `<option value="ALL">All locations (${fmtNum(RAW_ROWS.length)})</option>` + locs.map(l => `<option value="${escAttr(l)}">${escAttr(l)} (${fmtNum(count(l))})</option>`).join('');
  if(state.location !== 'ALL' && locs.indexOf(state.location) < 0) state.location = CONFIG.DEFAULT_LOCATION;
  sel.value = state.location;
  const pill = document.getElementById('locPill');
  if(pill) pill.textContent = state.location === 'ALL' ? 'All locations' : state.location;
}
/* Location change: rebuild weeks/months for that location, then redraw everything */
function applyLocationChange(){
  ALL_ROWS = applyLocation(RAW_ROWS);
  const meta = enrichAndIndex(ALL_ROWS); WEEKS = meta.weeks; MONTHS = meta.months;
  populateLocationOptions(); populateFilterOptions(); applyStateToUI(); renderAll(); renderDataHealth();
}
function populateFilterOptions(){
  const spSel = document.getElementById('spFilter');
  const prevSp = state.salesperson;
  const sps = [...new Set(ALL_ROWS.map(r=>r.salesperson))].sort();
  spSel.innerHTML = '<option value="ALL">All Salespersons</option>' + sps.map(s=>`<option value="${escAttr(s)}">${escAttr(s)}</option>`).join('');
  spSel.value = sps.includes(prevSp) ? prevSp : 'ALL';
  state.salesperson = spSel.value;

  const weekSel = document.getElementById('weekFilter');
  const prevWeek = state.weekKey;
  weekSel.innerHTML = WEEKS.slice().reverse().map(w=>`<option value="${w.key}">${w.label} (${w.range})</option>`).join('');
  if(WEEKS.length){
    const exists = WEEKS.some(w=>w.key===prevWeek);
    state.weekKey = exists ? prevWeek : WEEKS[WEEKS.length-1].key;
    weekSel.value = state.weekKey;
  }
  const monthSel = document.getElementById('monthFilter');
  const prevMonth = state.monthKey;
  monthSel.innerHTML = MONTHS.slice().reverse().map(m=>`<option value="${m.key}">${m.label}</option>`).join('');
  if(MONTHS.length){
    const exists = MONTHS.some(m=>m.key===prevMonth);
    state.monthKey = exists ? prevMonth : MONTHS[MONTHS.length-1].key;
    monthSel.value = state.monthKey;
  }
  if(!state.rangeStart && ALL_ROWS.length){
    state.rangeStart = fmtDateInput(ALL_ROWS[0].date);
    state.rangeEnd = fmtDateInput(ALL_ROWS[ALL_ROWS.length-1].date);
    document.getElementById('rangeStart').value = state.rangeStart;
    document.getElementById('rangeEnd').value = state.rangeEnd;
  }
  const yearSel = document.getElementById('yearFilter');
  const years = [...new Set(ALL_ROWS.map(r=>r.date.getFullYear()))].sort((a,b)=>b-a);
  yearSel.innerHTML = '<option value="ALL">Pick a year</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
}


/* ---------------------- UI wiring ---------------------- */
let activeTab = 'main';
document.querySelectorAll('.sb-nav [data-tab]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.sb-nav [data-tab]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    const TAB_IDS = { main:'mainTab', bi:'biTab', scoring:'scoringTab', customers:'customersTab', locations:'locationsTab' };
    Object.entries(TAB_IDS).forEach(([k,id])=>{ const el = document.getElementById(id); if(el) el.style.display = activeTab===k ? 'block':'none'; });
    // All Locations has its own filters: hide the Delhi- Offline hero + filter bar there
    document.getElementById('monthBanner').style.display = activeTab==='locations' ? 'none' : '';
    document.getElementById('mainFilterbar').style.display = activeTab==='locations' ? 'none' : '';
    if(activeTab==='locations'){ renderLocationsTab(); window.scrollTo({top:0, behavior:'smooth'}); return; }
    // charts drawn while their tab was hidden have 0 width — redraw so they size to the visible box
    if(ALL_ROWS.length) renderAll();
    window.scrollTo({top:0, behavior:'smooth'});
  });
});

function setMode(mode){
  state.mode = mode;
  document.getElementById('weekBlock').style.display = mode==='WEEK' ? 'flex':'none';
  document.getElementById('monthBlock').style.display = mode==='MONTH' ? 'flex':'none';
  document.getElementById('rangeBlock').style.display = mode==='RANGE' ? 'flex':'none';
  renderAll();
}
document.getElementById('metricToggle').querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.getElementById('metricToggle').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.metric = btn.dataset.metric; renderAll();
  });
});
document.getElementById('orderTypeToggle').querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.getElementById('orderTypeToggle').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); state.ordertype = btn.dataset.ordertype; renderAll();
  });
});
document.getElementById('modeToggle').querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.getElementById('modeToggle').querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setMode(btn.dataset.mode);
  });
});
document.getElementById('spFilter').addEventListener('change', e=>{ state.salesperson = e.target.value; renderAll(); });
/* All Locations tab (sales only, no salesperson / order type) */
let MVO = null;
function renderLocationsTab(){
  if(!MVO) MVO = createMultiView(document.getElementById('mvRootOffline'), { id:'mvo', locations: CONFIG.LOCATIONS, defaultLocs: CONFIG.LOCATIONS, rows: ()=>RAW_ROWS });
  MVO.render();
}
document.getElementById('weekFilter').addEventListener('change', e=>{ state.weekKey = +e.target.value; renderAll(); });
document.getElementById('monthFilter').addEventListener('change', e=>{ state.monthKey = e.target.value; renderAll(); });
document.getElementById('rangeStart').addEventListener('change', e=>{ state.rangeStart = e.target.value; renderAll(); });
document.getElementById('rangeEnd').addEventListener('change', e=>{ state.rangeEnd = e.target.value; renderAll(); });

document.querySelectorAll('.chart-toggle').forEach(group=>{
  const target = group.dataset.target;
  group.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      group.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      if(target==='trendGran'){ state.trendGran = btn.dataset.type; renderTrend(chartTypes.trend); return; }
      if(target==='growthGran'){ state.growthGran = btn.dataset.type; renderGrowthTable(); return; }
      if(target==='misGran'){ state.misGran = btn.dataset.type; renderMisReport(); return; }
      if(target==='scoreGran'){ state.scoreGran = btn.dataset.type; renderMisScoring(); return; }
      chartTypes[target] = btn.dataset.type;
      if(target==='trend') renderTrend(chartTypes.trend);
      if(target==='wow') renderWow(chartTypes.wow);
      if(target==='split') renderSplit(chartTypes.split);
      if(target==='sp') renderSp(chartTypes.sp);
    });
  });
});
document.getElementById('yearFilter').addEventListener('change', e=>{
  const y = e.target.value;
  if(y==='ALL') return;
  state.mode = 'RANGE';
  state.rangeStart = `${y}-01-01`;
  state.rangeEnd = `${y}-12-31`;
  state.trendGran = 'month';
  applyStateToUI();
  renderAll();
});
document.getElementById('refreshBtn').addEventListener('click', ()=>loadData(true));
document.getElementById('logoutBtn').addEventListener('click', ()=>{ if(confirm('Logout karein?')) signOut(); });

/* ---------------------- Save / restore filter view ---------------------- */
const SAVED_VIEW_KEY = 'pnp_live_saved_view_v1';   // separate from the old dashboard's saved view
function applyStateToUI(){
  document.querySelectorAll('#metricToggle button').forEach(b=>b.classList.toggle('active', b.dataset.metric===state.metric));
  document.querySelectorAll('#orderTypeToggle button').forEach(b=>b.classList.toggle('active', b.dataset.ordertype===state.ordertype));
  document.querySelectorAll('#modeToggle button').forEach(b=>b.classList.toggle('active', b.dataset.mode===state.mode));
  document.getElementById('weekBlock').style.display = state.mode==='WEEK' ? 'flex':'none';
  document.getElementById('monthBlock').style.display = state.mode==='MONTH' ? 'flex':'none';
  document.getElementById('rangeBlock').style.display = state.mode==='RANGE' ? 'flex':'none';
  const spSel = document.getElementById('spFilter');
  if([...spSel.options].some(o=>o.value===state.salesperson)) spSel.value = state.salesperson;
  if(state.weekKey!=null && document.getElementById('weekFilter').querySelector(`option[value="${state.weekKey}"]`)) document.getElementById('weekFilter').value = state.weekKey;
  if(state.monthKey && document.getElementById('monthFilter').querySelector(`option[value="${state.monthKey}"]`)) document.getElementById('monthFilter').value = state.monthKey;
  if(state.rangeStart) document.getElementById('rangeStart').value = state.rangeStart;
  if(state.rangeEnd) document.getElementById('rangeEnd').value = state.rangeEnd;
  Object.keys(chartTypes).forEach(target=>{
    document.querySelectorAll(`.chart-toggle[data-target="${target}"] button`).forEach(b=>b.classList.toggle('active', b.dataset.type===chartTypes[target]));
  });
  [['trendGran','trendGran'],['growthGran','growthGran'],['misGran','misGran'],['scoreGran','scoreGran']].forEach(([t,k])=>{
    document.querySelectorAll(`.chart-toggle[data-target="${t}"] button`).forEach(b=>b.classList.toggle('active', b.dataset.type===state[k]));
  });
}
function loadSavedView(){
  try{
    const raw = localStorage.getItem(SAVED_VIEW_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(saved.state) Object.assign(state, saved.state);
    if(saved.chartTypes) Object.assign(chartTypes, saved.chartTypes);
  } catch(e){ console.warn('Could not read saved view', e); }
}
function saveView(){
  try{
    localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify({ state, chartTypes }));
    const btn = document.getElementById('saveViewBtn');
    const original = btn.textContent;
    btn.textContent = '✓ Saved'; btn.classList.add('saved');
    showToast('View saved. Filters and chart types will load next time.');
    setTimeout(()=>{ btn.textContent = original; btn.classList.remove('saved'); }, 1500);
  } catch(e){ alert('Could not save — your browser may be blocking local storage for this file.'); }
}
function resetView(){
  try{ localStorage.removeItem(SAVED_VIEW_KEY); }catch(e){}
  state = { location: CONFIG.DEFAULT_LOCATION, metric:'net', ordertype:'ALL', salesperson:'ALL', mode:'ALL', weekKey:null, monthKey:null, rangeStart:null, rangeEnd:null, trendGran:'auto', growthGran:'week', misGran:'month', scoreGran:'week' };
  chartTypes = { trend:'bar', split:'stacked', sp:'stacked', wow:'bar' };
  applyLocationChange();
  showToast('View reset to defaults.');
}
document.getElementById('saveViewBtn').addEventListener('click', saveView);
document.getElementById('resetViewBtn').addEventListener('click', resetView);

/* ---------------------- Load / sync ---------------------- */
function setSyncStatus(ok, msg){
  document.getElementById('syncStatus').innerHTML = `<span class="live-dot ${ok?'':'err'}"></span>${msg}`;
}
function showError(msg){
  const bar = document.getElementById('errBar');
  bar.innerHTML = `⚠️ ${escAttr(msg)}<br><br>Check your internet and press <b>Refresh</b>. If it continues, an admin can check Supabase and the Zoho sync (Admin → Data &amp; users).`;
  bar.classList.add('show');
}
function hideError(){ document.getElementById('errBar').classList.remove('show'); }

async function loadData(manual, forceFull){
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  if(manual) setSyncStatus(true, 'Refreshing…');
  try{
    if(!loadData._savedApplied){ loadSavedView(); loadData._savedApplied = true; }
    state.location = CONFIG.DEFAULT_LOCATION;            // this dashboard is always Delhi- Offline
    const rows = await fetchSheetRows(forceFull);
    const meta = enrichAndIndex(rows);
    ALL_ROWS = rows; WEEKS = meta.weeks; MONTHS = meta.months;
    populateLocationOptions();
    populateFilterOptions();
    applyStateToUI();
    hideError();
    document.getElementById('loadingScreen').style.display='none';
    document.getElementById('dashboardBody').style.display='block';
    renderAll();
    renderDataHealth();
    if(activeTab === 'locations') renderLocationsTab();
    setSyncStatus(true, `Live · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` + (DATA_HEALTH.downloaded && !DATA_HEALTH.full ? ` · ${fmtNum(DATA_HEALTH.downloaded)} new` : ''));
    if(manual) showToast(DATA_HEALTH.full ? `Loaded ${fmtNum(RAW_ROWS.length)} invoices.` : (DATA_HEALTH.downloaded ? `${fmtNum(DATA_HEALTH.downloaded)} new or changed invoices.` : 'Already up to date.'));
    loadSyncInfo().then(renderSyncBadge);
  } catch(err){
    console.error(err);
    setSyncStatus(false, 'Connection error');
    showError(err.message || 'Could not load data from Supabase.');
    if(!ALL_ROWS.length) document.getElementById('loadingScreen').style.display='none';
  } finally {
    btn.classList.remove('spinning');
  }
}

// On resize, rebuild the charts so bar widths / label rotation / scroll width re-fit the new screen size
let resizeTimer = null, lastW = window.innerWidth;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{
    if(Math.abs(window.innerWidth - lastW) < 40) { Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(e){} }); return; }
    lastW = window.innerWidth;
    if(ALL_ROWS.length) renderAll();
  }, 220);
});

/* ---------------------- Admin modal ---------------------- */
function openAdminModal(){
  if(!isAdminUser()){ showToast('Admin settings sirf Admin role ke liye hain.'); return; }
  document.getElementById('adminModalOverlay').style.display = 'flex';
  document.getElementById('adminSettingsStage').style.display = 'block';
  ADMIN_PENDING.logo = ADMIN.logo || ''; ADMIN_PENDING.photos = Object.assign({}, ADMIN.photos||{});
  fillAdminForm(); renderLogoPreview(); renderScoringForm(); renderUsersAdmin(); renderDataAdmin();
}
function closeAdminModal(){ document.getElementById('adminModalOverlay').style.display = 'none'; }
function fillAdminForm(){
  document.getElementById('admRefresh').value = ADMIN.refreshSeconds;
  document.getElementById('admAutoRefresh').checked = ADMIN.autoRefresh;
  document.getElementById('admBrand').value = ADMIN.brandName;
  document.getElementById('admTitle').value = ADMIN.dashboardTitle;
  document.getElementById('admTopCust').value = ADMIN.topCustomersN;
  document.getElementById('admTopSp').value = ADMIN.topSalespersonN;
  document.getElementById('admOutlierSD').value = ADMIN.outlierSD;
  document.getElementById('admLowProfit').value = ADMIN.lowProfitPct;
  document.getElementById('admPanelList').innerHTML = PANEL_REGISTRY.map(p=>{
    const checked = ADMIN.visiblePanels[p.key] === false ? '' : 'checked';
    return `<label class="admin-check-row"><input type="checkbox" data-panel-key="${p.key}" ${checked}> ${p.label}</label>`;
  }).join('');
  const spNames = [...new Set(ALL_ROWS.map(r=>r.salesperson))].sort();
  const spListEl = document.getElementById('admSalespersonList');
  if(!spNames.length){
    spListEl.innerHTML = `<span class="hint">Load the sheet first — salespeople will appear here automatically.</span>`;
  } else {
    const COLS = 'grid-template-columns:38px minmax(120px,1fr) 96px 110px 120px 92px';
    spListEl.innerHTML = `<div class="admin-sp-head" style="${COLS}"><span>Photo</span><span>Salesperson</span><span>Department</span><span>Monthly salary ₹</span><span>New customers / month <em>(NBD)</em></span><span></span></div>` + spNames.map(sp=>{
      const a = escAttr(sp);
      const dept = ADMIN.departments[sp] || '';
      const salary = ADMIN.salaries[sp] || '';
      const crTarget = (ADMIN.crTargets && ADMIN.crTargets[sp]) || '';
      const hidden = ADMIN.hiddenFromMis && ADMIN.hiddenFromMis[sp];
      const tgt = (ADMIN.custTargets||{})[sp] || '';
      return `<div class="admin-sp-row" style="${COLS}">
        <label title="Click to upload a photo" style="position:relative">${spPhotoHtml(sp,'adm-photo', ADMIN_PENDING.photos[sp] || `assets/team/${spSlug(sp)}.jpg`)}
          <input type="file" accept="image/*" data-sp-photo="${a}" hidden></label>
        <span class="sp-name" title="${a}">${a} <button type="button" class="link-btn sm" data-sp-photo-del="${a}" style="${ADMIN_PENDING.photos[sp]?'':'display:none'}">remove photo</button></span>
        <select data-sp-dept="${a}">
          <option value="" ${dept===''?'selected':''}>Dept</option>
          <option value="NBD" ${dept==='NBD'?'selected':''}>NBD</option>
          <option value="CRR" ${dept==='CRR'?'selected':''}>CRR</option>
          <option value="OTHER" ${dept==='OTHER'?'selected':''}>OTHER</option>
        </select>
        <input type="number" data-sp-salary="${a}" placeholder="${dept==='OTHER'?'not needed':'e.g. 18000'}" value="${salary}">
        <input type="number" data-sp-newc="${a}" placeholder="${dept==='NBD'?'e.g. 8':'NBD only'}" title="NBD: new customers per month" value="${tgt}" ${dept==='NBD'?'':'disabled'}>
        <label style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--ink-dim);white-space:nowrap">
          <input type="checkbox" data-sp-hide="${a}" ${hidden?'checked':''}> Hide in MIS
        </label>
      </div>`;
    }).join('');
  }
}
/* ---- logo / photo uploads (resized in the browser so they fit in local storage) ---- */
const ADMIN_PENDING = { logo:'', photos:{} };
function resizeImage(file, maxW, maxH, type){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = ()=>{ const img = new Image(); img.onerror = rej; img.onload = ()=>{
      const k = Math.min(1, maxW/img.width, maxH/img.height);
      const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      const x = c.getContext('2d'); if(type==='image/jpeg'){ x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); }
      x.drawImage(img,0,0,c.width,c.height); res(c.toDataURL(type, 0.85)); }; img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function renderLogoPreview(){
  const p = document.getElementById('admLogoPreview');
  if(ADMIN_PENDING.logo){ p.src = ADMIN_PENDING.logo; p.style.display = ''; } else p.style.display = 'none';
}
function renderScoringForm(){
  const G = ADMIN.scoring;
  const f = (label, key, suffix, val) => `<label class="admin-field"><span style="font-size:11px;color:var(--ink-dim);font-weight:600">${label}</span>
    <span style="display:flex;align-items:center;gap:6px"><input type="number" step="any" data-scs="${key}" value="${val ?? G[key]}">${suffix?`<span class="hint">${suffix}</span>`:''}</span></label>`;
  document.getElementById('admScoring').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      ${f('NBD profit plan = salary ×','nbdProfitX')}${f('NBD revenue plan = profit ×','nbdRevX')}
      ${f('CRR profit plan = salary ×','crrProfitX')}${f('CRR revenue plan = profit ×','crrRevX')}
      ${f('CRR margin target','crrMargin','%')}${f('CRR retention target','crrRetention','%')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
      <div><b style="font-size:12px">NBD weights</b> <span class="hint" id="wNbdTot"></span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
        ${f('New customers','wNbd.newC','%',G.wNbd.newC)}${f('Profit','wNbd.profit','%',G.wNbd.profit)}${f('Revenue','wNbd.revenue','%',G.wNbd.revenue)}${f('Avg sale','wNbd.avg','%',G.wNbd.avg)}</div></div>
      <div><b style="font-size:12px">CRR weights</b> <span class="hint" id="wCrrTot"></span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
        ${f('Profit','wCrr.profit','%',G.wCrr.profit)}${f('Revenue','wCrr.revenue','%',G.wCrr.revenue)}${f('Retention','wCrr.retention','%',G.wCrr.retention)}${f('Margin','wCrr.margin','%',G.wCrr.margin)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px">
      ${f('Working days / month','workDays','Mon–Sat')}${f('Cap per KPI','cap','%')}${f('Green from','green','pts')}${f('Amber from','amber','pts')}${f('Retention window','retWindow','days')}
    </div>
    <label class="admin-check-row" style="margin-top:10px"><input type="checkbox" id="admExcludeCo" ${G.excludeCompany?'checked':''}> Leave COMPANY SALES = YES invoices out of personal scores</label>`;
  updateWeightTotals();
}
function updateWeightTotals(){
  const tot = t => [...document.querySelectorAll(`[data-scs^="${t}."]`)].reduce((s,i)=>s+(+i.value||0),0);
  [['wNbd','wNbdTot'],['wCrr','wCrrTot']].forEach(([t,id])=>{ const v = tot(t), el = document.getElementById(id); el.textContent = `total ${v}%${v===100?'':' — must be 100'}`; el.style.color = v===100 ? 'var(--good)' : 'var(--coral)'; });
}
function applyPanelVisibility(){
  PANEL_REGISTRY.forEach(p=>{
    const el = document.getElementById(p.key);
    if(el) el.style.display = (ADMIN.visiblePanels[p.key] === false) ? 'none' : '';
  });
}
/* ---- Admin → Users ---- */
async function renderUsersAdmin(){
  const box = document.getElementById('admUsers');
  box.innerHTML = '<div class="muted">Loading users…</div>';
  try{
    const users = await listUsers();
    box.innerHTML = `<table class="adm-users"><thead><tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr></thead><tbody>` +
      users.map(u => `<tr><td>${escAttr(u.email)}${u.email===CURRENT_USER.email?' <span class="chip">you</span>':''}</td>
        <td>${u.email==='mis2@picknpack.co' ? '<b>Owner (admin)</b>' : `<select data-user-role="${escAttr(u.email)}"><option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select>`}</td>
        <td class="muted">${u.added_at ? new Date(u.added_at).toLocaleDateString('en-GB') : ''}</td>
        <td>${u.email==='mis2@picknpack.co' || u.email===CURRENT_USER.email ? '' : `<button type="button" class="link-btn" data-user-del="${escAttr(u.email)}">Remove</button>`}</td></tr>`).join('') +
      `</tbody></table>`;
  }catch(e){ box.innerHTML = `<div class="dept-note">Users load nahi hue: ${escAttr(e.message)}</div>`; }
}
document.getElementById('admUserAddBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('admUserEmail').value, role = document.getElementById('admUserRole').value;
  try{ await addUser(email, role); document.getElementById('admUserEmail').value = ''; showToast('User joda gaya ✓ — woh ab login kar sakta hai'); renderUsersAdmin(); }
  catch(e){ alert(e.message); }
});
document.getElementById('admUsers').addEventListener('change', async e=>{
  const s = e.target.closest('[data-user-role]'); if(!s) return;
  try{ await addUser(s.dataset.userRole, s.value); showToast('Role badla ✓'); }catch(err){ alert(err.message); renderUsersAdmin(); }
});
document.getElementById('admUsers').addEventListener('click', async e=>{
  const b = e.target.closest('[data-user-del]'); if(!b) return;
  if(!confirm('Remove ' + b.dataset.userDel + '? Unka access band ho jayega.')) return;
  try{ await removeUser(b.dataset.userDel); showToast('User hataya ✓'); renderUsersAdmin(); }catch(err){ alert(err.message); }
});
/* ---- Admin → Data ---- */
function renderDataAdmin(){
  const h = DATA_HEALTH || {}, s = SYNC_INFO;
  const byLoc = CONFIG.LOCATIONS.map(l => `${escAttr(l)}: <b>${fmtNum(RAW_ROWS.filter(r=>r.location===l).length)}</b>`).join(' · ');
  document.getElementById('admDataInfo').innerHTML =
    `<div>Supabase project: <b>${escAttr(CONFIG.SUPABASE_URL.replace('https://',''))}</b></div>
     <div>Invoices in dashboard: <b>${fmtNum(RAW_ROWS.length)}</b>${h.voided ? ` (+${fmtNum(h.voided)} void, not counted)` : ''} — ${byLoc}</div>
     <div>Profit pending (Delhi- Offline): <b>${fmtNum(h.profitPending||0)}</b> invoices</div>
     <div>Last Zoho sync: ${s && s.last ? `<b>${new Date(s.last.at).toLocaleString('en-GB')}</b> — ${escAttr(s.last.message).slice(0,160)}` : '<span class="muted">no sync log yet</span>'}</div>
     ${s && s.error ? `<div style="color:var(--coral)">Last error: ${escAttr(s.error.message).slice(0,160)}</div>` : ''}
     <div class="muted">Settings last saved ${ADMIN._updatedAt ? new Date(ADMIN._updatedAt).toLocaleString('en-GB') + ' by ' + escAttr(ADMIN._updatedBy||'') : 'never (defaults)'}</div>`;
  const old = oldDashboardSettings();
  document.getElementById('admImportOld').style.display = old ? '' : 'none';
}
document.getElementById('admReloadAll').addEventListener('click', async ()=>{
  closeAdminModal(); try{ await idbClear(); }catch(e){}
  await loadData(true, true);
});
document.getElementById('admImportOld').addEventListener('click', async ()=>{
  const old = oldDashboardSettings(); if(!old) return;
  if(!confirm('Purane dashboard ki settings (is browser me saved: salary, department, targets, photos, logo, scoring) yahan copy karein? Purana dashboard nahi badlega.')) return;
  const copy = Object.assign({}, old); delete copy.sheetId; delete copy.gid;
  try{ await saveSharedSettings(mergeSettings(copy)); showToast('Settings copy ho gayi ✓'); setTimeout(()=>location.reload(), 600); }catch(e){ alert(e.message); }
});
document.getElementById('adminBtn').addEventListener('click', openAdminModal);
document.getElementById('adminModalClose').addEventListener('click', closeAdminModal);
document.getElementById('adminModalOverlay').addEventListener('click', e=>{ if(e.target.id==='adminModalOverlay') closeAdminModal(); });
document.getElementById('adminSaveBtn').addEventListener('click', ()=>{
  const visiblePanels = {};
  document.querySelectorAll('#admPanelList input[type="checkbox"]').forEach(cb=>{ if(!cb.checked) visiblePanels[cb.dataset.panelKey] = false; });
  const salaries = {}, departments = {}, crTargets = {}, hiddenFromMis = {};
  document.querySelectorAll('#admSalespersonList [data-sp-salary]').forEach(inp=>{ const v = +inp.value; if(v > 0) salaries[inp.dataset.spSalary] = v; });
  document.querySelectorAll('#admSalespersonList [data-sp-dept]').forEach(sel=>{ if(sel.value) departments[sel.dataset.spDept] = sel.value; });
  Object.assign(crTargets, ADMIN.crTargets || {});
  const custTargets = {};
  document.querySelectorAll('#admSalespersonList [data-sp-newc]').forEach(inp=>{ const v = +inp.value; if(v > 0) custTargets[inp.dataset.spNewc] = v; });
  const scoring = JSON.parse(JSON.stringify(ADMIN.scoring));
  document.querySelectorAll('#admScoring [data-scs]').forEach(inp=>{
    const [a,b] = inp.dataset.scs.split('.'), v = +inp.value;
    if(b) scoring[a][b] = Math.max(0, v||0); else if(inp.value!=='') scoring[a] = Math.max(0, v);
  });
  scoring.excludeCompany = document.getElementById('admExcludeCo').checked;
  const wn = Object.values(scoring.wNbd).reduce((s,v)=>s+v,0), wc = Object.values(scoring.wCrr).reduce((s,v)=>s+v,0);
  if(wn!==100 || wc!==100){ alert(`Scoring weights must add up to 100 (NBD is ${wn}, CRR is ${wc}). Please fix them before saving.`); return; }
  document.querySelectorAll('#admSalespersonList [data-sp-hide]').forEach(cb=>{ if(cb.checked) hiddenFromMis[cb.dataset.spHide] = true; });
  const updated = {
    refreshSeconds: Math.max(10, +document.getElementById('admRefresh').value || DEFAULT_ADMIN_SETTINGS.refreshSeconds),
    autoRefresh: document.getElementById('admAutoRefresh').checked,
    brandName: document.getElementById('admBrand').value.trim() || DEFAULT_ADMIN_SETTINGS.brandName,
    dashboardTitle: document.getElementById('admTitle').value.trim() || DEFAULT_ADMIN_SETTINGS.dashboardTitle,
    topCustomersN: Math.max(1, +document.getElementById('admTopCust').value || DEFAULT_ADMIN_SETTINGS.topCustomersN),
    topSalespersonN: Math.max(1, +document.getElementById('admTopSp').value || DEFAULT_ADMIN_SETTINGS.topSalespersonN),
    outlierSD: Math.max(0.5, +document.getElementById('admOutlierSD').value || DEFAULT_ADMIN_SETTINGS.outlierSD),
    lowProfitPct: Math.max(0, +document.getElementById('admLowProfit').value || 0),
    visiblePanels, salaries, departments, crTargets, hiddenFromMis,
    custTargets, scoring, logo: ADMIN_PENDING.logo, photos: ADMIN_PENDING.photos
  };
  const btn = document.getElementById('adminSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
  saveSharedSettings(updated).then(()=>{ showToast('Saved ✓ — sab users ko same settings dikhengi'); setTimeout(()=>location.reload(), 600); })
    .catch(e=>{ btn.disabled = false; btn.textContent = 'Save and reload'; alert('Save nahi hua: ' + e.message); });
});
document.getElementById('adminDefaultsBtn').addEventListener('click', ()=>{
  if(confirm('Restore all admin settings to factory defaults for EVERYONE? Salaries, targets and photos will be cleared.')){
    saveSharedSettings(mergeSettings({})).then(()=>location.reload()).catch(e=>alert(e.message));
  }
});

/* ---------------------- Data health line (footer) ---------------------- */
function renderDataHealth(){
  const el = document.getElementById('dataHealth');
  if(!el || !DATA_HEALTH) return;
  const h = DATA_HEALTH, parts = [`${fmtNum(ALL_ROWS.length)} invoices in view (${state.location === 'ALL' ? 'all locations' : state.location}) · ${fmtNum(h.loaded)} in database`];
  if(h.voided) parts.push(`${fmtNum(h.voided)} void (not counted)`);
  if(h.skippedNoDate) parts.push(`${fmtNum(h.skippedNoDate)} without a valid date`);
  const pend = ALL_ROWS.filter(r => r.pp).length;
  if(pend) parts.push(`${fmtNum(pend)} with profit not entered (left out of margin %)`);
  if(h.cacheOk === false) parts.push('browser cache off — full download each time');
  el.textContent = parts.join(' · ');
  el.style.color = '';
}

/* ---------------------- Boot ---------------------- */
function titleCase(s){ return s.toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()); }
function applyBranding(){
document.getElementById('brandLabel').textContent = ADMIN.brandName;
document.getElementById('dashTitle').textContent = ADMIN.dashboardTitle;
document.getElementById('heroHello').textContent = `Hello, ${titleCase(ADMIN.brandName)}!`;
document.getElementById('avatarBadge').textContent = ADMIN.brandName.split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'PN';
document.querySelector('.sb-brand').textContent = ADMIN.brandName.split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,3) || 'PnP';
// Company logo: Admin upload first, then assets/logo.png in the repo; hidden if neither exists
(function showLogo(){
  // header: full logo on an indigo badge; sidebar: the running-man icon
  const sources = { brandLogo: [ADMIN.logo, 'assets/logo.png?v=20260924'], sbLogo: ['assets/logo-icon.png?v=20260924', ADMIN.logo] };
  Object.entries(sources).forEach(([id, list])=>{
    const img = document.getElementById(id), queue = list.filter(Boolean);
    const next = ()=>{ if(!queue.length){ img.style.display = 'none'; return; } img.src = queue.shift(); };
    img.onload = ()=>{ img.style.display = ''; if(id==='sbLogo') document.querySelector('.sb-brand').style.display = 'none'; };
    img.onerror = next;
    next();
  });
})();
}
applyBranding();
/* Zoho sync health next to the Live badge (admins) */
function renderSyncBadge(){
  const el = document.getElementById('zohoBadge'); if(!el) return;
  const s = SYNC_INFO;
  if(!s || !s.last){ el.style.display = 'none'; return; }
  const mins = Math.max(0, Math.round((Date.now() - new Date(s.last.at).getTime()) / 60000));
  const late = mins > 150 || s.error;
  el.style.display = '';
  el.className = 'sync-pill' + (late ? ' late' : '');
  el.textContent = 'Zoho sync ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.round(mins/60) + ' h ago') + (s.error ? ' · error' : '');
  el.title = (s.error ? 'Last error: ' + s.error.message + '\n' : '') + 'Last run: ' + s.last.message;
}
/* admin: uploads + live weight totals */
document.getElementById('admLogoFile').addEventListener('change', async e=>{
  const f = e.target.files[0]; if(!f) return;
  ADMIN_PENDING.logo = await resizeImage(f, 480, 160, 'image/png'); renderLogoPreview();
});
document.getElementById('admLogoRemove').addEventListener('click', ()=>{ ADMIN_PENDING.logo = ''; document.getElementById('admLogoFile').value=''; renderLogoPreview(); });
document.getElementById('admSalespersonList').addEventListener('change', async e=>{
  const inp = e.target.closest('[data-sp-photo]');
  if(inp && inp.files[0]){
    const name = inp.dataset.spPhoto, data = await resizeImage(inp.files[0], 320, 320, 'image/jpeg');
    ADMIN_PENDING.photos[name] = data;
    setAdminPhoto(inp.closest('.admin-sp-row'), data, true);   // update in place so unsaved edits stay
    return;
  }
  const d = e.target.closest('[data-sp-dept]');
  if(d){ const t = document.querySelector(`[data-sp-newc="${CSS.escape(d.dataset.spDept)}"]`); if(t){ t.disabled = d.value!=='NBD'; t.placeholder = d.value==='NBD' ? 'e.g. 8' : 'NBD only'; } }
});
document.getElementById('admSalespersonList').addEventListener('click', e=>{
  const b = e.target.closest('[data-sp-photo-del]'); if(!b) return;
  e.preventDefault(); const name = b.dataset.spPhotoDel; delete ADMIN_PENDING.photos[name];
  setAdminPhoto(b.closest('.admin-sp-row'), `assets/team/${spSlug(name)}.jpg`, false);
});
function setAdminPhoto(row, src, hasUpload){
  const img = row.querySelector('.adm-photo img'), ini = row.querySelector('.adm-photo .ph-initials');
  img.style.display = ''; ini.style.display = 'none'; img.src = src;
  row.querySelector('[data-sp-photo-del]').style.display = hasUpload ? '' : 'none';
}
document.getElementById('admScoring').addEventListener('input', updateWeightTotals);

/* Login → shared settings → data */
async function startDashboard(){
  try{
    await requireUser();
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = CURRENT_USER.email;
    document.getElementById('avatarBadge').textContent = CURRENT_USER.email.slice(0, 2).toUpperCase();
    document.getElementById('avatarBadge').title = CURRENT_USER.email + ' (' + CURRENT_USER.role + ')';
    document.getElementById('adminBtn').style.display = isAdminUser() ? '' : 'none';
    try { ADMIN = await loadSharedSettings(); } catch(e){ console.warn('settings', e); showToast('Shared settings load nahi hui — pichhli copy use ho rahi hai.'); }
    applyBranding(); applyPanelVisibility();
    // Watchdog: never spin forever
    const wd = setTimeout(()=>{
      if(!ALL_ROWS.length && document.getElementById('loadingScreen').style.display !== 'none'){
        document.getElementById('loadingScreen').style.display = 'none';
        setSyncStatus(false, 'No data yet');
        showError('Supabase did not respond within 40 seconds. Check your internet and press Refresh.');
      }
    }, 40000);
    await loadData(false);
    clearTimeout(wd);
    if(refreshTimer) clearInterval(refreshTimer);
    if(ADMIN.autoRefresh){
      refreshTimer = setInterval(()=>{ if(!document.hidden) loadData(false); }, Math.max(60, ADMIN.refreshSeconds || 300) * 1000);
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) loadData(false); });   // catch up when the tab comes back
    }
  }catch(err){
    console.error(err);
    document.getElementById('loadingScreen').style.display = 'none';
    showError(err.message || String(err));
  }
}
startDashboard();
