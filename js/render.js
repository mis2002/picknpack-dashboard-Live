/* =====================================================================
   render.js — everything you see
   Hero card, KPI tiles, week cards, MIS report, tables, BI and scoring. Reads calculations from data.js, draws charts via charts.js.
   ===================================================================== */
/* ---------------------- Renderers ---------------------- */
function renderPeriodDesc(){
  let txt = '';
  if(state.mode==='ALL') txt = `Showing all ${fmtNum(ALL_ROWS.length)} invoices`;
  else if(state.mode==='WEEK'){ const w=WEEKS.find(w=>w.key===state.weekKey); txt = w?`Showing ${w.label} (${w.range})`:''; }
  else if(state.mode==='MONTH'){ const m=MONTHS.find(m=>m.key===state.monthKey); txt = m?`Showing ${m.label}`:''; }
  else if(state.mode==='RANGE') txt = `Showing ${state.rangeStart} to ${state.rangeEnd}`;
  document.getElementById('periodDesc').textContent = txt;
}

// Hero card: always reflects exactly what the filters select
function renderMonthBanner(){
  const agg = aggregateRows(currentRows());
  const mi = METRIC_INFO[state.metric];
  let scope = 'All time';
  if(state.mode==='WEEK'){ const w=WEEKS.find(w=>w.key===state.weekKey); if(w) scope = `${w.label} (${w.range})`; }
  else if(state.mode==='MONTH'){ const m=MONTHS.find(m=>m.key===state.monthKey); if(m) scope = m.label; }
  else if(state.mode==='RANGE') scope = `${state.rangeStart} to ${state.rangeEnd}`;
  document.getElementById('mbLabel').textContent = `${mi.label} · ${scope}`;
  setAnimatedText(document.getElementById('mbVal'), fmtINR(agg[mi.key]));
  document.getElementById('mbSub').textContent = `${fmtNum(agg.invoices)} invoices, ${fmtPct(agg.gpPct)} GP, avg invoice ${fmtINR(agg.avgInvoice)}`;
  const sp = state.salesperson==='ALL' ? '' : ` for ${state.salesperson}`;
  const ot = state.ordertype==='ALL' ? '' : ` (${state.ordertype} orders only)`;
  document.getElementById('heroSub').textContent = `Here's where sales stand${sp}${ot}. Change the filters below and every chart follows.`;
}

function weekStripScope(){
  const spFiltered = baseFiltered(ALL_ROWS);
  let ws, headTitle, headDesc;
  if(state.mode==='MONTH' && state.monthKey){
    const m = MONTHS.find(m=>m.key===state.monthKey);
    ws = weeksInScope(spFiltered.filter(r=>r.monthKey===state.monthKey));
    headTitle = `Weeks in ${m ? m.label : 'selected month'}`;
    headDesc = 'All weeks inside the selected month, with week-over-week change';
  } else if(state.mode==='WEEK' && state.weekKey!=null){
    const allWs = weeksInScope(spFiltered);
    const idx = allWs.findIndex(w=>w.key===state.weekKey);
    ws = idx>=0 ? allWs.slice(Math.max(0, idx-3), idx+1) : allWs.slice(-4);
    headTitle = 'Selected week and the 3 before it';
    headDesc = 'Where the selected week stands against recent weeks';
  } else if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){
    const s = new Date(state.rangeStart+'T00:00:00'), e = new Date(state.rangeEnd+'T23:59:59');
    ws = weeksInScope(spFiltered.filter(r=>r.date>=s && r.date<=e)).slice(-8);
    headTitle = 'Weeks in the selected range';
    headDesc = 'Up to the most recent 8 weeks inside your custom range';
  } else {
    ws = WEEKS.slice(-4);
    headTitle = 'Last 4 weeks';
    headDesc = 'Updates automatically as new invoices arrive';
  }
  return { ws, rows: spFiltered, headTitle, headDesc };
}
function hexSoft(hex, a){ const n=parseInt(hex.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
function renderWeekStrip(){
  const el = document.getElementById('weekStrip');
  const m = METRIC_INFO[state.metric].key;
  const { ws, rows, headTitle, headDesc } = weekStripScope();
  document.getElementById('weekStripTitle').textContent = headTitle;
  document.getElementById('weekStripDesc').textContent = headDesc;
  if(!ws.length){ el.innerHTML = '<div class="wk-empty">No dated rows found for this selection.</div>'; return; }
  const aggs = ws.map(w=>aggregateRows(rows.filter(r=>r.weekKey===w.key)));
  el.innerHTML = ws.map((w,i)=>{
    const agg = aggs[i];
    const prev = i>0 ? aggs[i-1] : null;
    const delta = prev && prev[m] ? ((agg[m]-prev[m])/prev[m]*100) : null;
    const c = PERIOD_COLORS[i % PERIOD_COLORS.length];
    return `<div class="wk-card clickable" data-week="${w.key}" title="Click to open this week" style="--wc:${c};--wc-soft:${hexSoft(c,.14)}">
      <div class="wk-top"><div class="wk-ico">W${w.index}</div>
        <div><div class="wk-title">${w.label}</div><div class="wk-range">${w.range}</div></div></div>
      <div class="wk-net">${fmtINR(agg[m])}</div>
      <div class="wk-sub">${fmtNum(agg.invoices)} inv, ${fmtPct(agg.gpPct)} GP
        ${delta===null ? '' : ` <b class="${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${Math.abs(delta).toFixed(1)}%</b>`}
      </div>
    </div>`;
  }).join('');
}

function renderKPIs(){
  const o = aggregateRows(currentRows());
  const crr = o.byType.find(t=>t.ordertype==='CRR');
  const crrShare = o.net ? ((crr?crr.net:0)/o.net*100) : 0;
  const cards = [
    {lbl:'Net sales (w/o GST)', ico:'₹', val: fmtINR(o.net), sub: fmtNum(o.invoices)+' invoices', accent:'var(--violet)'},
    {lbl:'Sales (with GST)', ico:'₹', val: fmtINR(o.gross), sub:'Total billed value', accent:'var(--sky)'},
    {lbl:'Total profit', ico:'▲', val: (o.pnet || !o.profitPending) ? fmtINR(o.profit) : 'Not tracked', sub: (o.pnet || !o.profitPending) ? fmtPct(o.gpPct) + (o.profitPending ? ` margin · ${fmtNum(o.profitPending)} invoices without profit left out` : ' of net sales') : 'Profit is not entered for this location yet', accent:'var(--orange)'},
    {lbl:'Avg. invoice value', ico:'≈', val: fmtINR(o.avgInvoice), sub:'Per bill, net of GST', accent:'var(--coral)'},
    {lbl:'Repeat business share', ico:'↻', val: fmtPct(crrShare), sub:'Of net sales is CRR', accent:'var(--good)'},
  ];
  document.getElementById('kpiRow').innerHTML = cards.map(c=>`
    <div class="kpi val-anim" style="--accent:${c.accent}">
      <div class="kpi-head"><span>${c.lbl}</span><i>${c.ico}</i></div>
      <div class="val">${c.val}</div>
      <div class="sub">${c.sub}</div>
    </div>`).join('');
}

function renderGrowthTable(){
  const mi = METRIC_INFO[state.metric];
  const otLabel = state.ordertype==='ALL' ? '' : `, ${state.ordertype} only`;
  const rows = currentRows();
  const buckets = buildPeriodBuckets(rows, state.growthGran);
  GROWTH_CTX = { rows, buckets };
  const granLower = buckets.granularity.toLowerCase();
  document.getElementById('growthTitle').textContent = `Salesperson-wise ${granLower} growth — ${mi.label}${otLabel}`;
  document.getElementById('growthDesc').textContent = `${mi.label} per ${granLower.replace('ly','').replace('dai','day')}, with period-over-period change`;
  const headRow = document.getElementById('growthHeadRow');
  headRow.innerHTML = '<th>#</th><th>Salesperson</th>' +
    buckets.defs.map(d=>`<th style="text-align:right">${d.label}${d.range ? `<br><span style="font-weight:400;font-size:9.5px;color:var(--ink-dim2)">${d.range}</span>` : ''}</th>`).join('') +
    `<th style="text-align:right">Total</th><th style="text-align:right">Overall growth</th>`;
  if(!buckets.defs.length){ document.getElementById('growthTable').innerHTML = `<tr><td colspan="4" class="empty-note">No data in this filter.</td></tr>`; return; }
  const spNames = [...new Set(rows.map(r=>r.salesperson))];
  const spData = spNames.map(sp=>{
    const periodVals = buckets.defs.map(d=>aggregateRows(rows.filter(r=>r.salesperson===sp && d.match(r)))[mi.key]);
    const total = periodVals.reduce((a,b)=>a+b,0);
    return { sp, periodVals, growth: growthSeries(periodVals), total, overall: overallGrowth(periodVals) };
  }).sort((a,b)=>b.total-a.total);
  function growthBadge(pct){
    if(pct===null||pct===undefined) return `<span class="growth-badge na">—</span>`;
    if(Math.abs(pct)<0.05) return `<span class="growth-badge flat">0.0%</span>`;
    return pct>0 ? `<span class="growth-badge up">▲ ${pct.toFixed(1)}%</span>` : `<span class="growth-badge down">▼ ${Math.abs(pct).toFixed(1)}%</span>`;
  }
  document.getElementById('growthTable').innerHTML = spData.map((r,i)=>{
    const cells = r.periodVals.map((v,idx)=>{
      const badge = idx===0 ? `<span class="growth-badge na">Start</span>` : growthBadge(r.growth[idx]);
      return `<td data-pi="${idx}" title="Click to see these invoices"><div class="growth-cell"><span class="amt">${money(v)}</span>${badge}</div></td>`;
    }).join('');
    return `<tr class="clickable" data-sp="${escAttr(r.sp)}"><td>${i+1}</td><td class="name" title="${escAttr(r.sp)}">${r.sp}</td>${cells}
      <td style="text-align:right;font-weight:700">${money(r.total)}</td>
      <td style="text-align:right">${r.overall===null?`<span class="growth-badge na">—</span>`:growthBadge(r.overall)}</td></tr>`;
  }).join('');
}

function renderTable(){
  const agg = aggregateRows(currentRows());
  const mi = METRIC_INFO[state.metric];
  document.getElementById('custMetricHead').textContent = mi.short;
  document.getElementById('custDesc').textContent = `Top ${ADMIN.topCustomersN} ranked by ${mi.label}, current filter`;
  const top = agg.customers.slice().sort((a,b)=>b[mi.key]-a[mi.key]).slice(0, ADMIN.topCustomersN);
  const maxVal = top.length ? Math.abs(top[0][mi.key]) || 1 : 1;
  document.getElementById('custTable').innerHTML = top.map((c,i)=>{
    const gpPct = gpOf(c);
    return `<tr class="clickable" data-cust="${escAttr(c.name)}"><td>${i+1}</td><td class="name" title="${escAttr(c.name)}">${c.name}</td>
      <td><span class="tag ${(c.ordertype||'').toLowerCase()}">${c.ordertype||'—'}</span></td>
      <td>${c.salesperson||'—'}</td><td style="text-align:right">${fmtNum(c.invoices)}</td>
      <td style="text-align:right;font-weight:600">${money(c[mi.key])}</td>
      <td style="text-align:right">${money(c.profit)}</td>
      <td style="text-align:right">${fmtPct(gpPct)}</td>
      <td style="min-width:90px"><div class="bar-mini"><i style="width:${(Math.abs(c[mi.key])/maxVal*100).toFixed(1)}%"></i></div></td></tr>`;
  }).join('') || `<tr><td colspan="9" class="empty-note">No customers in this filter.</td></tr>`;
}

/* Each section renders inside its own safety net: if one breaks (bad row, missing chart lib),
   the rest of the dashboard still shows and the problem is reported instead of freezing. */
const RENDER_ISSUES = new Set();
function safe(name, fn){
  try{ fn(); }
  catch(e){
    console.error('['+name+']', e);
    if(!RENDER_ISSUES.has(name)){
      RENDER_ISSUES.add(name);
      const mismatch = /of null|is not defined|is not a function/.test(e.message);
      showToast(mismatch ? `“${name}” couldn’t be drawn — the page files look out of date. Press Ctrl + Shift + R; if it stays, re-upload all files from the latest zip.` : `“${name}” couldn’t be drawn: ${e.message}`);
    }
  }
}
function renderAll(){
  safe('Header', renderPeriodDesc);
  safe('Summary card', renderMonthBanner);
  safe('Weekly cards', renderWeekStrip);
  safe('KPI tiles', renderKPIs);
  safe('MIS Sales Report', renderMisReport);
  safe('Growth table', renderGrowthTable);
  safe('Sales trend', ()=>renderTrend(chartTypes.trend));
  safe('Week-over-week', ()=>renderWow(chartTypes.wow));
  safe('Order type split', ()=>renderSplit(chartTypes.split));
  safe('Salesperson performance', ()=>renderSp(chartTypes.sp));
  safe('Top customers', renderTable);
  safe('BI Insights', renderBI);
  safe('MIS Scoring', renderMisScoring);
  safe('Customer insights', renderCustomerInsights);
  safe('Customer map', renderCustomerMap);
  safe('Main insights', renderMainInsights);
  safe('BI insights', renderBIInsights);
  safe('Scorecards', renderScoringV2);
  safe('Scoring insights', renderScoringInsights);
  safe('Clickable items', afterRenderAll);
}

/* ---------------------- MIS Sales Report ---------------------- */
function misGrowthCell(pct){
  if(pct===null||pct===undefined) return `<span class="mis-growth-cell flat">— new</span>`;
  if(Math.abs(pct)<0.05) return `<span class="mis-growth-cell flat">0.0%</span>`;
  return pct>0 ? `<span class="mis-growth-cell up">▲ ${pct.toFixed(1)}%</span>` : `<span class="mis-growth-cell down">▼ ${Math.abs(pct).toFixed(1)}%</span>`;
}
function renderMisReport(){
  const rows = baseFiltered(ALL_ROWS);
  const linked = getCurrentAndPreviousPeriod(rows);
  let curRows, prevRows, curLabelText, prevLabelText;
  if(linked){
    curRows = linked.curRows; prevRows = linked.prevRows;
    curLabelText = linked.curLabel; prevLabelText = linked.prevLabel;
    document.getElementById('misLinkNote').textContent = 'Following the week / month / range selected above.';
  } else {
    const buckets = buildPeriodBuckets(rows, state.misGran || 'month');
    const n = buckets.defs.length;
    if(!n){
      document.getElementById('misPeriodLabel').textContent = 'no data';
      document.getElementById('misCompareLabel').textContent = '';
      document.getElementById('misLinkNote').textContent = '';
      document.getElementById('misTableBody').innerHTML = `<tr><td colspan="12" style="color:var(--ink-dim);text-align:center;padding:20px">No data available yet.</td></tr>`;
      return;
    }
    const curDef = buckets.defs[n-1];
    const prevDef = n>1 ? buckets.defs[n-2] : null;
    curRows = rows.filter(curDef.match);
    prevRows = prevDef ? rows.filter(prevDef.match) : [];
    curLabelText = curDef.label + (curDef.range ? ` (${curDef.range})` : '');
    prevLabelText = prevDef ? prevDef.label + (prevDef.range?` (${prevDef.range})`:'') : null;
    document.getElementById('misLinkNote').textContent = 'View is All time, so this shows the latest period from the buttons on the right. Pick a week, month or range above to lock it.';
  }
  document.getElementById('misPeriodLabel').textContent = curLabelText;
  document.getElementById('misCompareLabel').textContent = prevLabelText ? `vs ${prevLabelText}` : 'no previous period yet to compare';
  const spNames = [...new Set(curRows.map(r=>r.salesperson))];
  const spData = spNames.map(sp=>{
    const spCur = curRows.filter(r=>r.salesperson===sp);
    const crr = aggregateRows(spCur.filter(r=>r.ordertype==='CRR'));
    const nbd = aggregateRows(spCur.filter(r=>r.ordertype==='NBD'));
    const total = aggregateRows(spCur);
    const prevNet = aggregateRows(prevRows.filter(r=>r.salesperson===sp)).net;
    const growth = prevNet ? ((total.net-prevNet)/prevNet*100) : (total.net>0 ? null : 0);
    return { sp, crr, nbd, total, growth };
  }).sort((a,b)=>b.total.net-a.total.net);
  const maxNet = spData.length ? (spData[0].total.net || 1) : 1;
  const rowsHtml = spData.map((r,i)=>`
    <tr class="clickable" data-sp="${escAttr(r.sp)}">
      <td class="mis-name">${r.sp}</td>
      <td>${fmtNum(r.crr.invoices)}</td><td>${money(r.crr.net)}</td><td>${money(r.crr.profit)}</td>
      <td>${fmtNum(r.nbd.invoices)}</td><td>${money(r.nbd.net)}</td><td>${money(r.nbd.profit)}</td>
      <td>${fmtNum(r.total.invoices)}</td><td>${money(r.total.net)}</td><td>${money(r.total.profit)}</td>
      <td>${misGrowthCell(r.growth)}</td>
      <td><div class="mis-rank-cell"><div class="mis-rank-bar" style="width:${Math.max(6, r.total.net/maxNet*60)}px"></div>${i+1}</div></td>
    </tr>`).join('');
  const grand = aggregateRows(curRows);
  const grandCrr = aggregateRows(curRows.filter(r=>r.ordertype==='CRR'));
  const grandNbd = aggregateRows(curRows.filter(r=>r.ordertype==='NBD'));
  const grandPrevNet = aggregateRows(prevRows).net;
  const grandGrowth = grandPrevNet ? ((grand.net-grandPrevNet)/grandPrevNet*100) : null;
  const grandHtml = `<tr class="mis-grand">
      <td class="mis-name">GRAND TOTAL</td>
      <td>${fmtNum(grandCrr.invoices)}</td><td>${money(grandCrr.net)}</td><td>${money(grandCrr.profit)}</td>
      <td>${fmtNum(grandNbd.invoices)}</td><td>${money(grandNbd.net)}</td><td>${money(grandNbd.profit)}</td>
      <td>${fmtNum(grand.invoices)}</td><td>${money(grand.net)}</td><td>${money(grand.profit)}</td>
      <td>${misGrowthCell(grandGrowth)}</td><td></td>
    </tr>`;
  document.getElementById('misTableBody').innerHTML = (rowsHtml || `<tr><td colspan="12" style="color:var(--ink-dim);text-align:center;padding:20px">No salespeople in this period.</td></tr>`) + grandHtml;
}
/* ---------------------- BI Insights tab ---------------------- */
function renderBI(){
  const rows = currentRows();
  const agg = aggregateRows(rows);
  const mi = METRIC_INFO[state.metric];
  const buckets = buildPeriodBuckets(rows);
  const items = bucketAggs(rows, buckets);
  const periodLabels = items.map(it => buckets.granularity==='Weekly' ? `${it.label} (${it.range})` : it.label);

  const totalTax = rows.reduce((s,r)=>s+r.tax,0);
  const taxRatio = agg.gross ? (totalTax/agg.gross*100) : 0;
  const zeroProfitRows = rows.filter(r=>{ if(r.pp) return false; const marginPct = r.net ? (r.profit/r.net*100) : 0; return marginPct <= ADMIN.lowProfitPct; });
  const crrCustomers = new Set(rows.filter(r=>r.ordertype==='CRR').map(r=>r.customer));
  const nbdCustomers = new Set(rows.filter(r=>r.ordertype==='NBD').map(r=>r.customer));
  const repeatCustCount = crrCustomers.size, oneTimeCustCount = nbdCustomers.size;
  document.getElementById('biTopKpis').innerHTML = [
    {lbl:'Total tax collected', val:fmtINR(totalTax), c:'var(--coral)'},
    {lbl:'Tax ÷ revenue', val:fmtPct(taxRatio), c:'var(--orange)'},
    {lbl:'Zero/negative profit orders', val:fmtNum(zeroProfitRows.length), c:'var(--violet)'},
    {lbl:'Repeat customers (CRR)', val:fmtNum(repeatCustCount), c:'var(--sky)'},
    {lbl:'New / one-time (NBD)', val:fmtNum(oneTimeCustCount), c:'var(--good)'},
  ].map(k=>`<div class="kpi-mini" style="border-left:4px solid ${k.c}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div></div>`).join('');

  /* 1. Revenue vs Tax vs Profit */
  destroyChart('biRevTaxProfit');
  document.getElementById('biRevDesc').textContent = `${buckets.granularity} view — how much of billed value is tax vs your actual margin`;
  autoFitChartWidth('biRevTaxProfit', periodLabels.length, 96, 0);
  const g3 = {borderRadius:6, borderSkipped:false, maxBarThickness:34};
  makeChart('biRevTaxProfit','biRevTaxProfit', { drill:(di,i)=>({ title:periodLabels[i], rows: rows.filter(buckets.defs[i].match) }),
    type:'bar',
    data:{ labels: periodLabels, datasets:[
      Object.assign({label:'Net sales', data:items.map(it=>it.agg.net), backgroundColor:'#6C5CE7'}, g3),
      Object.assign({label:'Tax', data:items.map(it=>it.agg.gross-it.agg.net), backgroundColor:'#EF5466'}, g3),
      Object.assign({label:'Profit', data:items.map(it=>it.agg.profit), backgroundColor:'#F6A623'}, g3)
    ]},
    options: singleItemOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}, x:{ticks:{maxRotation:45,autoSkip:true,maxTicksLimit:40}}}, true, false, (evts)=>{
      const idx = evts[0].dataIndex; const a = items[idx].agg;
      return [periodLabels[idx], `Net sales: ${fmtINR(a.net)}`, `Tax: ${fmtINR(a.gross-a.net)}`, `Profit: ${fmtINR(a.profit)}`, `Invoices: ${fmtNum(a.invoices)}`];
    }, fmtINRShort)
  });

  /* 2. Invoice count trend */
  destroyChart('biInvoiceCount');
  document.getElementById('biInvCountTitle').textContent = buckets.granularity + ' invoice count';
  autoFitChartWidth('biInvoiceCount', periodLabels.length, 44, 0);
  makeChart('biInvoiceCount','biInvoiceCount', { drill:(di,i)=>({ title:`Invoices — ${periodLabels[i]}`, rows: rows.filter(buckets.defs[i].match) }),
    type:'bar', data:{labels:periodLabels, datasets:[Object.assign({label:'Invoices', data:items.map(it=>it.agg.invoices), backgroundColor:'#3FB8E0'}, barStyle)]},
    options: baseOpts({y:{ticks:{precision:0}}, x:{ticks:{maxRotation:45,autoSkip:true,maxTicksLimit:40}}}, false, false, (evts)=>{
      const idx = evts[0].dataIndex;
      return [periodLabels[idx], `Invoices: ${fmtNum(items[idx].agg.invoices)}`];
    }, fmtNum)
  });

  /* 3. Profit contribution by salesperson */
  destroyChart('biProfitPie');
  const spByProfit = agg.bySp.slice().sort((a,b)=>b.profit-a.profit).filter(s=>s.profit>0).slice(0, ADMIN.topSalespersonN);
  makeChart('biProfitPie','biProfitPie', { drill:(di,i)=>({ action:()=>openSalespersonDetail(spByProfit[i].salesperson) }),
    type:'doughnut',
    data:{ labels: spByProfit.map(s=>s.salesperson), datasets:[{data:spByProfit.map(s=>s.profit), backgroundColor:spByProfit.map((_,i)=>PALETTE[i%PALETTE.length]), borderColor:'#fff', borderWidth:4, hoverOffset:6}] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'52%', plugins:{ legend:{position:'bottom',labels:{color:THEME.ink,font:{size:10.5},boxWidth:10,usePointStyle:true,pointStyle:'circle'}},
      datalabels: pieDL(),
      tooltip: tooltipConfigFromFn((evts)=>{ const s = spByProfit[evts[0].dataIndex]; return [s.salesperson, `Profit: ${fmtINR(s.profit)}`, `Net sales: ${fmtINR(s.net)}`, `Invoices: ${fmtNum(s.invoices)}`]; }) } }
  });

  /* 4. Top5/Bottom5 */
  document.getElementById('biRankDesc').textContent = `Ranked by ${mi.label}, current filter`;
  const spSorted = agg.bySp.slice().sort((a,b)=>b[mi.key]-a[mi.key]);
  const top5 = spSorted.slice(0,5), bottom5 = spSorted.slice(-5).reverse();
  const rankRow = (s,i)=>`<tr class="clickable" data-sp="${escAttr(s.salesperson)}"><td>${i+1}</td><td class="name">${s.salesperson}</td><td style="text-align:right">${money(s[mi.key])}</td><td style="text-align:right">${fmtNum(s.invoices)}</td></tr>`;
  document.getElementById('biTop5').innerHTML = top5.map(rankRow).join('') || `<tr><td colspan="4" class="empty-note">No data.</td></tr>`;
  document.getElementById('biBottom5').innerHTML = bottom5.map(rankRow).join('') || `<tr><td colspan="4" class="empty-note">No data.</td></tr>`;

  /* 5. Repeat vs one-time */
  destroyChart('biRepeatPie');
  const repeatNet = rows.filter(r=>r.ordertype==='CRR').reduce((s,r)=>s+r.net,0);
  const onceNet = rows.filter(r=>r.ordertype==='NBD').reduce((s,r)=>s+r.net,0);
  makeChart('biRepeatPie','biRepeatPie', { drill:(di,i)=>{ const ot = i===0?'CRR':'NBD'; return { title:`${ot} orders`, rows: rows.filter(r=>r.ordertype===ot) }; },
    type:'doughnut', data:{ labels:[`Repeat, CRR (${fmtNum(repeatCustCount)} customers)`, `New/one-time, NBD (${fmtNum(oneTimeCustCount)} customers)`], datasets:[{data:[repeatNet, onceNet], backgroundColor:[CRR_COLOR,NBD_COLOR], borderColor:'#fff', borderWidth:4, hoverOffset:6}] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'52%', plugins:{ legend:{position:'bottom',labels:{color:THEME.ink,font:{size:11},usePointStyle:true,pointStyle:'circle'}},
      datalabels: pieDL(),
      tooltip: tooltipConfigFromFn((evts)=>{ const lbl=evts[0].label; const val=lbl.startsWith('Repeat')?repeatNet:onceNet; return [lbl, `Net sales: ${fmtINR(val)}`]; }) } }
  });

  /* 6. Margin leaderboard */
  const marginCusts = agg.customers.filter(c=>c.invoices>=2 && c.net>0)
    .filter(c=>c.pnet>0).map(c=>({...c, gp: gpOf(c)})).sort((a,b)=>b.gp-a.gp).slice(0,10);
  document.getElementById('biMarginTable').innerHTML = marginCusts.map((c,i)=>
    `<tr class="clickable" data-cust="${escAttr(c.name)}"><td>${i+1}</td><td class="name" title="${escAttr(c.name)}">${c.name}</td><td style="text-align:right">${money(c.net)}</td><td style="text-align:right">${fmtPct(c.gp)}</td></tr>`
  ).join('') || `<tr><td colspan="4" class="empty-note">Need customers with 2+ invoices.</td></tr>`;

  /* 7. Profit % distribution */
  destroyChart('biProfitDist');
  const bands = [
    {label:'Negative', test:p=>p<0}, {label:'0%', test:p=>p===0}, {label:'0–5%', test:p=>p>0&&p<=5},
    {label:'5–10%', test:p=>p>5&&p<=10}, {label:'10–20%', test:p=>p>10&&p<=20}, {label:'20%+', test:p=>p>20},
  ];
  const bandCounts = bands.map(()=>0);
  rows.forEach(r=>{ if(r.pp) return; const p = r.net ? (r.profit/r.net*100) : 0; const idx = bands.findIndex(b=>b.test(p)); if(idx>=0) bandCounts[idx]++; });
  autoFitChartWidth('biProfitDist', 0, 0, 0);
  makeChart('biProfitDist','biProfitDist', { drill:(di,i)=>({ title:`Invoices with ${bands[i].label} margin`, rows: rows.filter(r=>!r.pp && bands[i].test(r.net ? r.profit/r.net*100 : 0)) }),
    type:'bar', data:{ labels: bands.map(b=>b.label), datasets:[Object.assign({label:'Invoices', data:bandCounts, backgroundColor:['#EF5466','#A4A2C0','#F6A623','#FFC857','#1FB286','#6C5CE7']}, barStyle)] },
    options: baseOpts({y:{ticks:{precision:0}}}, false, false, (evts)=>{
      const idx = evts[0].dataIndex;
      return [bands[idx].label + ' margin', `Invoices: ${fmtNum(bandCounts[idx])}`];
    }, fmtNum)
  });

  /* 8. Zero / low-profit flags */
  document.getElementById('biFlagDesc').textContent = ADMIN.lowProfitPct > 0
    ? `${fmtNum(zeroProfitRows.length)} of ${fmtNum(rows.length)} invoices have margin at or below ${ADMIN.lowProfitPct}%`
    : `${fmtNum(zeroProfitRows.length)} of ${fmtNum(rows.length)} invoices have zero or negative margin`;
  const worstFlags = zeroProfitRows.slice().sort((a,b)=>b.net-a.net).slice(0,10);
  document.getElementById('biFlagList').innerHTML = worstFlags.length
    ? worstFlags.map(r=>`<div class="flag-row clickable" data-cust="${escAttr(r.customer)}"><span>${r.invoice||'—'}, ${r.customer}</span><span class="amt">${money(r.net)} net, ${fmtINR(r.profit)} profit</span></div>`).join('')
    : `<div class="empty-note">No zero or negative-profit invoices in this filter.</div>`;

  /* 9. Efficiency */
  destroyChart('biEfficiency');
  const effList = agg.bySp.filter(s=>s.invoices>0).map(s=>({...s, avgProfit: s.profit/s.invoices}))
    .sort((a,b)=>b.avgProfit-a.avgProfit).slice(0, ADMIN.topSalespersonN);
  autoFitChartWidth('biEfficiency', effList.length, 64, 0);
  makeChart('biEfficiency','biEfficiency', { drill:(di,i)=>({ action:()=>openSalespersonDetail(effList[i].salesperson) }),
    type:'bar', data:{ labels: effList.map(s=>s.salesperson), datasets:[Object.assign({label:'Avg. profit per order', data:effList.map(s=>s.avgProfit), backgroundColor:'#1FB286'}, barStyle)] },
    options: baseOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}}, false, false, (evts)=>{
      const s = effList[evts[0].dataIndex];
      return [s.salesperson, `Avg. profit/order: ${fmtINR(s.avgProfit)}`, `Total profit: ${fmtINR(s.profit)}`, `Invoices: ${fmtNum(s.invoices)}`];
    }, fmtINRShort)
  });

  /* 10. Tax collected */
  destroyChart('biTaxTrend');
  document.getElementById('biTaxDesc').textContent = `Total tax in this filter: ${fmtINR(totalTax)} (${fmtPct(taxRatio)} of billed value), ${buckets.granularity.toLowerCase()} view`;
  autoFitChartWidth('biTaxTrend', periodLabels.length, 54, 0);
  makeChart('biTaxTrend','biTaxTrend', { drill:(di,i)=>({ title:`Tax — ${periodLabels[i]}`, rows: rows.filter(buckets.defs[i].match) }),
    type:'line', data:{ labels:periodLabels, datasets:[{label:'Tax', data:items.map(it=>it.agg.gross-it.agg.net), borderColor:'#EF5466', backgroundColor:'rgba(239,84,102,.14)', fill:true, tension:.35, borderWidth:2.5, pointRadius:3.5, pointBackgroundColor:'#fff', pointBorderColor:'#EF5466', pointBorderWidth:2}] },
    options: baseOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}, x:{ticks:{maxRotation:45,autoSkip:true,maxTicksLimit:40}}}, false, false, (evts)=>{
      const idx = evts[0].dataIndex; const a = items[idx].agg;
      return [periodLabels[idx], `Tax: ${fmtINR(a.gross-a.net)}`, `Billed (with GST): ${fmtINR(a.gross)}`];
    }, fmtINRShort)
  });

  /* 11. Outliers */
  const netVals = rows.map(r=>r.net).filter(n=>n>0);
  const avgNet = netVals.length ? netVals.reduce((a,b)=>a+b,0)/netVals.length : 0;
  const sdNet = netVals.length ? Math.sqrt(netVals.reduce((s,n)=>s+Math.pow(n-avgNet,2),0)/netVals.length) : 0;
  const outlierThreshold = avgNet + ADMIN.outlierSD*sdNet;
  const outliers = rows.filter(r=>r.net > outlierThreshold && r.net > 0).sort((a,b)=>b.net-a.net).slice(0,10);
  document.getElementById('biOutlierDesc').textContent = netVals.length
    ? `Invoices over ~${fmtINR(outlierThreshold)} (average + ${ADMIN.outlierSD}× std-dev), worth a quick check`
    : 'No invoices in this filter';
  document.getElementById('biOutlierList').innerHTML = outliers.length
    ? outliers.map(r=>`<div class="flag-row clickable" data-cust="${escAttr(r.customer)}"><span>${r.invoice||'—'}, ${r.customer} <span style="color:var(--ink-dim)">(${r.salesperson})</span></span><span class="amt" style="color:var(--orange-2)">${fmtINR(r.net)}</span></div>`).join('')
    : `<div class="empty-note">No unusually large invoices flagged in this filter.</div>`;
}

/* ---------------------- MIS Scoring ---------------------- */
function scoreVal(actual, plan){ if(!plan) return null; return Math.round((actual/plan*100-100)*100)/100; }
function scoreSpanNum(val){
  if(val===null||val===undefined||isNaN(val)) return `<span style="color:var(--ink-dim2)">—</span>`;
  const color = val>=0 ? 'var(--good)' : 'var(--coral)';
  return `<span style="color:${color};font-weight:700">${val>0?'+':''}${val.toFixed(2)}</span>`;
}
function growthChip(pct){
  if(pct===null||pct===undefined) return `<span style="color:var(--ink-dim2)">— new</span>`;
  if(Math.abs(pct)<0.05) return `<span style="color:var(--ink-dim);font-weight:700">0.0%</span>`;
  return pct>0 ? `<span style="color:var(--good);font-weight:700">▲ ${pct.toFixed(1)}%</span>` : `<span style="color:var(--coral);font-weight:700">▼ ${Math.abs(pct).toFixed(1)}%</span>`;
}
function computeScoreRow(sp, spRows, prevSpRows, revMultiplier, periodDivisor){
  const uniqCustomers = new Set(spRows.map(r=>r.customer)).size;
  const netTotal = spRows.reduce((s,r)=>s+r.net,0);
  const profitTotal = spRows.reduce((s,r)=>s+r.profit,0);
  const salary = ADMIN.salaries[sp] || 0;
  const profitPlan = (salary*revMultiplier)/periodDivisor;
  const profitActual = profitTotal;
  const profitScore = profitPlan ? scoreVal(profitActual, profitPlan) : null;
  const revenuePlan = profitPlan * revMultiplier;
  const revenueActual = netTotal;
  const revenueScore = revenuePlan ? scoreVal(revenueActual, revenuePlan) : null;
  const avgPlan = uniqCustomers ? revenuePlan/uniqCustomers : null;
  const avgActual = uniqCustomers ? revenueActual/uniqCustomers : null;
  const avgScore = (avgPlan && avgActual!=null) ? scoreVal(avgActual, avgPlan) : null;
  const loss = profitActual - profitPlan;
  const scores = [avgScore, revenueScore, profitScore].filter(v=>v!==null);
  const overall = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
  const prevRevenue = prevSpRows.reduce((s,r)=>s+r.net,0);
  const growth = prevRevenue ? ((revenueActual-prevRevenue)/prevRevenue*100) : (revenueActual>0 ? null : 0);
  return { sp, spRows, uniqCustomers, avgPlan, avgActual, avgScore, revenuePlan, revenueActual, revenueScore, profitPlan, profitActual, profitScore, salary, loss, overall, growth };
}
let custPopupStore = [];
function uniqCustCell(rowsArr){
  const count = new Set(rowsArr.map(r=>r.customer)).size;
  if(!count) return fmtNum(0);
  const idx = custPopupStore.push(rowsArr) - 1;
  return `<button type="button" class="uniq-tip-btn" onclick="showCustomerPopup(${idx})">${fmtNum(count)}</button>`;
}
function showCustomerPopup(idx){
  const rowsArr = custPopupStore[idx];
  if(!rowsArr) return;
  const byCust = {};
  rowsArr.forEach(r=>{
    byCust[r.customer] = byCust[r.customer] || { name:r.customer, net:0, profit:0 };
    byCust[r.customer].net += r.net; byCust[r.customer].pnet = (byCust[r.customer].pnet||0) + r.pnet; byCust[r.customer].profit += r.profit;
  });
  const list = Object.values(byCust).map(c=>({ ...c, margin: gpOf(c) })).sort((a,b)=>b.net-a.net);
  document.getElementById('custPopupTitle').textContent = `${fmtNum(list.length)} customer${list.length===1?'':'s'}, ranked by sales`;
  document.getElementById('custPopupBody').innerHTML = list.length ? list.map(c=>`
    <tr>
      <td style="white-space:normal;word-break:break-word;line-height:1.35">${c.name}</td>
      <td style="text-align:right;white-space:nowrap">${money(c.net)}</td>
      <td style="text-align:right;white-space:nowrap">${money(c.profit)}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:700;color:${c.margin>=0?'var(--good)':'var(--coral)'}">${fmtPct(c.margin)}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="padding:18px;text-align:center;color:var(--ink-dim)">No customers in this period.</td></tr>`;
  document.getElementById('custPopupOverlay').style.display = 'flex';
}
document.getElementById('custPopupClose').addEventListener('click', ()=>{ document.getElementById('custPopupOverlay').style.display='none'; });
document.getElementById('custPopupOverlay').addEventListener('click', e=>{ if(e.target.id==='custPopupOverlay') e.target.style.display='none'; });

function scoreRowHtml(r){
  return `<tr class="clickable" data-sp="${escAttr(r.sp)}">
    <td class="mis-name">${r.sp}${!r.salary?' <span style="color:var(--coral);font-size:10px">(no salary set)</span>':''}</td>
    <td>${uniqCustCell(r.spRows)}</td>
    <td>${money(r.avgPlan||0)}</td><td>${money(r.avgActual||0)}</td><td>${scoreSpanNum(r.avgScore)}</td>
    <td>${money(r.revenuePlan)}</td><td>${money(r.revenueActual)}</td><td>${scoreSpanNum(r.revenueScore)}</td>
    <td>${money(r.profitPlan)}</td><td>${money(r.profitActual)}</td><td>${scoreSpanNum(r.profitScore)}</td>
    <td>${growthChip(r.growth)}</td>
    <td>${money(r.loss)}</td><td>${scoreSpanNum(r.overall)}</td>
  </tr>`;
}
function topVisibleSalesperson(rowsArr){
  const bySp = {};
  rowsArr.forEach(r=>{ bySp[r.salesperson] = (bySp[r.salesperson]||0) + r.net; });
  const sorted = Object.entries(bySp).sort((a,b)=>b[1]-a[1]);
  const visible = sorted.find(([name])=> !ADMIN.hiddenFromMis[name]);
  return visible ? { name: visible[0], net: visible[1] } : (sorted.length ? { name:'(hidden)', net: sorted[0][1] } : null);
}
function renderMisScoring(){
  custPopupStore = [];
  const linked = getCurrentAndPreviousPeriod(ALL_ROWS);
  let curRows, prevRows, curLabelText, linkNote, periodDivisor;
  if(linked){
    curRows = linked.curRows; prevRows = linked.prevRows; curLabelText = linked.curLabel;
    linkNote = 'Following the week / month / range selected above.';
    if(state.mode==='WEEK') periodDivisor = 4;
    else if(state.mode==='MONTH') periodDivisor = 1;
    else if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){
      const s = new Date(state.rangeStart+'T00:00:00'), e = new Date(state.rangeEnd+'T23:59:59');
      const days = Math.max(1, Math.round((e-s)/86400000)+1);
      periodDivisor = 28/days;
    } else periodDivisor = 4;
  } else {
    const buckets = buildPeriodBuckets(ALL_ROWS, state.scoreGran || 'week');
    const n = buckets.defs.length;
    if(!n){ document.getElementById('scorePeriodLabel').textContent = 'no data'; return; }
    const curDef = buckets.defs[n-1];
    const prevDef = n>1 ? buckets.defs[n-2] : null;
    curRows = ALL_ROWS.filter(curDef.match);
    prevRows = prevDef ? ALL_ROWS.filter(prevDef.match) : [];
    curLabelText = curDef.label + (curDef.range?` (${curDef.range})`:'');
    linkNote = 'View is All time, so this shows the latest period from the buttons on the right. Pick a week, month or range above to lock it.';
    periodDivisor = buckets.granularity==='Daily' ? 28 : buckets.granularity==='Weekly' ? 4 : buckets.granularity==='Monthly' ? 1 : 1/12;
  }
  document.getElementById('scorePeriodLabel').textContent = curLabelText;
  document.getElementById('scoreLinkNote').textContent = linkNote;
  const divisorText = periodDivisor.toFixed(periodDivisor % 1 === 0 ? 0 : 2);

  const nbdNames = Object.keys(ADMIN.departments).filter(sp=>ADMIN.departments[sp]==='NBD');
  const crrNames = Object.keys(ADMIN.departments).filter(sp=>ADMIN.departments[sp]==='CRR');
  const nbdNamesVisible = nbdNames.filter(sp=>!ADMIN.hiddenFromMis[sp]);
  const crrNamesVisible = crrNames.filter(sp=>!ADMIN.hiddenFromMis[sp]);
  const noteBox = document.getElementById('deptNoteBox');
  if(!nbdNames.length && !crrNames.length){
    noteBox.innerHTML = `<div class="dept-note">No one is assigned to NBD or CRR yet. Open <b>Admin → Salesperson salary and department</b> and assign each salesperson with their salary to see scores here.</div>`;
  } else {
    const missingSalary = [...nbdNames, ...crrNames].filter(sp=>!ADMIN.salaries[sp]);
    noteBox.innerHTML = missingSalary.length
      ? `<div class="dept-note">Missing salary for: ${missingSalary.join(', ')}. Their profit plan and score need it — add it in Admin settings.</div>` : '';
  }
  const otherNames = Object.keys(ADMIN.departments).filter(sp=>ADMIN.departments[sp]==='OTHER');
  const nbdAllCur   = curRows.filter(r=>r.ordertype==='NBD' && nbdNames.includes(r.salesperson));
  const crrAllCur   = curRows.filter(r=>r.ordertype==='CRR' && crrNames.includes(r.salesperson));
  const otherAllCur = curRows.filter(r=>otherNames.includes(r.salesperson));
  const nbdAllPrev   = prevRows.filter(r=>r.ordertype==='NBD' && nbdNames.includes(r.salesperson));
  const crrAllPrev   = prevRows.filter(r=>r.ordertype==='CRR' && crrNames.includes(r.salesperson));
  const otherAllPrev = prevRows.filter(r=>otherNames.includes(r.salesperson));
  function overallCard(label, curArr, prevArr, color){
    const agg = aggregateRows(curArr);
    const prevNet = aggregateRows(prevArr).net;
    const growth = prevNet ? ((agg.net-prevNet)/prevNet*100) : (agg.net>0 ? null : 0);
    const top = topVisibleSalesperson(curArr);
    return `<div class="kpi-mini" style="border-left:4px solid ${color}">
      <div class="lbl">${label}, total sales (w/o GST)</div><div class="val">${fmtINR(agg.net)}</div>
      <div style="font-size:11px;color:var(--ink-dim);margin-top:6px">Profit: ${fmtINR(agg.profit)}</div>
      <div style="font-size:11px;color:var(--ink-dim)">Top: ${top ? top.name : '—'}</div>
      <div style="margin-top:4px;font-size:11.5px">${growthChip(growth)} vs previous period</div>
    </div>`;
  }
  document.getElementById('scoreOverallStrip').innerHTML =
    overallCard('CRR team', crrAllCur, crrAllPrev, 'var(--sky)') +
    overallCard('NBD team', nbdAllCur, nbdAllPrev, 'var(--violet)') +
    overallCard('Other', otherAllCur, otherAllPrev, 'var(--ink-dim2)') +
    overallCard('Total', curRows, prevRows, 'var(--orange)');

  const nbdRows = nbdNamesVisible.map(sp=>computeScoreRow(sp,
    curRows.filter(r=>r.salesperson===sp && r.ordertype==='NBD'),
    prevRows.filter(r=>r.salesperson===sp && r.ordertype==='NBD'), 10, periodDivisor));
  const crrRows = crrNamesVisible.map(sp=>computeScoreRow(sp,
    curRows.filter(r=>r.salesperson===sp && r.ordertype==='CRR'),
    prevRows.filter(r=>r.salesperson===sp && r.ordertype==='CRR'), 20, periodDivisor));
  SCORE_CTX = { nbdRows, crrRows, curRows, prevRows, label: curLabelText, nbdNames, crrNames, otherNames };
  function crossRowHtml(sp, curOrderRows, prevOrderRows){
    const net = curOrderRows.reduce((s,r)=>s+r.net,0);
    const profit = curOrderRows.reduce((s,r)=>s+r.profit,0);
    const pnet = curOrderRows.reduce((s,r)=>s+r.pnet,0);
    const margin = pnet ? (profit/pnet*100) : null;
    const prevPnet = prevOrderRows.reduce((s,r)=>s+r.pnet,0);
    const prevProfit = prevOrderRows.reduce((s,r)=>s+r.profit,0);
    const prevMargin = prevPnet ? (prevProfit/prevPnet*100) : null;
    const marginGrowth = (margin!==null && prevMargin) ? ((margin-prevMargin)/Math.abs(prevMargin)*100) : null;
    return `<tr class="clickable" data-sp="${escAttr(sp)}"><td>${sp}</td><td>${uniqCustCell(curOrderRows)}</td><td>${fmtNum(curOrderRows.length)}</td>
      <td>${money(net)}</td><td>${money(profit)}</td><td>${margin===null?'—':fmtPct(margin)}</td><td>${growthChip(marginGrowth)}</td></tr>`;
  }
  document.getElementById('nbdCrossBody').innerHTML = nbdNamesVisible.length
    ? nbdNamesVisible.map(sp=>crossRowHtml(sp, curRows.filter(r=>r.salesperson===sp && r.ordertype==='CRR'), prevRows.filter(r=>r.salesperson===sp && r.ordertype==='CRR'))).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--ink-dim);padding:12px">—</td></tr>`;
  document.getElementById('crrCrossBody').innerHTML = crrNamesVisible.length
    ? crrNamesVisible.map(sp=>crossRowHtml(sp, curRows.filter(r=>r.salesperson===sp && r.ordertype==='NBD'), prevRows.filter(r=>r.salesperson===sp && r.ordertype==='NBD'))).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--ink-dim);padding:12px">—</td></tr>`;
}

