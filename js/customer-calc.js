/* =====================================================================
   customer-calc.js — Customer Insights calculations (no drawing)
   Uses: Customer Name, Invoice Date, Amount Without Tax, Profit,
         Salesperson, Order Types, Place of Supply, Billing Code (pin)
   Respects the global filters: salesperson, order type and period.
   ===================================================================== */

const DAY_MS = 86400000;

const REGION_OF_STATE = (()=>{
  const m = {
    'North': ['Delhi','Haryana','Punjab','Himachal Pradesh','Jammu and Kashmir','Ladakh','Chandigarh','Uttarakhand','Uttar Pradesh','Rajasthan'],
    'West': ['Gujarat','Maharashtra','Goa','Dadra and Nagar Haveli and Daman and Diu','Daman and Diu','Dadra and Nagar Haveli'],
    'Central': ['Madhya Pradesh','Chhattisgarh'],
    'South': ['Karnataka','Kerala','Tamil Nadu','Telangana','Andhra Pradesh','Puducherry','Pondicherry','Lakshadweep'],
    'East': ['West Bengal','Odisha','Orissa','Bihar','Jharkhand','Andaman and Nicobar Islands'],
    'North-East': ['Assam','Meghalaya','Manipur','Mizoram','Nagaland','Tripura','Arunachal Pradesh','Sikkim']
  };
  const out = {};
  Object.entries(m).forEach(([reg, list])=> list.forEach(s=> out[s.toLowerCase()] = reg));
  return out;
})();
// Pin code first digit = India Post zone; used only when the state name isn't recognised
const PIN_ZONE_REGION = { '1':'North', '2':'North', '3':'West', '4':'West', '5':'South', '6':'South', '7':'East', '8':'East' };
function regionOf(stateName, pin){
  const r = REGION_OF_STATE[(stateName||'').toLowerCase()];
  if(r) return r;
  if(pin && PIN_ZONE_REGION[pin[0]]) return PIN_ZONE_REGION[pin[0]];
  return 'Not mapped';
}

const SEGMENTS = {
  'Champion':        { color:'#1FB286', desc:'Order often, ordered recently, top 20% by value', action:'Protect: priority service, first to hear about new stock and prices' },
  'Loyal':           { color:'#6C5CE7', desc:'Order regularly (4+ order days), active in last 45 days', action:'Upsell related products, ask for referrals' },
  'Promising':       { color:'#3FB8E0', desc:'Active in last 45 days, still building frequency', action:'Follow up for the next order, share catalogue' },
  'New':             { color:'#F6A623', desc:'First ever order in the last 30 days', action:'Welcome call, aim for a 2nd order within the first month' },
  'At risk':         { color:'#EF5466', desc:'Used to reorder, now overdue (2× their usual gap, min 30 days)', action:'Call this week: check for issues, offer a reason to reorder' },
  'Needs attention': { color:'#FFC857', desc:'Rare orders and quiet for 45–90 days', action:'Re-engage with an offer or new product' },
  'Lost':            { color:'#A4A2C0', desc:'No order in 90+ days', action:'Win-back campaign, or move off the active list' }
};
const SEGMENT_ORDER = ['Champion','Loyal','Promising','New','At risk','Needs attention','Lost'];

/* The date window the filters point at. "All time" = whole sheet. */
function periodWindow(){
  const first = ALL_ROWS.length ? ALL_ROWS[0].date : new Date();
  const last  = ALL_ROWS.length ? ALL_ROWS[ALL_ROWS.length-1].date : new Date();
  const endOf = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  if(state.mode==='WEEK' && state.weekKey!=null){
    const s = new Date(state.weekKey), e = new Date(s); e.setDate(e.getDate()+6);
    return { start:s, end:endOf(e), isAll:false };
  }
  if(state.mode==='MONTH' && state.monthKey){
    const [y,m] = state.monthKey.split('-').map(Number);
    return { start:new Date(y,m-1,1), end:endOf(new Date(y,m,0)), isAll:false };
  }
  if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){
    return { start:new Date(state.rangeStart+'T00:00:00'), end:new Date(state.rangeEnd+'T23:59:59'), isAll:false };
  }
  return { start:new Date(first.getFullYear(), first.getMonth(), first.getDate()), end:endOf(last), isAll:true };
}
function topKey(obj){
  let best = null, bv = -Infinity;
  for(const k in obj){ if(obj[k] > bv){ bv = obj[k]; best = k; } }
  return best;
}
function median(arr){
  if(!arr.length) return null;
  const a = arr.slice().sort((x,y)=>x-y), m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}

/* Builds everything the Customers tab needs in ONE pass over the rows (fast even with 10k+ invoices). */
function buildCustomerModel(){
  const win = periodWindow();
  const latest = ALL_ROWS.length ? ALL_ROWS[ALL_ROWS.length-1].date : new Date();
  const ref = new Date(Math.min(win.end.getTime(), endOfDay(latest).getTime()));   // "today" for recency = end of the selected period
  const newStart = win.isAll ? new Date(ref.getTime() - 29*DAY_MS) : win.start;     // All time → "new" means last 30 days
  const newLabel = win.isAll ? 'last 30 days' : 'this period';

  // First order ever, company-wide (a customer is "new" only if the COMPANY has never billed them before)
  const firstEver = {};
  ALL_ROWS.forEach(r=>{ const f = firstEver[r.customer]; if(!f || r.date < f) firstEver[r.customer] = r.date; });

  const base = baseFiltered(ALL_ROWS);
  const hist = base.filter(r=>r.date <= ref);             // lifetime up to the period end
  const cur  = currentRows();                              // exactly what the filters select

  // Comparison window for "trend": previous equal period, or last 30 days vs the 30 before (All time)
  const linked = getCurrentAndPreviousPeriod(base);
  let cmpCur, cmpPrev, cmpLabel;
  if(linked){
    cmpCur = linked.curRows; cmpPrev = linked.prevRows;
    cmpLabel = linked.prevLabel ? `vs ${linked.prevLabel}` : 'no previous period to compare';
  } else {
    const s = new Date(ref.getTime() - 29*DAY_MS); s.setHours(0,0,0,0);
    const pe = new Date(s.getTime() - 1), ps = new Date(pe.getTime() - 29*DAY_MS); ps.setHours(0,0,0,0);
    cmpCur = hist.filter(r=>r.date>=s && r.date<=ref);
    cmpPrev = hist.filter(r=>r.date>=ps && r.date<=pe);
    cmpLabel = 'last 30 days vs the 30 days before';
  }

  const map = {};
  const blank = () => ({ net:0, profit:0, gross:0, invoices:0 });
  const get = name => map[name] || (map[name] = { name, life:blank(), per:blank(), cmpCur:0, cmpPrev:0, first:null, last:null,
    days:new Set(), spNet:{}, states:{}, pins:{}, types:{}, months:{} });
  hist.forEach(r=>{
    const c = get(r.customer), L = c.life;
    L.net += r.net; L.pnet = (L.pnet||0) + r.pnet; L.profit += r.profit; L.gross += r.total; L.invoices++;
    if(!c.first || r.date < c.first) c.first = r.date;
    if(!c.last  || r.date > c.last)  c.last  = r.date;
    c.days.add(Math.floor(new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()).getTime()/DAY_MS));
    c.spNet[r.salesperson] = (c.spNet[r.salesperson]||0) + r.net;
    if(r.state) c.states[r.state] = (c.states[r.state]||0) + r.net;
    if(r.pincode) c.pins[r.pincode] = (c.pins[r.pincode]||0) + r.net;
    c.types[r.ordertype] = (c.types[r.ordertype]||0) + r.net;
    c.months[r.monthKey] = (c.months[r.monthKey]||0) + r.net;
  });
  cur.forEach(r=>{ const P = get(r.customer).per; P.net += r.net; P.pnet = (P.pnet||0) + r.pnet; P.profit += r.profit; P.gross += r.total; P.invoices++; });
  cmpCur.forEach(r=>{ if(map[r.customer]) map[r.customer].cmpCur += r.net; });
  cmpPrev.forEach(r=>{ if(map[r.customer]) map[r.customer].cmpPrev += r.net; });

  const list = Object.values(map).map(c=>{
    const d = [...c.days].sort((a,b)=>a-b);
    c.orderDays = d.length;
    c.avgGap = d.length>1 ? (d[d.length-1]-d[0])/(d.length-1) : null;
    c.recency = c.last ? Math.max(0, Math.floor((ref - c.last)/DAY_MS)) : null;
    c.firstEver = firstEver[c.name] || c.first;
    c.daysSinceFirst = c.firstEver ? Math.floor((ref - c.firstEver)/DAY_MS) : null;
    c.isNew = !!(c.firstEver && c.firstEver >= newStart && c.firstEver <= ref);
    c.salesperson = topKey(c.spNet) || '—';
    c.state = topKey(c.states) || '';
    c.pincode = topKey(c.pins) || '';
    c.region = regionOf(c.state, c.pincode);
    c.mainType = topKey(c.types) || '';
    c.gp = gpOf(c.life);
    c.perGp = gpOf(c.per);
    c.aov = c.life.invoices ? c.life.net/c.life.invoices : 0;
    c.growth = c.cmpPrev ? (c.cmpCur-c.cmpPrev)/c.cmpPrev*100 : (c.cmpCur>0 ? null : 0);
    delete c.days;
    return c;
  });

  // Segment each customer (value threshold = top 20% of lifetime sales)
  const vals = list.map(c=>c.life.net).sort((a,b)=>b-a);
  const top20 = vals.length ? vals[Math.max(0, Math.ceil(vals.length*0.2)-1)] : Infinity;
  list.forEach(c=>{ c.segment = segmentOf(c, top20); });

  /* ---------- period-level views ---------- */
  const active = list.filter(c=>c.per.invoices>0).sort((a,b)=>b.per.net-a.per.net);
  const perNet = active.reduce((s,c)=>s+c.per.net,0);
  const perProfit = active.reduce((s,c)=>s+c.per.profit,0);
  const newActive = active.filter(c=>c.isNew);
  const newNet = newActive.reduce((s,c)=>s+c.per.net,0);
  const retActive = active.filter(c=>!c.isNew);

  const shareOfTop = n => perNet ? active.slice(0,n).reduce((s,c)=>s+c.per.net,0)/perNet*100 : 0;
  const concentration = [
    { label:'Top 1',  pct: shareOfTop(1) },
    { label:'Top 5',  pct: shareOfTop(5) },
    { label:'Top 10', pct: shareOfTop(10) },
    { label:'Top 20', pct: shareOfTop(20) },
    { label:'Top 50', pct: shareOfTop(50) },
    { label:'All',    pct: perNet ? 100 : 0 }
  ];
  // how many customers make 80% of sales
  let run = 0, n80 = 0;
  for(const c of active){ run += c.per.net; n80++; if(perNet && run/perNet >= 0.8) break; }

  // state / region / pincode from the period rows
  const byState = {}, byRegion = {}, byPin = {};
  let noState = 0, noPin = 0;
  cur.forEach(r=>{
    const st = r.state || 'Not given';
    if(!r.state) noState++;
    if(!r.pincode) noPin++;
    const S = byState[st] || (byState[st] = { state:st, net:0, profit:0, invoices:0, customers:new Set() });
    S.net += r.net; S.pnet = (S.pnet||0) + r.pnet; S.profit += r.profit; S.invoices++; S.customers.add(r.customer);
    const reg = regionOf(r.state, r.pincode);
    const R = byRegion[reg] || (byRegion[reg] = { region:reg, net:0, profit:0, invoices:0, customers:new Set() });
    R.net += r.net; R.pnet = (R.pnet||0) + r.pnet; R.profit += r.profit; R.invoices++; R.customers.add(r.customer);
    if(r.pincode){
      const P = byPin[r.pincode] || (byPin[r.pincode] = { pin:r.pincode, net:0, profit:0, invoices:0, customers:{}, states:{} });
      P.net += r.net; P.pnet = (P.pnet||0) + r.pnet; P.profit += r.profit; P.invoices++;
      P.customers[r.customer] = (P.customers[r.customer]||0) + r.net;
      if(r.state) P.states[r.state] = (P.states[r.state]||0) + r.net;
    }
  });
  const fin = o => Object.assign(o, { custCount: o.customers instanceof Set ? o.customers.size : Object.keys(o.customers).length, gp: gpOf(o), share: perNet ? o.net/perNet*100 : 0 });
  const states = Object.values(byState).map(fin).sort((a,b)=>b.net-a.net);
  const regions = Object.values(byRegion).map(fin).sort((a,b)=>b.net-a.net);
  const pins = Object.values(byPin).map(p=>{ fin(p); p.state = topKey(p.states) || '—'; p.topCustomer = topKey(p.customers) || '—'; return p; }).sort((a,b)=>b.net-a.net);

  // segments summary (lifetime view, customers who appear in the filtered history)
  const segments = SEGMENT_ORDER.map(name=>{
    const cs = list.filter(c=>c.segment===name);
    return { name, count:cs.length, lifeNet:cs.reduce((s,c)=>s+c.life.net,0), perNet:cs.reduce((s,c)=>s+c.per.net,0), ...SEGMENTS[name] };
  });

  // new vs returning per month (history up to period end, last 12 months)
  const monthKeys = [...new Set(hist.map(r=>r.monthKey))].sort().slice(-12);
  const nvr = monthKeys.map(k=>{
    const custs = {};
    hist.forEach(r=>{ if(r.monthKey===k) custs[r.customer] = (custs[r.customer]||0) + r.net; });
    let nNew=0, nRet=0, sNew=0, sRet=0;
    Object.entries(custs).forEach(([name, net])=>{
      const f = firstEver[name];
      const fk = f ? `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}` : '';
      if(fk===k){ nNew++; sNew+=net; } else { nRet++; sRet+=net; }
    });
    const m = MONTHS.find(x=>x.key===k);
    return { key:k, label: m ? m.label : k, nNew, nRet, sNew, sRet };
  });

  // action lists
  const atRisk = list.filter(c=>c.segment==='At risk').sort((a,b)=>b.life.net-a.life.net);
  const overallGp = perNet ? perProfit/perNet*100 : 0;
  const bigCut = active.length ? active[Math.max(0, Math.ceil(active.length*0.25)-1)].per.net : Infinity;
  const lowMarginBig = active.filter(c=>c.per.net >= bigCut && c.perGp < overallGp).sort((a,b)=>b.per.net-a.per.net);
  const gaps = list.filter(c=>c.avgGap!==null && c.orderDays>=3).map(c=>c.avgGap);

  return {
    win, ref, newLabel, cmpLabel, list, active, perNet, perProfit, overallGp,
    newActive, newNet, retActive, concentration, n80,
    states, regions, pins, noState, noPin, curRowCount: cur.length,
    segments, nvr, atRisk, lowMarginBig, medianGap: median(gaps),
    hasState: cur.some(r=>r.state), hasPin: cur.some(r=>r.pincode)
  };
}
function endOfDay(d){ const x = new Date(d); x.setHours(23,59,59,999); return x; }

function segmentOf(c, top20){
  if(c.recency===null || c.recency > 90) return 'Lost';
  if(c.daysSinceFirst !== null && c.daysSinceFirst <= 30) return 'New';
  const overdueAfter = Math.max(30, (c.avgGap||0)*2);
  if(c.orderDays >= 2 && c.recency > overdueAfter) return 'At risk';
  if(c.orderDays >= 6 && c.recency <= 30 && c.life.net >= top20) return 'Champion';
  if(c.orderDays >= 4 && c.recency <= 45) return 'Loyal';
  if(c.recency <= 45) return 'Promising';
  return 'Needs attention';
}

/* Plain-language insights generated from the model. Each only appears when the data supports it. */
function buildCustomerInsights(M){
  const out = [];
  if(!M.active.length) return [{ tone:'info', text:'No customer activity in the selected filters.' }];
  const top10 = M.concentration[2].pct;
  out.push({ tone: top10 >= 50 ? 'warn' : 'good',
    text: `<b>Top 10 customers bring ${top10.toFixed(1)}%</b> of net sales, and <b>${fmtNum(M.n80)} of ${fmtNum(M.active.length)}</b> customers make up 80% of sales.` +
      (top10 >= 50 ? ' That is a high dependence — losing one big account would hurt.' : ' Sales are well spread across customers.') });

  if(M.hasState && M.states.length){
    const s0 = M.states.find(s=>s.state!=='Not given') || M.states[0];
    out.push({ tone:'info', text:`<b>${s0.state}</b> is the biggest market: ${s0.share.toFixed(1)}% of sales from ${fmtNum(s0.custCount)} customers at ${s0.gp.toFixed(1)}% GP.` });
    const meaningful = M.states.filter(s=>s.state!=='Not given' && s.share >= 3);
    if(meaningful.length >= 2){
      const best = meaningful.slice().sort((a,b)=>b.gp-a.gp)[0], worst = meaningful.slice().sort((a,b)=>a.gp-b.gp)[0];
      if(best.state !== worst.state) out.push({ tone:'info', text:`Best margin state is <b>${best.state}</b> (${best.gp.toFixed(1)}% GP); lowest is <b>${worst.state}</b> (${worst.gp.toFixed(1)}% GP). Check pricing or freight for ${worst.state}.` });
    }
    const r0 = M.regions.find(r=>r.region!=='Not mapped');
    if(r0) out.push({ tone:'info', text:`<b>${r0.region} India</b> region contributes ${r0.share.toFixed(1)}% of sales across ${fmtNum(r0.custCount)} customers.` });
  }

  const newShare = M.perNet ? M.newNet/M.perNet*100 : 0;
  if(M.newActive.length){
    const aovNew = M.newActive.reduce((s,c)=>s+c.per.net,0) / Math.max(1, M.newActive.reduce((s,c)=>s+c.per.invoices,0));
    const aovRet = M.retActive.reduce((s,c)=>s+c.per.net,0) / Math.max(1, M.retActive.reduce((s,c)=>s+c.per.invoices,0));
    out.push({ tone:'good', text:`<b>${fmtNum(M.newActive.length)} new customer${M.newActive.length===1?'':'s'}</b> (${M.newLabel}) added ${fmtINR(M.newNet)} — ${newShare<0.1?'under 0.1':newShare.toFixed(1)}% of sales. Avg invoice: new ${fmtINR(aovNew)} vs returning ${fmtINR(aovRet)}.` });
  } else {
    out.push({ tone:'warn', text:`No new customers ${M.newLabel === 'this period' ? 'in this period' : 'in the last 30 days'}. All sales came from existing accounts.` });
  }

  if(M.atRisk.length){
    const val = M.atRisk.reduce((s,c)=>s+c.life.net,0);
    out.push({ tone:'bad', text:`<b>${fmtNum(M.atRisk.length)} regular customers are overdue</b> (together ${fmtINR(val)} lifetime). Top ones to call: ${M.atRisk.slice(0,3).map(c=>`${c.name} (${c.recency} days)`).join(', ')}.` });
  }
  if(M.lowMarginBig.length){
    out.push({ tone:'warn', text:`<b>${fmtNum(M.lowMarginBig.length)} large customers are below your average margin</b> of ${M.overallGp.toFixed(1)}%: ${M.lowMarginBig.slice(0,3).map(c=>`${c.name} (${c.perGp.toFixed(1)}%)`).join(', ')}.` });
  }
  const movers = M.list.filter(c=>c.cmpPrev>0 && c.cmpCur>0 && isFinite(c.growth));
  if(movers.length >= 2){
    const up = movers.slice().sort((a,b)=>(b.cmpCur-b.cmpPrev)-(a.cmpCur-a.cmpPrev))[0];
    const down = movers.slice().sort((a,b)=>(a.cmpCur-a.cmpPrev)-(b.cmpCur-b.cmpPrev))[0];
    if(up.cmpCur>up.cmpPrev) out.push({ tone:'good', text:`Biggest gain: <b>${up.name}</b> +${fmtINR(up.cmpCur-up.cmpPrev)} (${up.growth.toFixed(0)}%), ${M.cmpLabel}.` });
    if(down.cmpCur<down.cmpPrev) out.push({ tone:'bad', text:`Biggest drop: <b>${down.name}</b> −${fmtINR(down.cmpPrev-down.cmpCur)} (${down.growth.toFixed(0)}%), ${M.cmpLabel}.` });
  }
  if(M.medianGap) out.push({ tone:'info', text:`A typical repeat customer reorders every <b>${Math.round(M.medianGap)} days</b> (median). Customers quiet for much longer than that show up as "At risk".` });
  if(M.hasPin && M.pins.length){
    const p = M.pins[0];
    out.push({ tone:'info', text:`Top pin code <b>${p.pin}</b> (${p.state}) — ${fmtINR(p.net)} from ${fmtNum(p.custCount)} customer${p.custCount>1?'s':''}, biggest: ${p.topCustomer}.` });
  }
  if(M.noState || M.noPin){
    out.push({ tone:'warn', text:`Data check: ${fmtNum(M.noState)} invoices have no Place of Supply and ${fmtNum(M.noPin)} have no valid 6-digit Billing Code in this filter. Fill them in the data for accurate location reports.` });
  }
  return out;
}
