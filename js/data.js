/* =====================================================================
   data.js — data store + all calculations
   Rows from Supabase (via cloud.js), location filter, aggregation, period buckets. No drawing here.
   ===================================================================== */
let ALL_ROWS = [];
let WEEKS = [];
let MONTHS = [];
let charts = {};
let chartTypes = { trend:'bar', split:'stacked', sp:'stacked', wow:'bar' };
let refreshTimer = null;

let state = {
  location: CONFIG.DEFAULT_LOCATION,
  metric: 'net', ordertype: 'ALL', salesperson: 'ALL', mode: 'ALL',
  weekKey: null, monthKey: null, rangeStart: null, rangeEnd: null,
  trendGran: 'auto', growthGran: 'week', misGran: 'month', scoreGran: 'week'
};
let DATA_HEALTH = null;


/* ---- Place of Supply / pin code clean-up (so "DELHI", "Delhi (07)", "07-Delhi" all become "Delhi") ---- */
function normState(v){
  if(v===null || v===undefined) return '';
  let t = String(v).replace(/\(.*?\)/g,' ').replace(/^\s*\d+\s*[-–:]\s*/,'').replace(/&/g,' and ').replace(/\s+/g,' ').trim();
  if(!t || t==='-' ) return '';
  return t.toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()).replace(/\bAnd\b/g,'and');
}
function normPin(v){
  if(v===null || v===undefined) return '';
  const d = String(v).replace(/\.0+$/,'').replace(/\D/g,'');
  return d.length===6 ? d : '';
}

/* ---------------------- Fetch & parse ---------------------- */
function colIndex(cols, matchers){
  for(const m of matchers){
    const idx = cols.findIndex(c => ((c.label||'')+'').trim().toLowerCase() === m);
    if(idx>=0) return idx;
  }
  return -1;
}
function parseSheetDate(v){
  if(v==null) return null;
  if(v instanceof Date) return v;
  if(typeof v === 'number'){
    const base = new Date(Date.UTC(1899,11,30));
    return new Date(base.getTime() + v*86400000);
  }
  if(typeof v === 'string'){
    let m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if(m) return new Date(+m[1], +m[2], +m[3]);
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m) return new Date(+m[3], +m[2]-1, +m[1]);
    const parsed = new Date(v);
    if(!isNaN(parsed)) return parsed;
  }
  return null;
}
/* ---------------------- Supabase data (replaces the Google Sheet) ---------------------- */
function applyLocation(rows){
  const loc = state.location || CONFIG.DEFAULT_LOCATION;
  return loc === 'ALL' ? rows.slice() : rows.filter(r => r.location === loc);
}
/* Same name as before, so the rest of the dashboard is unchanged. Returns rows for the chosen location. */
async function fetchSheetRows(forceFull){
  const res = await loadInvoices(forceFull);
  const all = res.rows.map(toDashRow).filter(r => r.date && !isNaN(r.date));
  const active = all.filter(r => r.status !== 'VOID' && (r.net || r.total));
  RAW_ROWS = active;
  const pending = active.filter(r => r.pp && CONFIG.PROFIT_LOCATIONS.indexOf(r.location) >= 0).length;
  DATA_HEALTH = {
    sheetRows: res.rows.length, loaded: active.length,
    voided: all.filter(r => r.status === 'VOID').length,
    skippedNoDate: res.rows.length - all.length, skippedNoAmount: 0,
    profitPending: pending, downloaded: res.downloaded, full: res.full, cacheOk: res.cacheOk,
    locations: [...new Set(active.map(r => r.location))].sort(), missingColumns: []
  };
  return applyLocation(active);
}

function mondayOf(d){
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  const diff = day===0 ? -6 : 1-day;
  dt.setDate(dt.getDate()+diff);
  return dt;
}
function fmtShort(d){ return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); }
function fmtDateInput(d){
  // local date (toISOString shifts to UTC and can land on the previous day in IST)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function enrichAndIndex(rows){
  const weekMap = new Map(), monthMap = new Map();
  rows.forEach(r=>{
    const mon = mondayOf(r.date);
    r.weekKey = mon.getTime();
    if(!weekMap.has(r.weekKey)){
      const sat = new Date(mon); sat.setDate(sat.getDate()+5);
      weekMap.set(r.weekKey, `${fmtShort(mon)} – ${fmtShort(sat)}`);
    }
    r.monthKey = `${r.date.getFullYear()}-${String(r.date.getMonth()+1).padStart(2,'0')}`;
    if(!monthMap.has(r.monthKey)){
      monthMap.set(r.monthKey, r.date.toLocaleDateString('en-US',{month:'long',year:'numeric'}));
    }
  });
  const weekKeys = [...weekMap.keys()].sort((a,b)=>a-b);
  const weeksMeta = {};
  const weeks = weekKeys.map((k,i)=>{ const o={key:k,index:i+1,label:`Week ${i+1}`,range:weekMap.get(k)}; weeksMeta[k]=o; return o; });
  const monthKeys = [...monthMap.keys()].sort();
  const months = monthKeys.map(k=>({key:k,label:monthMap.get(k)}));
  rows.forEach(r=>{ r.weekIndex = weeksMeta[r.weekKey].index; r.weekLabel = weeksMeta[r.weekKey].label; r.weekRange = weeksMeta[r.weekKey].range; });
  rows.sort((a,b)=>a.date-b.date);
  return { weeks, months };
}

/* ---------------------- Filtering & aggregation ---------------------- */
function baseFiltered(rows){
  let out = rows;
  if(state.salesperson!=='ALL') out = out.filter(r=>r.salesperson===state.salesperson);
  if(state.ordertype!=='ALL') out = out.filter(r=>r.ordertype===state.ordertype);
  return out;
}
function periodFiltered(rows){
  let out = rows;
  if(state.mode==='WEEK' && state.weekKey!=null){
    out = out.filter(r=>r.weekKey===state.weekKey);
  } else if(state.mode==='MONTH' && state.monthKey){
    out = out.filter(r=>r.monthKey===state.monthKey);
  } else if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){
    const s = new Date(state.rangeStart+'T00:00:00');
    const e = new Date(state.rangeEnd+'T23:59:59');
    out = out.filter(r=>r.date>=s && r.date<=e);
  }
  return out;
}
function currentRows(){ return periodFiltered(baseFiltered(ALL_ROWS)); }

function aggregateRows(rows){
  const net = rows.reduce((s,r)=>s+r.net,0);
  const gross = rows.reduce((s,r)=>s+r.total,0);
  const profit = rows.reduce((s,r)=>s+r.profit,0);
  const pnet = rows.reduce((s,r)=>s+(r.pnet===undefined ? r.net : r.pnet),0);   // sales that have a profit entered
  const invoices = rows.length;
  const byDayMap = {}, bySpMap = {}, byTypeMap = {}, byCustMap = {}, byCompMap = {};
  rows.forEach(r=>{
    const dk = r.date.toDateString();
    byDayMap[dk] = byDayMap[dk] || {date:r.date, label:r.date.toLocaleDateString('en-US',{weekday:'short'})+' '+r.date.getDate(), net:0, gross:0, profit:0, invoices:0};
    byDayMap[dk].net+=r.net; byDayMap[dk].gross+=r.total; byDayMap[dk].profit+=r.profit; byDayMap[dk].pnet=(byDayMap[dk].pnet||0)+r.pnet; byDayMap[dk].invoices++;
    const sp = r.salesperson;
    bySpMap[sp] = bySpMap[sp] || {salesperson:sp, net:0, gross:0, profit:0, invoices:0};
    bySpMap[sp].net+=r.net; bySpMap[sp].gross+=r.total; bySpMap[sp].profit+=r.profit; bySpMap[sp].pnet=(bySpMap[sp].pnet||0)+r.pnet; bySpMap[sp].invoices++;
    const ot = r.ordertype;
    byTypeMap[ot] = byTypeMap[ot] || {ordertype:ot, net:0, gross:0, profit:0, invoices:0};
    byTypeMap[ot].net+=r.net; byTypeMap[ot].gross+=r.total; byTypeMap[ot].profit+=r.profit; byTypeMap[ot].pnet=(byTypeMap[ot].pnet||0)+r.pnet; byTypeMap[ot].invoices++;
    const c = r.customer;
    byCustMap[c] = byCustMap[c] || {name:c, net:0, gross:0, profit:0, invoices:0, ordertype:r.ordertype, salesperson:r.salesperson};
    byCustMap[c].net+=r.net; byCustMap[c].gross+=r.total; byCustMap[c].profit+=r.profit; byCustMap[c].pnet=(byCustMap[c].pnet||0)+r.pnet; byCustMap[c].invoices++;
    const cs = r.companysales === 'YES' ? 'YES' : 'NO';
    byCompMap[cs] = byCompMap[cs] || {companysales:cs, net:0, gross:0, profit:0, invoices:0};
    byCompMap[cs].net+=r.net; byCompMap[cs].gross+=r.total; byCompMap[cs].profit+=r.profit; byCompMap[cs].pnet=(byCompMap[cs].pnet||0)+r.pnet; byCompMap[cs].invoices++;
  });
  const customers = Object.values(byCustMap);
  return {
    net, gross, profit, invoices,
    gpPct: pnet ? (profit/pnet*100) : 0,           // margin only over invoices whose profit is known
    pnet, profitPending: rows.filter(r=>r.pp).length,
    avgInvoice: invoices ? (net/invoices) : 0,
    byDay: Object.values(byDayMap).sort((a,b)=>a.date-b.date),
    bySp: Object.values(bySpMap).sort((a,b)=>b.net-a.net),
    byType: Object.values(byTypeMap),
    byCompanySales: Object.values(byCompMap),
    customers,
    topCustomers: customers.slice().sort((a,b)=>b.net-a.net).slice(0, ADMIN.topCustomersN)
  };
}
function growthSeries(values){
  const out=[null];
  for(let i=1;i<values.length;i++){
    const p=values[i-1], c=values[i];
    if(p>0) out.push((c-p)/p*100); else if(c>0) out.push(null); else out.push(0);
  }
  return out;
}
function overallGrowth(values){
  const idx = values.map((v,i)=>v>0?i:-1).filter(i=>i>=0);
  if(idx.length<2) return null;
  const first=values[idx[0]], last=values[idx[idx.length-1]];
  if(first===0) return null;
  return (last-first)/first*100;
}

function weeksInScope(rows){
  const keys = [...new Set(rows.map(r=>r.weekKey))].sort((a,b)=>a-b);
  return keys.map(k=>WEEKS.find(w=>w.key===k)).filter(Boolean);
}

function getCurrentAndPreviousPeriod(rows){
  if(state.mode==='WEEK' && state.weekKey!=null){
    const weeksHere = weeksInScope(rows);
    const idx = weeksHere.findIndex(w=>w.key===state.weekKey);
    const curDef = idx>=0 ? weeksHere[idx] : null;
    const prevDef = idx>0 ? weeksHere[idx-1] : null;
    return {
      curRows: rows.filter(r=>r.weekKey===state.weekKey),
      prevRows: prevDef ? rows.filter(r=>r.weekKey===prevDef.key) : [],
      curLabel: curDef ? `${curDef.label} (${curDef.range})` : 'Selected week',
      prevLabel: prevDef ? `${prevDef.label} (${prevDef.range})` : null,
      linked: true
    };
  }
  if(state.mode==='MONTH' && state.monthKey){
    const monthsHere = [...new Set(rows.map(r=>r.monthKey))].sort();
    const idx = monthsHere.indexOf(state.monthKey);
    const prevKey = idx>0 ? monthsHere[idx-1] : null;
    const curM = MONTHS.find(m=>m.key===state.monthKey);
    const prevM = prevKey ? MONTHS.find(m=>m.key===prevKey) : null;
    return {
      curRows: rows.filter(r=>r.monthKey===state.monthKey),
      prevRows: prevKey ? rows.filter(r=>r.monthKey===prevKey) : [],
      curLabel: curM ? curM.label : state.monthKey,
      prevLabel: prevM ? prevM.label : null,
      linked: true
    };
  }
  if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){
    const s = new Date(state.rangeStart+'T00:00:00');
    const e = new Date(state.rangeEnd+'T23:59:59');
    const spanDays = Math.max(1, Math.round((e-s)/86400000)+1);
    const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate()-1); prevEnd.setHours(23,59,59,999);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate()-(spanDays-1)); prevStart.setHours(0,0,0,0);
    return {
      curRows: rows.filter(r=>r.date>=s && r.date<=e),
      prevRows: rows.filter(r=>r.date>=prevStart && r.date<=prevEnd),
      curLabel: `${fmtShort(s)} – ${fmtShort(e)}`,
      prevLabel: `${fmtShort(prevStart)} – ${fmtShort(prevEnd)} (previous ${spanDays}-day period)`,
      linked: true
    };
  }
  return null;
}

const TREND_DAY_LIMIT = 40;
const WEEK_BUCKET_LIMIT = 16;
function buildPeriodBuckets(rows, forceGran){
  function dayBuckets(){
    const dayKeys = [...new Set(rows.map(r=>r.date.toDateString()))];
    const days = dayKeys.map(dk=>rows.find(r=>r.date.toDateString()===dk).date).sort((a,b)=>a-b);
    const multiMonth = new Set(days.map(d=>d.getFullYear()*12+d.getMonth())).size > 1;
    return { granularity:'Daily', defs: days.map(d=>({
      label: multiMonth ? d.getDate()+' '+d.toLocaleDateString('en-GB',{month:'short'}) : d.toLocaleDateString('en-US',{weekday:'short'})+' '+d.getDate(),
      match: r=>r.date.toDateString()===d.toDateString()
    })) };
  }
  function weekBuckets(){
    return { granularity:'Weekly', defs: weeksInScope(rows).map(w=>({ label: w.label, range: w.range, match: r=>r.weekKey===w.key })) };
  }
  function monthBuckets(){
    const monthKeys = [...new Set(rows.map(r=>r.monthKey))].sort();
    return { granularity:'Monthly', defs: monthKeys.map(k=>{
      const m = MONTHS.find(m=>m.key===k);
      return { label: m ? m.label : k, match: r=>r.monthKey===k };
    }) };
  }
  function yearBuckets(){
    const yearKeys = [...new Set(rows.map(r=>r.date.getFullYear()))].sort((a,b)=>a-b);
    return { granularity:'Yearly', defs: yearKeys.map(y=>({ label: String(y), match: r=>r.date.getFullYear()===y })) };
  }
  if(forceGran==='day') return dayBuckets();
  if(forceGran==='week') return weekBuckets();
  if(forceGran==='month') return monthBuckets();
  if(forceGran==='year') return yearBuckets();
  const dayKeys = [...new Set(rows.map(r=>r.date.toDateString()))];
  if(dayKeys.length <= TREND_DAY_LIMIT) return dayBuckets();
  if(weeksInScope(rows).length <= WEEK_BUCKET_LIMIT) return weekBuckets();
  return monthBuckets();
}
function bucketAggs(rows, buckets){
  return buckets.defs.map(d=>({ label:d.label, range:d.range, agg: aggregateRows(rows.filter(d.match)) }));
}
