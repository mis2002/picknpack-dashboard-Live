/* =====================================================================
   qa.js — Ask: questions in English or Hinglish, answered from the loaded invoices.
   Built-in engine (runs in the browser, no data leaves the dashboard).
   Answers: KPI, table, chart, customer/salesperson/pincode lists, links to the right dashboard.
   ===================================================================== */

const QA_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const QA_MON3 = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
let QA_PAGE_LOCS = null;          // default locations for this page (set by the page)
let QA_OPEN = false;

function qaHas(q, re){ return re.test(q); }
function qaParse(raw){
  const q = ' ' + String(raw || '').toLowerCase().replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const en = enabledLocs();
  // locations
  let locs = [];
  const want = (code, re) => { const l = en.find(x => x.code === code); if(l && re.test(q)) locs.push(l.key); };
  want('offline', /offline|head branch|mundka offline/);
  want('online', /online|e-?com|website|web site|shopsy|marketplace/);
  want('gujarat', /gujarat|gujrat|\bgj\b|surat/);
  want('karnataka', /karnataka|bangalore|bengaluru/);
  const allWords = /\b(all|sab|sabhi|overall|combined|total business|summary|poore business|har location|location wise|by location|kis location|which location|best (performing )?location|compare locations)\b/;
  if(!locs.length && allWords.test(q)) locs = en.map(l => l.key);
  if(!locs.length) locs = (QA_PAGE_LOCS && QA_PAGE_LOCS.length ? QA_PAGE_LOCS : en.map(l => l.key)).filter(k => en.some(l => l.key === k));
  // top N
  const nm = q.match(/top\s*(\d{1,3})|(\d{1,3})\s*(customers?|clients?|pincodes?|pin codes?|salesperson|sales persons?|states?)/);
  const n = nm ? Math.min(100, Number(nm[1] || nm[2])) : 10;
  // period
  let period = { preset: 'fy' }, pset = false;
  const P = (preset, extra) => { period = Object.assign({ preset }, extra || {}); pset = true; };
  if(/\b(today|aaj)\b/.test(q)) P('day', { offset: 0 });
  else if(/\b(yesterday|kal)\b/.test(q)) P('day', { offset: 1 });
  else if(/(this|is|iss) (week|hafte|hafta)/.test(q)) P('week', { offset: 0 });
  else if(/(last|pichh?le|previous) (week|hafte|hafta)/.test(q)) P('week', { offset: 1 });
  else if(/(this|is|iss) (month|mahine|mahina)/.test(q)) P('thisMonth');
  else if(/(last|pichh?le|previous) (month|mahine|mahina)/.test(q)) P('lastMonth');
  else if(/(last )?7 (days|din)/.test(q)) P('last7');
  else if(/(last )?30 (days|din)/.test(q)) P('last30');
  else if(/(last )?3 (months|mahine)/.test(q)) P('last3');
  else if(/(this|is|iss) (year|saal)|financial year|\bfy\b/.test(q)) P('fy');
  else if(/all time|ab tak|shuru se|since start/.test(q)) P('all');
  else { const mi = QA_MONTHS.findIndex(m => q.includes(' ' + m)); const m3 = mi >= 0 ? mi : QA_MON3.findIndex(m => new RegExp('\\b' + m + '\\b').test(q)); if(m3 >= 0) P('month', { month: m3 }); }
  // intent (order matters)
  let intent = 'totalsales';
  if(/product|item|sku|kaunsa maal|which bag|kaunsa bag/.test(q)) intent = 'product';
  else if(/sales ?person|salesman|sales executive|sales team|kaun (sa )?(banda|executive)|top seller|staff/.test(q)) intent = 'salesperson';
  else if(/pin ?codes?|\bpin\b|pincode/.test(q)) intent = 'pincode';
  else if(/\bstates?\b|rajya|region wise|state wise/.test(q)) intent = 'state';
  else if(/risk|khatre/.test(q)) intent = 'atrisk';
  else if(/inactive|lost customers|band ho gaye|nahi aaye|not ordered|order nahi|chup/.test(q)) intent = 'inactive';
  else if(/declin|decreas|gir rah|kam ho rah|drop|ghat/.test(q)) intent = 'declining';
  else if(/(new|naye|naya).*(repeat|purane|returning)|(repeat|purane|returning).*(new|naye|naya)/.test(q)) intent = 'newrepeat';
  else if(/customer growth|customers? (badh|grow)|growing customers|fastest growing|badh rahe/.test(q)) intent = 'custgrowth';
  else if(/\b(new|naye|naya|first time|pehli baar)\b/.test(q) && /customer|client|grahak/.test(q)) intent = 'newcust';
  else if(/repeat|returning|dobara|purane customer|loyal/.test(q)) intent = 'repeat';
  else if(/(best|highest|top|sabse (zyada|jyada|achhi)).*(location|branch)|(location|branch).*(best|highest|sabse)|kis location|which location/.test(q)) intent = 'bestloc';
  else if(/by location|location wise|har location|compare/.test(q)) intent = 'byloc';
  else if(/growth|badh|increase|vs last|comparison/.test(q)) intent = 'salesgrowth';
  else if(/trend|monthly|mahine wise|month wise|graph|chart/.test(q)) intent = 'trend';
  else if(/customer|client|grahak|buyer|party|parties/.test(q)) intent = 'topcust';
  const metric = /order|invoice|bill count|kitne order/.test(q) ? 'orders' : /aov|average order|avg order/.test(q) ? 'aov' : 'sales';
  return { intent, locs, n, period, pset, metric, q: raw };
}
/* period → start/end using the latest invoice as "today" */
function qaWindow(p, rows){
  let latest = new Date(0); for(const r of rows) if(r.date > latest) latest = r.date;
  if(!latest.getTime()) latest = new Date();
  if(p.preset === 'day'){ const d = mvDay(new Date(latest.getTime() - p.offset * MV_DAY)); return { start: d, end: mvEnd(d), prevStart: new Date(d.getTime() - MV_DAY), prevEnd: new Date(d.getTime() - 1), label: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }), prevLabel: 'the day before', latest }; }
  if(p.preset === 'week'){ const d = mvDay(latest); d.setDate(d.getDate() - (d.getDay() + 6) % 7 - 7 * p.offset); const e = mvEnd(new Date(d.getTime() + 6 * MV_DAY)); return { start: d, end: e, prevStart: new Date(d.getTime() - 7 * MV_DAY), prevEnd: new Date(d.getTime() - 1), label: `Week ${mvFmtD(d)} – ${mvFmtD(e)}`, prevLabel: 'the week before', latest }; }
  if(p.preset === 'month'){ let y = latest.getFullYear(); if(p.month > latest.getMonth()) y--; const s = new Date(y, p.month, 1), e = mvEnd(new Date(y, p.month + 1, 0)); return { start: s, end: e, prevStart: new Date(y, p.month - 1, 1), prevEnd: new Date(s.getTime() - 1), label: s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), prevLabel: 'the month before', latest }; }
  const P = mvPeriod(p.preset, null, latest); P.latest = latest; return P;
}
function qaData(parse){
  const locs = parse.locs, multi = locs.length > 1;
  let base = (RAW_ROWS || []).filter(r => locs.indexOf(r.location) >= 0);
  if(multi) base = base.filter(r => !MV_TRANSFER.test(r.customer));
  const P = qaWindow(parse.period, base);
  const cur = P.all ? base : base.filter(r => r.date >= P.start && r.date <= P.end);
  const prev = P.all ? [] : base.filter(r => r.date >= P.prevStart && r.date <= P.prevEnd);
  const hist = P.all ? base : base.filter(r => r.date <= P.end);
  return { base, cur, prev, hist, P, latest: P.latest };
}
function qaLink(parse, tab){
  const l = parse.locs.length === 1 ? locByKey(parse.locs[0]) : null;
  const page = l ? l.page : 'summary.html';
  const t = (l && l.code === 'offline') ? { sales: 'main', customers: 'customers', geo: 'customers', scoring: 'scoring' }[tab] || 'main' : tab;
  return `${page}#${t}`;
}
function qaTable(head, rows){ return `<div class="table-scroll"><table class="qa-table"><thead><tr>${head.map(h => `<th${h.r ? ' style="text-align:right"' : ''}>${h.l}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty-note">Nothing found.</td></tr>`}</tbody></table></div>`; }
const qaR = v => `<td style="text-align:right">${v}</td>`;

function qaAnswer(raw){
  const p = qaParse(raw);
  if(!p.locs.length) return { title: 'No location available', html: '<p>All locations are turned off in Settings.</p>' };
  const D = qaData(p), where = p.locs.map(locName).join(' + '), sub = `${where} · ${D.P.label}`;
  const net = mvSum(D.cur, 'net');
  const kpi = (l, v, s) => `<div class="qa-kpi"><span>${l}</span><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
  let title, html = '', chart = null, tab = 'sales';
  if(!D.base.length) return { title: 'No data', sub, html: `<p>There are no invoices for ${escAttr(where)} yet.</p>` };
  switch(p.intent){
    case 'product':
      title = 'Top products'; html = `<p>Product / item data is not part of the synced invoices (only invoice totals are available), so product rankings cannot be calculated reliably. Once item-level data is added, this answer can show it.</p>`; break;
    case 'salesperson': {
      title = 'Top salespersons';
      const own = D.cur.filter(mvIsPersonSale), ownNet = mvSum(own, 'net');
      const sp = {}; own.forEach(r => { const o = sp[r.salesperson] || (sp[r.salesperson] = { s: r.salesperson, net: 0, inv: 0, k: new Set(), rows: [] }); o.net += r.net; o.inv++; const k = mvKey(r); if(k) o.k.add(k); o.rows.push(r); });
      const list = Object.values(sp).sort((a, b) => b.net - a.net);
      if(list.length) html = `<p><b>${escAttr(list[0].s)}</b> has the highest sales: <b>${fmtINR(list[0].net)}</b> (${fmtPct(ownNet ? list[0].net / ownNet * 100 : 0)} of salesperson sales). Company accounts and orders booked under the company name (e.g. all Delhi Online orders) are left out, as in MIS scoring.</p>`;
      else html = `<p>No salesperson sales in this selection — orders here are booked under the company name.</p>`;
      html += qaTable([{ l: '#' }, { l: 'Salesperson' }, { l: 'Sales', r: 1 }, { l: 'Share', r: 1 }, { l: 'Orders', r: 1 }, { l: 'Customers', r: 1 }], list.slice(0, p.n).map((o, i) => `<tr class="clickable" data-mvdrill="${mvReg(o.s + ' — invoices', o.rows, D.P.label)}"><td>${i + 1}</td><td class="name">${escAttr(o.s)}</td>${qaR(money(o.net))}${qaR(fmtPct(ownNet ? o.net / ownNet * 100 : 0))}${qaR(fmtNum(o.inv))}${qaR(fmtNum(o.k.size))}</tr>`));
      chart = { type: 'bar', labels: list.slice(0, 8).map(o => o.s), data: list.slice(0, 8).map(o => o.net) }; tab = p.locs.length === 1 && locByKey(p.locs[0]).code === 'offline' ? 'scoring' : 'sales'; break; }
    case 'pincode': case 'state': {
      const G = mvGeo(D), list = p.intent === 'pincode' ? G.pins : G.states.filter(s => s.k !== 'Not given');
      title = p.intent === 'pincode' ? 'Top pincodes' : 'Top states';
      html = qaTable([{ l: '#' }, { l: p.intent === 'pincode' ? 'Pincode' : 'State' }, p.intent === 'pincode' ? { l: 'City' } : null, { l: 'Sales', r: 1 }, { l: 'Share', r: 1 }, { l: 'Orders', r: 1 }, { l: 'Customers', r: 1 }].filter(Boolean),
        list.slice(0, p.n).map((o, i) => { const info = p.intent === 'pincode' && mvHasPins() ? pinInfo(o.k) : null; return `<tr class="clickable" data-mvdrill="${mvReg(o.k + ' — invoices', o.rows, D.P.label)}"><td>${i + 1}</td><td class="name">${escAttr(o.k)}</td>${p.intent === 'pincode' ? `<td>${escAttr((info && info.city) || o.state || '')}</td>` : ''}${qaR(money(o.net))}${qaR(fmtPct(G.total ? o.net / G.total * 100 : 0))}${qaR(fmtNum(o.inv))}${qaR(fmtNum(o.cust))}</tr>`; }));
      chart = { type: 'bar', labels: list.slice(0, 8).map(o => o.k), data: list.slice(0, 8).map(o => o.net) }; tab = 'geo'; break; }
    case 'atrisk': case 'inactive': case 'declining': case 'custgrowth': case 'newcust': case 'repeat': case 'newrepeat': case 'topcust': {
      const C = mvCustomers(D); tab = 'customers';
      const val = c => D.P.all ? c.life.net : c.cur.net, ord = c => D.P.all ? c.life.inv : c.cur.inv;
      let list, head = [{ l: '#' }, { l: 'Customer' }, { l: 'Segment' }, { l: 'Sales', r: 1 }, { l: 'Orders', r: 1 }, { l: 'Lifetime', r: 1 }, { l: 'Last order' }], extra = '';
      const cells = (c, i) => `<tr class="clickable" data-mvdrill="${mvReg(c.name, D.base.filter(r => mvKey(r) === c.key))}"><td>${i + 1}</td><td class="name">${escAttr(c.name)}</td><td><span class="seg-pill sm" style="--c:${MV_SEG_COLOR[c.segment]}">${c.segment}</span></td>${qaR(money(val(c)))}${qaR(fmtNum(ord(c)))}${qaR(money(c.life.net))}<td>${mvFmtD(c.last)}</td></tr>`;
      if(p.intent === 'atrisk'){ title = 'At-risk customers'; list = C.segs['At risk'].list.slice().sort((a, b) => b.life.net - a.life.net); extra = `<p><b>${fmtNum(list.length)}</b> customers are overdue compared with their usual reorder gap, worth <b>${fmtINR(C.segs['At risk'].life)}</b> in lifetime sales. Call the biggest ones first.</p>`; }
      else if(p.intent === 'inactive'){ title = 'Inactive customers'; list = C.segs['Lost'].list.concat(C.segs['Needs attention'].list).sort((a, b) => b.life.net - a.life.net); extra = `<p><b>${fmtNum(C.segs['Lost'].n)}</b> customers have not ordered in ${dashCfg().customer.inactiveDays}+ days and <b>${fmtNum(C.segs['Needs attention'].n)}</b> have been quiet for ${dashCfg().customer.activeDays}–${dashCfg().customer.inactiveDays} days.</p>`; }
      else if(p.intent === 'declining' || p.intent === 'custgrowth'){
        if(!D.prev.length){ title = p.intent === 'declining' ? 'Declining customers' : 'Fastest growing customers'; html = `<p>Ask for a specific period to compare, for example "declining customers this month" or "customer growth last month".</p>`; break; }
        const dec = p.intent === 'declining';
        title = dec ? 'Customers with declining sales' : 'Fastest growing customers';
        list = C.list.filter(c => c.prev.net > 0 && (dec ? c.cur.net < c.prev.net : c.cur.net > c.prev.net)).sort((a, b) => dec ? (a.cur.net - a.prev.net) - (b.cur.net - b.prev.net) : (b.cur.net - b.prev.net) - (a.cur.net - a.prev.net));
        head = [{ l: '#' }, { l: 'Customer' }, { l: 'This period', r: 1 }, { l: 'Previous', r: 1 }, { l: 'Change', r: 1 }, { l: 'Last order' }];
        html = `<p><b>${fmtNum(list.length)}</b> customers ${dec ? 'bought less' : 'bought more'} than in ${escAttr(D.P.prevLabel)}.</p>` + qaTable(head, list.slice(0, p.n).map((c, i) => `<tr class="clickable" data-mvdrill="${mvReg(c.name, D.base.filter(r => mvKey(r) === c.key))}"><td>${i + 1}</td><td class="name">${escAttr(c.name)}</td>${qaR(money(c.cur.net))}${qaR(money(c.prev.net))}${qaR(mvGrowth(c.growth))}<td>${mvFmtD(c.last)}</td></tr>`));
        break; }
      else if((p.intent === 'newcust' || p.intent === 'newrepeat') && C.newUnknown){ title = p.intent === 'newcust' ? 'New customers' : 'New vs repeat customers';
        html = `<p>Customer history starts on <b>${mvFmtD(C.dataStart)}</b>, so everyone in ${escAttr(D.P.label)} would look new. Ask for a later period, for example "new customers this month".</p><div class="qa-kpis">${kpi('Customers', fmtNum(C.total))}${kpi('Repeat (2+ orders)', fmtNum(C.repeatCount), fmtPct(C.repeatRate))}${kpi('Repeat sales share', fmtPct(C.repeatSales))}</div>`; break; }
      else if(p.intent === 'newcust'){ title = 'New customers'; list = C.active.filter(c => c.isNew).sort((a, b) => val(b) - val(a)); extra = `<div class="qa-kpis">${kpi('New customers', fmtNum(C.newCount), fmtPct(C.newPct) + ' of customers')}${kpi('Their sales', fmtPct(C.newSales), 'of sales')}${kpi('All customers', fmtNum(C.total))}</div>`; }
      else if(p.intent === 'repeat'){ title = 'Repeat customers'; list = C.active.filter(c => c.repeat).sort((a, b) => b.life.inv - a.life.inv || b.life.net - a.life.net); extra = `<div class="qa-kpis">${kpi('Repeat customers', fmtNum(C.repeatCount), fmtPct(C.repeatRate) + ' repeat rate')}${kpi('Their sales', fmtPct(C.repeatSales), 'of sales')}${kpi('One-time buyers', fmtNum(C.list.filter(c => c.life.inv === 1).length))}</div>`; }
      else if(p.intent === 'newrepeat'){ title = 'New vs repeat customers';
        html = `<div class="qa-kpis">${kpi('Customers', fmtNum(C.total))}${kpi('New', fmtNum(C.newCount), fmtPct(C.newPct))}${kpi('Returning', fmtNum(C.returning), fmtPct(100 - C.newPct))}${kpi('Repeat (2+ orders)', fmtNum(C.repeatCount), fmtPct(C.repeatRate))}${kpi('Repeat sales share', fmtPct(C.repeatSales))}</div>`;
        chart = { type: 'doughnut', labels: ['New', 'Returning'], data: [C.newCount, C.returning] }; break; }
      else { title = p.metric === 'orders' ? 'Top customers by orders' : p.metric === 'aov' ? 'Customers with the highest order value' : 'Top customers by sales';
        list = p.metric === 'orders' ? C.active.slice().sort((a, b) => ord(b) - ord(a)) : p.metric === 'aov' ? C.active.filter(c => ord(c) >= 2).sort((a, b) => val(b) / ord(b) - val(a) / ord(a)) : C.active.slice().sort((a, b) => val(b) - val(a));
        extra = `<p>Top ${Math.min(p.n, list.length)} of ${fmtNum(C.total)} customers bring <b>${fmtPct(C.curNet ? list.slice(0, p.n).reduce((s, c) => s + val(c), 0) / C.curNet * 100 : 0)}</b> of sales.</p>`;
        chart = { type: 'bar', labels: list.slice(0, 8).map(c => c.name.slice(0, 22)), data: list.slice(0, 8).map(c => p.metric === 'orders' ? ord(c) : val(c)), count: p.metric === 'orders' }; }
      html = extra + qaTable(head, list.slice(0, p.n).map(cells));
      break; }
    case 'bestloc': case 'byloc': {
      const locs = p.locs.length > 1 ? p.locs : enabledLocs().map(l => l.key);
      const D2 = qaData(Object.assign({}, p, { locs })), n2 = mvSum(D2.cur, 'net');
      const L = locs.map(l => { const r = D2.cur.filter(x => x.location === l), pr = D2.prev.filter(x => x.location === l); return { l, net: mvSum(r, 'net'), inv: r.length, cust: new Set(r.map(mvKey).filter(Boolean)).size, g: D2.prev.length ? mvPct(mvSum(r, 'net'), mvSum(pr, 'net')) : undefined, rows: r }; }).sort((a, b) => b.net - a.net);
      title = p.intent === 'bestloc' ? 'Best performing location' : 'Sales by location';
      html = (p.intent === 'bestloc' && L[0] ? `<p><b>${escAttr(locName(L[0].l))}</b> had the highest sales in ${escAttr(D2.P.label)}: <b>${fmtINR(L[0].net)}</b> (${fmtPct(n2 ? L[0].net / n2 * 100 : 0)} of ${fmtINR(n2)}).</p>` : '') +
        qaTable([{ l: 'Location' }, { l: 'Sales', r: 1 }, { l: 'Share', r: 1 }, { l: 'Orders', r: 1 }, { l: 'Customers', r: 1 }, { l: 'Growth', r: 1 }], L.map(x => `<tr class="clickable" data-mvdrill="${mvReg(locName(x.l) + ' — invoices', x.rows, D2.P.label)}"><td class="name">${mvTag(x.l)}</td>${qaR(money(x.net))}${qaR(fmtPct(n2 ? x.net / n2 * 100 : 0))}${qaR(fmtNum(x.inv))}${qaR(fmtNum(x.cust))}${qaR(x.g === undefined ? '—' : mvGrowth(x.g))}</tr>`));
      chart = { type: 'bar', labels: L.map(x => locName(x.l)), data: L.map(x => x.net), colors: L.map(x => locColor(x.l)) };
      return { title, sub: `${locs.map(locName).join(' + ')} · ${D2.P.label} · internal transfers excluded`, html, chart, link: 'summary.html#sales' }; }
    case 'salesgrowth': {
      title = 'Sales growth';
      if(D.P.all){ const D2 = qaData(Object.assign({}, p, { period: { preset: 'thisMonth' } })); return qaGrowthAnswer(D2, p, where); }
      return qaGrowthAnswer(D, p, where); }
    case 'trend': {
      title = 'Sales trend';
      const src = D.P.all || (D.P.end - D.P.start) > 70 * MV_DAY ? D.hist : D.cur, monthly = src === D.hist || (D.P.end - D.P.start) > 62 * MV_DAY;
      const keyOf = r => monthly ? mvMonthKey(r.date) : mvDay(r.date).getTime();
      const m = {}; src.forEach(r => { const k = keyOf(r); m[k] = (m[k] || 0) + r.net; });
      const ks = Object.keys(m).sort((a, b) => monthly ? (a < b ? -1 : 1) : a - b).slice(-18);
      chart = { type: 'line', labels: ks.map(k => monthly ? mvMonthLabel(k) : new Date(Number(k)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })), data: ks.map(k => m[k]) };
      const best = ks.slice().sort((a, b) => m[b] - m[a])[0];
      html = `<p>${monthly ? 'Monthly' : 'Daily'} net sales for ${escAttr(where)}. Best ${monthly ? 'month' : 'day'}: <b>${monthly ? mvMonthLabel(best) : new Date(Number(best)).toLocaleDateString('en-GB')}</b> with ${fmtINR(m[best])}.</p>`; break; }
    default: {
      title = 'Total sales';
      const inv = D.cur.length, pn = mvSum(D.cur, 'pnet'), pr = mvSum(D.cur, 'profit'), pNet = mvSum(D.prev, 'net');
      html = `<div class="qa-kpis">${kpi('Net sales (excl. GST)', fmtINR(net), D.prev.length ? `${mvPct(net, pNet) === null ? 'new' : (mvPct(net, pNet) >= 0 ? '▲ ' : '▼ ') + Math.abs(mvPct(net, pNet)).toFixed(1) + '%'} vs ${escAttr(D.P.prevLabel)}` : '')}${kpi('Gross (incl. GST)', fmtINR(mvSum(D.cur, 'total')))}${kpi('Orders', fmtNum(inv))}${kpi('Customers', fmtNum(new Set(D.cur.map(mvKey).filter(Boolean)).size))}${kpi('Average order value', fmtINR(inv ? net / inv : 0))}${pn > 0 ? kpi('Profit', fmtINR(pr), fmtPct(pr / pn * 100) + ' margin') : ''}</div>`;
      if(p.locs.length > 1){ const L = p.locs.map(l => ({ l, net: mvSum(D.cur.filter(r => r.location === l), 'net') })); chart = { type: 'bar', labels: L.map(x => locName(x.l)), data: L.map(x => x.net), colors: L.map(x => locColor(x.l)) }; }
    }
  }
  return { title, sub, html, chart, link: qaLink(p, tab) };
}
function qaGrowthAnswer(D, p, where){
  const net = mvSum(D.cur, 'net'), pn = mvSum(D.prev, 'net'), g = mvPct(net, pn);
  const html = `<div class="qa-kpis"><div class="qa-kpi"><span>${escAttr(D.P.label)}</span><b>${fmtINR(net)}</b></div><div class="qa-kpi"><span>${escAttr(D.P.prevLabel)}</span><b>${fmtINR(pn)}</b></div><div class="qa-kpi"><span>Growth</span><b>${g === null ? 'new' : (g >= 0 ? '▲ ' : '▼ ') + Math.abs(g).toFixed(1) + '%'}</b></div></div>
    <p>Orders: ${fmtNum(D.cur.length)} vs ${fmtNum(D.prev.length)}. Customers: ${fmtNum(new Set(D.cur.map(mvKey).filter(Boolean)).size)} vs ${fmtNum(new Set(D.prev.map(mvKey).filter(Boolean)).size)}.</p>`;
  return { title: 'Sales growth', sub: `${where} · ${D.P.label}`, html, chart: { type: 'bar', labels: [D.P.prevLabel, D.P.label], data: [pn, net] }, link: qaLink(p, 'sales') };
}

/* ---------------- drawer UI ---------------- */
function qaMount(){
  if(document.getElementById('qaDrawer')) return;
  const qs = (dashCfg().qa.questions || []).slice(0, 14);
  const d = document.createElement('div'); d.id = 'qaDrawer'; d.className = 'qa-drawer';
  d.innerHTML = `<div class="qa-head"><div><h3>Ask</h3><p class="muted">Ask in English or Hinglish, e.g. "Gujarat me top 10 customers dikhao"</p></div><button class="modal-close" id="qaClose" aria-label="Close">✕</button></div>
    <div class="qa-input"><input id="qaInput" placeholder="Type a question…" autocomplete="off"><button class="refresh-btn" id="qaSend">Ask</button></div>
    <div class="qa-suggest">${qs.map(q => `<button data-qa="${escAttr(q)}">${escAttr(q)}</button>`).join('')}</div>
    <div class="qa-answers" id="qaAnswers"><div class="qa-empty">Answers use the invoices loaded in this dashboard. Try one of the questions above.</div></div>`;
  document.body.appendChild(d);
  const ask = () => { const v = document.getElementById('qaInput').value.trim(); if(v) qaAsk(v); };
  d.querySelector('#qaSend').addEventListener('click', ask);
  d.querySelector('#qaInput').addEventListener('keydown', e => { if(e.key === 'Enter') ask(); });
  d.querySelector('#qaClose').addEventListener('click', () => qaToggle(false));
  d.addEventListener('click', e => { const b = e.target.closest('[data-qa]'); if(b){ document.getElementById('qaInput').value = b.dataset.qa; qaAsk(b.dataset.qa); } });
}
function qaToggle(show){
  if(!dashCfg().qa.enabled) return;
  qaMount(); QA_OPEN = show === undefined ? !QA_OPEN : show;
  document.getElementById('qaDrawer').classList.toggle('open', QA_OPEN);
  if(QA_OPEN) setTimeout(() => document.getElementById('qaInput').focus(), 150);
}
let QA_N = 0;
function qaAsk(q){
  const box = document.getElementById('qaAnswers');
  const empty = box.querySelector('.qa-empty'); if(empty) empty.remove();
  if(!RAW_ROWS || !RAW_ROWS.length){ box.insertAdjacentHTML('afterbegin', `<div class="qa-card"><div class="qa-q">${escAttr(q)}</div><p>Data is still loading. Please try again in a moment.</p></div>`); return; }
  let a; try { a = qaAnswer(q); } catch(e){ console.error(e); a = { title: 'Sorry', html: '<p>I could not answer that. Try rephrasing, for example "top 10 customers this month".</p>' }; }
  const id = 'qaChart' + (++QA_N);
  box.insertAdjacentHTML('afterbegin', `<div class="qa-card"><div class="qa-q">${escAttr(q)}</div><h4>${escAttr(a.title || '')}</h4>${a.sub ? `<div class="qa-sub">${escAttr(a.sub)}</div>` : ''}
    ${a.chart ? `<div class="chart-box" style="height:${a.chart.type === 'doughnut' ? 190 : 210}px"><div class="chart-inner"><canvas id="${id}"></canvas></div></div>` : ''}${a.html || ''}
    ${a.link ? `<a class="qa-link" href="${a.link}">Open in dashboard →</a>` : ''}</div>`);
  if(a.chart){
    const c = a.chart, isMoney = !c.count && c.type !== 'doughnut';
    mvChart(id, { type: c.type, data: { labels: c.labels, datasets: [{ data: c.data, backgroundColor: c.colors || (c.type === 'doughnut' ? ['#1FB286', '#6C5CE7'] : '#6C5CE7'), borderColor: '#6C5CE7', borderRadius: c.type === 'bar' ? 6 : 0, fill: c.type === 'line', tension: .3, pointRadius: 2 }] },
      options: { indexAxis: c.type === 'bar' && c.labels.length > 4 ? 'y' : 'x', scales: c.type === 'doughnut' ? {} : { x: { grid: { display: false }, ticks: c.type === 'bar' && c.labels.length > 4 && isMoney ? { callback: v => fmtINRShort(v) } : {} }, y: c.type === 'bar' && c.labels.length > 4 ? { grid: { display: false } } : (isMoney ? mvY() : { beginAtZero: true }) },
        plugins: { legend: { display: c.type === 'doughnut' }, datalabels: c.type === 'line' ? { display: false } : { display: true, anchor: c.type === 'doughnut' ? 'center' : 'end', align: c.type === 'doughnut' ? 'center' : 'end', color: c.type === 'doughnut' ? '#fff' : '#1E1B4B', font: { size: 10, weight: 700 }, formatter: v => isMoney ? fmtINRShort(v) : fmtNum(v), clamp: true, clip: false } } } });
  }
}
