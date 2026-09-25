/* =====================================================================
   multi.js — location-wise reports (no salesperson, no order type)
   Used by:
   • index.html  → "All Locations" tab (all 4 locations, pick any combination)
   • branches.html → Online & Branches dashboard (Delhi- Online, Gujarat, Karnataka)
   Needs: format.js, data.js (normState/normPin), cloud.js, charts.js (theme, dlCfg, padValueAxis)
   ===================================================================== */

const MV_COLORS = { 'Delhi- Offline':'#6C5CE7', 'Delhi- Online':'#3FB8E0', 'Gujarat':'#F6A623', 'Karnataka':'#EF5466' };
const mvColor = l => MV_COLORS[l] || '#9A95C9';
/* Invoice-number prefix → sales channel (rename freely) */
const MV_CHANNELS = { ECOM:'ECOM (website)', SPSY:'Shopsy', SHOPSY:'Shopsy', SH:'SH', MYTR:'MYTR', EC:'EC', PNP:'PNP (direct)', PNPGJ:'PNPGJ', PNPDN:'PNPDN', C:'Other' };
const MV_TRANSFER = /pick\s*-?\s*n\s*-?\s*pack/i;                 // our own branches as customers = internal transfer
const MV_MARKETPLACE = /meesho|valmo/i;                             // online buyers who sell on Meesho / Valmo
const MV_DAY = 86400000;
const MV_CHARTS = {};
const MV_DRILL = new Map(); let MV_DRILL_ID = 0;

const mvChannelOf = r => { const m = String(r.invoice || '').match(/^[A-Za-z]+/); const p = m ? m[0].toUpperCase() : '—'; return MV_CHANNELS[p] || (p.length > 6 ? 'Other' : p); };
const mvSum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
const mvUniq = rows => new Set(rows.map(r => r.customer)).size;
const mvPct = (a, b) => b ? (a - b) / b * 100 : (a ? null : 0);
const mvMonthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const mvMonthLabel = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
const mvDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mvFmtD = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
function mvGrowthHtml(g){ return g === null ? '<span class="mv-g new">new</span>' : `<span class="mv-g ${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}%</span>`; }
function mvReg(title, rows, sub){ const id = 'm' + (++MV_DRILL_ID); MV_DRILL.set(id, { title, rows, sub }); return id; }

/* ---------------- period ---------------- */
function mvPeriod(preset, custom, latest){
  const L = mvDay(latest), y = L.getFullYear(), m = L.getMonth();
  let s, e = new Date(L.getTime() + MV_DAY - 1), label;
  if(preset === 'thisMonth'){ s = new Date(y, m, 1); label = L.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  else if(preset === 'lastMonth'){ s = new Date(y, m - 1, 1); e = new Date(y, m, 0, 23, 59, 59); label = s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  else if(preset === 'last3'){ s = new Date(y, m - 2, 1); label = 'Last 3 months'; }
  else if(preset === 'last30'){ s = new Date(L.getTime() - 29 * MV_DAY); label = 'Last 30 days'; }
  else if(preset === 'fy'){ const fy = m >= 3 ? y : y - 1; s = new Date(fy, 3, 1); label = `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`; }
  else if(preset === 'custom' && custom.start && custom.end){ s = new Date(custom.start + 'T00:00:00'); e = new Date(custom.end + 'T23:59:59'); label = `${mvFmtD(s)} – ${mvFmtD(e)}`; }
  else { return { all: true, label: 'All time' }; }
  const len = e - s;
  let ps, pe;
  if(preset === 'thisMonth' || preset === 'lastMonth'){ ps = new Date(s.getFullYear(), s.getMonth() - 1, 1); pe = new Date(s.getTime() - 1); }
  else if(preset === 'last3'){ ps = new Date(s.getFullYear(), s.getMonth() - 3, 1); pe = new Date(s.getTime() - 1); }
  else if(preset === 'fy'){ ps = new Date(s.getFullYear() - 1, 3, 1); pe = new Date(ps.getTime() + (e - s)); }
  else { pe = new Date(s.getTime() - 1); ps = new Date(pe.getTime() - len); }
  return { start: s, end: e, prevStart: ps, prevEnd: pe, label, prevLabel: `${mvFmtD(ps)} – ${mvFmtD(pe)}` };
}

/* ---------------- charts ---------------- */
function mvChart(id, cfg, drill){
  if(MV_CHARTS[id]){ MV_CHARTS[id].destroy(); delete MV_CHARTS[id]; }
  const el = document.getElementById(id); if(!el || !window.Chart) return;
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 350 } }, cfg.options || {});
  cfg.options.plugins = Object.assign({ legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
    tooltip: { backgroundColor: THEME.tooltipBg, padding: 10, cornerRadius: 10 } }, cfg.options.plugins || {});
  if(drill){
    cfg.options.onClick = (evt, els) => { const x = els && els[0]; if(!x) return; const d = drill(x.datasetIndex, x.index); if(d) mvOpenInvoices(d.title, d.rows, d.sub); };
    cfg.options.onHover = (evt, els) => { const t = evt.native && evt.native.target; if(t) t.style.cursor = els.length ? 'pointer' : 'default'; };
  }
  MV_CHARTS[id] = new Chart(el, cfg);
}
const mvMoneyTick = v => fmtINRShort(v);
const mvY = (extra) => Object.assign({ beginAtZero: true, afterDataLimits: padValueAxis, ticks: { callback: mvMoneyTick }, grid: { color: THEME.grid } }, extra || {});
const mvLabels = f => dlCfg(f || fmtINRShort);

/* ---------------- the view ---------------- */
function createMultiView(root, cfg){
  const V = {
    root, cfg,
    sel: new Set(cfg.defaultLocs || cfg.locations),
    preset: cfg.defaultPreset || 'fy', custom: {}, noTransfers: true, tab: cfg.startTab || 'overview', custSearch: '', custLimit: 200
  };
  const rowsAll = () => (cfg.rows() || []).filter(r => cfg.locations.indexOf(r.location) >= 0);

  root.innerHTML = `
    <div class="filterbar mv-filterbar">
      <div class="filter-block" style="flex:2 1 380px">
        <span class="fb-label">Locations <span class="muted">(ek ya zyada chunein)</span></span>
        <div class="mv-chips" data-mv="chips"></div>
      </div>
      <div class="filter-block">
        <span class="fb-label">Period</span>
        <div class="seg-toggle" data-mv="preset">
          ${[['thisMonth','This month'],['lastMonth','Last month'],['last30','Last 30 days'],['last3','3 months'],['fy','This FY'],['all','All time'],['custom','Custom']].map(([k,l]) => `<button data-p="${k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="filter-block" data-mv="customBox" style="display:none">
        <span class="fb-label">From – to</span>
        <div style="display:flex;gap:6px"><input type="date" data-mv="cs"><input type="date" data-mv="ce"></div>
      </div>
      <div class="filter-block">
        <span class="fb-label">Branch transfers</span>
        <label class="mv-switch"><input type="checkbox" data-mv="transfers" checked> <span>Internal transfers hatao</span></label>
      </div>
      <div class="filter-block"><span class="fb-label">Export</span><button class="util-btn" data-mv="export">Export invoices (CSV)</button></div>
    </div>
    <div data-mv="body"></div>`;
  const $ = k => root.querySelector(`[data-mv="${k}"]`);

  function drawChips(){
    const all = rowsAll();
    $('chips').innerHTML = cfg.locations.map(l => {
      const n = all.filter(r => r.location === l).length;
      return `<button class="mv-chip ${V.sel.has(l) ? 'on' : ''}" data-loc="${escAttr(l)}" style="--c:${mvColor(l)}"><i></i>${escAttr(l)} <span>${fmtNum(n)}</span></button>`;
    }).join('') + (cfg.locations.length > 1 ? `<button class="mv-chip ghost" data-loc="__all">Sab</button>` : '');
    root.querySelectorAll('[data-mv="preset"] button').forEach(b => b.classList.toggle('active', b.dataset.p === V.preset));
    $('customBox').style.display = V.preset === 'custom' ? '' : 'none';
  }
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('[data-loc]'); if(!b) return;
    const l = b.dataset.loc;
    if(l === '__all') cfg.locations.forEach(x => V.sel.add(x));
    else if(V.sel.has(l)){ if(V.sel.size > 1) V.sel.delete(l); } else V.sel.add(l);
    render();
  });
  $('preset').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if(!b) return; V.preset = b.dataset.p; render(); });
  ['cs', 'ce'].forEach(k => $(k).addEventListener('change', () => { V.custom = { start: $('cs').value, end: $('ce').value }; render(); }));
  $('transfers').addEventListener('change', e => { V.noTransfers = e.target.checked; render(); });
  $('export').addEventListener('click', () => { const d = V.last; if(d) mvExportCSV(d.cur, 'invoices ' + [...V.sel].join('+') + ' ' + d.P.label); });
  root.addEventListener('click', e => {
    const d = e.target.closest('[data-mvdrill]'); if(d){ const x = MV_DRILL.get(d.dataset.mvdrill); if(x) mvOpenInvoices(x.title, x.rows, x.sub); return; }
    const c = e.target.closest('[data-mvcust]'); if(c){ const rows = (V.last ? V.last.base : []).filter(r => r.customer === c.dataset.mvcust); mvOpenInvoices(c.dataset.mvcust, rows, 'All invoices of this customer'); return; }
    const x = e.target.closest('[data-mvcsv]'); if(x){ mvTableCSV(x.closest('.panel').querySelector('table'), x.dataset.mvcsv); return; }
    const more = e.target.closest('[data-mvmore]'); if(more){ V.custLimit += 300; render(); }
  });
  root.addEventListener('input', e => { if(e.target.matches('[data-mv="custSearch"]')){ V.custSearch = e.target.value; clearTimeout(V._t); V._t = setTimeout(() => { V.custLimit = 200; render(true); }, 250); } });

  function compute(){
    let base = rowsAll().filter(r => V.sel.has(r.location));
    const transfers = base.filter(r => MV_TRANSFER.test(r.customer));
    if(V.noTransfers) base = base.filter(r => !MV_TRANSFER.test(r.customer));
    const latest = base.reduce((m, r) => r.date > m ? r.date : m, new Date(0));
    const P = mvPeriod(V.preset, V.custom, latest.getTime() ? latest : new Date());
    const cur = P.all ? base : base.filter(r => r.date >= P.start && r.date <= P.end);
    const prev = P.all ? [] : base.filter(r => r.date >= P.prevStart && r.date <= P.prevEnd);
    const trInPeriod = P.all ? transfers : transfers.filter(r => r.date >= P.start && r.date <= P.end);
    return { base, cur, prev, P, latest, transfers: trInPeriod };
  }

  function render(keepFocus){
    MV_DRILL.clear();
    drawChips();
    const D = V.last = compute();
    const body = $('body');
    const focus = keepFocus && document.activeElement && document.activeElement.matches('[data-mv="custSearch"]');
    if(!D.base.length){
      const one = V.sel.size === 1 ? [...V.sel][0] : null;
      body.innerHTML = `<div class="panel"><h2 style="margin:0 0 6px">${one ? escAttr(one) : 'No invoices'}</h2><p class="muted">${one ? 'Is location ka abhi koi data nahi hai. Zoho sync se invoices aate hi yahan poori report apne aap ban jayegi.' : 'Is chunaav me abhi koi invoice nahi hai.'}</p></div>`;
      if(cfg.onRender) cfg.onRender(D, V); return;
    }
    const sec = cfg.tabs ? V.tab : 'overview';
    $('chips').closest('.filter-block').style.display = (sec === 'overview' || sec === 'customers') ? '' : 'none';
    if(sec === 'overview') body.innerHTML = overviewHtml(D);
    else if(sec === 'customers') body.innerHTML = customersHtml(D);
    else body.innerHTML = detailHtml(D, sec);
    if(sec === 'overview') overviewCharts(D);
    else if(sec !== 'customers') detailCharts(D, sec);
    if(focus){ const i = root.querySelector('[data-mv="custSearch"]'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    if(cfg.onRender) cfg.onRender(D, V);
  }

  /* ---------- OVERVIEW (consolidated) ---------- */
  function kpisHtml(rows, prev, extra){
    const net = mvSum(rows, 'net'), gross = mvSum(rows, 'total'), inv = rows.length, cust = mvUniq(rows);
    const pnet = mvSum(rows, 'pnet'), profit = mvSum(rows, 'profit'), pnetShare = net ? pnet / net * 100 : 0;
    const pnetPrev = mvSum(prev, 'net');
    const cards = [
      { l: 'Net sales (w/o GST)', i: '₹', v: fmtINR(net), s: prev.length ? `${mvGrowthHtml(mvPct(net, pnetPrev))} vs ${V.last.P.prevLabel}` : fmtNum(inv) + ' invoices', a: 'var(--violet)', d: mvReg('All invoices', rows) },
      { l: 'Sales (with GST)', i: '₹', v: fmtINR(gross), s: 'Total billed value', a: 'var(--sky)' },
      { l: 'Invoices', i: '#', v: fmtNum(inv), s: prev.length ? `${mvGrowthHtml(mvPct(inv, prev.length))} vs previous` : 'In this period', a: 'var(--coral)' },
      { l: 'Customers', i: '👥', v: fmtNum(cust), s: `${(cust ? inv / cust : 0).toFixed(1)} invoices per customer`, a: 'var(--good)' },
      { l: 'Avg. bill value', i: '≈', v: fmtINR(inv ? net / inv : 0), s: prev.length ? `was ${fmtINR(prev.length ? pnetPrev / prev.length : 0)}` : 'Net of GST', a: 'var(--orange)' },
      pnet > 0 ? { l: 'Profit', i: '▲', v: fmtINR(profit), s: `${fmtPct(profit / pnet * 100)} margin${pnetShare < 99 ? ` · on ${fmtPct(pnetShare)} of sales` : ''}`, a: 'var(--indigo-2)' }
               : { l: 'Profit', i: '▲', v: 'Not tracked', s: 'Profit abhi entered nahi hai', a: 'var(--indigo-2)' }
    ].concat(extra || []);
    return `<div class="kpis mv-kpis">${cards.map(c => `<div class="kpi ${c.d ? 'clickable' : ''}" style="--accent:${c.a}" ${c.d ? `data-mvdrill="${c.d}"` : ''}>
      <div class="kpi-head"><span>${c.l}</span><i>${c.i}</i></div><div class="val">${c.v}</div><div class="sub">${c.s}</div></div>`).join('')}</div>`;
  }
  function locCardsHtml(D){
    const tot = mvSum(D.cur, 'net');
    const locs = cfg.locations.filter(l => V.sel.has(l));
    return `<div class="mv-loc-grid">${locs.map(l => {
      const r = D.cur.filter(x => x.location === l), p = D.prev.filter(x => x.location === l);
      const net = mvSum(r, 'net'), pn = mvSum(r, 'pnet'), pr = mvSum(r, 'profit');
      const months = {}; D.base.filter(x => x.location === l).forEach(x => { const k = mvMonthKey(x.date); months[k] = (months[k] || 0) + x.net; });
      const mk = Object.keys(months).sort().slice(-6), mx = Math.max(1, ...mk.map(k => months[k]));
      return `<div class="mv-loc clickable" data-mvdrill="${mvReg(l + ' — invoices', r, D.P.label)}" style="--c:${mvColor(l)}">
        <div class="mv-loc-top"><b>${escAttr(l)}</b><span>${fmtPct(tot ? net / tot * 100 : 0)} share</span></div>
        <div class="mv-loc-val">${fmtINR(net)}</div>
        <div class="mv-loc-meta">${fmtNum(r.length)} invoices · ${fmtNum(mvUniq(r))} customers · avg ${fmtINR(r.length ? net / r.length : 0)}</div>
        <div class="mv-loc-meta">${D.prev.length ? mvGrowthHtml(mvPct(net, mvSum(p, 'net'))) + ' vs previous' : ''}${pn > 0 ? ` · margin ${fmtPct(pr / pn * 100)}` : ' · profit not tracked'}</div>
        <div class="mv-spark">${mk.map(k => `<i style="height:${Math.max(6, months[k] / mx * 100)}%" title="${mvMonthLabel(k)}: ${fmtINR(months[k])}"></i>`).join('')}</div>
      </div>`; }).join('')}</div>`;
  }
  function insightsList(D){
    const out = [], cur = D.cur, net = mvSum(cur, 'net');
    const locs = cfg.locations.filter(l => V.sel.has(l)).map(l => { const r = cur.filter(x => x.location === l), p = D.prev.filter(x => x.location === l);
      return { l, net: mvSum(r, 'net'), inv: r.length, cust: mvUniq(r), aov: r.length ? mvSum(r, 'net') / r.length : 0, g: D.prev.length ? mvPct(mvSum(r, 'net'), mvSum(p, 'net')) : null }; });
    const top = locs.slice().sort((a, b) => b.net - a.net)[0];
    if(top && locs.length > 1 && net) out.push({ t: 'info', x: `<b>${escAttr(top.l)}</b> brings <b>${fmtPct(top.net / net * 100)}</b> of sales (${fmtINR(top.net)}) in ${escAttr(D.P.label)}.` });
    const grow = locs.filter(x => x.g !== null && x.net > 0).sort((a, b) => b.g - a.g);
    if(grow.length) { const g = grow[0], w = grow[grow.length - 1];
      out.push({ t: g.g >= 0 ? 'good' : 'bad', x: `Fastest: <b>${escAttr(g.l)}</b> ${g.g >= 0 ? 'up' : 'down'} ${Math.abs(g.g).toFixed(1)}% vs previous period.` });
      if(grow.length > 1 && w.l !== g.l) out.push({ t: w.g >= 0 ? 'info' : 'warn', x: `Slowest: <b>${escAttr(w.l)}</b> ${w.g >= 0 ? 'up' : 'down'} ${Math.abs(w.g).toFixed(1)}%.` }); }
    const aovs = locs.filter(x => x.inv).sort((a, b) => b.aov - a.aov);
    if(aovs.length > 1) out.push({ t: 'info', x: `Bill size varies a lot: <b>${escAttr(aovs[0].l)}</b> avg ${fmtINR(aovs[0].aov)} vs <b>${escAttr(aovs[aovs.length - 1].l)}</b> avg ${fmtINR(aovs[aovs.length - 1].aov)}.` });
    const bym = {}; D.base.forEach(r => { const k = mvMonthKey(r.date); bym[k] = (bym[k] || 0) + r.net; });
    const best = Object.entries(bym).sort((a, b) => b[1] - a[1])[0];
    if(best) out.push({ t: 'good', x: `Best month so far: <b>${mvMonthLabel(best[0])}</b> with ${fmtINR(best[1])}.` });
    const wd = [0, 0, 0, 0, 0, 0, 0]; cur.forEach(r => wd[r.date.getDay()] += r.net);
    const dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], bi = wd.indexOf(Math.max(...wd));
    if(net) out.push({ t: 'info', x: `<b>${dn[bi]}</b> is the strongest day (${fmtPct(wd[bi] / net * 100)} of sales).` });
    const st = {}; cur.forEach(r => { if(r.state) st[r.state] = (st[r.state] || 0) + r.net; });
    const ts = Object.entries(st).sort((a, b) => b[1] - a[1]);
    if(ts.length) out.push({ t: 'info', x: `Top state: <b>${escAttr(ts[0][0])}</b> (${fmtPct(ts[0][1] / net * 100)}). Sales reach <b>${fmtNum(ts.length)}</b> states.` });
    const trAmt = mvSum(D.transfers, 'net');
    if(trAmt) out.push({ t: 'warn', x: `${V.noTransfers ? 'Hataye gaye' : 'Shamil'}: <b>${fmtINR(trAmt)}</b> internal branch transfers (${fmtNum(D.transfers.length)} invoices to PicknPack itself) — ${V.noTransfers ? 'double counting nahi hoti' : 'total me do baar gina ja sakta hai'}.`, d: mvReg('Internal branch transfers', D.transfers) });
    cfg.locations.filter(l => V.sel.has(l)).forEach(l => { if(!rowsAll().some(r => r.location === l)) out.push({ t: 'warn', x: `<b>${escAttr(l)}</b>: abhi koi data nahi hai.` }); });
    return out;
  }
  function insightsHtml(list){
    return `<div class="insight-grid">${list.map(i => `<div class="insight ${i.t} ${i.d ? 'clickable' : ''}" ${i.d ? `data-mvdrill="${i.d}"` : ''}><span class="ins-ico">${i.t === 'good' ? '▲' : i.t === 'bad' ? '▼' : i.t === 'warn' ? '!' : 'i'}</span><p>${i.x}${i.d ? ' <span class="ins-more">View →</span>' : ''}</p></div>`).join('')}</div>`;
  }
  function overviewHtml(D){
    const locs = cfg.locations.filter(l => V.sel.has(l));
    const months = [...new Set(D.cur.map(r => mvMonthKey(r.date)))].sort();
    const mat = locs.map(l => ({ l, v: months.map(m => mvSum(D.cur.filter(r => r.location === l && mvMonthKey(r.date) === m), 'net')) }));
    const tot = months.map((m, i) => mat.reduce((s, x) => s + x.v[i], 0));
    const custs = {}; D.cur.forEach(r => { const c = custs[r.customer] || (custs[r.customer] = { n: r.customer, loc: {}, net: 0, inv: 0, last: r.date }); c.net += r.net; c.inv++; c.loc[r.location] = 1; if(r.date > c.last) c.last = r.date; });
    const top = Object.values(custs).sort((a, b) => b.net - a.net).slice(0, 15), net = mvSum(D.cur, 'net');
    return `
      <div class="mv-period">Showing <b>${escAttr(D.P.label)}</b> · ${locs.map(l => `<span class="mv-dot" style="--c:${mvColor(l)}"></span>${escAttr(l)}`).join(' ')}${D.prev.length ? ` · compared with ${escAttr(D.P.prevLabel)}` : ''}</div>
      ${kpisHtml(D.cur, D.prev)}
      ${locCardsHtml(D)}
      <div class="panel"><div class="panel-head"><div><h2>Key insights</h2><p class="desc">Auto-written from the selected locations and period. Click to see invoices.</p></div></div>${insightsHtml(insightsList(D))}</div>
      <div class="panel"><div class="panel-head"><div><h2>Monthly sales by location</h2><p class="desc">Stacked, without GST. Total on top. Click a bar for its invoices.</p></div></div>
        <div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_monthly"></canvas></div></div></div>
      <div class="grid3">
        <div class="panel"><div class="panel-head"><div><h2>Location share</h2><p class="desc">Share of net sales</p></div></div><div class="chart-box"><div class="chart-inner"><canvas id="${cfg.id}_share"></canvas></div></div></div>
        <div class="panel"><div class="panel-head"><div><h2>Sales trend</h2><p class="desc" id="${cfg.id}_trendDesc"></p></div></div><div class="chart-box"><div class="chart-inner"><canvas id="${cfg.id}_trend"></canvas></div></div></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h2>Location × month</h2><p class="desc">Net sales without GST</p></div><button class="util-btn small" data-mvcsv="location-month">Export CSV</button></div>
        <div class="table-scroll"><table><thead><tr><th>Location</th>${months.map(m => `<th style="text-align:right">${mvMonthLabel(m)}</th>`).join('')}<th style="text-align:right">Total</th><th style="text-align:right">Share</th></tr></thead><tbody>
        ${mat.map(x => `<tr><td class="name"><span class="mv-dot" style="--c:${mvColor(x.l)}"></span>${escAttr(x.l)}</td>${x.v.map((v, i) => `<td style="text-align:right" class="clickable" data-mvdrill="${mvReg(`${x.l} — ${mvMonthLabel(months[i])}`, D.cur.filter(r => r.location === x.l && mvMonthKey(r.date) === months[i]))}">${money(v)}</td>`).join('')}
          <td style="text-align:right;font-weight:700">${money(x.v.reduce((a, b) => a + b, 0))}</td><td style="text-align:right">${fmtPct(net ? x.v.reduce((a, b) => a + b, 0) / net * 100 : 0)}</td></tr>`).join('')}
        <tr class="total-row"><td><b>Total</b></td>${tot.map(v => `<td style="text-align:right"><b>${money(v)}</b></td>`).join('')}<td style="text-align:right"><b>${money(net)}</b></td><td style="text-align:right">100%</td></tr>
        </tbody></table></div></div>
      <div class="grid3">
        <div class="panel"><div class="panel-head"><div><h2>Top states</h2><p class="desc">Place of supply, all selected locations</p></div></div><div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_states"></canvas></div></div></div>
        <div class="panel"><div class="panel-head"><div><h2>Sales by weekday</h2><p class="desc">Which days bring the orders</p></div></div><div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_wd"></canvas></div></div></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h2>Top customers</h2><p class="desc">Across selected locations · click a name for invoices</p></div><button class="util-btn small" data-mvcsv="top-customers">Export CSV</button></div>
        <div class="table-scroll"><table><thead><tr><th>#</th><th>Customer</th><th>Location</th><th style="text-align:right">Invoices</th><th style="text-align:right">Net sales</th><th style="text-align:right">Share</th><th>Last order</th></tr></thead><tbody>
        ${top.map((c, i) => `<tr class="clickable" data-mvcust="${escAttr(c.n)}"><td>${i + 1}</td><td class="name">${escAttr(c.n)}</td><td>${Object.keys(c.loc).map(l => `<span class="mv-tag" style="--c:${mvColor(l)}">${escAttr(l)}</span>`).join(' ')}</td>
          <td style="text-align:right">${fmtNum(c.inv)}</td><td style="text-align:right;font-weight:600">${money(c.net)}</td><td style="text-align:right">${fmtPct(net ? c.net / net * 100 : 0)}</td><td>${mvFmtD(c.last)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }
  function overviewCharts(D){
    const locs = cfg.locations.filter(l => V.sel.has(l));
    const months = [...new Set(D.cur.map(r => mvMonthKey(r.date)))].sort();
    mvChart(cfg.id + '_monthly', { type: 'bar',
      data: { labels: months.map(mvMonthLabel), datasets: locs.map(l => ({ label: l, backgroundColor: mvColor(l), borderRadius: 6, stack: 's',
        data: months.map(m => mvSum(D.cur.filter(r => r.location === l && mvMonthKey(r.date) === m), 'net')) })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: mvY({ stacked: true }) },
        plugins: { stackTotals: { enabled: locs.length > 1, formatter: fmtINRShort }, datalabels: locs.length > 1 ? { display: false } : mvLabels() } } },
      (di, i) => ({ title: `${locs[di]} — ${mvMonthLabel(months[i])}`, rows: D.cur.filter(r => r.location === locs[di] && mvMonthKey(r.date) === months[i]) }));
    const shares = locs.map(l => mvSum(D.cur.filter(r => r.location === l), 'net')), tot = shares.reduce((a, b) => a + b, 0);
    mvChart(cfg.id + '_share', { type: 'doughnut', data: { labels: locs, datasets: [{ data: shares, backgroundColor: locs.map(mvColor), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '62%', plugins: { datalabels: { display: ctx => tot && ctx.dataset.data[ctx.dataIndex] / tot > 0.04, color: '#fff', font: { weight: 700, size: 11 }, formatter: v => fmtPct(v / tot * 100) },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtINR(c.raw)} (${fmtPct(tot ? c.raw / tot * 100 : 0)})` } } } } },
      (di, i) => ({ title: locs[i] + ' — invoices', rows: D.cur.filter(r => r.location === locs[i]) }));
    // trend: daily for short periods, weekly otherwise
    const span = D.cur.length ? (Math.max(...D.cur.map(r => +r.date)) - Math.min(...D.cur.map(r => +r.date))) / MV_DAY : 0;
    const daily = span <= 62;
    const keyOf = d => { const x = mvDay(d); if(!daily){ const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); } return +x; };
    const keys = [...new Set(D.cur.map(r => keyOf(r.date)))].sort((a, b) => a - b);
    document.getElementById(cfg.id + '_trendDesc').textContent = daily ? 'Daily net sales' : 'Weekly net sales (Mon–Sun)';
    mvChart(cfg.id + '_trend', { type: 'line',
      data: { labels: keys.map(k => mvFmtD(new Date(k))), datasets: locs.map(l => ({ label: l, borderColor: mvColor(l), backgroundColor: mvColor(l) + '22', fill: locs.length === 1, tension: .3, pointRadius: keys.length > 40 ? 0 : 2, borderWidth: 2,
        data: keys.map(k => mvSum(D.cur.filter(r => r.location === l && keyOf(r.date) === k), 'net')) })) },
      options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: mvY() },
        plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtINR(c.raw)}` } } } } },
      (di, i) => ({ title: `${locs[di]} — ${mvFmtD(new Date(keys[i]))}${daily ? '' : ' week'}`, rows: D.cur.filter(r => r.location === locs[di] && keyOf(r.date) === keys[i]) }));
    const st = {}; D.cur.forEach(r => { const s = r.state || 'Not given'; st[s] = (st[s] || 0) + r.net; });
    const ts = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 10);
    mvChart(cfg.id + '_states', { type: 'bar', data: { labels: ts.map(x => x[0]), datasets: [{ label: 'Net sales', data: ts.map(x => x[1]), backgroundColor: '#6C5CE7', borderRadius: 6 }] },
      options: { indexAxis: 'y', scales: { x: mvY(), y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: mvLabels() } } },
      (di, i) => ({ title: ts[i][0] + ' — invoices', rows: D.cur.filter(r => (r.state || 'Not given') === ts[i][0]) }));
    const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], idx = d => (d.getDay() + 6) % 7;
    mvChart(cfg.id + '_wd', { type: 'bar', data: { labels: dn, datasets: locs.map(l => ({ label: l, backgroundColor: mvColor(l), borderRadius: 5,
        data: dn.map((x, i) => mvSum(D.cur.filter(r => r.location === l && idx(r.date) === i), 'net')) })) },
      options: { scales: { x: { grid: { display: false } }, y: mvY() }, plugins: { datalabels: locs.length === 1 ? mvLabels() : { display: false } } } },
      (di, i) => ({ title: `${locs[di]} — ${dn[i]}`, rows: D.cur.filter(r => r.location === locs[di] && idx(r.date) === i) }));
  }

  /* ---------- LOCATION DEEP DIVE (branches dashboard) ---------- */
  const BANDS = [[0, 500, 'Under ₹500'], [500, 1000, '₹500–1k'], [1000, 2500, '₹1k–2.5k'], [2500, 5000, '₹2.5k–5k'], [5000, 10000, '₹5k–10k'], [10000, 50000, '₹10k–50k'], [50000, 1e12, '₹50k+']];
  function detailData(D, loc){
    const all = D.base.filter(r => r.location === loc), cur = D.cur.filter(r => r.location === loc), prev = D.prev.filter(r => r.location === loc);
    const first = {}; all.forEach(r => { if(!first[r.customer] || r.date < first[r.customer]) first[r.customer] = r.date; });
    return { all, cur, prev, first };
  }
  function detailHtml(D, loc){
    const X = detailData(D, loc);
    if(!X.all.length) return `<div class="panel"><h2 style="margin:0 0 6px">${escAttr(loc)}</h2><p class="muted">Is location ka abhi koi data nahi hai. Invoices aate hi yahan report apne aap ban jayegi.</p></div>`;
    const cur = X.cur, net = mvSum(cur, 'net');
    const byC = {}; cur.forEach(r => { const c = byC[r.customer] || (byC[r.customer] = { n: r.customer, net: 0, inv: 0, last: r.date, first: X.first[r.customer] }); c.net += r.net; c.inv++; if(r.date > c.last) c.last = r.date; });
    const custs = Object.values(byC).sort((a, b) => b.net - a.net);
    const repeat = custs.filter(c => c.inv > 1).length, top5 = custs.slice(0, 5).reduce((s, c) => s + c.net, 0);
    const newC = custs.filter(c => !D.P.all && c.first >= D.P.start).length;
    const mkt = cur.filter(r => MV_MARKETPLACE.test(r.customer));
    const channels = {}; cur.forEach(r => { const ch = mvChannelOf(r); const o = channels[ch] || (channels[ch] = { ch, net: 0, inv: 0, c: new Set(), pnet: 0, profit: 0 }); o.net += r.net; o.inv++; o.c.add(r.customer); o.pnet += r.pnet; o.profit += r.profit; });
    const chList = Object.values(channels).sort((a, b) => b.net - a.net);
    const extra = [{ l: 'Repeat customers', i: '↻', v: fmtPct(custs.length ? repeat / custs.length * 100 : 0), s: `${fmtNum(repeat)} of ${fmtNum(custs.length)} ordered 2+ times`, a: 'var(--sky)' },
      (D.P.all || D.P.start <= X.all.reduce((m, r) => r.date < m ? r.date : m, new Date(8.64e15))) ? { l: 'Top 5 customers', i: '★', v: fmtPct(net ? top5 / net * 100 : 0), s: 'Share of sales', a: 'var(--coral)' }
              : { l: 'New customers', i: '+', v: fmtNum(newC), s: `First order in ${escAttr(D.P.label)}`, a: 'var(--coral)' }];
    if(mkt.length) extra.push({ l: 'Meesho / Valmo sellers', i: '🛍', v: fmtPct(net ? mvSum(mkt, 'net') / net * 100 : 0), s: `${fmtNum(mkt.length)} invoices · ${fmtNum(mvUniq(mkt))} sellers`, a: 'var(--good)' });
    return `
      <div class="mv-period"><span class="mv-dot" style="--c:${mvColor(loc)}"></span><b>${escAttr(loc)}</b> · ${escAttr(D.P.label)}${D.prev.length ? ` · compared with ${escAttr(D.P.prevLabel)}` : ''}</div>
      ${kpisHtml(cur, X.prev, extra)}
      <div class="panel"><div class="panel-head"><div><h2>Monthly sales and invoices</h2><p class="desc">Bars: net sales · line: number of invoices</p></div></div><div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_d_month"></canvas></div></div></div>
      ${chList.length > 1 ? `<div class="grid3">
        <div class="panel"><div class="panel-head"><div><h2>Sales channels</h2><p class="desc">From the invoice number (ECOM, SPSY/SHOPSY, SH, MYTR…)</p></div></div><div class="chart-box"><div class="chart-inner"><canvas id="${cfg.id}_d_ch"></canvas></div></div></div>
        <div class="panel"><div class="panel-head"><div><h2>Channel report</h2><p class="desc">Click a row for invoices</p></div><button class="util-btn small" data-mvcsv="channels">Export CSV</button></div>
          <div class="table-scroll"><table><thead><tr><th>Channel</th><th style="text-align:right">Invoices</th><th style="text-align:right">Customers</th><th style="text-align:right">Net sales</th><th style="text-align:right">Avg bill</th><th style="text-align:right">Share</th>${chList.some(c => c.pnet) ? '<th style="text-align:right">Margin</th>' : ''}</tr></thead><tbody>
          ${chList.map(c => `<tr class="clickable" data-mvdrill="${mvReg(`${loc} — ${c.ch}`, cur.filter(r => mvChannelOf(r) === c.ch))}"><td class="name">${escAttr(c.ch)}</td><td style="text-align:right">${fmtNum(c.inv)}</td><td style="text-align:right">${fmtNum(c.c.size)}</td><td style="text-align:right;font-weight:600">${money(c.net)}</td><td style="text-align:right">${money(c.inv ? c.net / c.inv : 0)}</td><td style="text-align:right">${fmtPct(net ? c.net / net * 100 : 0)}</td>${chList.some(x => x.pnet) ? `<td style="text-align:right">${c.pnet ? fmtPct(c.profit / c.pnet * 100) : '—'}</td>` : ''}</tr>`).join('')}
          </tbody></table></div></div></div>` : ''}
      <div class="grid3">
        <div class="panel"><div class="panel-head"><div><h2>Bill size</h2><p class="desc">How many invoices fall in each value band (bars) and their share of sales</p></div></div><div class="chart-box"><div class="chart-inner"><canvas id="${cfg.id}_d_bands"></canvas></div></div></div>
        <div class="panel"><div class="panel-head"><div><h2>New vs returning customers</h2><p class="desc">Per month: customers ordering for the first time at ${escAttr(loc)} vs coming back</p></div></div><div class="chart-box"><div class="chart-inner"><canvas id="${cfg.id}_d_nvr"></canvas></div></div></div>
      </div>
      <div class="grid3">
        <div class="panel"><div class="panel-head"><div><h2>Top states</h2><p class="desc">Where the orders ship</p></div></div><div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_d_states"></canvas></div></div></div>
        <div class="panel"><div class="panel-head"><div><h2>Sales by weekday</h2><p class="desc">Invoices per day of week</p></div></div><div class="chart-box tall"><div class="chart-inner"><canvas id="${cfg.id}_d_wd"></canvas></div></div></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h2>Top customers — ${escAttr(loc)}</h2><p class="desc">Top 5 bring ${fmtPct(net ? top5 / net * 100 : 0)} of sales · click a name for invoices</p></div><button class="util-btn small" data-mvcsv="top-customers-${loc}">Export CSV</button></div>
        <div class="table-scroll"><table><thead><tr><th>#</th><th>Customer</th><th style="text-align:right">Invoices</th><th style="text-align:right">Net sales</th><th style="text-align:right">Avg bill</th><th style="text-align:right">Share</th><th>First order</th><th>Last order</th></tr></thead><tbody>
        ${custs.slice(0, 20).map((c, i) => `<tr class="clickable" data-mvcust="${escAttr(c.n)}"><td>${i + 1}</td><td class="name">${escAttr(c.n)}</td><td style="text-align:right">${fmtNum(c.inv)}</td><td style="text-align:right;font-weight:600">${money(c.net)}</td><td style="text-align:right">${money(c.net / c.inv)}</td><td style="text-align:right">${fmtPct(net ? c.net / net * 100 : 0)}</td><td>${mvFmtD(c.first)}</td><td>${mvFmtD(c.last)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }
  function detailCharts(D, loc){
    const X = detailData(D, loc); if(!X.all.length) return;
    const cur = X.cur, col = mvColor(loc);
    const months = [...new Set(cur.map(r => mvMonthKey(r.date)))].sort();
    mvChart(cfg.id + '_d_month', { data: { labels: months.map(mvMonthLabel), datasets: [
        { type: 'bar', label: 'Net sales', data: months.map(m => mvSum(cur.filter(r => mvMonthKey(r.date) === m), 'net')), backgroundColor: col, borderRadius: 7, yAxisID: 'y', datalabels: mvLabels() },
        { type: 'line', label: 'Invoices', data: months.map(m => cur.filter(r => mvMonthKey(r.date) === m).length), borderColor: '#1E1B4B', backgroundColor: '#1E1B4B', tension: .3, yAxisID: 'y2', pointRadius: 3,
          datalabels: { display: true, align: 'top', color: '#1E1B4B', font: { size: 10, weight: 600 }, formatter: v => fmtNum(v) } }] },
      options: { scales: { x: { grid: { display: false } }, y: mvY(), y2: { position: 'right', beginAtZero: true, grid: { display: false }, afterDataLimits: padValueAxis } } } },
      (di, i) => ({ title: `${loc} — ${mvMonthLabel(months[i])}`, rows: cur.filter(r => mvMonthKey(r.date) === months[i]) }));
    const chs = {}; cur.forEach(r => { const c = mvChannelOf(r); chs[c] = (chs[c] || 0) + r.net; });
    const chl = Object.entries(chs).sort((a, b) => b[1] - a[1]), cht = chl.reduce((s, x) => s + x[1], 0);
    if(chl.length > 1) mvChart(cfg.id + '_d_ch', { type: 'doughnut', data: { labels: chl.map(x => x[0]), datasets: [{ data: chl.map(x => x[1]), backgroundColor: PALETTE.slice(0, chl.length), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '60%', plugins: { datalabels: { display: c => cht && c.dataset.data[c.dataIndex] / cht > 0.04, color: '#fff', font: { weight: 700, size: 11 }, formatter: v => fmtPct(v / cht * 100) },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtINR(c.raw)}` } } } } },
      (di, i) => ({ title: `${loc} — ${chl[i][0]}`, rows: cur.filter(r => mvChannelOf(r) === chl[i][0]) }));
    const bandOf = v => BANDS.findIndex(b => v >= b[0] && v < b[1]);
    const bc = BANDS.map(() => 0), bs = BANDS.map(() => 0), tn = mvSum(cur, 'net');
    cur.forEach(r => { const i = bandOf(r.net); if(i >= 0){ bc[i]++; bs[i] += r.net; } });
    const keep = BANDS.map((b, i) => i).filter(i => bc[i] > 0);
    mvChart(cfg.id + '_d_bands', { type: 'bar', data: { labels: keep.map(i => BANDS[i][2]), datasets: [{ label: 'Invoices', data: keep.map(i => bc[i]), backgroundColor: col, borderRadius: 6,
        datalabels: { display: true, anchor: 'end', align: 'end', clamp: true, clip: false, color: '#1E1B4B', font: { size: 10, weight: 700 }, formatter: (v, c) => `${fmtNum(v)} · ${fmtPct(tn ? bs[keep[c.dataIndex]] / tn * 100 : 0)}` } }] },
      options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => `${fmtNum(c.raw)} invoices · ${fmtINR(bs[keep[c.dataIndex]])} (${fmtPct(tn ? bs[keep[c.dataIndex]] / tn * 100 : 0)} of sales)` } } } } },
      (di, i) => ({ title: `${loc} — bills ${BANDS[keep[i]][2]}`, rows: cur.filter(r => bandOf(r.net) === keep[i]) }));
    const nv = months.map(m => { const s = new Set(), n = new Set(); cur.filter(r => mvMonthKey(r.date) === m).forEach(r => { (mvMonthKey(X.first[r.customer]) === m ? n : s).add(r.customer); }); return { n: n.size, s: s.size }; });
    mvChart(cfg.id + '_d_nvr', { type: 'bar', data: { labels: months.map(mvMonthLabel), datasets: [
        { label: 'New', data: nv.map(x => x.n), backgroundColor: '#1FB286', borderRadius: 5, stack: 'c' }, { label: 'Returning', data: nv.map(x => x.s), backgroundColor: col, borderRadius: 5, stack: 'c' }] },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { stackTotals: { enabled: true, formatter: v => fmtNum(v) } } } },
      (di, i) => ({ title: `${loc} — ${di === 0 ? 'new' : 'returning'} customers, ${mvMonthLabel(months[i])}`, rows: cur.filter(r => mvMonthKey(r.date) === months[i] && ((mvMonthKey(X.first[r.customer]) === months[i]) === (di === 0))) }));
    const st = {}; cur.forEach(r => { const s = r.state || 'Not given'; st[s] = (st[s] || 0) + r.net; });
    const ts = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 12);
    mvChart(cfg.id + '_d_states', { type: 'bar', data: { labels: ts.map(x => x[0]), datasets: [{ label: 'Net sales', data: ts.map(x => x[1]), backgroundColor: col, borderRadius: 6 }] },
      options: { indexAxis: 'y', scales: { x: mvY(), y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: mvLabels() } } },
      (di, i) => ({ title: `${loc} — ${ts[i][0]}`, rows: cur.filter(r => (r.state || 'Not given') === ts[i][0]) }));
    const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], idx = d => (d.getDay() + 6) % 7;
    mvChart(cfg.id + '_d_wd', { type: 'bar', data: { labels: dn, datasets: [{ label: 'Invoices', data: dn.map((x, i) => cur.filter(r => idx(r.date) === i).length), backgroundColor: col, borderRadius: 6 }] },
      options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { legend: { display: false }, datalabels: mvLabels(v => fmtNum(v)) } } },
      (di, i) => ({ title: `${loc} — ${dn[i]}`, rows: cur.filter(r => idx(r.date) === i) }));
  }

  /* ---------- CUSTOMERS (branches dashboard) ---------- */
  function customersHtml(D){
    const byC = {};
    D.base.forEach(r => { const c = byC[r.customer] || (byC[r.customer] = { n: r.customer, loc: {}, net: 0, inv: 0, pnet: 0, profit: 0, cnet: 0, cinv: 0, first: r.date, last: r.date, mk: MV_MARKETPLACE.test(r.customer) });
      c.net += r.net; c.inv++; c.pnet += r.pnet; c.profit += r.profit; c.loc[r.location] = 1; if(r.date < c.first) c.first = r.date; if(r.date > c.last) c.last = r.date; });
    D.cur.forEach(r => { const c = byC[r.customer]; if(c){ c.cnet += r.net; c.cinv++; } });
    const q = V.custSearch.trim().toLowerCase();
    let list = Object.values(byC).filter(c => c.cinv > 0 || D.P.all);
    if(q) list = list.filter(c => c.n.toLowerCase().includes(q));
    list.sort((a, b) => b.cnet - a.cnet);
    const ref = D.latest;
    const totalC = list.length, rep = list.filter(c => c.inv > 1).length;
    return `
      <div class="mv-period">Customers with orders in <b>${escAttr(D.P.label)}</b> · ${[...V.sel].map(l => `<span class="mv-dot" style="--c:${mvColor(l)}"></span>${escAttr(l)}`).join(' ')}</div>
      <div class="kpi-mini-row">
        <div class="kpi-mini"><div class="lbl">Customers</div><div class="val">${fmtNum(totalC)}</div></div>
        <div class="kpi-mini"><div class="lbl">Ordered 2+ times (ever)</div><div class="val">${fmtNum(rep)} · ${fmtPct(totalC ? rep / totalC * 100 : 0)}</div></div>
        <div class="kpi-mini"><div class="lbl">Sales in period</div><div class="val">${fmtINR(list.reduce((s, c) => s + c.cnet, 0))}</div></div>
        <div class="kpi-mini"><div class="lbl">Meesho / Valmo sellers</div><div class="val">${fmtNum(list.filter(c => c.mk).length)}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h2>Customer report</h2><p class="desc">Sorted by sales in the period · lifetime = since data starts · click a name for invoices</p></div>
        <div style="display:flex;gap:8px;align-items:center"><input class="table-search" data-mv="custSearch" placeholder="Search name or phone…" value="${escAttr(V.custSearch)}"><button class="util-btn small" data-mvcsv="customers">Export CSV</button></div></div>
        <div class="table-scroll"><table><thead><tr><th>#</th><th>Customer</th><th>Location</th><th style="text-align:right">Invoices (period)</th><th style="text-align:right">Sales (period)</th><th style="text-align:right">Lifetime invoices</th><th style="text-align:right">Lifetime sales</th><th style="text-align:right">Avg bill</th><th>First</th><th>Last</th><th style="text-align:right">Days since</th></tr></thead><tbody>
        ${list.slice(0, V.custLimit).map((c, i) => `<tr class="clickable" data-mvcust="${escAttr(c.n)}"><td>${i + 1}</td><td class="name">${escAttr(c.n)}${c.mk ? ' <span class="mv-tag" style="--c:#1FB286">Meesho/Valmo</span>' : ''}</td>
          <td>${Object.keys(c.loc).map(l => `<span class="mv-tag" style="--c:${mvColor(l)}">${escAttr(l)}</span>`).join(' ')}</td>
          <td style="text-align:right">${fmtNum(c.cinv)}</td><td style="text-align:right;font-weight:600">${money(c.cnet)}</td><td style="text-align:right">${fmtNum(c.inv)}</td><td style="text-align:right">${money(c.net)}</td>
          <td style="text-align:right">${money(c.net / c.inv)}</td><td>${mvFmtD(c.first)}</td><td>${mvFmtD(c.last)}</td><td style="text-align:right">${fmtNum(Math.round((ref - c.last) / MV_DAY))}</td></tr>`).join('')}
        </tbody></table></div>
        ${list.length > V.custLimit ? `<div style="text-align:center;margin-top:10px"><button class="util-btn small" data-mvmore="1">Show more (${fmtNum(list.length - V.custLimit)} left)</button></div>` : ''}</div>`;
  }

  V.render = render;
  V.setTab = t => { V.tab = t; render(); };
  return V;
}

/* ---------------- invoice popup (own, so it works on both pages) ---------------- */
let MV_INV = null;
function mvOpenInvoices(title, rows, sub){
  let ov = document.getElementById('mvInvOverlay');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'mvInvOverlay'; ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-box" style="max-width:1000px"><div class="modal-head"><div><h3 id="mvInvTitle"></h3><p class="muted" id="mvInvSub" style="margin:4px 0 0"></p></div><button class="modal-close" id="mvInvClose" aria-label="Close">✕</button></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><input class="table-search" id="mvInvSearch" placeholder="Search customer or invoice…"><button class="util-btn small" id="mvInvCsv">Export CSV</button></div>
      <div class="table-scroll" style="max-height:60vh"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Location</th><th>Channel</th><th style="text-align:right">Net</th><th style="text-align:right">Total</th><th style="text-align:right">Profit</th><th>State</th></tr></thead><tbody id="mvInvBody"></tbody></table></div>
      <div style="text-align:center;margin-top:10px"><button class="util-btn small" id="mvInvMore" style="display:none">Show more</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if(e.target === ov) ov.style.display = 'none'; });
    ov.querySelector('#mvInvClose').addEventListener('click', () => ov.style.display = 'none');
    ov.querySelector('#mvInvSearch').addEventListener('input', () => { MV_INV.limit = 200; mvDrawInv(); });
    ov.querySelector('#mvInvMore').addEventListener('click', () => { MV_INV.limit += 400; mvDrawInv(); });
    ov.querySelector('#mvInvCsv').addEventListener('click', () => mvExportCSV(mvInvFiltered(), MV_INV.title));
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && ov.style.display !== 'none') ov.style.display = 'none'; });
  }
  MV_INV = { title, rows: rows.slice().sort((a, b) => b.date - a.date), sub, limit: 200 };
  ov.querySelector('#mvInvTitle').textContent = title;
  ov.querySelector('#mvInvSearch').value = '';
  ov.style.display = 'flex';
  mvDrawInv();
}
function mvInvFiltered(){ const q = document.getElementById('mvInvSearch').value.trim().toLowerCase(); return q ? MV_INV.rows.filter(r => (r.customer + ' ' + r.invoice).toLowerCase().includes(q)) : MV_INV.rows; }
function mvDrawInv(){
  const rows = mvInvFiltered(), net = mvSum(rows, 'net');
  document.getElementById('mvInvSub').textContent = `${fmtNum(rows.length)} invoices · ${fmtINR(net)} net${MV_INV.sub ? ' · ' + MV_INV.sub : ''}`;
  document.getElementById('mvInvBody').innerHTML = rows.slice(0, MV_INV.limit).map(r => `<tr><td>${r.date.toLocaleDateString('en-GB')}</td><td>${escAttr(r.invoice)}</td><td class="name">${escAttr(r.customer)}</td><td><span class="mv-tag" style="--c:${mvColor(r.location)}">${escAttr(r.location)}</span></td><td>${escAttr(mvChannelOf(r))}</td>
    <td style="text-align:right">${money(r.net)}</td><td style="text-align:right">${money(r.total)}</td><td style="text-align:right">${r.pp ? '<span class="muted">—</span>' : money(r.profit)}</td><td>${escAttr(r.state || '')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty-note">No invoices</td></tr>';
  const more = document.getElementById('mvInvMore'); more.style.display = rows.length > MV_INV.limit ? '' : 'none'; more.textContent = `Show more (${fmtNum(rows.length - MV_INV.limit)} left)`;
}
function mvCsvCell(v){ const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function mvDownload(name, text){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })); a.download = name.replace(/[^\w\- +]/g, '_').slice(0, 80) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function mvExportCSV(rows, name){
  const head = ['Invoice Date', 'Invoice#', 'Customer Name', 'Location', 'Channel', 'Amount Without Tax', 'Tax Amount', 'Total', 'Profit', 'Place of Supply', 'Billing Code'];
  mvDownload(name || 'invoices', [head.join(',')].concat(rows.map(r => [r.date.toLocaleDateString('en-GB'), r.invoice, r.customer, r.location, mvChannelOf(r), r.net.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2), r.pp ? '' : r.profit.toFixed(2), r.state, r.pincode].map(mvCsvCell).join(','))).join('\n'));
}
function mvTableCSV(table, name){
  if(!table) return;
  const lines = [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => { const m = td.querySelector('[data-v]'); return mvCsvCell(m ? m.dataset.v : td.textContent.trim()); }).join(','));
  mvDownload(name, lines.join('\n'));
}
