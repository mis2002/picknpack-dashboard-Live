/* =====================================================================
   customer-view.js — draws the Customers tab
   Numbers come from customer-calc.js; charts go through charts.js.
   ===================================================================== */

let CUST_MODEL = null;
const custTable = { search:'', state:'ALL', segment:'ALL', sort:'perNet', dir:-1, limit:50 };

function segBadge(name){
  const s = SEGMENTS[name] || { color:'#A4A2C0' };
  return `<span class="seg-badge" style="--sc:${s.color}">${name}</span>`;
}
function fmtDate(d){ return d ? d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '—'; }
function fmtDays(n){ return n===null||n===undefined ? '—' : `${Math.round(n)}d`; }
function trendCell(c){
  if(c.cmpPrev===0 && c.cmpCur===0) return `<span class="growth-badge na">—</span>`;
  if(c.growth===null) return `<span class="growth-badge up">new</span>`;
  if(Math.abs(c.growth)<0.05) return `<span class="growth-badge flat">0%</span>`;
  return c.growth>0 ? `<span class="growth-badge up">▲ ${c.growth.toFixed(0)}%</span>` : `<span class="growth-badge down">▼ ${Math.abs(c.growth).toFixed(0)}%</span>`;
}
function hbarOpts(tooltipFn, fmt){
  const o = singleItemOpts({}, false, false, tooltipFn, fmt);
  o.indexAxis = 'y';
  o.scales = {
    x: axisBase({ beginAtZero:true, afterDataLimits:padValueAxis, ticks:{color:THEME.muted,font:{size:10.5}, callback:v=>fmt(v)} }),
    y: axisBase({ grid:{display:false}, ticks:{color:THEME.ink,font:{size:11}} })
  };
  o.layout = { padding:{ right: 18, top: 4 } };
  return o;
}

function renderCustomerInsights(){
  const M = CUST_MODEL = buildCustomerModel();
  const winTxt = M.win.isAll ? 'All time' : document.getElementById('periodDesc').textContent.replace(/^Showing /,'');
  document.getElementById('custPeriodNote').textContent =
    `${winTxt}. Recency is measured up to ${fmtDate(M.ref)}. Trend column: ${M.cmpLabel}.`;

  /* ---- KPI tiles ---- */
  const top10 = M.concentration[2].pct;
  const atRiskVal = M.atRisk.reduce((s,c)=>s+c.life.net,0);
  const repeatRate = M.active.length ? M.retActive.length/M.active.length*100 : 0;
  const tiles = [
    { lbl:'Active customers', ico:'👥', val:fmtNum(M.active.length), sub:`bought in the selected period`, accent:'var(--violet)' },
    { lbl:`New customers`, ico:'✦', val:fmtNum(M.newActive.length), sub:`first ever order, ${M.newLabel}`, accent:'var(--orange)' },
    { lbl:'Returning share', ico:'↻', val:fmtPct(repeatRate), sub:`${fmtNum(M.retActive.length)} customers ordered before`, accent:'var(--sky)' },
    { lbl:'Avg sales / customer', ico:'₹', val:fmtINR(M.active.length ? M.perNet/M.active.length : 0), sub:'net of GST, selected period', accent:'var(--good)' },
    { lbl:'Top 10 share', ico:'%', val:fmtPct(top10), sub:`${fmtNum(M.n80)} customers = 80% of sales`, accent:'var(--indigo-2)' },
    { lbl:'At-risk customers', ico:'!', val:fmtNum(M.atRisk.length), sub:`${fmtINR(atRiskVal)} lifetime value`, accent:'var(--coral)' }
  ];
  document.getElementById('custKpis').innerHTML = tiles.map(c=>`
    <div class="kpi" style="--accent:${c.accent}">
      <div class="kpi-head"><span>${c.lbl}</span><i>${c.ico}</i></div>
      <div class="val">${c.val}</div><div class="sub">${c.sub}</div>
    </div>`).join('');

  /* ---- Key insights ---- */
  const icons = { good:'▲', bad:'▼', warn:'!', info:'i' };
  document.getElementById('custInsights').innerHTML = buildCustomerInsights(M)
    .map(i=>`<div class="insight ${i.tone}"><span class="ins-ico">${icons[i.tone]}</span><p>${i.text}</p></div>`).join('');

  renderCustLocation(M);
  renderCustSegments(M);
  renderCustConcentration(M);
  renderCustNewReturning(M);
  renderCustActionLists(M);
  renderCustPins(M);
  populateCustTableFilters(M);
  renderCustTable();
}

function renderCustLocation(M){
  const box = document.getElementById('custStateBox');
  if(!M.hasState){
    makeChart('custState','custStateChart', { type:'bar', data:{labels:[],datasets:[]} });
    document.getElementById('custStateDesc').textContent = 'No Place of Supply values found in this filter.';
  } else {
    const top = M.states.slice(0, 12);
    document.getElementById('custStateDesc').textContent = `Top ${top.length} of ${M.states.length} states by net sales, selected period`;
    box.style.height = Math.max(260, top.length*30 + 50) + 'px';
    makeChart('custState','custStateChart', { drill:(di,i)=>({ title:`${top[i].state} — invoices`, rows: currentRows().filter(r=>(r.state||'Not given')===top[i].state) }),
      type:'bar',
      data:{ labels: top.map(s=>s.state), datasets:[Object.assign({ label:'Net sales', data: top.map(s=>s.net),
        backgroundColor: top.map((s,i)=> s.state==='Not given' ? '#DAD6E6' : i===0 ? '#6C5CE7' : i<3 ? '#8E81EE' : '#C3BBF7') }, { borderRadius:6, borderSkipped:false, maxBarThickness:22 })] },
      options: hbarOpts(evts=>{ const s = top[evts[0].dataIndex];
        return [s.state, `Net sales: ${fmtINR(s.net)} (${s.share.toFixed(1)}%)`, `Profit: ${fmtINR(s.profit)} · GP ${s.gp.toFixed(1)}%`, `Customers: ${fmtNum(s.custCount)} · Invoices: ${fmtNum(s.invoices)}`]; }, fmtINRShort)
    });
  }
  // state table (all states)
  document.getElementById('custStateTable').innerHTML = M.states.map((s,i)=>`
    <tr class="clickable" data-state="${escAttr(s.state)}"><td>${i+1}</td><td class="name">${s.state}</td><td>${regionOf(s.state==='Not given'?'':s.state,'')}</td>
      <td style="text-align:right">${fmtNum(s.custCount)}</td><td style="text-align:right">${fmtNum(s.invoices)}</td>
      <td style="text-align:right;font-weight:600">${money(s.net)}</td><td style="text-align:right">${fmtPct(s.share)}</td>
      <td style="text-align:right">${money(s.profit)}</td><td style="text-align:right">${fmtPct(s.gp)}</td>
      <td style="text-align:right">${money(s.custCount ? s.net/s.custCount : 0)}</td></tr>`).join('')
    || `<tr><td colspan="10" class="empty-note">No data in this filter.</td></tr>`;

  const regs = M.regions;
  const regColors = { 'North':'#6C5CE7','West':'#F6A623','South':'#3FB8E0','East':'#EF5466','Central':'#1FB286','North-East':'#443AA8','Not mapped':'#A4A2C0' };
  makeChart('custRegion','custRegionChart', { drill:(di,i)=>({ title:`${regs[i].region} region — invoices`, rows: currentRows().filter(r=>regionOf(r.state, r.pincode)===regs[i].region) }),
    type:'doughnut',
    data:{ labels: regs.map(r=>r.region), datasets:[{ data: regs.map(r=>r.net), backgroundColor: regs.map(r=>regColors[r.region]||'#A4A2C0'), borderColor:'#fff', borderWidth:4, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%',
      plugins:{ legend:{position:'bottom',labels:{color:THEME.ink,font:{size:11},usePointStyle:true,pointStyle:'circle'}}, datalabels: pieDL(),
        tooltip: tooltipConfigFromFn(evts=>{ const r = regs[evts[0].dataIndex];
          return [`${r.region} India`, `Net sales: ${fmtINR(r.net)} (${r.share.toFixed(1)}%)`, `GP: ${r.gp.toFixed(1)}%`, `Customers: ${fmtNum(r.custCount)}`]; }) } }
  });
}

function renderCustSegments(M){
  const segs = M.segments.filter(s=>s.count>0);
  makeChart('custSegment','custSegmentChart', { drill:(di,i)=>({ action:()=>{ custTable.segment = segs[i].name; custTable.limit = 50; document.getElementById('custSegFilter').value = segs[i].name; renderCustTable(); document.getElementById('panel-cust-table').scrollIntoView({behavior:'smooth'}); } }),
    type:'doughnut',
    data:{ labels: segs.map(s=>s.name), datasets:[{ data: segs.map(s=>s.count), backgroundColor: segs.map(s=>s.color), borderColor:'#fff', borderWidth:4, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%',
      plugins:{ legend:{position:'bottom',labels:{color:THEME.ink,font:{size:11},usePointStyle:true,pointStyle:'circle'}},
        datalabels: Object.assign(pieDL(), { display:'auto', formatter:(v,ctx)=>{ const t = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0); return t && v/t>=0.04 ? fmtNum(v) : ''; } }),
        tooltip: tooltipConfigFromFn(evts=>{ const s = segs[evts[0].dataIndex];
          return [s.name, `${fmtNum(s.count)} customers`, `Lifetime sales: ${fmtINR(s.lifeNet)}`, `This period: ${fmtINR(s.perNet)}`, s.desc]; }) } }
  });
  document.getElementById('custSegmentTable').innerHTML = M.segments.map(s=>`
    <tr class="clickable" data-seg="${s.name}">
      <td>${segBadge(s.name)}</td><td style="text-align:right">${fmtNum(s.count)}</td>
      <td style="text-align:right">${money(s.lifeNet)}</td><td style="text-align:right">${money(s.perNet)}</td>
      <td class="cell-wrap">${s.desc}<br><span class="act">→ ${s.action}</span></td></tr>`).join('');
  document.querySelectorAll('#custSegmentTable tr[data-seg]').forEach(tr=>tr.addEventListener('click', ()=>{
    custTable.segment = tr.dataset.seg; custTable.limit = 50;
    document.getElementById('custSegFilter').value = custTable.segment;
    renderCustTable();
    document.getElementById('panel-cust-table').scrollIntoView({behavior:'smooth', block:'start'});
  }));
}

function renderCustConcentration(M){
  const C = M.concentration;
  makeChart('custConc','custConcChart', { drill:(di,i)=>{ const n = [1,5,10,20,50,Infinity][i]; const names = new Set(M.active.slice(0,n).map(c=>c.name)); return { title:`${C[i].label} customers — invoices`, rows: currentRows().filter(r=>names.has(r.customer)) }; },
    type:'bar',
    data:{ labels: C.map(c=>c.label), datasets:[Object.assign({ label:'Share of net sales', data: C.map(c=>c.pct),
      backgroundColor: C.map((c,i)=> i===C.length-1 ? '#DAD6F0' : ['#443AA8','#6C5CE7','#8E81EE','#A99EF2','#C3BBF7'][i]) }, barStyle)] },
    options: baseOpts({ y:{ ticks:{ callback:v=> v<=100 ? v+'%' : '' }, afterDataLimits: s=>{ s.max = 115; s.min = 0; } } }, false, false, evts=>{
      const c = C[evts[0].dataIndex];
      return [`${c.label} customers`, `${c.pct.toFixed(1)}% of net sales`, `= ${fmtINR(M.perNet*c.pct/100)}`]; }, v=>v.toFixed(0)+'%')
  });
  document.getElementById('custConcDesc').textContent = `${fmtNum(M.active.length)} active customers · ${fmtNum(M.n80)} of them make 80% of sales`;
}

function renderCustNewReturning(M){
  const d = M.nvr;
  autoFitChartWidth('custNvrChart', d.length, 60, 0);
  const bs = { borderRadius:6, borderSkipped:false, maxBarThickness:56, borderColor:'#fff', borderWidth:{top:2} };
  makeChart('custNvr','custNvrChart', { drill:(di,i)=>{ const k = d[i].key; const firstM = {}; ALL_ROWS.forEach(r=>{ if(!firstM[r.customer] || r.monthKey < firstM[r.customer]) firstM[r.customer] = r.monthKey; }); const isNew = di===1; return { title:`${isNew?'New':'Returning'} customers — ${d[i].label}`, rows: baseFiltered(ALL_ROWS).filter(r=>r.monthKey===k && ((firstM[r.customer]===k)===isNew)) }; },
    type:'bar',
    data:{ labels: d.map(x=>x.label), datasets:[
      Object.assign({ label:'Returning customers', data:d.map(x=>x.nRet), backgroundColor:'#6C5CE7' }, bs),
      Object.assign({ label:'New customers', data:d.map(x=>x.nNew), backgroundColor:'#F6A623' }, bs)
    ]},
    options: singleItemOpts({ x:{stacked:true}, y:{stacked:true, ticks:{precision:0}} }, true, false, evts=>{
      const x = d[evts[0].dataIndex];
      return [x.label, `New: ${fmtNum(x.nNew)} customers, ${fmtINR(x.sNew)}`, `Returning: ${fmtNum(x.nRet)} customers, ${fmtINR(x.sRet)}`,
        `New share of sales: ${fmtPct((x.sNew+x.sRet) ? x.sNew/(x.sNew+x.sRet)*100 : 0)}`]; }, fmtNum)
  });
}

function renderCustActionLists(M){
  const risk = M.atRisk.slice(0, 15);
  document.getElementById('custRiskDesc').textContent = M.atRisk.length
    ? `${fmtNum(M.atRisk.length)} customers who used to reorder are now overdue. Sorted by lifetime value — call from the top.`
    : 'No overdue regular customers right now.';
  document.getElementById('custRiskTable').innerHTML = risk.map(c=>`
    <tr class="clickable" data-cust="${escAttr(c.name)}">
      <td class="name" title="${escAttr(c.name)}">${c.name}</td><td>${c.salesperson}</td><td>${c.state||'—'}</td>
      <td style="text-align:right">${fmtDate(c.last)}</td>
      <td style="text-align:right;color:var(--coral);font-weight:700">${c.recency}d</td>
      <td style="text-align:right">${fmtDays(c.avgGap)}</td>
      <td style="text-align:right;font-weight:600">${money(c.life.net)}</td></tr>`).join('')
    || `<tr><td colspan="7" class="empty-note">Nothing overdue 🎉</td></tr>`;

  const low = M.lowMarginBig.slice(0, 10);
  document.getElementById('custLowDesc').textContent = `Top-25% customers by sales whose margin is below the ${M.overallGp.toFixed(1)}% average`;
  document.getElementById('custLowTable').innerHTML = low.map(c=>`
    <tr class="clickable" data-cust="${escAttr(c.name)}">
      <td class="name" title="${escAttr(c.name)}">${c.name}</td><td>${c.salesperson}</td>
      <td style="text-align:right;font-weight:600">${money(c.per.net)}</td><td style="text-align:right">${money(c.per.profit)}</td>
      <td style="text-align:right;color:var(--coral);font-weight:700">${fmtPct(c.perGp)}</td>
      <td style="text-align:right">${money(c.per.net*(M.overallGp-c.perGp)/100)}</td></tr>`).join('')
    || `<tr><td colspan="6" class="empty-note">All large customers are at or above average margin.</td></tr>`;
  bindCustRowClicks('#custRiskTable'); bindCustRowClicks('#custLowTable');
}

function renderCustPins(M){
  const pins = M.pins.slice(0, 15);
  document.getElementById('custPinDesc').textContent = M.hasPin
    ? `Top ${pins.length} of ${fmtNum(M.pins.length)} pin codes by net sales (from the Billing Code column)`
    : 'No valid 6-digit Billing Code values found in this filter.';
  document.getElementById('custPinTable').innerHTML = pins.map((p,i)=>`
    <tr class="clickable" data-pin="${p.pin}"><td>${i+1}</td><td style="font-weight:700;font-variant-numeric:tabular-nums">${p.pin}</td><td>${p.state}</td>
      <td style="text-align:right">${fmtNum(p.custCount)}</td><td style="text-align:right">${fmtNum(p.invoices)}</td>
      <td style="text-align:right;font-weight:600">${money(p.net)}</td><td style="text-align:right">${fmtPct(p.share)}</td>
      <td style="text-align:right">${fmtPct(p.gp)}</td><td class="name" title="${escAttr(p.topCustomer)}">${p.topCustomer}</td></tr>`).join('')
    || `<tr><td colspan="9" class="empty-note">No pin code data.</td></tr>`;
}

/* ---------------- Full customer report table ---------------- */
function populateCustTableFilters(M){
  const stSel = document.getElementById('custStateFilter');
  const states = [...new Set(M.list.map(c=>c.state).filter(Boolean))].sort();
  stSel.innerHTML = '<option value="ALL">All states</option>' + states.map(s=>`<option value="${escAttr(s)}">${escAttr(s)}</option>`).join('');
  if(!states.includes(custTable.state)) custTable.state = 'ALL';
  stSel.value = custTable.state;
  const segSel = document.getElementById('custSegFilter');
  segSel.innerHTML = '<option value="ALL">All segments</option>' + SEGMENT_ORDER.map(s=>`<option value="${s}">${s}</option>`).join('');
  segSel.value = custTable.segment;
}
function custFilteredList(){
  if(!CUST_MODEL) return [];
  const q = custTable.search.trim().toLowerCase();
  let L = CUST_MODEL.list;
  if(custTable.state!=='ALL') L = L.filter(c=>c.state===custTable.state);
  if(custTable.segment!=='ALL') L = L.filter(c=>c.segment===custTable.segment);
  if(q) L = L.filter(c=>c.name.toLowerCase().includes(q) || (c.pincode||'').includes(q) || (c.salesperson||'').toLowerCase().includes(q));
  const key = custTable.sort, dir = custTable.dir;
  const val = c => ({ name:c.name.toLowerCase(), state:c.state, perNet:c.per.net, lifeNet:c.life.net, perProfit:c.per.profit, perGp:c.perGp,
    invoices:c.life.invoices, aov:c.aov, recency:c.recency??99999, gap:c.avgGap??99999, first:c.firstEver?c.firstEver.getTime():0, growth:c.growth??-99999 })[key];
  return L.slice().sort((a,b)=>{ const x = val(a), y = val(b); return (x>y?1:x<y?-1:0)*dir; });
}
function renderCustTable(){
  const L = custFilteredList();
  const shown = L.slice(0, custTable.limit);
  document.getElementById('custTableCount').textContent = `${fmtNum(L.length)} customers${L.length>shown.length?` · showing ${fmtNum(shown.length)}`:''}`;
  document.getElementById('custTableBody').innerHTML = shown.map(c=>`
    <tr class="clickable" data-cust="${escAttr(c.name)}">
      <td class="name" title="${escAttr(c.name)}">${c.name}</td>
      <td>${segBadge(c.segment)}</td>
      <td>${c.state||'—'}${c.pincode?`<br><span class="muted">${c.pincode}</span>`:''}</td>
      <td>${c.salesperson}</td>
      <td style="text-align:right;font-weight:600">${money(c.per.net)}</td>
      <td style="text-align:right">${fmtPct(c.perGp)}</td>
      <td style="text-align:right">${trendCell(c)}</td>
      <td style="text-align:right">${money(c.life.net)}</td>
      <td style="text-align:right">${fmtNum(c.life.invoices)}</td>
      <td style="text-align:right">${money(c.aov)}</td>
      <td style="text-align:right">${fmtDate(c.firstEver)}</td>
      <td style="text-align:right">${c.recency===null?'—':c.recency+'d'}</td>
      <td style="text-align:right">${fmtDays(c.avgGap)}</td>
    </tr>`).join('') || `<tr><td colspan="13" class="empty-note">No customers match.</td></tr>`;
  document.getElementById('custShowMore').style.display = L.length > shown.length ? '' : 'none';
  document.querySelectorAll('#custTableHead th[data-sort]').forEach(th=>{
    th.classList.toggle('sorted', th.dataset.sort===custTable.sort);
    th.dataset.dir = th.dataset.sort===custTable.sort ? (custTable.dir>0?'↑':'↓') : '';
  });
  bindCustRowClicks('#custTableBody');
}
function bindCustRowClicks(){ /* row clicks are handled centrally in interact.js */ }
function exportCustCSV(){
  const L = custFilteredList();
  const head = ['Customer','Segment','State','Pin code','Region','Salesperson','Period net sales','Period profit','Period GP %','Trend %','Lifetime net sales','Lifetime profit','Invoices','Avg invoice','First order','Last order','Days since last order','Avg days between orders'];
  const q = v => { const s = v===null||v===undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const iso = d => d ? fmtDateInput(d) : '';
  const lines = [head.join(',')].concat(L.map(c=>[c.name,c.segment,c.state,c.pincode,c.region,c.salesperson,
    Math.round(c.per.net),Math.round(c.per.profit),c.perGp.toFixed(1),c.growth===null?'':c.growth.toFixed(1),
    Math.round(c.life.net),Math.round(c.life.profit),c.life.invoices,Math.round(c.aov),iso(c.firstEver),iso(c.last),
    c.recency??'',c.avgGap===null?'':c.avgGap.toFixed(1)].map(q).join(',')));
  const blob = new Blob(['\ufeff'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `customer-report-${fmtDateInput(new Date())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  showToast(`Exported ${fmtNum(L.length)} customers to CSV.`);
}

/* ---------------- Customer drill-down ---------------- */
function openCustomerDetail(name){
  const c = CUST_MODEL && CUST_MODEL.list.find(x=>x.name===name);
  if(!c) return;
  const rows = baseFiltered(ALL_ROWS).filter(r=>r.customer===name && r.date<=CUST_MODEL.ref).sort((a,b)=>b.date-a.date);
  document.getElementById('custDetailTitle').textContent = c.name;
  document.getElementById('custDetailMeta').innerHTML =
    `${segBadge(c.segment)} <span class="chip">${c.state||'No state'}${c.pincode?' · '+c.pincode:''}</span> <span class="chip">${c.region}</span> <span class="chip">${c.salesperson}</span> <span class="chip">${c.mainType||'—'}</span>`;
  const k = [
    ['Lifetime sales', fmtINR(c.life.net)], ['Lifetime profit', `${fmtINR(c.life.profit)} · ${fmtPct(c.gp)}`],
    ['Invoices', `${fmtNum(c.life.invoices)} on ${fmtNum(c.orderDays)} days`], ['Avg invoice', fmtINR(c.aov)],
    ['First order', fmtDate(c.firstEver)], ['Last order', `${fmtDate(c.last)} (${c.recency}d ago)`],
    ['Reorders every', c.avgGap===null ? 'only one order day' : `${Math.round(c.avgGap)} days`], ['Selected period', `${fmtINR(c.per.net)} · ${fmtPct(c.perGp)} GP`]
  ];
  document.getElementById('custDetailKpis').innerHTML = k.map(([l,v])=>`<div class="kpi-mini"><div class="lbl">${l}</div><div class="val" style="font-size:14px">${v}</div></div>`).join('')
    + `<div class="insight info" style="grid-column:1/-1"><span class="ins-ico">→</span><p><b>${c.segment}:</b> ${SEGMENTS[c.segment].action}</p></div>`;
  document.getElementById('custDetailInv').innerHTML = rows.slice(0, 25).map(r=>`
    <tr><td>${fmtDate(r.date)}</td><td>${r.invoice||'—'}</td><td>${r.salesperson}</td><td><span class="tag ${r.ordertype.toLowerCase()}">${r.ordertype}</span></td>
      <td style="text-align:right">${money(r.net)}</td><td style="text-align:right">${money(r.profit)}</td>
      <td style="text-align:right">${r.pp ? '<span class="muted">pending</span>' : fmtPct(r.net ? r.profit/r.net*100 : 0)}</td></tr>`).join('');
  showModal('custDetailOverlay');
  const mk = Object.keys(c.months).sort();
  const labels = mk.map(k=>{ const m = MONTHS.find(x=>x.key===k); return m ? m.label.replace(/^(\w{3})\w*/, '$1') : k; });
  setTimeout(()=>{
    autoFitChartWidth('custDetailChart', mk.length, 56, 0);
    makeChart('custDetail','custDetailChart', { drill:(di,i)=>({ title:`${c.name} — ${labels[i]}`, rows: rows.filter(r=>r.monthKey===mk[i]) }),
      type:'bar',
      data:{ labels, datasets:[Object.assign({ label:'Net sales', data: mk.map(k=>c.months[k]), backgroundColor:'#6C5CE7' }, barStyle)] },
      options: baseOpts({ y:{ ticks:{ callback:v=>fmtINRShort(v) } } }, false, false, evts=>[labels[evts[0].dataIndex], `Net sales: ${fmtINR(c.months[mk[evts[0].dataIndex]])}`], fmtINRShort)
    });
  }, 30);
}

/* ---------------- wiring (runs once) ---------------- */
(function wireCustomerTab(){
  const $ = id => document.getElementById(id);
  let t = null;
  $('custSearch').addEventListener('input', e=>{ clearTimeout(t); t = setTimeout(()=>{ custTable.search = e.target.value; custTable.limit = 50; renderCustTable(); }, 180); });
  $('custStateFilter').addEventListener('change', e=>{ custTable.state = e.target.value; custTable.limit = 50; renderCustTable(); });
  $('custSegFilter').addEventListener('change', e=>{ custTable.segment = e.target.value; custTable.limit = 50; renderCustTable(); });
  $('custShowMore').addEventListener('click', ()=>{ custTable.limit += 100; renderCustTable(); });
  $('custExport').addEventListener('click', exportCustCSV);
  document.querySelectorAll('#custTableHead th[data-sort]').forEach(th=>th.addEventListener('click', ()=>{
    const k = th.dataset.sort;
    if(custTable.sort===k) custTable.dir *= -1; else { custTable.sort = k; custTable.dir = (k==='name'||k==='state'||k==='recency'||k==='gap') ? 1 : -1; }
    renderCustTable();
  }));
  $('custDetailClose').addEventListener('click', ()=>{ $('custDetailOverlay').style.display='none'; });
  $('custDetailOverlay').addEventListener('click', e=>{ if(e.target.id==='custDetailOverlay') e.target.style.display='none'; });
})();
