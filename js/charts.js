/* =====================================================================
   charts.js — chart theme, data-label engine, chart builders
   Everything that draws a graph. Uses numbers from data.js.
   ===================================================================== */
const CHARTS_OK = typeof window.Chart !== 'undefined';
if(!CHARTS_OK) console.error('Chart.js did not load — charts will show a notice, tables still work.');
/* ========================= THEME for charts ========================= */
const THEME = {
  ink:'#1E1B4B', muted:'#75739A', grid:'rgba(47,42,122,.07)',
  tooltipBg:'#1E1B4B', font:"'Poppins', sans-serif"
};
if(CHARTS_OK){
  Chart.defaults.color = THEME.muted;
  Chart.defaults.borderColor = THEME.grid;
  Chart.defaults.font.family = THEME.font;
}

/* =====================================================================
   DATA-LABEL ENGINE — why labels were missing before, and the fix
   ---------------------------------------------------------------------
   1. The tallest bar touched the top of the chart (axis max == data max),
      so its label had nowhere to go and got clipped. Fix: every value axis
      now gets automatic headroom (padValueAxis) based on how many points
      there are, so the top label always fits.
   2. clip:true cut labels at the chart edge. Fix: clip:false + clamp.
   3. Stacked bars tried to put every segment's label on top of each other.
      Fix: segments get their label INSIDE (only when the segment is tall
      and wide enough to hold it) and a separate plugin (stackTotals)
      writes the stack total above the bar.
   4. Many bars = narrow bars = overlapping text. Fix: labels shrink and
      rotate vertically automatically once there are lots of points, and
      display:'auto' drops only the ones that would genuinely collide.
   Everything below is scriptable, so it re-decides on every data change.
   ===================================================================== */
function pointCount(chart){ return (chart.data.labels||[]).length; }
function isStackedChart(chart){
  const s = chart.options && chart.options.scales;
  const stacked = !!(s && ((s.y && s.y.stacked) || (s.x && s.x.stacked)));
  return stacked && chart.getVisibleDatasetCount() > 1;
}
function isLineDataset(ctx){ return (ctx.dataset.type || ctx.chart.config.type) === 'line'; }
function manyPoints(chart){
  if(chart.options && chart.options.indexAxis==='y') return false;   // horizontal bars: labels sit to the right, never rotate
  const n = pointCount(chart);
  const per = (chart.chartArea ? chart.chartArea.width : chart.width) / Math.max(n,1) / Math.max(chart.getVisibleDatasetCount(),1);
  return n > 1 && per < 40;    // bars narrower than ~40px can't fit a horizontal ₹ label → rotate
}

// Adds breathing room above the highest (and below the lowest) value so labels never get cut off.
function padValueAxis(scale){
  const chart = scale.chart;
  const rotated = chart.config.type==='bar' && !isStackedChart(chart) && manyPoints(chart);
  const pad = rotated ? 0.30 : 0.16;
  const range = (scale.max - scale.min) || Math.abs(scale.max) || 1;
  if(scale.max > 0) scale.max = scale.max + range*pad;
  if(scale.min < 0) scale.min = scale.min - range*pad;
}

function dlCfg(formatter){
  return {
    clip:false, clamp:true,
    display: ctx => {
      const v = ctx.dataset.data[ctx.dataIndex];
      if(v===null || v===undefined || isNaN(v)) return false;
      if(isStackedChart(ctx.chart)){
        if(!v) return false;
        const el = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex];
        if(!el) return false;
        // final (post-animation) geometry, otherwise segments look 0px tall while animating in
        const g = el.getProps(['y','base','width'], true);
        const h = Math.abs((g.base ?? g.y) - g.y), w = g.width || 0;
        return (h >= 18 && w >= 34) ? 'auto' : false;   // too small to hold text → rely on the total on top
      }
      return 'auto';
    },
    anchor: ctx => isStackedChart(ctx.chart) ? 'center' : 'end',
    align:  ctx => isStackedChart(ctx.chart) ? 'center' : (isLineDataset(ctx) ? 'top' : 'end'),
    offset: ctx => isStackedChart(ctx.chart) ? 0 : 4,
    rotation: ctx => (!isLineDataset(ctx) && !isStackedChart(ctx.chart) && manyPoints(ctx.chart)) ? -90 : 0,
    color: ctx => isStackedChart(ctx.chart) ? '#FFFFFF' : THEME.ink,
    backgroundColor: ctx => isLineDataset(ctx) ? 'rgba(255,255,255,.9)' : null,
    borderRadius: 5,
    padding: ctx => isLineDataset(ctx) ? {top:2,bottom:2,left:5,right:5} : 2,
    font: ctx => ({ family:THEME.font, weight:'700', size: pointCount(ctx.chart) > 24 ? 9 : pointCount(ctx.chart) > 12 ? 10 : 11 }),
    formatter: v => formatter(v)
  };
}

// Draws the total above each stacked bar (only on stacked charts with 2+ visible datasets).
const StackTotals = {
  id:'stackTotals',
  afterDatasetsDraw(chart, args, opts){
    if(!opts || !opts.enabled || !isStackedChart(chart)) return;
    const n = pointCount(chart);
    const metas = chart.getSortedVisibleDatasetMetas();
    const ctx = chart.ctx;
    const rotate = manyPoints(chart);
    ctx.save();
    ctx.font = `700 ${n>24?9:n>12?10:11}px ${THEME.font}`;
    ctx.fillStyle = THEME.ink;
    for(let i=0;i<n;i++){
      let total = 0, topY = Infinity, x = null;
      metas.forEach(m=>{
        const v = chart.data.datasets[m.index].data[i];
        if(typeof v === 'number' && isFinite(v)) total += v;
        const el = m.data[i];
        if(el && typeof el.y === 'number'){ topY = Math.min(topY, el.y); x = el.x; }
      });
      if(x===null || !total) continue;
      const txt = opts.formatter ? opts.formatter(total) : String(total);
      if(rotate){
        ctx.save(); ctx.translate(x, topY-5); ctx.rotate(-Math.PI/2);
        ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt, 0, 0); ctx.restore();
      } else {
        ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(txt, x, topY-5);
      }
    }
    ctx.restore();
  }
};
if(CHARTS_OK){
  Chart.register(StackTotals);
  if(window.ChartDataLabels){
    Chart.register(ChartDataLabels);
    Chart.defaults.set('plugins.datalabels', { display:false });
  }
}

// Chart.js sizes the canvas to .chart-inner. When there are more points than fit,
// .chart-inner is widened so each bar keeps a readable width and the box scrolls sideways.
function autoFitChartWidth(canvasId, n, perItem, minWidth){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const inner = canvas.parentElement, box = inner.parentElement;
  const needed = Math.max(minWidth || 0, n * (perItem || 40) + 70);
  const avail = box.clientWidth || needed;
  inner.style.width = needed > avail ? needed+'px' : '100%';
}


/* One place that creates every chart: destroys the old one, and if Chart.js is missing
   shows a readable notice inside the chart box instead of crashing the whole page. */
function makeChart(key, canvasId, config){
  // optional drill(datasetIndex, index) → { title, rows, sub } or { action } : makes the chart clickable
  const drill = config.drill; delete config.drill;
  if(drill){
    config.options = config.options || {};
    config.options.onClick = (evt, els)=>{
      const el = els && els[0]; if(!el) return;
      const d = drill(el.datasetIndex, el.index);
      if(!d) return;
      if(d.action) d.action(); else openInvoiceList(d.title, d.rows, d.sub);
    };
    config.options.onHover = (evt, els)=>{ const t = evt.native && evt.native.target; if(t) t.style.cursor = els.length ? 'pointer' : 'default'; };
  }
  if(charts[key]){ try{ charts[key].destroy(); }catch(e){} delete charts[key]; }
  const canvas = document.getElementById(canvasId);
  if(!canvas) return null;
  if(!CHARTS_OK){
    const box = canvas.parentElement;
    if(!box.querySelector('.chart-missing')){
      const n = document.createElement('div');
      n.className = 'chart-missing';
      n.textContent = 'Chart library (js/vendor/chart.umd.js) did not load, so this chart can’t be drawn. Tables and numbers are still correct.';
      box.appendChild(n);
    }
    return null;
  }
  charts[key] = new Chart(canvas, config);
  return charts[key];
}
/* ---------------------- Chart option builders ---------------------- */
function destroyChart(k){ if(charts[k]){ charts[k].destroy(); delete charts[k]; } }
function tooltipConfigFromFn(fn){
  return { callbacks:{ title:(items)=>fn(items)[0]||'', label:()=>'', afterBody:(items)=>fn(items).slice(1) },
    backgroundColor:THEME.tooltipBg, titleColor:'#fff', bodyColor:'#E7E4F6', borderWidth:0,
    padding:12, cornerRadius:12, displayColors:false, titleFont:{weight:'700',size:12,family:THEME.font}, bodyFont:{size:11.5,family:THEME.font},
    caretSize:6 };
}
function pieDL(){
  return { display:true, color:THEME.ink, backgroundColor:'rgba(255,255,255,.92)', borderRadius:6, padding:{top:3,bottom:3,left:7,right:7},
    font:{size:11,weight:'700',family:THEME.font},
    formatter:(value, ctx)=>{
      const arr = ctx.chart.data.datasets[0].data;
      const total = arr.reduce((a,b)=>a+b,0);
      if(!total) return '';
      const pct = value/total*100;
      return pct < 4 ? '' : pct.toFixed(0)+'%';
    }
  };
}
function axisBase(extra){
  return Object.assign({ ticks:{color:THEME.muted,font:{size:10.5}}, grid:{color:THEME.grid, drawTicks:false}, border:{display:false} }, extra||{});
}
function chartOpts(scaleExtras, legend, tooltipFn, datalabelsFmt, interaction){
  const tooltip = tooltipFn ? tooltipConfigFromFn(tooltipFn) : { callbacks:{ label: ctx => `${ctx.dataset.label}: ${fmtINR(ctx.parsed.y ?? ctx.parsed)}` } };
  const yExtra = Object.assign({ beginAtZero:true, afterDataLimits: padValueAxis }, scaleExtras.y||{});
  if(scaleExtras.y && scaleExtras.y.ticks) yExtra.ticks = Object.assign({color:THEME.muted,font:{size:10.5}}, scaleExtras.y.ticks);
  const xExtra = Object.assign({ grid:{display:false}, border:{display:false} }, scaleExtras.x||{});
  if(scaleExtras.x && scaleExtras.x.ticks) xExtra.ticks = Object.assign({color:THEME.muted,font:{size:10.5}}, scaleExtras.x.ticks);
  return { responsive:true, maintainAspectRatio:false,
    layout:{ padding:{ top: 10, right: 10, left: 4 } },
    interaction,
    plugins:{
      legend:{display:legend,position:'bottom',labels:{color:THEME.ink,font:{size:11},boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'circle',padding:14}},
      tooltip,
      datalabels: datalabelsFmt ? dlCfg(datalabelsFmt) : { display:false },
      stackTotals: { enabled: !!datalabelsFmt, formatter: datalabelsFmt || String }
    },
    scales:{ x: axisBase(xExtra), y: axisBase(yExtra) } };
}
const baseOpts = (scaleExtras={}, legend=true, _h=false, tooltipFn=null, fmt=null) => chartOpts(scaleExtras, legend, tooltipFn, fmt, {mode:'index',intersect:false});
const singleItemOpts = (scaleExtras={}, legend=true, _h=false, tooltipFn=null, fmt=null) => chartOpts(scaleExtras, legend, tooltipFn, fmt, {mode:'nearest',intersect:true});

function richTooltip(rec,label){
  const lines=[]; if(label) lines.push(label);
  lines.push(`Net (w/o GST): ${fmtINR(rec.net||0)}`,`With GST: ${fmtINR(rec.gross||0)}`,`Profit: ${fmtINR(rec.profit||0)}`);
  if(rec.invoices!==undefined) lines.push(`Invoices: ${fmtNum(rec.invoices)}`);
  return lines;
}
const barStyle = { borderRadius:8, borderSkipped:false, maxBarThickness:64 };

function renderTrend(type){
  destroyChart('trend');
  const mi = METRIC_INFO[state.metric];
  const rows = currentRows();
  const forced = state.trendGran && state.trendGran!=='auto' ? state.trendGran : null;
  const buckets = buildPeriodBuckets(rows, forced);
  const items = bucketAggs(rows, buckets);
  const labels = items.map(it => buckets.granularity==='Weekly' ? `${it.label} (${it.range})` : it.label);
  const data = items.map(it => it.agg[mi.key]);
  document.getElementById('trendTitle').textContent = buckets.granularity + ' trend';
  document.getElementById('trendDesc').textContent = forced
    ? `Set to ${buckets.granularity.toLowerCase()} view. Switch back to Auto to let it size itself.`
    : (buckets.granularity==='Daily' ? 'Filtered period, day by day'
      : `Grouped into ${buckets.granularity.toLowerCase()} buckets automatically because the period is long`);
  autoFitChartWidth('trendChart', labels.length, 48, 0);
  const isBar = type==='bar', fillArea = type==='area';
  makeChart('trend','trendChart', { drill:(di,i)=>({ title:`${buckets.granularity} — ${labels[i]}`, rows: rows.filter(buckets.defs[i].match) }),
    type: isBar?'bar':'line',
    data:{ labels, datasets:[Object.assign({label:mi.short, data, borderColor:mi.color,
      backgroundColor: isBar? mi.color : mi.colorSoft, fill:fillArea, tension:.35, borderWidth:isBar?0:2.5,
      pointRadius:isBar?0:3.5, pointBackgroundColor:'#fff', pointBorderColor:mi.color, pointBorderWidth:2}, isBar?barStyle:{})]},
    options: baseOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}, x:{ticks:{maxRotation:45,minRotation:0,autoSkip:true,maxTicksLimit:40}}}, false, false, (evts)=>{
      const idx=evts[0].dataIndex; return richTooltip(items[idx].agg, labels[idx]);
    }, fmtINRShort)
  });
}
function renderWow(type){
  destroyChart('wow');
  const mi = METRIC_INFO[state.metric];
  const rows = currentRows();
  let scopeWeeks = weeksInScope(rows);
  const truncated = scopeWeeks.length > WEEK_BUCKET_LIMIT;
  if(truncated) scopeWeeks = scopeWeeks.slice(-WEEK_BUCKET_LIMIT);
  document.getElementById('wowDesc').textContent = truncated
    ? `Most recent ${WEEK_BUCKET_LIMIT} weeks in the current filter (older weeks still count in totals)`
    : 'All three metrics available on hover';
  const aggs = scopeWeeks.map(w=>aggregateRows(rows.filter(r=>r.weekKey===w.key)));
  const labels = scopeWeeks.map(w=>w.label);
  autoFitChartWidth('wowChart', labels.length, 46, 0);
  makeChart('wow','wowChart', { drill:(di,i)=>({ title:`${scopeWeeks[i].label} (${scopeWeeks[i].range})`, rows: rows.filter(r=>r.weekKey===scopeWeeks[i].key) }),
    type,
    data:{ labels, datasets:[Object.assign({label:mi.short, data:aggs.map(a=>a[mi.key]),
      backgroundColor: type==='bar' ? labels.map((_,i)=>PERIOD_COLORS[i%PERIOD_COLORS.length]) : mi.colorSoft,
      borderColor:mi.color, borderWidth:type==='bar'?0:2.5, tension:.35, fill:false,
      pointRadius:3.5, pointBackgroundColor:'#fff', pointBorderColor:mi.color, pointBorderWidth:2}, type==='bar'?barStyle:{})]},
    options: baseOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}}, false, false, (items)=>{
      const idx=items[0].dataIndex; return richTooltip(aggs[idx], labels[idx]);
    }, fmtINRShort)
  });
}
function renderSplit(type){
  destroyChart('split');
  const mi = METRIC_INFO[state.metric];
  const rows = currentRows();
  let scopeWeeks = weeksInScope(rows);
  if(scopeWeeks.length > WEEK_BUCKET_LIMIT) scopeWeeks = scopeWeeks.slice(-WEEK_BUCKET_LIMIT);
  const typeRec = (w, ot) => aggregateRows(rows.filter(r=>r.weekKey===w.key && r.ordertype===ot));
  if(type==='pie'){
    autoFitChartWidth('splitChart', 0, 0, 0);
    const crrRec = aggregateRows(rows.filter(r=>r.ordertype==='CRR'));
    const nbdRec = aggregateRows(rows.filter(r=>r.ordertype==='NBD'));
    makeChart('split','splitChart', { drill:(di,i)=>{ const ot = i===0?'CRR':'NBD'; return { title:`${ot} orders`, rows: rows.filter(r=>r.ordertype===ot) }; },
      type:'doughnut',
      data:{labels:['CRR','NBD'], datasets:[{data:[crrRec[mi.key],nbdRec[mi.key]], backgroundColor:[CRR_COLOR,NBD_COLOR], borderColor:'#fff', borderWidth:4, hoverOffset:6}]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'55%',
        plugins:{ legend:{position:'bottom',labels:{color:THEME.ink,font:{size:11.5},usePointStyle:true,pointStyle:'circle'}},
          datalabels: pieDL(),
          tooltip: tooltipConfigFromFn((items)=>{ const rec = items[0].label==='CRR'?crrRec:nbdRec; return richTooltip(rec, items[0].label); })}}});
    return;
  }
  const labels = scopeWeeks.map(w=>w.label);
  const crrRecs = scopeWeeks.map(w=>typeRec(w,'CRR'));
  const nbdRecs = scopeWeeks.map(w=>typeRec(w,'NBD'));
  const stacked = type==='stacked';
  autoFitChartWidth('splitChart', labels.length, stacked?50:70, 0);
  const bs = stacked ? {borderRadius:6, borderSkipped:false, maxBarThickness:64, borderColor:'#fff', borderWidth:{top:2}} : barStyle;
  makeChart('split','splitChart', { drill:(di,i)=>{ const ot = di===0?'CRR':'NBD', w = scopeWeeks[i]; return { title:`${ot} — ${w.label} (${w.range})`, rows: rows.filter(r=>r.weekKey===w.key && r.ordertype===ot) }; },
    type:'bar', data:{labels, datasets:[
      Object.assign({label:'CRR', data:crrRecs.map(r=>r[mi.key]), backgroundColor:CRR_COLOR, meta:crrRecs}, bs),
      Object.assign({label:'NBD', data:nbdRecs.map(r=>r[mi.key]), backgroundColor:NBD_COLOR, meta:nbdRecs}, bs)
    ]},
    options: singleItemOpts({x:{stacked}, y:{stacked,ticks:{callback:v=>fmtINRShort(v)}}}, true, false, (items)=>{
      const it = items[0]; const rec = it.dataset.meta[it.dataIndex];
      return [`${it.dataset.label} — ${labels[it.dataIndex]}`, ...richTooltip(rec)];
    }, fmtINRShort)
  });
}
function renderSp(type){
  destroyChart('sp');
  const mi = METRIC_INFO[state.metric];
  const rows = currentRows();
  let scopeWeeks = weeksInScope(rows);
  const SP_STACK_LIMIT = 8;
  const truncatedForStack = scopeWeeks.length > SP_STACK_LIMIT;
  document.getElementById('spDesc').textContent = (type==='line')
    ? `Top ${ADMIN.topSalespersonN} performers, up to the most recent ${Math.min(scopeWeeks.length, WEEK_BUCKET_LIMIT)} weeks`
    : (truncatedForStack ? `Top ${ADMIN.topSalespersonN} performers, most recent ${SP_STACK_LIMIT} weeks shown (totals above include everything)` : `Top ${ADMIN.topSalespersonN} performers in the current filter`);
  if(scopeWeeks.length > WEEK_BUCKET_LIMIT) scopeWeeks = scopeWeeks.slice(-WEEK_BUCKET_LIMIT);
  const totalBySp = {};
  rows.forEach(r=>{ totalBySp[r.salesperson] = (totalBySp[r.salesperson]||0)+r[mi.key]; });
  const topN = Object.entries(totalBySp).sort((a,b)=>b[1]-a[1]).slice(0, ADMIN.topSalespersonN).map(x=>x[0]);
  const spRec = (w, sp) => aggregateRows(rows.filter(r=>r.weekKey===w.key && r.salesperson===sp));
  if(type==='line'){
    autoFitChartWidth('spChart', scopeWeeks.length, 56, 0);
    const datasets = topN.map((sp,i)=>{ const recs = scopeWeeks.map(w=>spRec(w,sp)); return { label:sp, data:recs.map(r=>r[mi.key]), meta:recs,
      borderColor:PALETTE[i%PALETTE.length], backgroundColor:PALETTE[i%PALETTE.length], tension:.35, borderWidth:2.5, fill:false, pointRadius:3.5 }; });
    makeChart('sp','spChart', { drill:(di,i)=>{ const sp = topN[di], w = scopeWeeks[i]; return { title:`${sp} — ${w.label} (${w.range})`, rows: rows.filter(r=>r.salesperson===sp && r.weekKey===w.key) }; },
      type:'line', data:{labels:scopeWeeks.map(w=>w.label), datasets},
      options: baseOpts({y:{ticks:{callback:v=>fmtINRShort(v)}}}, true, false, (items)=>{
        const lines=[]; items.forEach(it=>{ const rec=it.dataset.meta[it.dataIndex]; lines.push(`${it.dataset.label} — ${scopeWeeks[it.dataIndex]?.label||''}`, ...richTooltip(rec)); });
        return lines;
      }, fmtINRShort)});
    return;
  }
  const spPeriods = scopeWeeks.length > SP_STACK_LIMIT ? scopeWeeks.slice(-SP_STACK_LIMIT) : scopeWeeks;
  const stacked = type==='stacked';
  autoFitChartWidth('spChart', topN.length, stacked ? 70 : Math.max(70, spPeriods.length*26), 0);
  const bs = stacked ? {borderRadius:6, borderSkipped:false, maxBarThickness:90, borderColor:'#fff', borderWidth:{top:2}} : {borderRadius:6, borderSkipped:false, maxBarThickness:40};
  const datasets = spPeriods.map((w,wi)=>{ const recs = topN.map(sp=>spRec(w,sp)); return Object.assign({ label:`${w.label} (${w.range})`, data:recs.map(r=>r[mi.key]), meta:recs,
    backgroundColor: PERIOD_COLORS[wi%PERIOD_COLORS.length] }, bs); });
  makeChart('sp','spChart', { drill:(di,i)=>{ const sp = topN[i], w = spPeriods[di]; return { title:`${sp} — ${w.label} (${w.range})`, rows: rows.filter(r=>r.salesperson===sp && r.weekKey===w.key) }; },
    type:'bar', data:{labels:topN, datasets},
    options: singleItemOpts({x:{stacked}, y:{stacked,ticks:{callback:v=>fmtINRShort(v)}}}, true, false, (items)=>{
      const it = items[0];
      return [`${it.dataset.label} — ${topN[it.dataIndex]}`, ...richTooltip(it.dataset.meta[it.dataIndex])];
    }, fmtINRShort)
  });
}
