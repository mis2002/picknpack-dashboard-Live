/* =====================================================================
   multi.js — shared analytics for Delhi Online, Gujarat, Summary (and the
   Customer Intelligence + Geographic Performance panels on Delhi Offline).
   • Customer identity: mobile number where the location uses phone IDs (Delhi Online),
     otherwise the cleaned customer name. Blank/unknown names are never counted as customers.
   • Everything is computed from real invoices; if something cannot be calculated
     reliably it is shown as "—" or hidden, never estimated.
   Needs: config.js, format.js, data.js, cloud.js, charts.js; map also needs india-map.js + customer-map.js
   ===================================================================== */

const MV_DAY = 86400000;
const MV_CHANNELS = { ECOM:'ECOM (website)', SPSY:'Shopsy', SHOPSY:'Shopsy', SH:'SH', MYTR:'MYTR', EC:'EC', PNP:'PNP (direct)', PNPGJ:'PNPGJ' };
const MV_TRANSFER = /pick\s*-?\s*n\s*-?\s*pack/i;
/* rows that belong to a real salesperson (not company accounts or the company name used as a placeholder) */
const mvIsPersonSale = r => r.companysales !== 'YES' && !MV_TRANSFER.test(r.salesperson || '') && !!r.salesperson;
const MV_CHARTS = {};
const MV_DRILL = new Map(); let MV_DRILL_ID = 0;
const MV_INST = {};

/* ---------------- helpers ---------------- */
const mvSum = (rows, k) => { let s = 0; for(const r of rows) s += r[k] || 0; return s; };
const mvPct = (a, b) => b ? (a - b) / b * 100 : (a ? null : 0);
const mvMonthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const mvMonthLabel = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
const mvDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mvEnd = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const mvFmtD = d => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const mvChannelOf = r => { const m = String(r.invoice || '').match(/^[A-Za-z]+/); const p = m ? m[0].toUpperCase() : '—'; return MV_CHANNELS[p] || (p.length > 6 ? 'Other' : p); };
function mvGrowth(g){ return g === null || g === undefined ? '<span class="mv-g new">new</span>' : `<span class="mv-g ${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '▲' : '▼'} ${Math.abs(g).toFixed(1)}%</span>`; }
function mvReg(title, rows, sub){ const id = 'm' + (++MV_DRILL_ID); MV_DRILL.set(id, { title, rows, sub }); return id; }
function mvTag(k){ return `<span class="mv-tag" style="--c:${locColor(k)}">${escAttr(locName(k))}</span>`; }
function topOf(o){ let k = '', v = -Infinity; for(const x in o) if(o[x] > v){ v = o[x]; k = x; } return k; }
const mvHasPins = () => typeof PIN_INDEX !== 'undefined' && !!PIN_INDEX;

/* ---------------- customer identity ---------------- */
function mvPhoneOf(s){ const m = String(s || '').match(/(?:^|\D)(?:\+?91[\s-]?|0)?([6-9]\d{9})(?!\d)/); return m ? m[1] : ''; }
function mvNormName(s){ return String(s || '').toUpperCase().replace(/[.,]+$/, '').replace(/\s+/g, ' ').trim(); }
function mvKey(r){
  if(r._ck !== undefined) return r._ck;
  const l = locByKey(r.location), name = mvNormName(r.customer);
  let k = '';
  if(l && l.idMode === 'phone'){ const p = mvPhoneOf(r.customer); if(p) k = 'P' + p; }
  if(!k && name && name !== 'UNKNOWN' && name !== 'NA' && name !== '-') k = 'N' + name;
  return (r._ck = k);
}

/* ---------------- periods ---------------- */
function mvPeriod(preset, custom, latest){
  const L = mvDay(latest), y = L.getFullYear(), m = L.getMonth();
  let s, e = mvEnd(L), label;
  if(preset === 'thisMonth'){ s = new Date(y, m, 1); label = L.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  else if(preset === 'lastMonth'){ s = new Date(y, m - 1, 1); e = mvEnd(new Date(y, m, 0)); label = s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  else if(preset === 'last7'){ s = new Date(L.getTime() - 6 * MV_DAY); label = 'Last 7 days'; }
  else if(preset === 'last30'){ s = new Date(L.getTime() - 29 * MV_DAY); label = 'Last 30 days'; }
  else if(preset === 'last3'){ s = new Date(y, m - 2, 1); label = 'Last 3 months'; }
  else if(preset === 'fy'){ const fy = m >= 3 ? y : y - 1; s = new Date(fy, 3, 1); label = `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`; }
  else if(preset === 'custom' && custom && custom.start && custom.end){ s = new Date(custom.start + 'T00:00:00'); e = new Date(custom.end + 'T23:59:59'); label = `${mvFmtD(s)} – ${mvFmtD(e)}`; }
  else return { all: true, label: 'All time', end: mvEnd(L) };
  let ps, pe;
  if(preset === 'thisMonth' || preset === 'lastMonth'){ ps = new Date(s.getFullYear(), s.getMonth() - 1, 1); pe = new Date(s.getTime() - 1); }
  else if(preset === 'last3'){ ps = new Date(s.getFullYear(), s.getMonth() - 3, 1); pe = new Date(s.getTime() - 1); }
  else if(preset === 'fy'){ ps = new Date(s.getFullYear() - 1, 3, 1); pe = new Date(ps.getTime() + (e - s)); }
  else { pe = new Date(s.getTime() - 1); ps = new Date(pe.getTime() - (e - s)); }
  return { start: s, end: e, prevStart: ps, prevEnd: pe, label, prevLabel: `${mvFmtD(ps)} – ${mvFmtD(pe)}` };
}

/* ---------------- customer intelligence (reusable) ---------------- */
const MV_SEG_ORDER = ['Champion', 'Loyal', 'Promising', 'New', 'At risk', 'Needs attention', 'Lost'];
const MV_SEG_COLOR = { 'Champion':'#1FB286', 'Loyal':'#6C5CE7', 'Promising':'#3FB8E0', 'New':'#F6A623', 'At risk':'#EF5466', 'Needs attention':'#E4A11B', 'Lost':'#A4A2C0' };
function mvSegment(c, top20, th){
  if(c.recency === null || c.recency > th.inactiveDays) return 'Lost';
  if(c.daysSinceFirst !== null && c.daysSinceFirst <= th.newDays) return 'New';
  const overdue = Math.max(th.atRiskMinDays, (c.avgGap || 0) * th.atRiskMultiplier);
  if(c.orderDays >= 2 && c.recency > overdue) return 'At risk';
  if(c.orderDays >= 6 && c.recency <= th.championDays && c.life.net >= top20) return 'Champion';
  if(c.orderDays >= 4 && c.recency <= th.activeDays) return 'Loyal';
  if(c.recency <= th.activeDays) return 'Promising';
  return 'Needs attention';
}
function mvSegInfo(seg){
  const t = dashCfg().customer;
  return ({
    'Champion': [`6+ order days, ordered in the last ${t.championDays} days, top 20% by lifetime value`, 'Protect: priority service, first to hear about new stock and prices'],
    'Loyal': [`4+ order days, active in the last ${t.activeDays} days`, 'Upsell related products, ask for referrals'],
    'Promising': [`Active in the last ${t.activeDays} days, still building frequency`, 'Follow up for the next order, share the catalogue'],
    'New': [`First ever order in the last ${t.newDays} days`, 'Welcome call, aim for a second order within the first month'],
    'At risk': [`Used to reorder, now overdue (${t.atRiskMultiplier}× their usual gap, minimum ${t.atRiskMinDays} days)`, 'Call this week: check for issues, give a reason to reorder'],
    'Needs attention': [`Rare orders and quiet for ${t.activeDays}–${t.inactiveDays} days`, 'Re-engage with an offer or a new product'],
    'Lost': [`No order in more than ${t.inactiveDays} days`, 'Win-back campaign, or move off the active list']
  })[seg] || ['', ''];
}
/* D = { hist, cur, prev, P, latest } */
function mvCustomers(D){
  const th = dashCfg().customer;
  const ref = D.P.all ? mvEnd(D.latest) : new Date(Math.min(+D.P.end, +mvEnd(D.latest)));
  const map = new Map();
  let unidentified = 0;
  for(const r of D.hist){
    const k = mvKey(r); if(!k){ unidentified++; continue; }
    let c = map.get(k);
    if(!c){ c = { key: k, name: r.customer, locs: {}, life: { net: 0, inv: 0, pnet: 0, profit: 0 }, cur: { net: 0, inv: 0 }, prev: { net: 0, inv: 0 }, first: r.date, last: r.date, days: new Set(), months: {}, pins: {}, states: {} }; map.set(k, c); }
    c.life.net += r.net; c.life.inv++; c.life.pnet += r.pnet; c.life.profit += r.profit;
    if(r.date < c.first) c.first = r.date;
    if(r.date >= c.last){ c.last = r.date; c.name = r.customer; }
    c.days.add(Math.floor(mvDay(r.date).getTime() / MV_DAY));
    c.locs[r.location] = 1;
    const mk = mvMonthKey(r.date); c.months[mk] = (c.months[mk] || 0) + r.net;
    if(r.pincode) c.pins[r.pincode] = (c.pins[r.pincode] || 0) + r.net;
    if(r.state) c.states[r.state] = (c.states[r.state] || 0) + r.net;
  }
  for(const r of D.cur){ const k = mvKey(r), c = k && map.get(k); if(c){ c.cur.net += r.net; c.cur.inv++; } }
  for(const r of D.prev){ const k = mvKey(r), c = k && map.get(k); if(c){ c.prev.net += r.net; c.prev.inv++; } }
  const list = [...map.values()];
  for(const c of list){
    const d = [...c.days].sort((a, b) => a - b);
    c.orderDays = d.length;
    c.avgGap = d.length > 1 ? (d[d.length - 1] - d[0]) / (d.length - 1) : null;
    c.recency = Math.max(0, Math.floor((ref - c.last) / MV_DAY));
    c.daysSinceFirst = Math.floor((ref - c.first) / MV_DAY);
    c.aov = c.life.inv ? c.life.net / c.life.inv : 0;
    c.growth = c.prev.net ? (c.cur.net - c.prev.net) / c.prev.net * 100 : (c.cur.net ? null : 0);
    c.active = c.cur.inv > 0;
    c.isNew = D.P.all ? c.daysSinceFirst <= th.newDays : (c.first >= D.P.start && c.first <= ref);
    c.repeat = c.life.inv >= 2;
    c.pin = topOf(c.pins); c.state = topOf(c.states);
    delete c.days;
  }
  const vals = list.map(c => c.life.net).sort((a, b) => b - a);
  const top20 = vals.length ? vals[Math.max(0, Math.ceil(vals.length * 0.2) - 1)] : Infinity;
  list.forEach(c => { c.segment = mvSegment(c, top20, th); c.highValue = c.life.net >= top20; });
  const active = D.P.all ? list : list.filter(c => c.active);
  const val = c => D.P.all ? c.life.net : c.cur.net, ord = c => D.P.all ? c.life.inv : c.cur.inv;
  let dataStart = null; for(const r of (D.base || D.hist)) if(!dataStart || r.date < dataStart) dataStart = r.date;
  // "new" needs history before the period; if the data starts inside the period, every customer would look new
  const newUnknown = !D.P.all && !!dataStart && mvDay(D.P.start) <= mvDay(dataStart);
  const curNet = active.reduce((s, c) => s + val(c), 0), curInv = active.reduce((s, c) => s + ord(c), 0);
  const sorted = active.slice().sort((a, b) => val(b) - val(a));
  let run = 0, n80 = 0; for(const c of sorted){ run += val(c); n80++; if(run >= curNet * 0.8) break; }
  const shareTop = n => curNet ? sorted.slice(0, n).reduce((s, c) => s + val(c), 0) / curNet * 100 : 0;
  const newC = active.filter(c => c.isNew), rep = active.filter(c => c.repeat);
  const segs = {}; MV_SEG_ORDER.forEach(s => segs[s] = { n: 0, life: 0, cur: 0, list: [] });
  list.forEach(c => { const s = segs[c.segment]; s.n++; s.life += c.life.net; s.cur += c.cur.net; s.list.push(c); });
  return {
    list, active, ref, top20, segs, unidentified, curNet, dataStart, newUnknown,
    total: active.length, newCount: newC.length, returning: active.length - newC.length, repeatCount: rep.length,
    newPct: active.length ? newC.length / active.length * 100 : 0, repeatRate: active.length ? rep.length / active.length * 100 : 0,
    repeatSales: curNet ? rep.reduce((s, c) => s + val(c), 0) / curNet * 100 : 0,
    newSales: curNet ? newC.reduce((s, c) => s + val(c), 0) / curNet * 100 : 0,
    avgOrders: active.length ? curInv / active.length : 0, aov: curInv ? curNet / curInv : 0,
    n80, top10: shareTop(10), top5: shareTop(5), top1: shareTop(1),
    atRisk: segs['At risk'].n, inactive: segs['Lost'].n, quiet: segs['Needs attention'].n
  };
}

/* ---------------- geography (reusable) ---------------- */
function mvGeo(D){
  const pins = new Map(), states = new Map();
  const add = (m, k, r, prev) => { let o = m.get(k); if(!o){ if(prev) return; o = { k, net: 0, inv: 0, custs: new Set(), prev: 0, rows: [], top: {}, state: r.state || '' }; m.set(k, o); }
    if(prev){ o.prev += r.net; return; }
    o.net += r.net; o.inv++; o.rows.push(r); const ck = mvKey(r); if(ck){ o.custs.add(ck); o.top[r.customer] = (o.top[r.customer] || 0) + r.net; } };
  for(const r of D.cur){ if(r.pincode) add(pins, r.pincode, r); add(states, r.state || 'Not given', r); }
  for(const r of D.prev){ if(r.pincode) add(pins, r.pincode, r, true); add(states, r.state || 'Not given', r, true); }
  const fin = m => [...m.values()].map(o => Object.assign(o, { cust: o.custs.size, aov: o.inv ? o.net / o.inv : 0, growth: D.prev.length ? (o.prev ? (o.net - o.prev) / o.prev * 100 : null) : undefined, topCust: topOf(o.top) })).sort((a, b) => b.net - a.net);
  const withPin = D.cur.filter(r => r.pincode).length;
  return { pins: fin(pins), states: fin(states), total: mvSum(D.cur, 'net'), withPin, noPin: D.cur.length - withPin };
}

/* ---------------- charts + building blocks ---------------- */
function mvChart(id, cfg, drill){
  if(MV_CHARTS[id]){ MV_CHARTS[id].destroy(); delete MV_CHARTS[id]; }
  const el = document.getElementById(id); if(!el || !window.Chart) return;
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 300 } }, cfg.options || {});
  cfg.options.plugins = Object.assign({ legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
    tooltip: { backgroundColor: THEME.tooltipBg, padding: 10, cornerRadius: 10 } }, cfg.options.plugins || {});
  if(drill){
    cfg.options.onClick = (evt, els) => { const x = els && els[0]; if(!x) return; const d = drill(x.datasetIndex, x.index); if(d) mvOpenInvoices(d.title, d.rows, d.sub); };
    cfg.options.onHover = (evt, els) => { const t = evt.native && evt.native.target; if(t) t.style.cursor = els.length ? 'pointer' : 'default'; };
  }
  MV_CHARTS[id] = new Chart(el, cfg);
}
const mvY = extra => Object.assign({ beginAtZero: true, afterDataLimits: padValueAxis, ticks: { callback: v => fmtINRShort(v) }, grid: { color: THEME.grid } }, extra || {});
const mvLabels = f => dlCfg(f || fmtINRShort);
const mvBox = (id, tall) => `<div class="chart-box ${tall ? 'tall' : ''}"><div class="chart-inner"><canvas id="${id}"></canvas></div></div>`;
function mvPanel(title, desc, body, tools){ return `<div class="panel"><div class="panel-head"><div><h2>${title}</h2>${desc ? `<p class="desc">${desc}</p>` : ''}</div>${tools || ''}</div>${body}</div>`; }
function mvKpis(cards){
  return `<div class="kpis mv-kpis">${cards.filter(Boolean).map(c => `<div class="kpi ${c.d ? 'clickable' : ''}" style="--accent:${c.a || 'var(--violet)'}" ${c.d ? `data-mvdrill="${c.d}"` : ''} ${c.t ? `title="${escAttr(c.t)}"` : ''}>
    <div class="kpi-head"><span>${c.l}</span><i>${c.i || ''}</i></div><div class="val">${c.v}</div><div class="sub">${c.s || ''}</div></div>`).join('')}</div>`;
}
function mvInsights(list){
  return list.length ? `<div class="insight-grid">${list.map(i => `<div class="insight ${i.t} ${i.d ? 'clickable' : ''}" ${i.d ? `data-mvdrill="${i.d}"` : ''}><span class="ins-ico">${i.t === 'good' ? '▲' : i.t === 'bad' ? '▼' : i.t === 'warn' ? '!' : 'i'}</span><p>${i.x}${i.d ? ' <span class="ins-more">View →</span>' : ''}</p></div>`).join('')}</div>` : '';
}

/* =====================================================================
   SECTION: SALES
   ===================================================================== */
function mvSalesHtml(D, X){
  const multi = X.locs.length > 1, id = X.id;
  const net = mvSum(D.cur, 'net'), gross = mvSum(D.cur, 'total'), inv = D.cur.length, pnet = mvSum(D.cur, 'pnet'), profit = mvSum(D.cur, 'profit');
  const pNet = mvSum(D.prev, 'net'), custs = new Set(D.cur.map(mvKey).filter(Boolean)).size;
  let h = mvKpis([
    { l: 'Net sales (excl. GST)', i: '₹', v: fmtINR(net), s: D.prev.length ? `${mvGrowth(mvPct(net, pNet))} vs ${escAttr(D.P.prevLabel)}` : `${fmtNum(inv)} orders`, a: 'var(--violet)', d: mvReg('All invoices', D.cur, D.P.label) },
    { l: 'Gross sales (incl. GST)', i: '₹', v: fmtINR(gross), s: 'Total billed value', a: 'var(--sky)', d: mvReg('All invoices (with GST)', D.cur, D.P.label) },
    { l: 'Orders', i: '#', v: fmtNum(inv), s: D.prev.length ? `${mvGrowth(mvPct(inv, D.prev.length))} vs previous` : 'Invoices in period', a: 'var(--coral)', d: mvReg('Orders', D.cur, D.P.label) },
    { l: 'Customers', i: '👥', v: fmtNum(custs), s: `${(custs ? inv / custs : 0).toFixed(1)} orders per customer`, a: 'var(--good)', d: mvReg('Invoices of these customers', D.cur, D.P.label) },
    { l: 'Average order value', i: '≈', v: fmtINR(inv ? net / inv : 0), s: D.prev.length ? `${mvGrowth(mvPct(inv ? net / inv : 0, D.prev.length ? pNet / D.prev.length : 0))} vs previous` : 'Excl. GST', a: 'var(--orange)', d: mvReg('Invoices behind the average', D.cur, D.P.label) },
    pnet > 0 ? { l: 'Profit', i: '▲', v: fmtINR(profit), s: `${fmtPct(profit / pnet * 100)} margin` + (pnet < net * 0.99 ? ` on ${fmtPct(pnet / net * 100)} of sales` : ''), a: 'var(--indigo-2)', t: 'Margin uses only invoices whose profit has been entered', d: mvReg('Invoices with profit entered', D.cur.filter(r => !r.pp), D.P.label) }
             : { l: 'Profit', i: '▲', v: 'Not tracked', s: 'No profit entered for this selection', a: 'var(--indigo-2)' }
  ]);
  if(multi) h += mvLocCompareHtml(D, X);
  h += mvPanel('Sales insights', 'Generated from the selected filters. Click an insight to see its invoices.', mvInsights(mvSalesInsights(D, X)));
  h += mvPanel(multi ? 'Monthly sales by location' : 'Monthly sales and orders', multi ? 'Stacked net sales, total on top. Click a bar for its invoices.' : 'Bars: net sales · line: number of orders', mvBox(id + '_month', true));
  const g = X.V.gran || 'auto';
  const granBtns = `<div class="seg-toggle mv-gran">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button data-mvgran="${k}" class="${g === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  h += `<div class="grid3">${mvPanel('Sales trend', `<span id="${id}_trendDesc"></span>`, mvBox(id + '_trend'), granBtns)}${multi ? mvPanel('Location share', 'Share of net sales', mvBox(id + '_share')) : mvPanel('Sales by weekday', 'Orders per day of the week', mvBox(id + '_wd'))}</div>`;
  if(!multi && new Set(D.cur.map(mvChannelOf)).size > 1) h += `<div class="grid3">${mvPanel('Sales channels', 'From the invoice number prefix', mvBox(id + '_ch'))}${mvPanel('Channel report', 'Click a row for invoices', mvChannelTable(D))}</div>`;
  if(!multi) h += mvPanel('Order size', 'Number of orders in each value band, with their share of sales', mvBox(id + '_bands'));
  if(X.showSp) h += mvSpTable(D, X);
  return h;
}
function mvLocCompareHtml(D, X){
  const rows = X.locs.map(l => {
    const r = D.cur.filter(x => x.location === l), p = D.prev.filter(x => x.location === l), hist = D.hist.filter(x => x.location === l);
    const first = {}, cnt = {}; hist.forEach(x => { const k = mvKey(x); if(!k) return; if(!first[k] || x.date < first[k]) first[k] = x.date; cnt[k] = (cnt[k] || 0) + 1; });
    const cs = new Set(r.map(mvKey).filter(Boolean)); let nw = 0, rep = 0; cs.forEach(k => { if(!D.P.all && first[k] >= D.P.start) nw++; if(cnt[k] >= 2) rep++; });
    const net = mvSum(r, 'net'), ds = hist.reduce((m, x) => (!m || x.date < m) ? x.date : m, null);
    const known = !D.P.all && ds && mvDay(D.P.start) > mvDay(ds);
    return { l, net, inv: r.length, cust: cs.size, aov: r.length ? net / r.length : 0, nw: known ? nw : null, rep, g: D.prev.length ? mvPct(net, mvSum(p, 'net')) : undefined, pn: mvSum(r, 'pnet'), pr: mvSum(r, 'profit'), rows: r, hist };
  });
  const tot = rows.reduce((s, x) => s + x.net, 0);
  const cards = `<div class="mv-loc-grid">${rows.map(x => {
    const months = {}; x.hist.forEach(r => { const k = mvMonthKey(r.date); months[k] = (months[k] || 0) + r.net; });
    const mk = Object.keys(months).sort().slice(-6), mx = Math.max(1, ...mk.map(k => months[k]));
    return `<div class="mv-loc clickable" data-mvfilter="loc" data-v="${escAttr(x.l)}" style="--c:${locColor(x.l)}" title="Click to focus on ${escAttr(locName(x.l))}; click again to show all">
      <div class="mv-loc-top"><b>${escAttr(locName(x.l))}</b><span>${fmtPct(tot ? x.net / tot * 100 : 0)} share</span></div>
      <div class="mv-loc-val">${fmtINR(x.net)}</div>
      <div class="mv-loc-meta">${fmtNum(x.inv)} orders · ${fmtNum(x.cust)} customers · AOV ${fmtINR(x.aov)}</div>
      <div class="mv-loc-meta">${x.g !== undefined ? mvGrowth(x.g) + ' vs previous · ' : ''}${x.pn > 0 ? 'margin ' + fmtPct(x.pr / x.pn * 100) : 'profit not tracked'}</div>
      <div class="mv-spark">${mk.map(k => `<i style="height:${Math.max(6, months[k] / mx * 100)}%" title="${mvMonthLabel(k)}: ${fmtINR(months[k])}"></i>`).join('')}</div></div>`; }).join('')}</div>`;
  const table = `<div class="table-scroll"><table><thead><tr><th>Location</th><th style="text-align:right">Sales</th><th style="text-align:right">Share</th><th style="text-align:right">Orders</th><th style="text-align:right">Customers</th><th style="text-align:right">AOV</th><th style="text-align:right">New customers</th><th style="text-align:right">Repeat customers</th><th style="text-align:right">Growth</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="clickable" data-mvdrill="${mvReg(locName(x.l) + ' — invoices', x.rows, D.P.label)}"><td class="name">${mvTag(x.l)}</td><td style="text-align:right;font-weight:600">${money(x.net)}</td><td style="text-align:right">${fmtPct(tot ? x.net / tot * 100 : 0)}</td><td style="text-align:right">${fmtNum(x.inv)}</td><td style="text-align:right">${fmtNum(x.cust)}</td><td style="text-align:right">${money(x.aov)}</td><td style="text-align:right">${x.nw === null ? '—' : fmtNum(x.nw)}</td><td style="text-align:right">${fmtNum(x.rep)}</td><td style="text-align:right">${x.g === undefined ? '—' : mvGrowth(x.g)}</td></tr>`).join('')}
    </tbody></table></div>`;
  return cards + mvPanel('Location comparison', 'Repeat = 2+ orders ever at that location. New = first order in this period (shown when a period is selected).',
    `<div class="grid3" style="margin-bottom:12px">${mvBox(X.id + '_cmpSales')}${mvBox(X.id + '_cmpCust')}</div>` + table, `<button class="util-btn small" data-mvcsv="location-comparison">Export CSV</button>`);
}
function mvChannelTable(D){
  const ch = {}; D.cur.forEach(r => { const c = mvChannelOf(r); const o = ch[c] || (ch[c] = { c, net: 0, inv: 0, k: new Set(), rows: [] }); o.net += r.net; o.inv++; const k = mvKey(r); if(k) o.k.add(k); o.rows.push(r); });
  const list = Object.values(ch).sort((a, b) => b.net - a.net), tot = mvSum(D.cur, 'net');
  return `<div class="table-scroll"><table><thead><tr><th>Channel</th><th style="text-align:right">Orders</th><th style="text-align:right">Customers</th><th style="text-align:right">Sales</th><th style="text-align:right">AOV</th><th style="text-align:right">Share</th></tr></thead><tbody>
    ${list.map(o => `<tr class="clickable" data-mvdrill="${mvReg(o.c + ' — invoices', o.rows)}"><td class="name">${escAttr(o.c)}</td><td style="text-align:right">${fmtNum(o.inv)}</td><td style="text-align:right">${fmtNum(o.k.size)}</td><td style="text-align:right;font-weight:600">${money(o.net)}</td><td style="text-align:right">${money(o.inv ? o.net / o.inv : 0)}</td><td style="text-align:right">${fmtPct(tot ? o.net / tot * 100 : 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
function mvSpTable(D, X){
  const sp = {}; D.cur.filter(mvIsPersonSale).forEach(r => { const s = r.salesperson || 'Unknown'; const o = sp[s] || (sp[s] = { s, net: 0, inv: 0, k: new Set(), locs: {}, pnet: 0, profit: 0 }); o.net += r.net; o.inv++; o.locs[r.location] = 1; const k = mvKey(r); if(k) o.k.add(k); o.pnet += r.pnet; o.profit += r.profit; });
  const prev = {}; D.prev.filter(mvIsPersonSale).forEach(r => { prev[r.salesperson] = (prev[r.salesperson] || 0) + r.net; });
  const list = Object.values(sp).sort((a, b) => b.net - a.net).slice(0, 15), tot = mvSum(D.cur.filter(mvIsPersonSale), 'net');
  if(list.length < 2) return '';
  return mvPanel('Top salespersons', 'Company accounts (COMPANY SALES = YES) and orders booked under the company name are left out, as in MIS scoring. Click a name to filter the dashboard.',
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Salesperson</th>${X.locs.length > 1 ? '<th>Locations</th>' : ''}<th style="text-align:right">Sales</th><th style="text-align:right">Share</th><th style="text-align:right">Orders</th><th style="text-align:right">Customers</th><th style="text-align:right">AOV</th><th style="text-align:right">Margin</th><th style="text-align:right">Growth</th></tr></thead><tbody>
    ${list.map((o, i) => `<tr class="clickable" data-mvfilter="sp" data-v="${escAttr(o.s)}"><td>${i + 1}</td><td class="name">${escAttr(o.s)}</td>${X.locs.length > 1 ? `<td>${Object.keys(o.locs).map(mvTag).join(' ')}</td>` : ''}<td style="text-align:right;font-weight:600">${money(o.net)}</td><td style="text-align:right">${fmtPct(tot ? o.net / tot * 100 : 0)}</td><td style="text-align:right">${fmtNum(o.inv)}</td><td style="text-align:right">${fmtNum(o.k.size)}</td><td style="text-align:right">${money(o.inv ? o.net / o.inv : 0)}</td><td style="text-align:right">${o.pnet ? fmtPct(o.profit / o.pnet * 100) : '—'}</td><td style="text-align:right">${D.prev.length ? mvGrowth(mvPct(o.net, prev[o.s] || 0)) : '—'}</td></tr>`).join('')}</tbody></table></div>`,
    `<button class="util-btn small" data-mvcsv="salespersons">Export CSV</button>`);
}
function mvSalesInsights(D, X){
  const out = [], cur = D.cur, net = mvSum(cur, 'net');
  if(!cur.length) return [{ t: 'info', x: 'No invoices in this selection.' }];
  if(X.locs.length > 1){
    const L = X.locs.map(l => { const r = cur.filter(x => x.location === l), p = D.prev.filter(x => x.location === l); return { l, net: mvSum(r, 'net'), g: D.prev.length ? mvPct(mvSum(r, 'net'), mvSum(p, 'net')) : null }; });
    const top = L.slice().sort((a, b) => b.net - a.net)[0];
    if(net) out.push({ t: 'info', x: `<b>${escAttr(locName(top.l))}</b> brings <b>${fmtPct(top.net / net * 100)}</b> of sales (${fmtINR(top.net)}).` });
    const gr = L.filter(x => x.g !== null && x.net > 0).sort((a, b) => b.g - a.g);
    if(gr.length) out.push({ t: gr[0].g >= 0 ? 'good' : 'bad', x: `Fastest growth: <b>${escAttr(locName(gr[0].l))}</b> ${gr[0].g >= 0 ? 'up' : 'down'} ${Math.abs(gr[0].g).toFixed(1)}% vs the previous period.` });
  } else if(D.prev.length){
    const g = mvPct(net, mvSum(D.prev, 'net'));
    if(g !== null) out.push({ t: g >= 0 ? 'good' : 'bad', x: `Sales are <b>${g >= 0 ? 'up' : 'down'} ${Math.abs(g).toFixed(1)}%</b> vs ${escAttr(D.P.prevLabel)} (${fmtINR(net)} vs ${fmtINR(mvSum(D.prev, 'net'))}).` });
  }
  const bym = {}; D.hist.forEach(r => { const k = mvMonthKey(r.date); bym[k] = (bym[k] || 0) + r.net; });
  const best = Object.entries(bym).sort((a, b) => b[1] - a[1])[0];
  if(best) out.push({ t: 'good', x: `Best month in the data: <b>${mvMonthLabel(best[0])}</b> with ${fmtINR(best[1])}.` });
  const wd = [0, 0, 0, 0, 0, 0, 0]; cur.forEach(r => wd[r.date.getDay()] += r.net);
  const dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], bi = wd.indexOf(Math.max(...wd));
  out.push({ t: 'info', x: `<b>${dn[bi]}</b> is the strongest day (${fmtPct(net ? wd[bi] / net * 100 : 0)} of sales).` });
  const big = cur.reduce((m, r) => (!m || r.net > m.net) ? r : m, null);
  if(big) out.push({ t: 'info', x: `Largest order: ${fmtINR(big.net)} — <b>${escAttr(big.customer)}</b> on ${mvFmtD(big.date)}.`, d: mvReg('Largest order', [big]) });
  const tr = D.transfers || [];
  if(tr.length && X.V && X.V.showTransfers) out.push({ t: 'warn', x: `${X.V.noTransfers ? 'Excluded' : 'Included'}: <b>${fmtINR(mvSum(tr, 'net'))}</b> of internal branch transfers (${fmtNum(tr.length)} invoices to PicknPack's own branches).`, d: mvReg('Internal branch transfers', tr) });
  return out;
}
function mvSalesCharts(D, X){
  const id = X.id, multi = X.locs.length > 1, cur = D.cur;
  const months = [...new Set(cur.map(r => mvMonthKey(r.date)))].sort();
  if(multi){
    mvChart(id + '_month', { type: 'bar', data: { labels: months.map(mvMonthLabel), datasets: X.locs.map(l => ({ label: locName(l), backgroundColor: locColor(l), borderRadius: 6, stack: 's', data: months.map(m => mvSum(cur.filter(r => r.location === l && mvMonthKey(r.date) === m), 'net')) })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: mvY({ stacked: true }) }, plugins: { stackTotals: { enabled: true, formatter: fmtINRShort }, datalabels: { display: false } } } },
      (di, i) => ({ title: `${locName(X.locs[di])} — ${mvMonthLabel(months[i])}`, rows: cur.filter(r => r.location === X.locs[di] && mvMonthKey(r.date) === months[i]) }));
    const sh = X.locs.map(l => mvSum(cur.filter(r => r.location === l), 'net')), tot = sh.reduce((a, b) => a + b, 0);
    mvChart(id + '_share', { type: 'doughnut', data: { labels: X.locs.map(locName), datasets: [{ data: sh, backgroundColor: X.locs.map(locColor), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '62%', plugins: { datalabels: { display: c => tot && c.dataset.data[c.dataIndex] / tot > .04, color: '#fff', font: { weight: 700, size: 11 }, formatter: v => fmtPct(v / tot * 100) }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtINR(c.raw)}` } } } } },
      (di, i) => ({ title: locName(X.locs[i]) + ' — invoices', rows: cur.filter(r => r.location === X.locs[i]) }));
    const cmp = X.locs.map(l => { const r = cur.filter(x => x.location === l); return { net: mvSum(r, 'net'), inv: r.length, cust: new Set(r.map(mvKey).filter(Boolean)).size }; });
    mvChart(id + '_cmpSales', { type: 'bar', data: { labels: X.locs.map(locName), datasets: [{ label: 'Sales', data: cmp.map(x => x.net), backgroundColor: X.locs.map(locColor), borderRadius: 7 }] },
      options: { scales: { x: { grid: { display: false } }, y: mvY() }, plugins: { legend: { display: false }, title: { display: true, text: 'Sales', color: THEME.inkDim }, datalabels: mvLabels() } } });
    mvChart(id + '_cmpCust', { type: 'bar', data: { labels: X.locs.map(locName), datasets: [{ label: 'Orders', data: cmp.map(x => x.inv), backgroundColor: '#C9C4F2', borderRadius: 6 }, { label: 'Customers', data: cmp.map(x => x.cust), backgroundColor: '#6C5CE7', borderRadius: 6 }] },
      options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis, grid: { color: THEME.grid } } }, plugins: { title: { display: true, text: 'Orders and customers', color: THEME.inkDim }, datalabels: mvLabels(v => fmtNum(v)) } } });
  } else {
    const col = locColor(X.locs[0]);
    mvChart(id + '_month', { data: { labels: months.map(mvMonthLabel), datasets: [
      { type: 'bar', label: 'Net sales', data: months.map(m => mvSum(cur.filter(r => mvMonthKey(r.date) === m), 'net')), backgroundColor: col, borderRadius: 7, yAxisID: 'y', datalabels: mvLabels() },
      { type: 'line', label: 'Orders', data: months.map(m => cur.filter(r => mvMonthKey(r.date) === m).length), borderColor: '#1E1B4B', backgroundColor: '#1E1B4B', tension: .3, yAxisID: 'y2', pointRadius: 3, datalabels: { display: true, align: 'top', offset: 6, color: '#1E1B4B', font: { size: 10, weight: 600 }, formatter: v => fmtNum(v) } }] },
      options: { scales: { x: { grid: { display: false } }, y: mvY(), y2: { position: 'right', beginAtZero: true, grid: { display: false }, afterDataLimits: s => { s.max = s.max * 1.35; } } } } },
      (di, i) => ({ title: `${mvMonthLabel(months[i])} — invoices`, rows: cur.filter(r => mvMonthKey(r.date) === months[i]) }));
    const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ix = d => (d.getDay() + 6) % 7;
    mvChart(id + '_wd', { type: 'bar', data: { labels: dn, datasets: [{ label: 'Orders', data: dn.map((x, i) => cur.filter(r => ix(r.date) === i).length), backgroundColor: col, borderRadius: 6 }] },
      options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { legend: { display: false }, datalabels: mvLabels(v => fmtNum(v)) } } },
      (di, i) => ({ title: dn[i] + ' — invoices', rows: cur.filter(r => ix(r.date) === i) }));
    const ch = {}; cur.forEach(r => { const c = mvChannelOf(r); ch[c] = (ch[c] || 0) + r.net; });
    const cl = Object.entries(ch).sort((a, b) => b[1] - a[1]), ct = cl.reduce((s, x) => s + x[1], 0);
    if(cl.length > 1) mvChart(id + '_ch', { type: 'doughnut', data: { labels: cl.map(x => x[0]), datasets: [{ data: cl.map(x => x[1]), backgroundColor: PALETTE.slice(0, cl.length), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '60%', plugins: { datalabels: { display: c => ct && c.dataset.data[c.dataIndex] / ct > .04, color: '#fff', font: { weight: 700, size: 11 }, formatter: v => fmtPct(v / ct * 100) } } } },
      (di, i) => ({ title: cl[i][0] + ' — invoices', rows: cur.filter(r => mvChannelOf(r) === cl[i][0]) }));
    const B = [[0, 500, 'Under ₹500'], [500, 1000, '₹500–1k'], [1000, 2500, '₹1k–2.5k'], [2500, 5000, '₹2.5k–5k'], [5000, 10000, '₹5k–10k'], [10000, 50000, '₹10k–50k'], [50000, 2e5, '₹50k–2L'], [2e5, 1e13, '₹2L+']];
    const bi = v => B.findIndex(b => v >= b[0] && v < b[1]), bc = B.map(() => 0), bs = B.map(() => 0), tn = mvSum(cur, 'net');
    cur.forEach(r => { const i = bi(r.net); if(i >= 0){ bc[i]++; bs[i] += r.net; } });
    const keep = B.map((b, i) => i).filter(i => bc[i]);
    mvChart(id + '_bands', { type: 'bar', data: { labels: keep.map(i => B[i][2]), datasets: [{ label: 'Orders', data: keep.map(i => bc[i]), backgroundColor: col, borderRadius: 6,
      datalabels: { display: true, anchor: 'end', align: 'end', clamp: true, clip: false, color: '#1E1B4B', font: { size: 10, weight: 700 }, formatter: (v, c) => `${fmtNum(v)} · ${fmtPct(tn ? bs[keep[c.dataIndex]] / tn * 100 : 0)}` } }] },
      options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${fmtNum(c.raw)} orders · ${fmtINR(bs[keep[c.dataIndex]])}` } } } } },
      (di, i) => ({ title: `Orders ${B[keep[i]][2]}`, rows: cur.filter(r => bi(r.net) === keep[i]) }));
  }
  let mn = Infinity, mxd = -Infinity; for(const r of cur){ const t = +r.date; if(t < mn) mn = t; if(t > mxd) mxd = t; }
  let gran = (X.V && X.V.gran && X.V.gran !== 'auto') ? X.V.gran : (cur.length && (mxd - mn) / MV_DAY > 62 ? 'week' : 'day');
  const daily = gran === 'day';
  const keyOf = d => { const x = mvDay(d); if(gran === 'week') x.setDate(x.getDate() - (x.getDay() + 6) % 7); if(gran === 'month') x.setDate(1); return +x; };
  const keys = [...new Set(cur.map(r => keyOf(r.date)))].sort((a, b) => a - b);
  const desc = document.getElementById(id + '_trendDesc'); if(desc) desc.textContent = { day: 'Daily net sales', week: 'Weekly net sales (week starts Monday)', month: 'Monthly net sales' }[gran];
  const tLabel = k => gran === 'month' ? new Date(k).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  mvChart(id + '_trend', { type: gran === 'month' ? 'bar' : 'line', data: { labels: keys.map(tLabel), datasets: X.locs.map(l => ({ label: locName(l), borderColor: locColor(l), backgroundColor: locColor(l) + '22', fill: !multi && gran !== 'month', tension: .3, pointRadius: keys.length > 40 ? 0 : 2, borderWidth: 2, borderRadius: 6, backgroundColor: gran === 'month' ? locColor(l) : locColor(l) + '22', data: keys.map(k => mvSum(cur.filter(r => r.location === l && keyOf(r.date) === k), 'net')) })) },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { stacked: gran === 'month' && multi, grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: mvY({ stacked: gran === 'month' && multi }) }, plugins: { legend: { display: multi }, datalabels: gran === 'month' && !multi ? mvLabels() : { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtINR(c.raw)}` } } } } },
    (di, i) => ({ title: `${locName(X.locs[di])} — ${tLabel(keys[i])}${gran === 'week' ? ' (week)' : ''}`, rows: cur.filter(r => r.location === X.locs[di] && keyOf(r.date) === keys[i]) }));
}

/* =====================================================================
   SECTION: CUSTOMERS (customer intelligence)
   ===================================================================== */
const MV_LISTS = [
  ['sales', 'Top by sales'], ['orders', 'Top by orders'], ['aov', 'Highest AOV'], ['growing', 'Fastest growing'], ['declining', 'Declining'], ['atrisk', 'At risk'],
  ['quiet', 'Not ordered recently'], ['inactive', 'Inactive'], ['highvalue', 'High value'], ['onetime', 'One-time buyers'], ['repeat', 'Top repeat customers'], ['new', 'New customers']
];
function mvCustListRows(C, which, D){
  const all = D.P.all ? C.list : C.active, val = c => D.P.all ? c.life.net : c.cur.net, ord = c => D.P.all ? c.life.inv : c.cur.inv;
  switch(which){
    case 'orders': return all.slice().sort((a, b) => ord(b) - ord(a) || val(b) - val(a));
    case 'aov': return all.filter(c => ord(c) >= 2).sort((a, b) => (val(b) / ord(b)) - (val(a) / ord(a)));
    case 'growing': return C.list.filter(c => c.prev.net > 0 && c.cur.net > c.prev.net).sort((a, b) => (b.cur.net - b.prev.net) - (a.cur.net - a.prev.net));
    case 'declining': return C.list.filter(c => c.prev.net > 0 && c.cur.net < c.prev.net).sort((a, b) => (a.cur.net - a.prev.net) - (b.cur.net - b.prev.net));
    case 'atrisk': return C.segs['At risk'].list.slice().sort((a, b) => b.life.net - a.life.net);
    case 'quiet': return C.segs['Needs attention'].list.slice().sort((a, b) => b.life.net - a.life.net);
    case 'inactive': return C.segs['Lost'].list.slice().sort((a, b) => b.life.net - a.life.net);
    case 'highvalue': return C.list.filter(c => c.highValue).sort((a, b) => b.life.net - a.life.net);
    case 'onetime': return C.list.filter(c => c.life.inv === 1).sort((a, b) => b.life.net - a.life.net);
    case 'repeat': return all.filter(c => c.repeat).sort((a, b) => b.life.inv - a.life.inv || b.life.net - a.life.net);
    case 'new': return all.filter(c => c.isNew).sort((a, b) => val(b) - val(a));
    default: return all.slice().sort((a, b) => val(b) - val(a));
  }
}
const MV_SEG_LIST = { 'At risk': 'atrisk', 'Needs attention': 'quiet', 'Lost': 'inactive', 'New': 'new' };
function mvCustomersHtml(D, X){
  const C = X.C = mvCustomers(D), id = X.id, V = X.V, periodTxt = D.P.all ? 'all time' : 'period';
  const R = mvCustRows(C, D), Cp = mvPrevCustomers(D);
  const repPrev = Cp ? Cp.repeatRate : null, repDiff = repPrev === null ? null : C.repeatRate - repPrev;
  const pts = v => v === null ? '' : `<span class="mv-g ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)} pts</span> vs previous`;
  let h = mvKpis([
    { l: 'Customers', i: '👥', v: fmtNum(C.total), s: (Cp ? `${mvGrowth(mvPct(C.total, Cp.total))} vs previous · ` : '') + (D.P.all ? 'all customers in the data' : 'ordered in ' + escAttr(D.P.label)), a: 'var(--violet)', d: mvReg('Invoices of active customers', R.active, D.P.label) },
    C.newUnknown ? { l: 'New customers', i: '+', v: '—', s: `History starts ${mvFmtD(C.dataStart)} — pick a later period`, a: 'var(--good)', t: 'New vs returning needs order history from before the selected period' }
      : { l: 'New customers', i: '+', v: fmtNum(C.newCount), s: `${fmtPct(C.newPct)} of customers · ${fmtPct(C.newSales)} of sales` + (Cp && !Cp.newUnknown ? ` · ${mvGrowth(mvPct(C.newCount, Cp.newCount))}` : ''), a: 'var(--good)', t: D.P.all ? `First order in the last ${dashCfg().customer.newDays} days` : `First order since the data starts (${mvFmtD(C.dataStart)}) falls in this period`, d: mvReg('Invoices of new customers', R.newC, D.P.label) },
    C.newUnknown ? { l: 'Returning customers', i: '↩', v: '—', s: 'Needs history before the period', a: 'var(--sky)' }
      : { l: 'Returning customers', i: '↩', v: fmtNum(C.returning), s: `${fmtPct(100 - C.newPct)} of customers`, a: 'var(--sky)', t: 'Ordered before this period and again in it', d: mvReg('Invoices of returning customers', R.ret, D.P.label) },
    { l: 'Repeat customer rate', i: '↻', v: fmtPct(C.repeatRate), s: `${fmtNum(C.repeatCount)} repeat customers` + (repDiff === null ? ` · ${fmtPct(C.repeatSales)} of sales` : ` · ${pts(repDiff)}`), a: 'var(--indigo-2)', t: 'Customers with 2 or more orders ever (up to the end of the period) as a share of active customers', d: mvReg('Invoices of repeat customers', R.rep, D.P.label) },
    { l: 'Avg orders per customer', i: '#', v: C.avgOrders.toFixed(2), s: `AOV ${fmtINR(C.aov)}` + (Cp ? ` · ${mvGrowth(mvPct(C.avgOrders, Cp.avgOrders))}` : ''), a: 'var(--orange)', d: mvReg('Orders in period', R.active, D.P.label) },
    { l: 'At risk', i: '!', v: fmtNum(C.atRisk), s: `${fmtINR(C.segs['At risk'].life)} lifetime sales`, a: 'var(--coral)', d: mvReg('At-risk customers — all their invoices', R.atRisk) },
    { l: 'Inactive', i: '⏸', v: fmtNum(C.inactive), s: `No order in ${dashCfg().customer.inactiveDays}+ days`, a: 'var(--ink-dim2)', d: mvReg('Inactive customers — all their invoices', R.lost) },
    { l: 'Concentration', i: '◔', v: fmtPct(C.top10), s: `Top 10 share · ${fmtNum(C.n80)} customers make 80% of sales`, a: 'var(--sky)', d: mvReg('Invoices of the top 10 customers', R.top10, D.P.label) }
  ]);
  if(C.unidentified) h += `<div class="mv-note">${fmtNum(C.unidentified)} invoices have no usable customer name or mobile number and are not counted as customers.</div>`;
  h += mvPanel('Customer insights', 'Generated from the selected filters', mvInsights(mvCustInsights(C, D)));
  h += `<div class="grid3">${mvPanel('New vs returning customers', `Per month: customers ordering for the first time vs coming back.${C.dataStart ? ` History starts ${mvFmtD(C.dataStart)}, so the first month counts everyone as new.` : ''}`, mvBox(id + '_nvr'))}${mvPanel('Customer segments', 'Click a slice to list those customers', mvBox(id + '_seg'))}</div>`;
  h += mvPanel('Repeat customer rate by month', 'Bars: customers who had ordered before that month · line: their share of all customers that month. Click a bar for its invoices.', mvBox(id + '_rep'));
  h += mvPanel('What to do with each segment', 'Segments use each customer\'s full history up to the end of the selected period. Click a row to list the customers.',
    `<div class="table-scroll"><table><thead><tr><th>Segment</th><th style="text-align:right">Customers</th><th style="text-align:right">Lifetime sales</th><th style="text-align:right">Sales (${periodTxt})</th><th>Meaning and action</th></tr></thead><tbody>
    ${MV_SEG_ORDER.map(s => { const g = C.segs[s], info = mvSegInfo(s); return `<tr class="clickable" data-mvseg="${escAttr(s)}"><td><span class="seg-pill" style="--c:${MV_SEG_COLOR[s]}">${s}</span></td><td style="text-align:right">${fmtNum(g.n)}</td><td style="text-align:right">${money(g.life)}</td><td style="text-align:right">${money(g.cur)}</td><td class="seg-meaning">${info[0]}<br><span class="seg-action">→ ${info[1]}</span></td></tr>`; }).join('')}
    </tbody></table></div>`, `<button class="util-btn small" data-mvcsv="segments">Export CSV</button>`);
  h += mvCustListPanelHtml(C, D, X);
  return h;
}
function mvCustListPanelHtml(C, D, X){
  const V = X.V, id = X.id, which = V.ciList || 'sales', periodTxt = D.P.all ? 'all time' : 'period';
  const noPrev = (!D.prev.length && (which === 'growing' || which === 'declining')) || (which === 'new' && C.newUnknown);
  let h = '';
  let rows = V.ciSeg ? C.segs[V.ciSeg].list.slice().sort((a, b) => b.life.net - a.life.net) : mvCustListRows(C, which, D);
  const q = (V.custSearch || '').trim().toLowerCase();
  if(q) rows = rows.filter(c => (c.name + ' ' + c.key).toLowerCase().includes(q));
  const limit = V.custLimit || 50, multi = X.locs.length > 1;
  const tabs = `<div class="mv-list-tabs">${MV_LISTS.map(([k, l]) => `<button class="${!V.ciSeg && which === k ? 'active' : ''}" data-mvlist="${k}">${l}</button>`).join('')}</div>`;
  const title = V.ciSeg ? `Segment: ${V.ciSeg}` : (MV_LISTS.find(x => x[0] === which) || [0, 'Customers'])[1];
  h += `<div id="${id}_lists"></div>` + mvPanel('Customer lists', `${title} · ${fmtNum(rows.length)} customers · click a customer for their history`,
    tabs + (noPrev ? `<p class="muted" style="margin:12px 0">${which === 'new' ? `Customer history starts on ${mvFmtD(C.dataStart)}. Pick a period that starts after it (for example This month) to see new customers.` : 'Pick a period (for example This month) to compare with the previous period.'}</p>` :
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Customer</th>${multi ? '<th>Location</th>' : ''}<th>Segment</th><th style="text-align:right">Orders (${periodTxt})</th><th style="text-align:right">Sales (${periodTxt})</th><th style="text-align:right">Previous</th><th style="text-align:right">Change</th><th style="text-align:right">Lifetime sales</th><th style="text-align:right">Lifetime orders</th><th style="text-align:right">AOV</th><th>Last order</th><th style="text-align:right">Days since</th></tr></thead><tbody>
    ${rows.slice(0, limit).map((c, i) => `<tr class="clickable" data-mvcust="${escAttr(c.key)}"><td>${i + 1}</td><td class="name">${escAttr(c.name)}${c.key[0] === 'P' ? ` <span class="muted">· ${c.key.slice(1)}</span>` : ''}</td>${multi ? `<td>${Object.keys(c.locs).map(mvTag).join(' ')}</td>` : ''}
      <td><span class="seg-pill sm" style="--c:${MV_SEG_COLOR[c.segment]}">${c.segment}</span></td><td style="text-align:right">${fmtNum(D.P.all ? c.life.inv : c.cur.inv)}</td><td style="text-align:right;font-weight:600">${money(D.P.all ? c.life.net : c.cur.net)}</td>
      <td style="text-align:right">${D.prev.length ? money(c.prev.net) : '—'}</td><td style="text-align:right">${D.prev.length ? mvGrowth(c.growth) : '—'}</td><td style="text-align:right">${money(c.life.net)}</td><td style="text-align:right">${fmtNum(c.life.inv)}</td><td style="text-align:right">${money(c.aov)}</td><td>${mvFmtD(c.last)}</td><td style="text-align:right">${fmtNum(c.recency)}</td></tr>`).join('') || `<tr><td colspan="13" class="empty-note">No customers in this list.</td></tr>`}
    </tbody></table></div>${rows.length > limit ? `<div style="text-align:center;margin-top:10px"><button class="util-btn small" data-mvmore="1">Show more (${fmtNum(rows.length - limit)} left)</button></div>` : ''}`),
    `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="table-search" data-mvsearch="1" placeholder="Search name or mobile…" value="${escAttr(V.custSearch || '')}"><button class="util-btn small" data-mvcsv="customers">Export CSV</button></div>`);
  return h;
}
function mvCustInsights(C, D){
  const out = [];
  if(!C.total) return [{ t: 'info', x: 'No customer activity in this selection.' }];
  out.push({ t: C.top10 >= 50 ? 'warn' : 'good', x: `Top 10 customers bring <b>${fmtPct(C.top10)}</b> of sales; <b>${fmtNum(C.n80)} of ${fmtNum(C.total)}</b> customers make up 80%.` + (C.top10 >= 50 ? ' High dependence on a few accounts.' : '') });
  out.push({ t: 'info', x: `<b>${fmtPct(C.repeatRate)}</b> of customers have ordered more than once; they bring <b>${fmtPct(C.repeatSales)}</b> of sales.` });
  if(C.newUnknown) out.push({ t: 'info', x: `Customer history starts on <b>${mvFmtD(C.dataStart)}</b>, so new vs returning is shown for periods that start after that date (for example This month).` });
  else if(!D.P.all) out.push({ t: C.newCount ? 'good' : 'warn', x: `<b>${fmtNum(C.newCount)}</b> new customers in ${escAttr(D.P.label)} (${fmtPct(C.newPct)} of active customers, ${fmtPct(C.newSales)} of sales).` });
  const ar = C.segs['At risk'];
  if(ar.n){ const keys = new Set(ar.list.map(c => c.key)), big = ar.list.reduce((m, c) => (!m || c.life.net > m.life.net) ? c : m, null);
    out.push({ t: 'bad', x: `<b>${fmtNum(ar.n)}</b> customers are at risk (overdue vs their usual gap), worth <b>${fmtINR(ar.life)}</b> in lifetime sales. Biggest: <b>${escAttr(big.name)}</b>.`, d: mvReg('At-risk customers — their invoices', D.hist.filter(r => keys.has(mvKey(r)))) }); }
  if(D.prev.length){
    const dec = C.list.filter(c => c.prev.net > 0 && c.cur.net < c.prev.net), drop = dec.reduce((s, c) => s + (c.prev.net - c.cur.net), 0);
    const inc = C.list.filter(c => c.prev.net > 0 && c.cur.net > c.prev.net), gain = inc.reduce((s, c) => s + (c.cur.net - c.prev.net), 0);
    if(dec.length || inc.length) out.push({ t: drop > gain ? 'warn' : 'good', x: `<b>${fmtNum(dec.length)}</b> customers bought less than in the previous period (−${fmtINR(drop)}); <b>${fmtNum(inc.length)}</b> bought more (+${fmtINR(gain)}).` });
  }
  const one = C.list.filter(c => c.life.inv === 1).length;
  if(C.list.length) out.push({ t: 'info', x: `<b>${fmtPct(one / C.list.length * 100)}</b> of all customers have ordered only once — a second-order follow-up can lift repeat sales.` });
  const gaps = C.list.filter(c => c.avgGap !== null && c.orderDays >= 3).map(c => c.avgGap).sort((a, b) => a - b);
  if(gaps.length >= 5) out.push({ t: 'info', x: `Regular customers reorder about every <b>${Math.round(gaps[Math.floor(gaps.length / 2)])} days</b> (median).` });
  return out;
}
function mvCustomersCharts(D, X){
  const C = X.C, id = X.id;
  const first = {}; D.hist.forEach(r => { const k = mvKey(r); if(k && (!first[k] || r.date < first[k])) first[k] = r.date; });
  const src = D.P.all ? D.hist : D.cur;
  const months = [...new Set(src.map(r => mvMonthKey(r.date)))].sort().slice(-12);
  const nv = months.map(m => { const n = new Set(), s = new Set(); src.forEach(r => { if(mvMonthKey(r.date) !== m) return; const k = mvKey(r); if(!k) return; (mvMonthKey(first[k]) === m ? n : s).add(k); }); return { n: n.size, s: s.size }; });
  mvChart(id + '_nvr', { type: 'bar', data: { labels: months.map(mvMonthLabel), datasets: [{ label: 'New', data: nv.map(x => x.n), backgroundColor: '#1FB286', borderRadius: 5, stack: 'c' }, { label: 'Returning', data: nv.map(x => x.s), backgroundColor: '#6C5CE7', borderRadius: 5, stack: 'c' }] },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, afterDataLimits: padValueAxis } }, plugins: { stackTotals: { enabled: true, formatter: v => fmtNum(v) } } } },
    (di, i) => ({ title: `${di === 0 ? 'New' : 'Returning'} customers — ${mvMonthLabel(months[i])}`, rows: src.filter(r => mvMonthKey(r.date) === months[i] && mvKey(r) && ((mvMonthKey(first[mvKey(r)]) === months[i]) === (di === 0))) }));
  const rr = months.map((m, i) => { const t = nv.at(i).n + nv.at(i).s; return t ? nv.at(i).s / t * 100 : 0; });
  mvChart(id + '_rep', { data: { labels: months.map(mvMonthLabel), datasets: [
      { type: 'bar', label: 'Repeat customers', data: nv.map(x => x.s), backgroundColor: '#6C5CE7', borderRadius: 6, yAxisID: 'y', datalabels: mvLabels(v => fmtNum(v)) },
      { type: 'line', label: 'Repeat rate %', data: rr, borderColor: '#F6A623', backgroundColor: '#F6A623', tension: .3, yAxisID: 'y2', pointRadius: 3, datalabels: { display: true, align: 'top', offset: 6, color: '#B36B00', font: { size: 10, weight: 700 }, formatter: v => fmtPct(v) } }] },
    options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis, grid: { color: THEME.grid } }, y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: v => v + '%' } } } } },
    (di, i) => ({ title: `Repeat customers — ${mvMonthLabel(months[i])}`, rows: src.filter(r => mvMonthKey(r.date) === months[i] && mvKey(r) && mvMonthKey(first[mvKey(r)]) !== months[i]) }));
  const segs = MV_SEG_ORDER.filter(s => C.segs[s].n);
  mvChart(id + '_seg', { type: 'doughnut', data: { labels: segs, datasets: [{ data: segs.map(s => C.segs[s].n), backgroundColor: segs.map(s => MV_SEG_COLOR[s]), borderWidth: 2, borderColor: '#fff' }] },
    options: { cutout: '58%', onClick: (e, els) => { if(els[0]){ const inst = MV_INST[X.id]; if(inst){ inst.V.ciSeg = segs[els[0].index]; inst.V.custLimit = 50; inst.render(); mvScrollTo(X.id + '_lists'); } } },
      plugins: { datalabels: { display: c => c.dataset.data[c.dataIndex] / Math.max(1, C.list.length) > .04, color: '#fff', font: { weight: 700, size: 11 }, formatter: v => fmtNum(v) }, tooltip: { callbacks: { label: c => `${c.label}: ${fmtNum(c.raw)} customers` } } } } });
}
function mvScrollTo(id){ setTimeout(() => { const el = document.getElementById(id); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }

/* =====================================================================
   SECTION: GEOGRAPHY (states, pincodes, map)
   ===================================================================== */
function mvGeoHtml(D, X){
  const G = X.G = mvGeo(D), id = X.id, V = X.V;
  const sortKey = V.geoSort || 'net';
  const pins = G.pins.slice().sort((a, b) => sortKey === 'growth' ? ((b.growth ?? -1e9) - (a.growth ?? -1e9)) : (b[sortKey] - a[sortKey]));
  const cities = mvHasPins() ? new Set(G.pins.map(p => (pinInfo(p.k) || {}).city).filter(Boolean)).size : null;
  const top10 = G.total ? G.pins.slice(0, 10).reduce((s, p) => s + p.net, 0) / G.total * 100 : 0;
  let h = mvKpis([
    { l: 'States', i: '🗺', v: fmtNum(G.states.filter(s => s.k !== 'Not given').length), s: G.states[0] ? `Top: ${escAttr(G.states[0].k)} (${fmtPct(G.total ? G.states[0].net / G.total * 100 : 0)})` : '', a: 'var(--violet)' },
    { l: 'Pincodes', i: '📍', v: fmtNum(G.pins.length), s: `${fmtNum(G.withPin)} of ${fmtNum(D.cur.length)} orders have a valid pincode`, a: 'var(--sky)' },
    { l: 'Cities / towns', i: '🏙', v: cities === null ? '…' : fmtNum(cities), s: 'From the India Post pincode directory', a: 'var(--good)' },
    { l: 'Top 10 pincodes', i: '◔', v: fmtPct(top10), s: 'Share of sales', a: 'var(--orange)' }
  ]);
  if(!X.noMap) h += mvMapPanelHtml();
  h += `<div class="grid3">${mvPanel('Top states by sales', 'Place of supply', mvBox(id + '_states', true))}${mvPanel('Top pincodes by sales', 'Click a bar for its invoices', mvBox(id + '_pins', true))}</div>`;
  h += mvPanel('Pincode performance', `Top ${Math.min(50, pins.length)} of ${fmtNum(pins.length)} pincodes · click a column to sort · click a row for invoices${X.canFilter ? ', or Filter to focus the dashboard on that pincode' : ''}`,
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Pincode</th><th>City / state</th>${[['net', 'Sales'], ['inv', 'Orders'], ['cust', 'Customers'], ['aov', 'AOV'], ['growth', 'Growth']].map(([k, l]) => `<th style="text-align:right" class="mv-sortable ${sortKey === k ? 'on' : ''}" data-mvsort="${k}">${l}${sortKey === k ? ' ▾' : ''}</th>`).join('')}<th style="text-align:right">Share</th><th>Top customer</th>${X.canFilter ? '<th></th>' : ''}</tr></thead><tbody>
    ${pins.slice(0, 50).map((p, i) => { const info = mvHasPins() ? pinInfo(p.k) : null; return `<tr class="clickable" data-mvdrill="${mvReg('Pincode ' + p.k + ' — invoices', p.rows)}"><td>${i + 1}</td><td class="name">${p.k}</td><td>${escAttr((info && info.city) || '')}${info && info.city ? '<br>' : ''}<span class="muted">${escAttr(p.state || '')}</span></td>
      <td style="text-align:right;font-weight:600">${money(p.net)}</td><td style="text-align:right">${fmtNum(p.inv)}</td><td style="text-align:right">${fmtNum(p.cust)}</td><td style="text-align:right">${money(p.aov)}</td><td style="text-align:right">${p.growth === undefined ? '—' : mvGrowth(p.growth)}</td><td style="text-align:right">${fmtPct(G.total ? p.net / G.total * 100 : 0)}</td><td class="name" title="${escAttr(p.topCust)}">${escAttr(p.topCust)}</td>
      ${X.canFilter ? `<td><button class="link-btn sm" data-mvfilter="pin" data-v="${p.k}">Filter</button></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="11" class="empty-note">No pincodes in this selection.</td></tr>'}
    </tbody></table></div>`, `<button class="util-btn small" data-mvcsv="pincodes">Export CSV</button>`);
  if(G.noPin) h += `<div class="mv-note">${fmtNum(G.noPin)} orders have no valid 6-digit pincode and are not placed on the map.</div>`;
  return h;
}
function mvStateTable(G){
  return `<div class="table-scroll" style="max-height:520px"><table style="min-width:0"><thead><tr><th>State</th><th style="text-align:right">Sales</th><th style="text-align:right">Share</th><th style="text-align:right">Orders</th><th style="text-align:right">Customers</th></tr></thead><tbody>
    ${G.states.slice(0, 30).map(s => `<tr class="clickable" data-mvdrill="${mvReg(s.k + ' — invoices', s.rows)}"><td class="name">${escAttr(s.k)}</td><td style="text-align:right;font-weight:600">${money(s.net)}</td><td style="text-align:right">${fmtPct(G.total ? s.net / G.total * 100 : 0)}</td><td style="text-align:right">${fmtNum(s.inv)}</td><td style="text-align:right">${fmtNum(s.cust)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function mvGeoCharts(D, X){
  const G = X.G, id = X.id, col = X.locs.length === 1 ? locColor(X.locs[0]) : '#6C5CE7';
  const st = G.states.filter(s => s.k !== 'Not given').slice(0, 10);
  mvChart(id + '_states', { type: 'bar', data: { labels: st.map(s => s.k), datasets: [{ label: 'Sales', data: st.map(s => s.net), backgroundColor: col, borderRadius: 6 }] },
    options: { indexAxis: 'y', scales: { x: mvY(), y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: mvLabels() } } }, (di, i) => ({ title: st[i].k + ' — invoices', rows: st[i].rows }));
  const pn = G.pins.slice(0, 10);
  const lbl = p => { const info = mvHasPins() ? pinInfo(p.k) : null; return p.k + (info && info.city ? ' · ' + info.city : ''); };
  mvChart(id + '_pins', { type: 'bar', data: { labels: pn.map(lbl), datasets: [{ label: 'Sales', data: pn.map(p => p.net), backgroundColor: '#3FB8E0', borderRadius: 6 }] },
    options: { indexAxis: 'y', scales: { x: mvY(), y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: mvLabels() } } }, (di, i) => ({ title: 'Pincode ' + pn[i].k + ' — invoices', rows: pn[i].rows }));
  if(!X.noMap && typeof renderCustomerMap === 'function' && document.getElementById('mapBox')){ MAP_ROWS = () => D.cur; wireMap(); renderCustomerMap(); }
}
/* map: reuses the India outlines (india-map.js) and pincode directory (customer-map.js) */
function mvMap(D, X){
  const host = document.getElementById(X.id + '_map'); if(!host) return;
  if(!window.INDIA_MAP || typeof project !== 'function'){ host.innerHTML = '<p class="muted" style="padding:20px">Map files are not loaded on this page.</p>'; return; }
  if(!mvHasPins()){ host.innerHTML = '<p class="muted" style="padding:20px">Loading pincode locations…</p>';
    loadPinDb().then(() => { const i = MV_INST[X.id]; if(i && i.render) i.render(); }).catch(() => { host.innerHTML = '<p class="muted" style="padding:20px">The pincode file (js/vendor/pincodes.js) is missing, so customers cannot be placed on the map.</p>'; }); return; }
  const M = window.INDIA_MAP, G = X.G, V = X.V;
  const stMax = Math.max(1, ...G.states.map(s => s.net)), stBy = {}; G.states.forEach(s => stBy[mapKey(s.k)] = s);
  const pts = []; let placed = 0;
  G.pins.forEach(p => { const info = pinInfo(p.k); if(!info) return; placed += p.inv; const [x, y] = project(info.lat, info.lng); pts.push({ p, x, y }); });
  const pMax = Math.max(1, ...pts.map(o => o.p.net)), vb = V.mapVB || [0, 0, M.w, M.h], z = M.w / vb[2];
  const paths = M.states.map(s => { const o = stBy[s.n.toLowerCase()]; return `<path class="map-state" d="${s.d}" fill="${o ? mixColor(0.12 + 0.88 * Math.sqrt(o.net / stMax)) : '#E4E1F2'}" data-mvst="${escAttr(s.n.toLowerCase())}"></path>`; }).join('');
  const circles = pts.sort((a, b) => b.p.net - a.p.net).map(o => { const r0 = 2.5 + 12 * Math.sqrt(o.p.net / pMax); return `<circle class="map-pin" cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="${(r0 / Math.sqrt(z)).toFixed(2)}" data-mvpin="${o.p.k}" fill="#F6A623" fill-opacity=".75"></circle>`; }).join('');
  host.innerHTML = `<svg viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%" role="img" aria-label="Map of India with customer locations"><g>${paths}</g><g>${circles}</g></svg>`;
  document.getElementById(X.id + '_legend').innerHTML = `<div><b style="color:var(--ink)">State sales</b></div><div class="scale"></div><div class="row"><span>low</span><span>${fmtINRShort(stMax)}</span></div><div style="margin-top:6px">Bubble = pincode, size = sales · ${fmtNum(placed)} of ${fmtNum(D.cur.length)} orders placed</div>`;
  const box = document.getElementById(X.id + '_mapBox'), tip = document.getElementById(X.id + '_tip');
  const pinBy = {}; G.pins.forEach(p => pinBy[p.k] = p);
  box.onmousemove = e => {
    const c = e.target.closest('[data-mvpin]'), s = e.target.closest('[data-mvst]'); let html = '';
    if(c){ const p = pinBy[c.dataset.mvpin], info = pinInfo(p.k) || {}; html = `<b>${escAttr(info.city || 'Pin area')} · ${p.k}</b><br>${escAttr(p.state)}<br>Sales ${fmtINR(p.net)} · ${fmtNum(p.inv)} orders<br>${fmtNum(p.cust)} customers · top: ${escAttr(p.topCust)}`; }
    else if(s){ const o = stBy[s.dataset.mvst]; html = o ? `<b>${escAttr(o.k)}</b><br>Sales ${fmtINR(o.net)} (${fmtPct(G.total ? o.net / G.total * 100 : 0)})<br>${fmtNum(o.inv)} orders · ${fmtNum(o.cust)} customers` : 'No sales in this selection'; }
    if(!html){ tip.style.display = 'none'; return; }
    tip.innerHTML = html; tip.style.display = 'block'; const r = box.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14; if(x + tip.offsetWidth > r.width - 8) x -= tip.offsetWidth + 28; if(y + tip.offsetHeight > r.height - 8) y -= tip.offsetHeight + 28;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  box.onmouseleave = () => { tip.style.display = 'none'; };
  box.onclick = e => {
    const zb = e.target.closest('[data-mvzoom]');
    if(zb){ const f = zb.dataset.mvzoom, cur = V.mapVB || [0, 0, M.w, M.h];
      if(f === 'reset') V.mapVB = null; else { const k = f === 'in' ? 1.6 : 1 / 1.6, w = Math.min(M.w, Math.max(M.w / 12, cur[2] / k)), h = w * M.h / M.w; V.mapVB = [cur[0] + (cur[2] - w) / 2, cur[1] + (cur[3] - h) / 2, w, h]; }
      mvMap(D, X); return; }
    const c = e.target.closest('[data-mvpin]'), s = e.target.closest('[data-mvst]');
    if(c){ const p = pinBy[c.dataset.mvpin], info = pinInfo(p.k) || {}; mvOpenInvoices(`Pincode ${p.k}${info.city ? ' · ' + info.city : ''}`, p.rows, `${fmtNum(p.cust)} customers · top: ${p.topCust}`); }
    else if(s){ const o = stBy[s.dataset.mvst]; if(o) mvOpenInvoices(o.k + ' — invoices', o.rows); }
  };
}

/* =====================================================================
   DASHBOARD: filters + sections (location pages and Summary)
   cfg: { id, locations, rows, tab, showSp, filters:{sp,pin,cust,transfers}, onRender, defaultPreset }
   ===================================================================== */
function createDash(root, cfg){
  const F = cfg.filters || {};
  const V = { sel: new Set(cfg.locations), preset: cfg.defaultPreset || 'fy', custom: {}, noTransfers: true, showTransfers: !!F.transfers, tab: cfg.tab || 'sales',
    sp: 'ALL', pin: '', cust: '', ciList: 'sales', ciSeg: null, custSearch: '', custLimit: 50, geoSort: 'net', mapVB: null };
  root.dataset.mvroot = cfg.id;
  root.innerHTML = `
    <div class="filterbar mv-filterbar">
      ${cfg.locations.length > 1 ? `<div class="filter-block" style="flex:2 1 320px"><span class="fb-label">Locations</span><div class="mv-chips" data-mv="chips"></div></div>` : ''}
      <div class="filter-block"><span class="fb-label">Period</span><div class="seg-toggle" data-mv="preset">
        ${[['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['last7', '7 days'], ['last30', '30 days'], ['last3', '3 months'], ['fy', 'This FY'], ['all', 'All time'], ['custom', 'Custom']].map(([k, l]) => `<button data-p="${k}">${l}</button>`).join('')}</div></div>
      <div class="filter-block" data-mv="customBox" style="display:none"><span class="fb-label">From – to</span><div style="display:flex;gap:6px"><input type="date" data-mv="cs"><input type="date" data-mv="ce"></div></div>
      ${F.sp ? `<div class="filter-block"><span class="fb-label">Salesperson</span><select data-mv="sp"></select></div>` : ''}
      ${F.pin ? `<div class="filter-block"><span class="fb-label">Pincode</span><input data-mv="pin" list="${cfg.id}_pinlist" placeholder="Any" inputmode="numeric" style="width:120px"><datalist id="${cfg.id}_pinlist"></datalist></div>` : ''}
      ${F.cust ? `<div class="filter-block"><span class="fb-label">Customer</span><input data-mv="cust" list="${cfg.id}_custlist" placeholder="Any customer" style="width:210px"><datalist id="${cfg.id}_custlist"></datalist></div>` : ''}
      ${F.transfers ? `<div class="filter-block"><span class="fb-label">Branch transfers</span><label class="mv-switch"><input type="checkbox" data-mv="transfers" checked> <span>Exclude internal transfers</span></label></div>` : ''}
      <div class="filter-block"><span class="fb-label">&nbsp;</span><div style="display:flex;gap:6px"><button class="util-btn" data-mv="export">Export invoices</button><button class="util-btn" data-mv="clear" style="display:none">Clear filters</button></div></div>
    </div>
    <div class="mv-active" data-mv="active"></div>
    <div data-mv="body"></div>`;
  const $ = k => root.querySelector(`[data-mv="${k}"]`);
  const rowsAll = () => (cfg.rows() || []).filter(r => cfg.locations.indexOf(r.location) >= 0);

  function compute(){
    let base = rowsAll().filter(r => V.sel.has(r.location));
    const transfers = base.filter(r => MV_TRANSFER.test(r.customer));
    if(F.transfers && V.noTransfers) base = base.filter(r => !MV_TRANSFER.test(r.customer));
    if(V.sp !== 'ALL') base = base.filter(r => r.salesperson === V.sp);
    if(V.pin) base = base.filter(r => r.pincode === V.pin);
    if(V.cust){ const q = mvNormName(V.cust), ph = mvPhoneOf(V.cust); base = base.filter(r => mvNormName(r.customer) === q || (ph && mvKey(r) === 'P' + ph)); }
    let latest = new Date(0); for(const r of base) if(r.date > latest) latest = r.date;
    if(!latest.getTime()) latest = new Date();
    const P = mvPeriod(V.preset, V.custom, latest);
    const cur = P.all ? base : base.filter(r => r.date >= P.start && r.date <= P.end);
    const prev = P.all ? [] : base.filter(r => r.date >= P.prevStart && r.date <= P.prevEnd);
    const hist = P.all ? base : base.filter(r => r.date <= P.end);
    return { base, cur, prev, hist, P, latest, transfers: P.all ? transfers : transfers.filter(r => r.date >= P.start && r.date <= P.end) };
  }
  function fillFilters(){
    const all = rowsAll().filter(r => V.sel.has(r.location));
    if($('chips')) $('chips').innerHTML = cfg.locations.map(l => `<button class="mv-chip ${V.sel.has(l) ? 'on' : ''}" data-loc="${escAttr(l)}" style="--c:${locColor(l)}"><i></i>${escAttr(locName(l))} <span>${fmtNum(rowsAll().filter(r => r.location === l).length)}</span></button>`).join('');
    root.querySelectorAll('[data-mv="preset"] button').forEach(b => b.classList.toggle('active', b.dataset.p === V.preset));
    $('customBox').style.display = V.preset === 'custom' ? '' : 'none';
    if($('sp')){ const sps = {}; all.forEach(r => { sps[r.salesperson] = (sps[r.salesperson] || 0) + r.net; });
      $('sp').innerHTML = `<option value="ALL">All salespersons</option>` + Object.keys(sps).sort((a, b) => sps[b] - sps[a]).map(s => `<option value="${escAttr(s)}" ${s === V.sp ? 'selected' : ''}>${escAttr(s)}</option>`).join(''); }
    if($('pin')){ const pc = {}; all.forEach(r => { if(r.pincode) pc[r.pincode] = (pc[r.pincode] || 0) + r.net; });
      document.getElementById(cfg.id + '_pinlist').innerHTML = Object.keys(pc).sort((a, b) => pc[b] - pc[a]).slice(0, 400).map(p => `<option value="${p}">`).join(''); $('pin').value = V.pin; }
    if($('cust')){ const cc = {}; all.forEach(r => { cc[r.customer] = (cc[r.customer] || 0) + r.net; });
      document.getElementById(cfg.id + '_custlist').innerHTML = Object.keys(cc).sort((a, b) => cc[b] - cc[a]).slice(0, 500).map(c => `<option value="${escAttr(c)}">`).join(''); $('cust').value = V.cust; }
    const act = [];
    if(V.sp !== 'ALL') act.push(['sp', 'Salesperson: ' + V.sp]);
    if(V.pin) act.push(['pin', 'Pincode: ' + V.pin]);
    if(V.cust) act.push(['cust', 'Customer: ' + V.cust]);
    if(cfg.locations.length > 1 && V.sel.size < cfg.locations.length) act.push(['loc', 'Locations: ' + [...V.sel].map(locName).join(', ')]);
    $('active').innerHTML = act.map(([k, l]) => `<span class="mv-fchip">${escAttr(l)} <button data-mvclear="${k}" aria-label="Remove filter">✕</button></span>`).join('');
    $('clear').style.display = act.length ? '' : 'none';
  }
  function render(keepFocus){
    const focusSearch = keepFocus && document.activeElement && document.activeElement.matches('[data-mvsearch]');
    MV_DRILL.clear();
    fillFilters();
    const D = inst.D = compute();
    const X = inst.X = { id: cfg.id, locs: cfg.locations.filter(l => V.sel.has(l)), V, showSp: cfg.showSp, canFilter: !!F.pin };
    const body = $('body');
    if(!D.base.length) body.innerHTML = `<div class="panel mv-empty"><h2>No data</h2><p class="muted">${cfg.locations.length === 1 ? escAttr(locName(cfg.locations[0])) + ' has no invoices yet. Reports appear automatically once invoices are pushed.' : 'Nothing matches these filters. Try a wider period or clear the filters.'}</p></div>`;
    else if(V.tab === 'customers'){ body.innerHTML = mvCustomersHtml(D, X); mvCustomersCharts(D, X); }
    else if(V.tab === 'geo'){ body.innerHTML = mvGeoHtml(D, X); mvGeoCharts(D, X); }
    else if(V.tab === 'forecast'){ body.innerHTML = mvForecastHtml(D, X); mvForecastCharts(D, X); }
    else { body.innerHTML = mvSalesHtml(D, X); mvSalesCharts(D, X); }
    root.querySelector('.mv-filterbar [data-mv="preset"]').closest('.filter-block').style.opacity = V.tab === 'forecast' ? .45 : 1;
    if(focusSearch){ const i = root.querySelector('[data-mvsearch]'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    if(cfg.onRender) cfg.onRender(D, V);
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-loc]'); if(b){ const l = b.dataset.loc; if(V.sel.has(l)){ if(V.sel.size > 1) V.sel.delete(l); } else V.sel.add(l); render(); return; }
    const p = e.target.closest('[data-p]'); if(p){ V.preset = p.dataset.p; render(); return; }
    const c = e.target.closest('[data-mvclear]'); if(c){ const k = c.dataset.mvclear; if(k === 'sp') V.sp = 'ALL'; else if(k === 'loc') cfg.locations.forEach(l => V.sel.add(l)); else V[k] = ''; render(); return; }
    if(e.target.closest('[data-mv="clear"]')){ V.sp = 'ALL'; V.pin = ''; V.cust = ''; cfg.locations.forEach(l => V.sel.add(l)); render(); return; }
    if(e.target.closest('[data-mv="export"]')){ mvExportCSV(inst.D ? inst.D.cur : [], 'invoices ' + (inst.D ? inst.D.P.label : '')); return; }
    const f = e.target.closest('[data-mvfilter]'); if(f){ e.stopPropagation(); const k = f.dataset.mvfilter, v = f.dataset.v;
      if(k === 'loc'){ if(V.sel.size === 1 && V.sel.has(v)) cfg.locations.forEach(l => V.sel.add(l)); else V.sel = new Set([v]); }
      else if(k === 'sp') V.sp = V.sp === v ? 'ALL' : v; else V[k] = V[k] === v ? '' : v;
      render(); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const l = e.target.closest('[data-mvlist]'); if(l){ V.ciList = l.dataset.mvlist; V.ciSeg = null; V.custLimit = 50; render(); return; }
    const sg = e.target.closest('[data-mvseg]'); if(sg){ V.ciSeg = sg.dataset.mvseg; V.custLimit = 50; render(); mvScrollTo(cfg.id + '_lists'); return; }
    const s = e.target.closest('[data-mvsort]'); if(s){ V.geoSort = s.dataset.mvsort; render(); return; }
    const gb = e.target.closest('[data-mvgran]'); if(gb){ V.gran = gb.dataset.mvgran; render(); return; }
    if(e.target.closest('[data-mvmore]')){ V.custLimit += 100; render(); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if(t.matches('[data-mv="sp"]')){ V.sp = t.value; render(); }
    else if(t.matches('[data-mv="pin"]')){ V.pin = t.value.trim(); render(); }
    else if(t.matches('[data-mv="cust"]')){ V.cust = t.value.trim(); render(); }
    else if(t.matches('[data-mv="transfers"]')){ V.noTransfers = t.checked; render(); }
    else if(t.matches('[data-mv="cs"],[data-mv="ce"]')){ V.custom = { start: $('cs').value, end: $('ce').value }; if(V.custom.start && V.custom.end) render(); }
  });
  root.addEventListener('input', e => { if(e.target.matches('[data-mvsearch]')){ V.custSearch = e.target.value; clearTimeout(V._t); V._t = setTimeout(() => { V.custLimit = 50; render(true); }, 250); } });
  const inst = MV_INST[cfg.id] = { V, cfg, render, setTab: t => { V.tab = t; render(); }, D: null, X: null };
  return inst;
}

/* ---------------- shared clicks: drills, customer popup, CSV ---------------- */
document.addEventListener('click', e => {
  const d = e.target.closest('[data-mvdrill]'); if(d){ const x = MV_DRILL.get(d.dataset.mvdrill); if(x) mvOpenInvoices(x.title, x.rows, x.sub); return; }
  const c = e.target.closest('[data-mvcust]'); if(c){ const root = c.closest('[data-mvroot]'), inst = root && MV_INST[root.dataset.mvroot]; if(inst && inst.D) mvOpenCustomer(c.dataset.mvcust, inst.D); return; }
  const x = e.target.closest('[data-mvcsv]'); if(x){ const p = x.closest('.panel'); mvTableCSV(p && p.querySelector('table'), x.dataset.mvcsv); }
});
function mvOpenCustomer(key, D){
  const rows = D.base.filter(r => mvKey(r) === key);
  if(!rows.length) return;
  const C = mvCustomers({ hist: rows, cur: rows.filter(r => D.P.all || (r.date >= D.P.start && r.date <= D.P.end)), prev: rows.filter(r => !D.P.all && r.date >= D.P.prevStart && r.date <= D.P.prevEnd), P: D.P, latest: D.latest });
  const c = C.list[0];
  mvOpenInvoices(c.name, rows, `${c.key[0] === 'P' ? 'Mobile ' + c.key.slice(1) + ' · ' : ''}${c.segment} · lifetime ${fmtINR(c.life.net)} from ${fmtNum(c.life.inv)} orders · AOV ${fmtINR(c.aov)} · first ${mvFmtD(c.first)} · last ${mvFmtD(c.last)}${c.avgGap ? ` · reorders about every ${Math.round(c.avgGap)} days` : ''}`, c);
}

/* ---------------- invoice / customer popup ---------------- */
let MV_INV = null;
function mvOpenInvoices(title, rows, sub, cust){
  let ov = document.getElementById('mvInvOverlay');
  if(!ov){
    ov = document.createElement('div'); ov.id = 'mvInvOverlay'; ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-box" style="max-width:1060px"><div class="modal-head"><div><h3 id="mvInvTitle"></h3><p class="muted" id="mvInvSub" style="margin:4px 0 0"></p></div><button class="modal-close" id="mvInvClose" aria-label="Close">✕</button></div>
      <div id="mvInvChartWrap" style="display:none;margin:10px 0"><div class="chart-box" style="height:210px"><div class="chart-inner"><canvas id="mvInvChart"></canvas></div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><input class="table-search" id="mvInvSearch" placeholder="Search customer or invoice…"><button class="util-btn small" id="mvInvCsv">Export CSV</button></div>
      <div class="table-scroll" style="max-height:50vh"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Location</th><th>Salesperson</th><th style="text-align:right">Net</th><th style="text-align:right">Total</th><th style="text-align:right">Profit</th><th>Pincode</th><th>State</th></tr></thead><tbody id="mvInvBody"></tbody></table></div>
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
  const wrap = ov.querySelector('#mvInvChartWrap');
  if(cust){ wrap.style.display = ''; const ks = Object.keys(cust.months).sort();
    mvChart('mvInvChart', { type: 'bar', data: { labels: ks.map(mvMonthLabel), datasets: [{ label: 'Monthly sales', data: ks.map(k => cust.months[k]), backgroundColor: '#6C5CE7', borderRadius: 6 }] },
      options: { scales: { x: { grid: { display: false } }, y: mvY() }, plugins: { legend: { display: false }, datalabels: mvLabels() } } }); }
  else wrap.style.display = 'none';
  mvDrawInv();
}
function mvInvFiltered(){ const q = document.getElementById('mvInvSearch').value.trim().toLowerCase(); return q ? MV_INV.rows.filter(r => (r.customer + ' ' + r.invoice).toLowerCase().includes(q)) : MV_INV.rows; }
function mvDrawInv(){
  const rows = mvInvFiltered(), net = mvSum(rows, 'net');
  document.getElementById('mvInvSub').textContent = `${fmtNum(rows.length)} invoices · ${fmtINR(net)} net` + (MV_INV.sub ? ' · ' + MV_INV.sub : '');
  document.getElementById('mvInvBody').innerHTML = rows.slice(0, MV_INV.limit).map(r => `<tr><td>${r.date.toLocaleDateString('en-GB')}</td><td>${escAttr(r.invoice)}</td><td class="name">${escAttr(r.customer)}</td><td>${mvTag(r.location)}</td><td>${escAttr(r.salesperson || '')}</td>
    <td style="text-align:right">${money(r.net)}</td><td style="text-align:right">${money(r.total)}</td><td style="text-align:right">${r.pp ? '<span class="muted">—</span>' : money(r.profit)}</td><td>${escAttr(r.pincode || '')}</td><td>${escAttr(r.state || '')}</td></tr>`).join('') || '<tr><td colspan="10" class="empty-note">No invoices</td></tr>';
  const more = document.getElementById('mvInvMore'); more.style.display = rows.length > MV_INV.limit ? '' : 'none'; more.textContent = `Show more (${fmtNum(rows.length - MV_INV.limit)} left)`;
}
function mvCsvCell(v){ const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function mvDownload(name, text){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })); a.download = String(name).replace(/[^\w\- +]/g, '_').slice(0, 80) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function mvExportCSV(rows, name){
  const head = ['Invoice Date', 'Invoice#', 'Customer Name', 'Location', 'Salesperson', 'Channel', 'Amount Without Tax', 'Tax Amount', 'Total', 'Profit', 'Place of Supply', 'Billing Code'];
  mvDownload(name || 'invoices', [head.join(',')].concat(rows.map(r => [r.date.toLocaleDateString('en-GB'), r.invoice, r.customer, locName(r.location), r.salesperson, mvChannelOf(r), r.net.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2), r.pp ? '' : r.profit.toFixed(2), r.state, r.pincode].map(mvCsvCell).join(','))).join('\n'));
}
function mvTableCSV(table, name){
  if(!table) return;
  mvDownload(name, [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => { const m = td.querySelector('[data-v]'); return mvCsvCell(m ? m.dataset.v : td.textContent.trim()); }).join(',')).join('\n'));
}

/* ---------------- Delhi Offline: embedded panels (customer lists on Customers tab, Forecast tab) ---------------- */
function mvEmbedOffline(which, hostId){
  const host = document.getElementById(hostId); if(!host || !ALL_ROWS.length) return;
  const id = 'off_' + which;
  host.dataset.mvroot = id;
  const inst = MV_INST[id] || (MV_INST[id] = { V: { ciList: 'growing', ciSeg: null, custSearch: '', custLimit: 25, geoSort: 'net', mapVB: null } });
  inst.render = () => mvEmbedOffline(which, hostId);
  const D = inst.D = mvOfflineData();
  const X = inst.X = { id, locs: ['Delhi- Offline'], V: inst.V, canFilter: false };
  if(which === 'fc'){ host.innerHTML = mvForecastHtml(D, X); mvForecastCharts(D, X); }
  else { const C = X.C = mvCustomers(D); host.innerHTML = mvCustListPanelHtml(C, D, X); }
}
document.addEventListener('click', e => {
  const root = e.target.closest('[data-mvroot^="off_"]'); if(!root) return;
  const inst = MV_INST[root.dataset.mvroot]; if(!inst || !inst.render) return;
  const l = e.target.closest('[data-mvlist]'); if(l){ inst.V.ciList = l.dataset.mvlist; inst.V.ciSeg = null; inst.V.custLimit = 25; inst.render(); return; }
  const sg = e.target.closest('[data-mvseg]'); if(sg){ inst.V.ciSeg = sg.dataset.mvseg; inst.V.custLimit = 25; inst.render(); mvScrollTo(inst.X.id + '_lists'); return; }
  const s = e.target.closest('[data-mvsort]'); if(s){ inst.V.geoSort = s.dataset.mvsort; inst.render(); return; }
  if(e.target.closest('[data-mvmore]')){ inst.V.custLimit += 50; inst.render(); }
});
document.addEventListener('input', e => {
  if(!e.target.matches('[data-mvsearch]')) return;
  const root = e.target.closest('[data-mvroot^="off_"]'); if(!root) return;
  const inst = MV_INST[root.dataset.mvroot]; if(!inst) return; inst.V.custSearch = e.target.value;
  clearTimeout(inst._t); inst._t = setTimeout(() => { inst.render(); const i = root.querySelector('[data-mvsearch]'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300);
});

/* =====================================================================
   Helpers for clickable KPIs + previous-period comparison
   ===================================================================== */
function mvCustRows(C, D){
  const keys = list => new Set(list.map(c => c.key));
  const pick = (set, src) => src.filter(r => set.has(mvKey(r)));
  const act = C.active, byVal = act.slice().sort((a, b) => (D.P.all ? b.life.net - a.life.net : b.cur.net - a.cur.net));
  return {
    active: D.P.all ? D.hist : D.cur,
    newC: pick(keys(act.filter(c => c.isNew)), D.P.all ? D.hist : D.cur),
    ret: pick(keys(act.filter(c => !c.isNew)), D.P.all ? D.hist : D.cur),
    rep: pick(keys(act.filter(c => c.repeat)), D.P.all ? D.hist : D.cur),
    atRisk: pick(keys(C.segs['At risk'].list), D.hist),
    lost: pick(keys(C.segs['Lost'].list), D.hist),
    top10: pick(keys(byVal.slice(0, 10)), D.P.all ? D.hist : D.cur)
  };
}
/* the same customer numbers for the previous period (null when there is none) */
function mvPrevCustomers(D){
  if(D.P.all || !D.prev.length) return null;
  return mvCustomers({ base: D.base, hist: D.base.filter(r => r.date <= D.P.prevEnd), cur: D.prev, prev: [], P: { start: D.P.prevStart, end: D.P.prevEnd, all: false }, latest: D.latest });
}
/* the exact map used on Delhi Offline (customer-map.js) */
function mvMapPanelHtml(){
  if(typeof renderCustomerMap !== 'function') return '';
  return `<div class="panel"><div class="panel-head"><div><h2>Where our customers are</h2><p class="desc" id="custMapDesc"></p></div>
    <div class="seg-toggle" id="mapModeToggle"><button data-m="both" class="active">States + pin codes</button><button data-m="states">States</button><button data-m="pins">Pin codes</button></div></div>
    <div class="map-layout"><div class="map-box" id="mapBox"><div class="map-ctrl"><button id="mapZoomIn" aria-label="Zoom in">+</button><button id="mapZoomOut" aria-label="Zoom out">−</button><button id="mapReset" aria-label="Reset view" style="font-size:14px">⟲</button></div>
      <div id="mapSvgHost" style="height:100%"></div><div class="map-tip" id="mapTip"></div><div class="map-legend" id="mapLegend"></div></div>
    <div class="map-side"><div class="kpi-mini-row" id="mapStats" style="grid-template-columns:1fr 1fr;margin:0"></div><div class="map-status" id="mapStatus"></div>
      <h3 class="score-h3" style="margin:2px 0">Top cities and towns</h3><div class="table-scroll" style="max-height:380px"><table style="min-width:0"><thead><tr><th>#</th><th>City</th><th style="text-align:right">Customers</th><th style="text-align:right">Net sales</th><th style="text-align:right">Share</th></tr></thead><tbody id="mapCityTable"></tbody></table></div></div></div></div>`;
}

/* =====================================================================
   FORECAST — simple, explainable estimates from the full history
   • Month-end: sales so far + the usual sales of each remaining day (weekday pattern, last 90 days)
   • Next months: average of a straight-line trend (last 6 full months) and the last-3-month average
   • Range: ± the typical miss of the trend line on past months (at least ±10%)
   • Reorders: customers whose usual reorder gap says they will buy in the next 30 days
   ===================================================================== */
function mvForecast(rows, latest){
  const L = mvDay(latest), y = L.getFullYear(), m = L.getMonth();
  const mk = (yy, mm) => mvMonthKey(new Date(yy, mm, 1));
  const byM = {}, byMInv = {}; rows.forEach(r => { const k = mvMonthKey(r.date); byM[k] = (byM[k] || 0) + r.net; byMInv[k] = (byMInv[k] || 0) + 1; });
  const curK = mk(y, m), monthEnd = new Date(y, m + 1, 0), daysIn = monthEnd.getDate();
  const mtdRows = rows.filter(r => mvMonthKey(r.date) === curK), mtd = mvSum(mtdRows, 'net');
  // weekday pattern from the last 90 days (days with no sales count as zero)
  const from = new Date(L.getTime() - 89 * MV_DAY), wSum = [0,0,0,0,0,0,0], wCnt = [0,0,0,0,0,0,0], wInv = [0,0,0,0,0,0,0];
  for(let d = new Date(from); d <= L; d = new Date(d.getTime() + MV_DAY)) wCnt[d.getDay()]++;
  rows.forEach(r => { if(r.date >= from && r.date <= mvEnd(L)){ wSum[r.date.getDay()] += r.net; wInv[r.date.getDay()]++; } });
  const wAvg = wSum.map((v, i) => wCnt[i] ? v / wCnt[i] : 0), wAvgInv = wInv.map((v, i) => wCnt[i] ? v / wCnt[i] : 0);
  let restNet = 0, restInv = 0, restDays = 0;
  for(let d = L.getDate() + 1; d <= daysIn; d++){ const dow = new Date(y, m, d).getDay(); restNet += wAvg[dow]; restInv += wAvgInv[dow]; restDays++; }
  const projMonth = mtd + restNet, projInv = mtdRows.length + restInv;
  // full months before the current one
  const fullKeys = Object.keys(byM).filter(k => k < curK).sort();
  const firstDate = rows.reduce((mn, r) => (!mn || r.date < mn) ? r.date : mn, null);
  const firstFull = firstDate && firstDate.getDate() > 1 ? mvMonthKey(new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 1)) : (firstDate ? mvMonthKey(firstDate) : null);
  const usable = fullKeys.filter(k => !firstFull || k >= firstFull).slice(-6);
  const vals = usable.map(k => byM[k]);
  let slope = 0, icpt = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : projMonth, resid = 0;
  if(vals.length >= 3){
    const n = vals.length, xm = (n - 1) / 2, ym = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0; vals.forEach((v, i) => { num += (i - xm) * (v - ym); den += (i - xm) ** 2; });
    slope = den ? num / den : 0; icpt = ym - slope * xm;
    resid = Math.sqrt(vals.reduce((s, v, i) => s + (v - (icpt + slope * i)) ** 2, 0) / n);
  }
  const avg3 = vals.length ? vals.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, vals.length) : projMonth;
  const at = step => { const t = vals.length - 1 + step; const trend = vals.length >= 3 ? icpt + slope * t : avg3; return Math.max(0, (trend + avg3) / 2); };
  const band = v => Math.max(resid, v * 0.1);
  const next = [1, 2, 3].map(i => { const d = new Date(y, m + i, 1), v = at(i + 0); return { k: mvMonthKey(d), v, lo: Math.max(0, v - band(v)), hi: v + band(v) }; });
  // financial year (April–March)
  const fyStart = m >= 3 ? y : y - 1, fyEndM = new Date(fyStart + 1, 2, 1);
  const fyActual = mvSum(rows.filter(r => r.date >= new Date(fyStart, 3, 1) && r.date <= mvEnd(L)), 'net');
  let fyProj = fyActual + restNet, step = 1;
  for(let d = new Date(y, m + 1, 1); d <= fyEndM; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) fyProj += at(step++);
  const lastK = mk(y, m - 1), lastMonth = byM[lastK] || 0;
  const lastSameDay = mvSum(rows.filter(r => mvMonthKey(r.date) === lastK && r.date.getDate() <= L.getDate()), 'net');
  const needPerDay = restDays ? Math.max(0, lastMonth - mtd) / restDays : 0;
  const monthlyTrendPct = vals.length >= 3 && Math.abs(icpt + slope * (vals.length - 1)) > 0 ? slope / ((icpt + slope * (vals.length - 1)) || 1) * 100 : null;
  return { L, curK, mtd, mtdRows, projMonth, projInv, restDays, daysIn, lastK, lastMonth, lastSameDay, needPerDay, next, fyStart, fyActual, fyProj, usable, byM, byMInv, wAvg, monthlyTrendPct, resid, vals, projBand: band(projMonth) * (restDays / daysIn) };
}
function mvReorders(rows, latest){
  const C = mvCustomers({ base: rows, hist: rows, cur: rows, prev: [], P: { all: true }, latest });
  const L = mvDay(latest), horizon = new Date(L.getTime() + 30 * MV_DAY);
  const due = [];
  C.list.forEach(c => { if(c.orderDays < 3 || !c.avgGap) return; const next = new Date(mvDay(c.last).getTime() + Math.round(c.avgGap) * MV_DAY);
    if(next > horizon) return; const late = Math.floor((L - next) / MV_DAY);
    if(late > Math.max(14, c.avgGap)) return;                 // long overdue → at risk, not a forecast
    due.push({ c, next, late, exp: c.aov }); });
  return due.sort((a, b) => a.next - b.next);
}
function mvForecastHtml(D, X){
  const id = X.id, F = X.F = mvForecast(D.base, D.latest), R = X.R = mvReorders(D.base, D.latest);
  const vsLast = F.lastMonth ? (F.projMonth - F.lastMonth) / F.lastMonth * 100 : null, paceVs = F.lastSameDay ? (F.mtd - F.lastSameDay) / F.lastSameDay * 100 : null;
  const expReorder = R.reduce((s, x) => s + x.exp, 0), dueKeys = new Set(R.map(x => x.c.key));
  const lastRows = D.base.filter(r => mvMonthKey(r.date) === F.lastK), curLabel = mvMonthLabel(F.curK);
  let h = `<div class="mv-note">Estimates from ${fmtNum(D.base.length)} invoices up to ${mvFmtD(F.L)}. They follow the filters above except the period (forecasts always use the full history). Treat them as a guide, not a promise.</div>`;
  h += mvKpis([
    { l: `${curLabel} so far`, i: '₹', v: fmtINR(F.mtd), s: paceVs === null ? `${fmtNum(F.mtdRows.length)} orders` : `${mvGrowth(paceVs)} vs same days last month`, a: 'var(--violet)', d: mvReg(`${curLabel} — invoices so far`, F.mtdRows) },
    { l: `${curLabel} projected`, i: '◎', v: fmtINR(F.projMonth), s: `range ${fmtINRShort(Math.max(0, F.projMonth - F.projBand))} – ${fmtINRShort(F.projMonth + F.projBand)}` + (vsLast === null ? '' : ` · ${mvGrowth(vsLast)} vs last month`), a: 'var(--orange)', t: 'Sales so far + the usual sales for each remaining day of the month (weekday pattern of the last 90 days)', d: mvReg(`${curLabel} — invoices so far`, F.mtdRows) },
    { l: 'Last month', i: '▭', v: fmtINR(F.lastMonth), s: `${mvMonthLabel(F.lastK)} · ${fmtNum(lastRows.length)} orders`, a: 'var(--sky)', d: mvReg(`${mvMonthLabel(F.lastK)} — invoices`, lastRows) },
    { l: 'Needed per day', i: '→', v: F.restDays ? fmtINR(F.needPerDay) : '—', s: F.restDays ? `for ${F.restDays} remaining days to match last month` : 'Month complete', a: 'var(--coral)' },
    { l: `Next month (${mvMonthLabel(F.next[0].k)})`, i: '↗', v: fmtINR(F.next[0].v), s: `range ${fmtINRShort(F.next[0].lo)} – ${fmtINRShort(F.next[0].hi)}`, a: 'var(--good)', t: 'Average of the trend line over the last full months and the last-3-month average' },
    { l: `FY ${F.fyStart}-${String((F.fyStart + 1) % 100).padStart(2, '0')} projected`, i: 'Σ', v: fmtINR(F.fyProj), s: `${fmtINR(F.fyActual)} booked so far`, a: 'var(--indigo-2)' },
    { l: 'Projected orders', i: '#', v: fmtNum(Math.round(F.projInv)), s: `${curLabel} · ${fmtNum(F.mtdRows.length)} so far`, a: 'var(--sky)' },
    { l: 'Expected reorders (30 days)', i: '↻', v: fmtNum(R.length), s: `≈ ${fmtINR(expReorder)} at their usual order value`, a: 'var(--good)', d: mvReg('Customers due to reorder — their past invoices', D.base.filter(r => dueKeys.has(mvKey(r)))) }
  ]);
  h += mvPanel('Forecast insights', 'Click an insight to see its invoices', mvInsights(mvForecastInsights(F, R, D)));
  h += mvPanel('Monthly sales and forecast', 'Bars: actual (this month so far in light colour) · dashed line: forecast with its low–high range', mvBox(id + '_fcm', true));
  h += `<div class="grid3">${mvPanel(`${curLabel}: running total`, 'Actual so far vs projected path vs last month (same day of month)', mvBox(id + '_fcd'))}${mvPanel('Usual sales by weekday', 'Average net sales per weekday over the last 90 days — used for the month-end projection', mvBox(id + '_fcw'))}</div>`;
  const rowsTbl = F.usable.slice(-6).map(k => `<tr><td class="name">${mvMonthLabel(k)}</td><td style="text-align:right">${money(F.byM[k])}</td><td style="text-align:right">${fmtNum(F.byMInv[k] || 0)}</td><td style="text-align:right">—</td><td style="text-align:right">—</td><td><span class="muted">Actual</span></td></tr>`).join('')
    + `<tr><td class="name"><b>${curLabel}</b></td><td style="text-align:right">${money(F.mtd)}</td><td style="text-align:right">${fmtNum(F.mtdRows.length)}</td><td style="text-align:right;font-weight:700">${money(F.projMonth)}</td><td style="text-align:right">${money(Math.max(0, F.projMonth - F.projBand))} – ${money(F.projMonth + F.projBand)}</td><td>Month to date + projection</td></tr>`
    + F.next.map(n => `<tr><td class="name">${mvMonthLabel(n.k)}</td><td style="text-align:right">—</td><td style="text-align:right">—</td><td style="text-align:right;font-weight:700">${money(n.v)}</td><td style="text-align:right">${money(n.lo)} – ${money(n.hi)}</td><td>Forecast</td></tr>`).join('');
  h += mvPanel('Forecast report', 'Last full months, this month and the next three', `<div class="table-scroll"><table><thead><tr><th>Month</th><th style="text-align:right">Actual</th><th style="text-align:right">Orders</th><th style="text-align:right">Forecast</th><th style="text-align:right">Range</th><th>Basis</th></tr></thead><tbody>${rowsTbl}</tbody></table></div>`, `<button class="util-btn small" data-mvcsv="forecast">Export CSV</button>`);
  h += mvPanel('Customers due to reorder', `${fmtNum(R.length)} customers whose usual reorder gap says they will order in the next 30 days (or are a little late). Call the late ones first.`,
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Customer</th>${X.locs.length > 1 ? '<th>Location</th>' : ''}<th>Last order</th><th style="text-align:right">Usual gap</th><th>Expected</th><th style="text-align:right">Status</th><th style="text-align:right">Usual order</th><th style="text-align:right">Lifetime</th></tr></thead><tbody>
    ${R.slice(0, 60).map((x, i) => `<tr class="clickable" data-mvcust="${escAttr(x.c.key)}"><td>${i + 1}</td><td class="name">${escAttr(x.c.name)}</td>${X.locs.length > 1 ? `<td>${Object.keys(x.c.locs).map(mvTag).join(' ')}</td>` : ''}<td>${mvFmtD(x.c.last)}</td><td style="text-align:right">${Math.round(x.c.avgGap)} days</td><td>${mvFmtD(x.next)}</td><td style="text-align:right">${x.late > 0 ? `<span class="mv-g down">${x.late} days late</span>` : `in ${-x.late} days`}</td><td style="text-align:right">${money(x.exp)}</td><td style="text-align:right">${money(x.c.life.net)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty-note">No regular customers are due in the next 30 days.</td></tr>'}
    </tbody></table></div>`, `<button class="util-btn small" data-mvcsv="reorders">Export CSV</button>`);
  return h;
}
function mvForecastInsights(F, R, D){
  const out = [], cur = mvMonthLabel(F.curK);
  if(F.lastMonth) out.push({ t: F.projMonth >= F.lastMonth ? 'good' : 'warn', x: `At the current pace ${cur} ends near <b>${fmtINR(F.projMonth)}</b>, ${F.projMonth >= F.lastMonth ? 'above' : 'below'} last month's ${fmtINR(F.lastMonth)} by ${fmtPct(Math.abs(F.projMonth - F.lastMonth) / F.lastMonth * 100)}.`, d: mvReg(`${cur} — invoices so far`, F.mtdRows) });
  if(F.restDays && F.lastMonth > F.mtd) out.push({ t: 'info', x: `To match last month, the remaining ${F.restDays} days need <b>${fmtINR(F.needPerDay)}</b> a day (usual: ${fmtINR((F.projMonth - F.mtd) / F.restDays)}).` });
  if(F.monthlyTrendPct !== null) out.push({ t: F.monthlyTrendPct >= 0 ? 'good' : 'bad', x: `Over the last ${F.vals.length} full months sales have moved <b>${F.monthlyTrendPct >= 0 ? '+' : '−'}${fmtPct(Math.abs(F.monthlyTrendPct))}</b> a month on average.` });
  else out.push({ t: 'info', x: `Only ${F.vals.length} full month${F.vals.length === 1 ? '' : 's'} of history — the forecast uses the average for now and will sharpen as data grows.` });
  const dn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], best = F.wAvg.indexOf(Math.max(...F.wAvg)), low = F.wAvg.indexOf(Math.min(...F.wAvg));
  out.push({ t: 'info', x: `<b>${dn[best]}</b> is the strongest day (≈ ${fmtINR(F.wAvg[best])}); <b>${dn[low]}</b> the weakest (≈ ${fmtINR(F.wAvg[low])}).` });
  const late = R.filter(x => x.late > 0);
  if(R.length) out.push({ t: late.length ? 'warn' : 'good', x: `<b>${fmtNum(R.length)}</b> regular customers are due to reorder in 30 days (≈ ${fmtINR(R.reduce((s, x) => s + x.exp, 0))}); <b>${fmtNum(late.length)}</b> are already late.`, d: mvReg('Late reorders — their invoices', D.base.filter(r => late.some(x => x.c.key === mvKey(r)))) });
  out.push({ t: 'info', x: `Next three months: ${F.next.map(n => `${mvMonthLabel(n.k)} ≈ <b>${fmtINRShort(n.v)}</b>`).join(', ')}.` });
  return out;
}
function mvForecastCharts(D, X){
  const F = X.F, id = X.id, col = X.locs.length === 1 ? locColor(X.locs[0]) : '#6C5CE7';
  const ks = F.usable.slice(-6).concat([F.curK], F.next.map(n => n.k));
  const actual = ks.map(k => k === F.curK ? F.mtd : (F.byM[k] !== undefined && k < F.curK ? F.byM[k] : null));
  const fc = ks.map(k => k === F.curK ? F.projMonth : (F.next.find(n => n.k === k) || {}).v ?? null);
  const lo = ks.map(k => k === F.curK ? Math.max(0, F.projMonth - F.projBand) : (F.next.find(n => n.k === k) || {}).lo ?? null);
  const hi = ks.map(k => k === F.curK ? F.projMonth + F.projBand : (F.next.find(n => n.k === k) || {}).hi ?? null);
  mvChart(id + '_fcm', { data: { labels: ks.map(mvMonthLabel), datasets: [
      { type: 'bar', label: 'Actual', data: actual, backgroundColor: ks.map(k => k === F.curK ? col + '66' : col), borderRadius: 7, datalabels: mvLabels() },
      { type: 'line', label: 'Forecast', data: fc, borderColor: '#F6A623', backgroundColor: '#F6A623', borderDash: [6, 4], tension: .25, pointRadius: 4, spanGaps: false, datalabels: { display: c => c.dataIndex >= ks.indexOf(F.curK), align: 'top', offset: 6, color: '#B36B00', font: { size: 10, weight: 700 }, formatter: v => v === null ? '' : fmtINRShort(v) } },
      { type: 'line', label: 'High', data: hi, borderColor: 'transparent', backgroundColor: 'rgba(246,166,35,.14)', fill: '+1', pointRadius: 0, datalabels: { display: false } },
      { type: 'line', label: 'Low', data: lo, borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, datalabels: { display: false } }] },
    options: { scales: { x: { grid: { display: false } }, y: mvY() }, plugins: { legend: { labels: { filter: i => i.text !== 'High' && i.text !== 'Low' } }, tooltip: { callbacks: { label: c => c.raw === null ? '' : `${c.dataset.label}: ${fmtINR(c.raw)}` } } } } },
    (di, i) => di === 0 && actual[i] !== null ? ({ title: `${mvMonthLabel(ks[i])} — invoices`, rows: D.base.filter(r => mvMonthKey(r.date) === ks[i]) }) : null);
  const days = Array.from({ length: F.daysIn }, (_, i) => i + 1), today = F.L.getDate();
  let run = 0; const act = days.map(d => { if(d > today) return null; run += mvSum(F.mtdRows.filter(r => r.date.getDate() === d), 'net'); return run; });
  let p = F.mtd; const y = F.L.getFullYear(), m = F.L.getMonth();
  const proj = days.map(d => { if(d < today) return null; if(d === today) return F.mtd; p += F.wAvg[new Date(y, m, d).getDay()]; return p; });
  const lastRows = D.base.filter(r => mvMonthKey(r.date) === F.lastK); let lr = 0;
  const last = days.map(d => { lr += mvSum(lastRows.filter(r => r.date.getDate() === d), 'net'); return lr; });
  mvChart(id + '_fcd', { type: 'line', data: { labels: days.map(String), datasets: [
      { label: 'Actual', data: act, borderColor: col, backgroundColor: col + '22', fill: true, tension: .25, pointRadius: 0, borderWidth: 2.5 },
      { label: 'Projected', data: proj, borderColor: '#F6A623', borderDash: [6, 4], tension: .25, pointRadius: 0, borderWidth: 2 },
      { label: 'Last month', data: last, borderColor: '#A4A2C0', tension: .25, pointRadius: 0, borderWidth: 1.5 }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, title: { display: true, text: 'Day of month', color: THEME.inkDim } }, y: mvY() }, plugins: { datalabels: { display: false }, tooltip: { callbacks: { label: c => c.raw === null ? '' : `${c.dataset.label}: ${fmtINR(c.raw)}` } } } } });
  const dn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ord = [1, 2, 3, 4, 5, 6, 0];
  mvChart(id + '_fcw', { type: 'bar', data: { labels: dn, datasets: [{ label: 'Average net sales', data: ord.map(i => F.wAvg[i]), backgroundColor: col, borderRadius: 6 }] },
    options: { scales: { x: { grid: { display: false } }, y: mvY() }, plugins: { legend: { display: false }, datalabels: mvLabels() } } });
}

/* ---------------- Delhi Offline: extra customer KPIs (appended to the existing KPI row) ---------------- */
function mvOfflineExtraKpis(){
  if(!ALL_ROWS.length || typeof registerDrill !== 'function') return '';
  const D = mvOfflineData(), C = mvCustomers(D), Cp = mvPrevCustomers(D), R = mvCustRows(C, D);
  const pick = (list, src) => { const k = new Set(list.map(c => c.key)); return src.filter(r => k.has(mvKey(r))); };
  const dec = D.prev.length ? C.list.filter(c => c.prev.net > 0 && c.cur.net < c.prev.net) : [], inc = D.prev.length ? C.list.filter(c => c.prev.net > 0 && c.cur.net > c.prev.net) : [];
  const one = C.list.filter(c => c.life.inv === 1), diff = Cp ? C.repeatRate - Cp.repeatRate : null;
  const since = D.P.all ? D.hist : D.hist.filter(r => r.date >= D.P.prevStart);
  const tiles = [
    { l: 'Repeat customer rate', i: '↻', v: fmtPct(C.repeatRate), s: `${fmtNum(C.repeatCount)} with 2+ orders` + (diff === null ? '' : ` · <span class="mv-g ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} pts</span>`), a: 'var(--indigo-2)', d: registerDrill('Invoices of repeat customers', R.rep) },
    { l: 'Avg orders per customer', i: '#', v: C.avgOrders.toFixed(2), s: `AOV ${fmtINR(C.aov)}` + (Cp ? ` · ${mvGrowth(mvPct(C.avgOrders, Cp.avgOrders))}` : ''), a: 'var(--orange)', d: registerDrill('Orders in the selected period', R.active) },
    { l: 'Growing customers', i: '▲', v: D.prev.length ? fmtNum(inc.length) : '—', s: D.prev.length ? `+${fmtINR(inc.reduce((s, c) => s + c.cur.net - c.prev.net, 0))} vs previous` : 'Pick a period to compare', a: 'var(--good)', d: D.prev.length ? registerDrill('Growing customers — this and previous period', pick(inc, since)) : '' },
    { l: 'Declining customers', i: '▼', v: D.prev.length ? fmtNum(dec.length) : '—', s: D.prev.length ? `−${fmtINR(dec.reduce((s, c) => s + c.prev.net - c.cur.net, 0))} vs previous` : 'Pick a period to compare', a: 'var(--coral)', d: D.prev.length ? registerDrill('Declining customers — this and previous period', pick(dec, since)) : '' },
    { l: 'Inactive customers', i: '⏸', v: fmtNum(C.inactive), s: `no order in ${dashCfg().customer.inactiveDays}+ days · ${fmtINR(C.segs['Lost'].life)} lifetime`, a: 'var(--ink-dim2)', d: registerDrill('Inactive customers — all their invoices', R.lost) },
    { l: 'One-time buyers', i: '1', v: fmtPct(C.list.length ? one.length / C.list.length * 100 : 0), s: `${fmtNum(one.length)} customers ordered once`, a: 'var(--sky)', d: registerDrill('One-time buyers — their invoice', pick(one, D.hist)) }
  ];
  return tiles.map(c => `<div class="kpi ${c.d ? 'clickable' : ''}" style="--accent:${c.a}" ${c.d ? `data-drill="${c.d}"` : ''}><div class="kpi-head"><span>${c.l}</span><i>${c.i}</i></div><div class="val">${c.v}</div><div class="sub">${c.s}</div></div>`).join('');
}
function mvOfflineData(){
  const base = baseFiltered(ALL_ROWS), win = periodWindow();
  let latest = new Date(0); for(const r of base) if(r.date > latest) latest = r.date;
  if(!latest.getTime()) latest = new Date();
  let P;
  if(win.isAll) P = { all: true, label: 'All time', end: mvEnd(latest) };
  else { const len = win.end - win.start, pe = new Date(win.start.getTime() - 1); P = { start: win.start, end: win.end, prevStart: new Date(pe.getTime() - len), prevEnd: pe, label: (document.getElementById('periodDesc').textContent || '').replace(/^Showing /, ''), prevLabel: 'the previous period' }; }
  return { base, cur: currentRows(), prev: P.all ? [] : base.filter(r => r.date >= P.prevStart && r.date <= P.prevEnd), hist: P.all ? base : base.filter(r => r.date <= P.end), P, latest };
}
