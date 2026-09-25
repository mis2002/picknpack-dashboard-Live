/* =====================================================================
   interact.js — makes every page clickable, searchable and exportable
   • Invoice drill-down popup (from any chart bar / slice / KPI / insight)
   • Salesperson profile popup (from any salesperson row or chart)
   • CSV export for every table + raw invoice export
   • Search box on tables, quick date filters, central click handling
   ===================================================================== */

let GROWTH_CTX = null;
const DRILLS = new Map();               // id → { title, rows, sub }
let drillSeq = 0;
function registerDrill(title, rows, sub){
  const id = 'd' + (++drillSeq);
  DRILLS.set(id, { title, rows, sub });
  if(DRILLS.size > 600) DRILLS.delete(DRILLS.keys().next().value);
  return id;
}

/* ---------------- modal stacking (popups can open on top of popups) ---------------- */
let MODAL_Z = 0;
function showModal(id){
  const el = document.getElementById(id);
  el.style.zIndex = 1000 + (++MODAL_Z);
  el.style.display = 'flex';
}
function closeTopModal(){
  const open = [...document.querySelectorAll('.modal-overlay')].filter(m=>m.style.display==='flex');
  if(!open.length) return;
  open.sort((a,b)=>(+b.style.zIndex||0)-(+a.style.zIndex||0))[0].style.display = 'none';
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeTopModal(); });

/* ---------------- CSV helpers ---------------- */
function csvCell(v){ const s = v===null||v===undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
function downloadCSV(filename, lines){
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^\w\-. ]+/g,'').replace(/\s+/g,'-').toLowerCase() + '-' + fmtDateInput(new Date()) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
function exportRowsCSV(rows, name){
  const head = ['Invoice Date','Invoice#','Customer','Salesperson','Order Type','Place of Supply','Pin code','Amount Without Tax','Tax','Total','Profit','GP %','Company Sales','MIDAP'];
  const lines = [head.join(',')].concat(rows.map(r=>[fmtDateInput(r.date), r.invoice, r.customer, r.salesperson, r.ordertype, r.state, r.pincode,
    Math.round(r.net*100)/100, Math.round(r.tax*100)/100, Math.round(r.total*100)/100, Math.round(r.profit*100)/100,
    r.net ? (r.profit/r.net*100).toFixed(2) : '0', r.companysales, r.midap].map(csvCell).join(',')));
  downloadCSV(name, lines);
  showToast(`Exported ${fmtNum(rows.length)} invoices.`);
}
function cleanText(el){ return (el.innerText || el.textContent || '').replace(/\s+/g,' ').replace(/\s*[↑↓]\s*$/,'').trim(); }
function headerLabels(thead){
  const grid = [];
  [...thead.rows].forEach((tr, ri)=>{
    grid[ri] = grid[ri] || [];
    let ci = 0;
    [...tr.cells].forEach(th=>{
      while(grid[ri][ci] !== undefined) ci++;
      const cs = th.colSpan || 1, rs = th.rowSpan || 1, t = cleanText(th);
      for(let r=0;r<rs;r++){ grid[ri+r] = grid[ri+r] || []; for(let c=0;c<cs;c++) grid[ri+r][ci+c] = t; }
      ci += cs;
    });
  });
  const n = Math.max(0, ...grid.map(g=>g.length));
  const out = [];
  for(let c=0;c<n;c++){
    const parts = [];
    grid.forEach(g=>{ const t = g[c]; if(t && parts[parts.length-1] !== t) parts.push(t); });
    out.push(parts.join(' - '));
  }
  return out;
}
function cellValue(td){
  const v = td.querySelectorAll('[data-v]');
  if(v.length === 1) return v[0].dataset.v;             // exact rupee value, not the rounded "₹12.69 L"
  let t = cleanText(td);
  t = t.replace(/^▲\s*/,'').replace(/^▼\s*/,'-');                 // growth arrows → signed numbers
  if(/^-?[\d,]+(\.\d+)?%?$/.test(t)) t = t.replace(/,/g,'');
  return t;
}
function exportTablesCSV(tables, name){
  const lines = [];
  tables.forEach((tb, i)=>{
    if(tables.length > 1){
      const cap = tb.dataset.caption || (tb.closest('.table-scroll')?.previousElementSibling?.matches('h3') ? cleanText(tb.closest('.table-scroll').previousElementSibling) : `Table ${i+1}`);
      if(i) lines.push('');
      lines.push(csvCell(cap));
    }
    if(tb.tHead) lines.push(headerLabels(tb.tHead).map(csvCell).join(','));
    [...tb.tBodies].forEach(body=>[...body.rows].forEach(tr=>{
      if(tr.style.display === 'none' || tr.querySelector('.empty-note')) return;
      lines.push([...tr.cells].map(td=>csvCell(cellValue(td))).join(','));
    }));
  });
  downloadCSV(name, lines);
  showToast('Table exported to CSV.');
}

/* ---------------- Table tools: search box + export button on panels ---------------- */
const TABLE_TOOLS = [
  { panel:'panel-mis', search:true }, { panel:'panel-growth', search:true }, { panel:'panel-customers', search:true },
  { panel:'panel-bi-rank' }, { panel:'panel-bi-margin' }, { panel:'panel-scoring', search:true },
  { panel:'panel-cust-statetable', search:true }, { panel:'panel-cust-segtable' }, { panel:'panel-cust-risk' },
  { panel:'panel-cust-lowmargin' }, { panel:'panel-cust-pins', search:true }
];
function injectTableTools(){
  TABLE_TOOLS.forEach(cfg=>{
    const p = document.getElementById(cfg.panel);
    if(!p || p.querySelector('.panel-tools')) return;
    const head = p.querySelector('.panel-head, .mis-header');
    const titleEl = p.querySelector('h2, .mis-title');
    const box = document.createElement('div');
    box.className = 'panel-tools';
    if(cfg.search){
      const inp = document.createElement('input');
      inp.type = 'search'; inp.placeholder = 'Search…'; inp.className = 'mini-search'; inp.setAttribute('aria-label','Search this table');
      inp.addEventListener('input', ()=>applyTableSearch(p, inp.value));
      box.appendChild(inp);
    }
    const btn = document.createElement('button');
    btn.className = 'util-btn small'; btn.textContent = 'Export CSV'; btn.type = 'button';
    btn.addEventListener('click', ()=>exportTablesCSV([...p.querySelectorAll('table')], titleEl ? cleanText(titleEl) : cfg.panel));
    box.appendChild(btn);
    const toggle = head && head.querySelector(':scope > .chart-toggle, :scope > div:last-child:not(:first-child)');
    if(head){
      if(toggle && toggle !== head.firstElementChild){ const wrap = document.createElement('div'); wrap.className='panel-tools-wrap'; toggle.replaceWith(wrap); wrap.appendChild(box); wrap.appendChild(toggle); }
      else head.appendChild(box);
    } else p.insertBefore(box, p.firstChild);
  });
}
function applyTableSearch(panel, q){
  panel.dataset.q = q;
  const term = q.trim().toLowerCase();
  panel.querySelectorAll('tbody tr').forEach(tr=>{
    if(tr.classList.contains('mis-grand')) return;
    tr.style.display = !term || cleanText(tr).toLowerCase().includes(term) ? '' : 'none';
  });
}
function reapplyTableSearches(){
  document.querySelectorAll('.panel[data-q]').forEach(p=>{ if(p.dataset.q) applyTableSearch(p, p.dataset.q); });
}

/* ---------------- Quick date filters ---------------- */
function applyQuick(q){
  if(!ALL_ROWS.length) return;
  const last = ALL_ROWS[ALL_ROWS.length-1].date;
  if(q==='thisWeek'){ state.mode='WEEK'; state.weekKey = WEEKS[WEEKS.length-1].key; }
  else if(q==='lastWeek'){ state.mode='WEEK'; state.weekKey = WEEKS[Math.max(0, WEEKS.length-2)].key; }
  else if(q==='thisMonth'){ state.mode='MONTH'; state.monthKey = MONTHS[MONTHS.length-1].key; }
  else if(q==='lastMonth'){ state.mode='MONTH'; state.monthKey = MONTHS[Math.max(0, MONTHS.length-2)].key; }
  else if(q==='last30'){ state.mode='RANGE'; state.rangeStart = fmtDateInput(new Date(last.getTime()-29*DAY_MS)); state.rangeEnd = fmtDateInput(last); }
  else if(q==='fy'){ const y = last.getMonth()>=3 ? last.getFullYear() : last.getFullYear()-1; state.mode='RANGE'; state.rangeStart = `${y}-04-01`; state.rangeEnd = fmtDateInput(last); }
  else { state.mode='ALL'; }
  applyStateToUI();
  renderAll();
}
function currentQuick(){
  if(!ALL_ROWS.length) return null;
  const last = ALL_ROWS[ALL_ROWS.length-1].date;
  if(state.mode==='ALL') return 'all';
  if(state.mode==='WEEK') return state.weekKey===WEEKS[WEEKS.length-1]?.key ? 'thisWeek' : state.weekKey===WEEKS[WEEKS.length-2]?.key ? 'lastWeek' : null;
  if(state.mode==='MONTH') return state.monthKey===MONTHS[MONTHS.length-1]?.key ? 'thisMonth' : state.monthKey===MONTHS[MONTHS.length-2]?.key ? 'lastMonth' : null;
  if(state.mode==='RANGE' && state.rangeEnd===fmtDateInput(last)){
    if(state.rangeStart===fmtDateInput(new Date(last.getTime()-29*DAY_MS))) return 'last30';
    const y = last.getMonth()>=3 ? last.getFullYear() : last.getFullYear()-1;
    if(state.rangeStart===`${y}-04-01`) return 'fy';
  }
  return null;
}

/* ---------------- Invoice drill-down popup ---------------- */
const INV = { title:'', rows:[], sub:'', group:'inv', q:'', sort:'date', dir:-1, limit:100 };
function openInvoiceList(title, rows, sub){
  Object.assign(INV, { title, rows: rows||[], sub: sub||'', group:'inv', q:'', sort:'date', dir:-1, limit:100 });
  document.getElementById('invListSearch').value = '';
  document.querySelectorAll('#invListGroup button').forEach(b=>b.classList.toggle('active', b.dataset.g==='inv'));
  renderInvoiceList();
  showModal('invListOverlay');
}
function invGroups(rows, keyFn){
  const m = {};
  rows.forEach(r=>{ const k = keyFn(r) || '—';
    const g = m[k] || (m[k] = { key:k, net:0, profit:0, gross:0, invoices:0, customers:new Set() });
    g.net += r.net; g.pnet = (g.pnet||0) + r.pnet; g.profit += r.profit; g.gross += r.total; g.invoices++; g.customers.add(r.customer); });
  const tot = rows.reduce((s,r)=>s+r.net,0);
  return Object.values(m).map(g=>Object.assign(g, { custCount:g.customers.size, gp: gpOf(g), share: tot ? g.net/tot*100 : 0 }));
}
function invView(){
  const q = INV.q.trim().toLowerCase();
  let rows = INV.rows;
  if(q) rows = rows.filter(r=>[r.customer, r.invoice, r.salesperson, r.state, r.pincode, r.ordertype].join(' ').toLowerCase().includes(q));
  return rows;
}
function renderInvoiceList(){
  const all = INV.rows, rows = invView(), a = aggregateRows(rows);
  document.getElementById('invListTitle').textContent = INV.title;
  const dates = all.map(r=>r.date.getTime());
  document.getElementById('invListSub').textContent = (INV.sub ? INV.sub + ' · ' : '') +
    (all.length ? `${fmtDate(new Date(Math.min(...dates)))} to ${fmtDate(new Date(Math.max(...dates)))}` : 'No invoices');
  const sps = [...new Set(all.map(r=>r.salesperson))], custs = [...new Set(all.map(r=>r.customer))];
  document.getElementById('invListLinks').innerHTML =
    (sps.length===1 ? `<button class="util-btn small" data-open-sp="${escAttr(sps[0])}">${escAttr(sps[0])} profile →</button>` : '') +
    (custs.length===1 ? `<button class="util-btn small" data-open-cust="${escAttr(custs[0])}">${escAttr(custs[0])} profile →</button>` : '');
  const custCount = new Set(rows.map(r=>r.customer)).size;
  document.getElementById('invListKpis').innerHTML = [
    ['Net sales', fmtINR(a.net)], ['With GST', fmtINR(a.gross)], ['Profit', `${fmtINR(a.profit)} · ${fmtPct(a.gpPct)}`],
    ['Invoices', fmtNum(a.invoices)], ['Customers', fmtNum(custCount)], ['Avg invoice', fmtINR(a.avgInvoice)]
  ].map(([l,v])=>`<div class="kpi-mini"><div class="lbl">${l}</div><div class="val" style="font-size:15px">${v}</div></div>`).join('');

  const head = document.getElementById('invListHead'), body = document.getElementById('invListBody');
  const th = (k,l,right)=>`<th data-k="${k}" style="${right?'text-align:right;':''}cursor:pointer" class="${INV.sort===k?'sorted':''}">${l}${INV.sort===k?(INV.dir>0?' ↑':' ↓'):''}</th>`;
  const dir = INV.dir;
  const by = (f)=> (x,y)=>{ const a1=f(x), b1=f(y); return (a1>b1?1:a1<b1?-1:0)*dir; };
  let shown = 0, total = 0;
  if(INV.group==='inv'){
    head.innerHTML = '<tr>' + th('date','Date') + th('invoice','Invoice') + th('customer','Customer') + th('salesperson','Salesperson') + '<th>Type</th>' + th('state','State') +
      th('net','Net',1) + th('total','With GST',1) + th('profit','Profit',1) + th('gp','GP %',1) + '</tr>';
    const f = { date:r=>r.date.getTime(), invoice:r=>r.invoice, customer:r=>r.customer.toLowerCase(), salesperson:r=>r.salesperson, state:r=>r.state,
      net:r=>r.net, total:r=>r.total, profit:r=>r.profit, gp:r=>r.net?r.profit/r.net:0 }[INV.sort] || (r=>r.date.getTime());
    const list = rows.slice().sort(by(f)); total = list.length;
    const part = list.slice(0, INV.limit); shown = part.length;
    body.innerHTML = part.map(r=>`<tr class="clickable" data-cust="${escAttr(r.customer)}">
      <td>${fmtDate(r.date)}</td><td>${r.invoice||'—'}</td><td class="name" title="${escAttr(r.customer)}">${r.customer}</td><td>${r.salesperson}</td>
      <td><span class="tag ${r.ordertype.toLowerCase()}">${r.ordertype}</span></td><td>${r.state||'—'}${r.pincode?` <span class="muted">${r.pincode}</span>`:''}</td>
      <td style="text-align:right;font-weight:600">${money(r.net)}</td><td style="text-align:right">${money(r.total)}</td><td style="text-align:right">${money(r.profit)}</td>
      <td style="text-align:right;${!r.pp && r.profit<=0?'color:var(--coral);font-weight:700':''}">${r.pp ? '<span class="muted" title="Profit not entered (sales-only or pending)">pending</span>' : fmtPct(r.net?r.profit/r.net*100:0)}</td></tr>`).join('');
  } else {
    const keyFn = { cust:r=>r.customer, sp:r=>r.salesperson, state:r=>r.state || 'Not given', type:r=>r.ordertype }[INV.group];
    const label = { cust:'Customer', sp:'Salesperson', state:'State', type:'Order type' }[INV.group];
    const attr = { cust:'data-cust', sp:'data-sp', state:'', type:'' }[INV.group];
    const showCust = INV.group!=='cust';
    head.innerHTML = '<tr>' + th('key',label) + th('invoices','Invoices',1) + (showCust ? th('custCount','Customers',1) : '') + th('net','Net',1) + th('share','Share',1) + th('profit','Profit',1) + th('gp','GP %',1) + '</tr>';
    const g = invGroups(rows, keyFn);
    const f = { key:x=>String(x.key).toLowerCase(), invoices:x=>x.invoices, custCount:x=>x.custCount, net:x=>x.net, share:x=>x.share, profit:x=>x.profit, gp:x=>x.gp }[INV.sort] || (x=>x.net);
    const list = g.sort(by(f)); total = list.length;
    const part = list.slice(0, INV.limit); shown = part.length;
    body.innerHTML = part.map(x=>`<tr class="${attr?'clickable':''}" ${attr?`${attr}="${escAttr(x.key)}"`:''}>
      <td class="name" title="${escAttr(x.key)}">${x.key}</td><td style="text-align:right">${fmtNum(x.invoices)}</td>${showCust?`<td style="text-align:right">${fmtNum(x.custCount)}</td>`:''}
      <td style="text-align:right;font-weight:600">${money(x.net)}</td><td style="text-align:right">${fmtPct(x.share)}</td>
      <td style="text-align:right">${money(x.profit)}</td><td style="text-align:right">${fmtPct(x.gp)}</td></tr>`).join('');
  }
  if(!total) body.innerHTML = `<tr><td colspan="10" class="empty-note">No invoices match.</td></tr>`;
  document.getElementById('invListCount').textContent = `${fmtNum(total)} ${INV.group==='inv'?'invoices':'rows'}${total>shown?` · showing ${fmtNum(shown)}`:''}`;
  document.getElementById('invListMore').style.display = total > shown ? '' : 'none';
}
function exportInvoiceList(){
  if(INV.group==='inv') return exportRowsCSV(invView(), INV.title);
  exportTablesCSV([document.getElementById('invListTable')], `${INV.title} by ${INV.group}`);
}

/* ---------------- Salesperson profile popup ---------------- */
function openSalespersonDetail(name){
  const typeOk = r => state.ordertype==='ALL' || r.ordertype===state.ordertype;
  const base = ALL_ROWS.filter(r=>r.salesperson===name && typeOk(r));
  const rows = periodFiltered(base);
  const a = aggregateRows(rows);
  const cmp = periodCompare(base);
  const pa = aggregateRows(cmp.prev), ca = aggregateRows(cmp.cur);
  const growth = pa.net ? (ca.net-pa.net)/pa.net*100 : null;
  const peers = aggregateRows(periodFiltered(ALL_ROWS.filter(typeOk))).bySp.sort((x,y)=>y.net-x.net);
  const rank = peers.findIndex(p=>p.salesperson===name) + 1;
  const crr = aggregateRows(rows.filter(r=>r.ordertype==='CRR')), nbd = aggregateRows(rows.filter(r=>r.ordertype==='NBD'));
  const custs = invGroups(rows, r=>r.customer).sort((x,y)=>y.net-x.net);
  const statesG = invGroups(rows, r=>r.state || 'Not given').sort((x,y)=>y.net-x.net);
  const zero = rows.filter(r=>!r.pp && r.profit<=0);
  const dept = ADMIN.departments[name];

  document.getElementById('spDetailTitle').textContent = name;
  document.getElementById('spDetailAvatar').innerHTML = spPhotoHtml(name, 'sp-avatar');
  document.getElementById('spDetailMeta').innerHTML =
    `<span class="chip">${dept ? dept+' team' : 'No department set'}</span>` +
    `<span class="chip">${ADMIN.salaries[name] ? 'Salary ₹'+fmtNum(ADMIN.salaries[name]) : 'No salary set'}</span>` +
    `<span class="chip">Rank ${rank || '—'} of ${peers.length}</span>` +
    `<span class="chip">${(t=>t.charAt(0).toUpperCase()+t.slice(1))(document.getElementById('periodDesc').textContent.replace(/^Showing /,''))}</span>`;
  document.getElementById('spDetailKpis').innerHTML = [
    ['Net sales', fmtINR(a.net)], ['Profit', `${fmtINR(a.profit)} · ${fmtPct(a.gpPct)}`], ['Invoices', fmtNum(a.invoices)],
    ['Customers', fmtNum(custs.length)], ['Avg invoice', fmtINR(a.avgInvoice)],
    ['CRR / NBD', `${fmtINR(crr.net)} / ${fmtINR(nbd.net)}`],
    ['Trend', growth===null ? '—' : `${growth>=0?'▲':'▼'} ${Math.abs(growth).toFixed(1)}%`],
    ['Zero-profit invoices', `${fmtNum(zero.length)} · ${fmtINR(zero.reduce((s,r)=>s+r.net,0))}`]
  ].map(([l,v])=>`<div class="kpi-mini"><div class="lbl">${l}</div><div class="val" style="font-size:14px">${v}</div></div>`).join('');

  const notes = [];
  if(custs.length){ const t = custs[0]; notes.push({ tone: t.share>=40?'warn':'info', text:`Biggest customer <b>${t.key}</b> = ${t.share.toFixed(1)}% of ${name}'s sales${t.share>=40?' — high dependence on one account.':'.'}` }); }
  if(growth!==null) notes.push({ tone: growth>=0?'good':'bad', text:`Net sales ${growth>=0?'up':'down'} <b>${Math.abs(growth).toFixed(1)}%</b> ${cmp.label} (${fmtINR(ca.net)} vs ${fmtINR(pa.net)}).` });
  const teamGp = peers.length ? peers.reduce((s,p)=>s+p.profit,0) / Math.max(1, peers.reduce((s,p)=>s+p.net,0)) * 100 : 0;
  notes.push({ tone: a.gpPct >= teamGp ? 'good' : 'warn', text:`Margin ${fmtPct(a.gpPct)} vs team average ${fmtPct(teamGp)}.` });
  if(zero.length) notes.push({ tone:'bad', text:`<b>${fmtNum(zero.length)} invoices</b> with zero or negative profit worth ${fmtINR(zero.reduce((s,r)=>s+r.net,0))}.`, drill: registerDrill(`${name} — zero-profit invoices`, zero) });
  document.getElementById('spDetailNotes').innerHTML = notes.map(n=>`<div class="insight ${n.tone}${n.drill?' clickable':''}" ${n.drill?`data-drill="${n.drill}"`:''}><span class="ins-ico">${{good:'▲',bad:'▼',warn:'!',info:'i'}[n.tone]}</span><p>${n.text}</p></div>`).join('');

  document.getElementById('spDetailCust').innerHTML = custs.slice(0, 12).map(c=>`<tr class="clickable" data-cust="${escAttr(c.key)}">
      <td class="name" title="${escAttr(c.key)}">${c.key}</td><td style="text-align:right">${fmtNum(c.invoices)}</td>
      <td style="text-align:right;font-weight:600">${money(c.net)}</td><td style="text-align:right">${fmtPct(c.share)}</td><td style="text-align:right">${fmtPct(c.gp)}</td></tr>`).join('')
    || `<tr><td colspan="5" class="empty-note">No customers in this period.</td></tr>`;
  document.getElementById('spDetailStates').innerHTML = statesG.slice(0, 12).map(s=>`<tr>
      <td class="name">${s.key}</td><td style="text-align:right">${fmtNum(s.custCount)}</td>
      <td style="text-align:right;font-weight:600">${money(s.net)}</td><td style="text-align:right">${fmtPct(s.share)}</td></tr>`).join('')
    || `<tr><td colspan="4" class="empty-note">No data.</td></tr>`;
  document.getElementById('spDetailAll').onclick = ()=>openInvoiceList(`${name} — all invoices`, rows);

  showModal('spDetailOverlay');
  const buckets = buildPeriodBuckets(rows);
  const items = bucketAggs(rows, buckets);
  const labels = items.map(it => buckets.granularity==='Weekly' ? it.label : it.label);
  document.getElementById('spDetailChartTitle').textContent = `${buckets.granularity} net sales`;
  setTimeout(()=>{
    autoFitChartWidth('spDetailChart', labels.length, 44, 0);
    makeChart('spDetail','spDetailChart', { drill:(di,i)=>({ title:`${name} — ${labels[i]}`, rows: rows.filter(buckets.defs[i].match) }),
      type:'bar', data:{ labels, datasets:[Object.assign({ label:'Net sales', data: items.map(it=>it.agg.net), backgroundColor:'#6C5CE7' }, barStyle)] },
      options: baseOpts({ y:{ ticks:{ callback:v=>fmtINRShort(v) } } }, false, false, evts=>{ const it = items[evts[0].dataIndex];
        return [labels[evts[0].dataIndex], ...richTooltip(it.agg)]; }, fmtINRShort) });
  }, 30);
}

/* "Current vs previous" window used by insights and profiles */
function periodCompare(baseRows){
  const linked = getCurrentAndPreviousPeriod(baseRows);
  if(linked) return { cur: linked.curRows, prev: linked.prevRows, label: linked.prevLabel ? `vs ${linked.prevLabel}` : 'with no previous period to compare' };
  if(!ALL_ROWS.length) return { cur:[], prev:[], label:'' };
  const last = endOfDay(ALL_ROWS[ALL_ROWS.length-1].date);
  const s = new Date(last.getTime() - 30*DAY_MS + 1), pe = new Date(s.getTime()-1), ps = new Date(pe.getTime() - 30*DAY_MS + 1);
  return { cur: baseRows.filter(r=>r.date>=s && r.date<=last), prev: baseRows.filter(r=>r.date>=ps && r.date<=pe), label:'in the last 30 days vs the 30 days before' };
}

/* ---------------- after every render: make cards clickable, re-apply searches ---------------- */
function afterRenderAll(){
  const cur = currentRows();
  const kpiDrills = [
    ['All invoices in this filter', cur], ['All invoices in this filter', cur],
    ['Invoices by profit', cur.slice().sort((a,b)=>b.profit-a.profit)], ['All invoices in this filter', cur],
    ['CRR (repeat) invoices', cur.filter(r=>r.ordertype==='CRR')]
  ];
  [...document.getElementById('kpiRow').children].forEach((el,i)=>{ const d = kpiDrills[i]; if(d){ el.classList.add('clickable'); el.dataset.drill = registerDrill(d[0], d[1]); } });

  const lp = ADMIN.lowProfitPct;
  const biDrills = [
    ['Tax — all invoices', cur], ['Tax — all invoices', cur],
    [`Invoices at or below ${lp}% margin`, cur.filter(r=>!r.pp && (r.net ? r.profit/r.net*100 : 0) <= lp)],
    ['CRR (repeat) invoices', cur.filter(r=>r.ordertype==='CRR')], ['NBD (new) invoices', cur.filter(r=>r.ordertype==='NBD')]
  ];
  [...document.getElementById('biTopKpis').children].forEach((el,i)=>{ const d = biDrills[i]; if(d){ el.classList.add('clickable'); el.dataset.drill = registerDrill(d[0], d[1]); } });

  if(CUST_MODEL){
    const M = CUST_MODEL, newSet = new Set(M.newActive.map(c=>c.name)), retSet = new Set(M.retActive.map(c=>c.name));
    const top10 = new Set(M.active.slice(0,10).map(c=>c.name));
    const cd = [
      ['Invoices of active customers', cur], ['Invoices of new customers', cur.filter(r=>newSet.has(r.customer))],
      ['Invoices of returning customers', cur.filter(r=>retSet.has(r.customer))], ['All invoices in this filter', cur],
      ['Invoices of the top 10 customers', cur.filter(r=>top10.has(r.customer))], null
    ];
    [...document.getElementById('custKpis').children].forEach((el,i)=>{
      el.classList.add('clickable');
      if(cd[i]) el.dataset.drill = registerDrill(cd[i][0], cd[i][1]);
      else el.dataset.seg = 'At risk';
    });
  }
  if(typeof SCORE_CTX !== 'undefined' && SCORE_CTX){
    const S = SCORE_CTX, R = S.curRows;
    const sd = [
      ['CRR team — CRR invoices', R.filter(r=>r.ordertype==='CRR' && S.crrNames.includes(r.salesperson))],
      ['NBD team — NBD invoices', R.filter(r=>r.ordertype==='NBD' && S.nbdNames.includes(r.salesperson))],
      ['Other — invoices', R.filter(r=>S.otherNames.includes(r.salesperson))], ['All invoices — scoring period', R]
    ];
    [...document.getElementById('scoreOverallStrip').children].forEach((el,i)=>{ const d = sd[i]; if(d){ el.classList.add('clickable'); el.dataset.drill = registerDrill(d[0], d[1], S.label); } });
  }
  const q = currentQuick();
  document.querySelectorAll('#quickToggle button').forEach(b=>b.classList.toggle('active', b.dataset.q===q));
  reapplyTableSearches();
}

/* ---------------- one click handler for the whole page ---------------- */
document.addEventListener('click', e=>{
  const openSp = e.target.closest('[data-open-sp]'); if(openSp){ openSalespersonDetail(openSp.dataset.openSp); return; }
  const openCu = e.target.closest('[data-open-cust]'); if(openCu){ openCustomerDetail(openCu.dataset.openCust); return; }
  if(e.target.closest('button, a, input, select, label')) return;

  const growthCell = e.target.closest('#growthTable td[data-pi]');
  if(growthCell && GROWTH_CTX){
    const sp = growthCell.closest('tr').dataset.sp, def = GROWTH_CTX.buckets.defs[+growthCell.dataset.pi];
    openInvoiceList(`${sp} — ${def.label}${def.range?` (${def.range})`:''}`, GROWTH_CTX.rows.filter(r=>r.salesperson===sp && def.match(r)));
    return;
  }
  const el = e.target.closest('[data-drill],[data-sp],[data-cust],[data-state],[data-pin],[data-week],[data-seg]');
  if(!el) return;
  if(el.dataset.drill){ const d = DRILLS.get(el.dataset.drill); if(d) openInvoiceList(d.title, d.rows, d.sub); return; }
  if(el.dataset.sp){ openSalespersonDetail(el.dataset.sp); return; }
  if(el.dataset.cust){
    if(CUST_MODEL && CUST_MODEL.list.some(c=>c.name===el.dataset.cust)) openCustomerDetail(el.dataset.cust);
    else openInvoiceList(el.dataset.cust, currentRows().filter(r=>r.customer===el.dataset.cust));
    return;
  }
  if(el.dataset.state){ const st = el.dataset.state; openInvoiceList(`${st} — invoices`, currentRows().filter(r=>(r.state||'Not given')===st)); return; }
  if(el.dataset.pin){ const p = el.dataset.pin; openInvoiceList(`Pin code ${p} — invoices`, currentRows().filter(r=>r.pincode===p)); return; }
  if(el.dataset.week){
    state.mode = 'WEEK'; state.weekKey = +el.dataset.week; applyStateToUI(); renderAll();
    showToast('Switched to that week. Use "All time" in Quick range to go back.');
    return;
  }
  if(el.dataset.seg && el.closest('#custKpis')){
    custTable.segment = el.dataset.seg; custTable.limit = 50;
    document.getElementById('custSegFilter').value = el.dataset.seg; renderCustTable();
    document.getElementById('panel-cust-table').scrollIntoView({behavior:'smooth'});
  }
});

/* ---------------- wiring (runs once) ---------------- */
(function wireInteractions(){
  const $ = id => document.getElementById(id);
  injectTableTools();
  document.querySelectorAll('#quickToggle button').forEach(b=>b.addEventListener('click', ()=>applyQuick(b.dataset.q)));
  $('exportInvoicesBtn').addEventListener('click', ()=>exportRowsCSV(currentRows(), 'invoices ' + ($('periodDesc').textContent || '')));
  document.querySelectorAll('#invListGroup button').forEach(b=>b.addEventListener('click', ()=>{
    document.querySelectorAll('#invListGroup button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    INV.group = b.dataset.g; INV.sort = b.dataset.g==='inv' ? 'date' : 'net'; INV.dir = -1; INV.limit = 100; renderInvoiceList();
  }));
  let t = null;
  $('invListSearch').addEventListener('input', e=>{ clearTimeout(t); t = setTimeout(()=>{ INV.q = e.target.value; INV.limit = 100; renderInvoiceList(); }, 160); });
  $('invListHead').addEventListener('click', e=>{
    const th = e.target.closest('th[data-k]'); if(!th) return;
    if(INV.sort===th.dataset.k) INV.dir *= -1; else { INV.sort = th.dataset.k; INV.dir = ['customer','salesperson','state','key','invoice'].includes(th.dataset.k) ? 1 : -1; }
    renderInvoiceList();
  });
  $('invListMore').addEventListener('click', ()=>{ INV.limit += 200; renderInvoiceList(); });
  $('invListExport').addEventListener('click', exportInvoiceList);
  ['invListOverlay','spDetailOverlay'].forEach(id=>$(id).addEventListener('click', e=>{ if(e.target.id===id) e.target.style.display='none'; }));
  $('invListClose').addEventListener('click', ()=>{ $('invListOverlay').style.display='none'; });
  $('spDetailClose').addEventListener('click', ()=>{ $('spDetailOverlay').style.display='none'; });
})();
