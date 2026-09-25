/* =====================================================================
   scoring.js — MIS Scoring (new system)
   Achievement = Actual ÷ Plan × 100, capped; Points = Achievement × weight;
   Overall = sum of points (out of 100). Targets are monthly and scale
   automatically with the period (day / week / month / range / year).
   Every Actual opens the invoices behind it; every Plan shows its formula.
   ===================================================================== */

let SCORE2 = null;                 // last computed results (used by insights & detail popup)
let scoreView = 'cards';           // 'cards' | 'table'

/* ---------------- photos & initials ---------------- */
function spSlug(name){ return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function spInitials(name){ return String(name).split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?'; }
function spHue(name){ let h = 0; for(const c of String(name)) h = (h*31 + c.charCodeAt(0)) % 360; return h; }
/* Photo priority: uploaded in Admin → assets/team/<name>.jpg in the repo → initials */
function spPhotoSrc(name){ return (ADMIN.photos && ADMIN.photos[name]) || `assets/team/${spSlug(name)}.jpg`; }
function spPhotoHtml(name, cls, srcOverride){
  const src = srcOverride || spPhotoSrc(name);
  const h = spHue(name);
  return `<div class="${cls} ph-wrap"><img src="${escAttr(src)}" alt="${escAttr(name)}" loading="lazy"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="ph-initials" style="display:none;background:linear-gradient(135deg,hsl(${h} 55% 55%),hsl(${(h+40)%360} 60% 38%))">${escAttr(spInitials(name))}</div></div>`;
}

/* ---------------- period window + factor ---------------- */
function scoringWindow(){
  const G = ADMIN.scoring, wd = G.workDays || 26;
  const last = ALL_ROWS.length ? endOfDay(ALL_ROWS[ALL_ROWS.length-1].date) : endOfDay(new Date());
  const sod = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  let start, end, kind;
  if(state.mode==='WEEK' && state.weekKey!=null){ start = new Date(state.weekKey); end = endOfDay(new Date(start.getTime()+5*DAY_MS)); kind='week'; }
  else if(state.mode==='MONTH' && state.monthKey){ const [y,m] = state.monthKey.split('-').map(Number); start = new Date(y,m-1,1); end = endOfDay(new Date(y,m,0)); kind='month'; }
  else if(state.mode==='RANGE' && state.rangeStart && state.rangeEnd){ start = new Date(state.rangeStart+'T00:00:00'); end = new Date(state.rangeEnd+'T23:59:59'); kind='range'; }
  else {
    const g = state.scoreGran || 'week';
    if(g==='day'){ start = sod(last); end = last; kind='day'; }
    else if(g==='month'){ start = new Date(last.getFullYear(), last.getMonth(), 1); end = endOfDay(new Date(last.getFullYear(), last.getMonth()+1, 0)); kind='month'; }
    else if(g==='year'){ start = new Date(last.getFullYear(),0,1); end = endOfDay(new Date(last.getFullYear(),11,31)); kind='year'; }
    else { start = mondayOf(last); end = endOfDay(new Date(start.getTime()+5*DAY_MS)); kind='week'; }
  }
  let f, ftxt;
  if(kind==='day'){ f = 1/wd; ftxt = `÷ ${wd}`; }
  else if(kind==='week'){ f = 1/4; ftxt = '÷ 4'; }
  else if(kind==='month'){ f = 1; ftxt = '× 1'; }
  else if(kind==='year'){ f = 12; ftxt = '× 12'; }
  else { const n = workingDaysBetween(start, end); f = n/wd; ftxt = `× ${n} ÷ ${wd}`; }
  // previous window of the same kind
  let pStart, pEnd;
  if(kind==='week'){ pStart = new Date(start.getTime()-7*DAY_MS); pEnd = endOfDay(new Date(pStart.getTime()+5*DAY_MS)); }
  else if(kind==='month'){ pStart = new Date(start.getFullYear(), start.getMonth()-1, 1); pEnd = endOfDay(new Date(start.getFullYear(), start.getMonth(), 0)); }
  else if(kind==='year'){ pStart = new Date(start.getFullYear()-1,0,1); pEnd = endOfDay(new Date(start.getFullYear()-1,11,31)); }
  else if(kind==='day'){ pStart = new Date(start.getTime()-DAY_MS); if(pStart.getDay()===0) pStart = new Date(pStart.getTime()-DAY_MS); pEnd = endOfDay(pStart); }
  else { const len = end - start; pEnd = new Date(start.getTime()-1); pStart = new Date(pEnd.getTime()-len); }
  const lenDays = Math.round((end-start)/DAY_MS)+1;
  const labelOf = (a,b)=> kind==='month' ? a.toLocaleDateString('en-GB',{month:'long',year:'numeric'})
    : kind==='year' ? String(a.getFullYear()) : kind==='day' ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`;
  return { start, end, kind, f, ftxt, pStart, pEnd, lenDays, label: labelOf(start, end), prevLabel: labelOf(pStart, pEnd) };
}

/* ---------------- engine ---------------- */
function mkKpi(o){
  const cap = ADMIN.scoring.cap || 120;
  const na = !(o.plan > 0) || o.actual===null || o.actual===undefined || isNaN(o.actual);
  const raw = na ? null : o.actual/o.plan*100;
  const counted = na ? 0 : Math.min(raw, cap);
  return Object.assign(o, { na, raw, counted, points: na ? 0 : counted*o.weight/100 });
}
function finish(r){
  const inc = r.k.filter(x=>!x.na);
  const wsum = inc.reduce((s,x)=>s+x.weight,0);
  r.total = (!r.noSalary && wsum) ? inc.reduce((s,x)=>s+x.points,0) / wsum * 100 : null;
  r.partial = wsum && wsum < r.k.reduce((s,x)=>s+x.weight,0);
  return r;
}
const bandOf = v => v===null ? 'n' : v >= ADMIN.scoring.green ? 'g' : v >= ADMIN.scoring.amber ? 'a' : 'r';
const uniq = rows => new Set(rows.map(r=>r.customer));
const sumOf = (rows, k) => rows.reduce((s,r)=>s+r[k],0);

function computeScoring(){
  const W = scoringWindow(), G = ADMIN.scoring;
  const isCo = r => G.excludeCompany && r.companysales==='YES';
  const inWin = (r,a,b) => r.date>=a && r.date<=b;
  const firstEver = {};
  ALL_ROWS.forEach(r=>{ const f = firstEver[r.customer]; if(!f || r.date<f) firstEver[r.customer] = r.date; });
  const names = t => Object.keys(ADMIN.departments).filter(sp=>ADMIN.departments[sp]===t && !ADMIN.hiddenFromMis[sp]);
  const fmtC = v => (v%1 ? v.toFixed(2) : fmtNum(v));

  const nbd = names('NBD').map(sp=>{
    const salary = ADMIN.salaries[sp] || 0, target = (ADMIN.custTargets||{})[sp] || 0;
    const mine = ALL_ROWS.filter(r=>r.salesperson===sp && r.ordertype==='NBD' && !isCo(r));
    const rows = mine.filter(r=>inWin(r,W.start,W.end)), prev = mine.filter(r=>inWin(r,W.pStart,W.pEnd));
    const custs = uniq(rows);
    const newNames = [...custs].filter(c=>firstEver[c]>=W.start && firstEver[c]<=W.end);
    const revenue = sumOf(rows,'net'), profit = sumOf(rows,'profit');
    const profitPlan = salary*G.nbdProfitX*W.f, revPlan = profitPlan*G.nbdRevX, custPlan = target*W.f;
    const avgPlan = custPlan ? revPlan/custPlan : 0, avgAct = custs.size ? revenue/custs.size : 0;
    const k = [
      mkKpi({ key:'newC', label:'New customers', actual:newNames.length, plan:custPlan, weight:G.wNbd.newC, fmt:fmtC,
        plan_steps:[`Monthly target: ${target} new customers`, `Period factor ${W.ftxt}`, `Plan = ${target} ${W.ftxt} = ${fmtC(custPlan)}`],
        how:`${target}/month ${W.ftxt}`, drill:()=>({ title:`${sp} — new customers`, rows: rows.filter(r=>newNames.includes(r.customer)) }) }),
      mkKpi({ key:'profit', label:'Profit', actual:profit, plan:profitPlan, weight:G.wNbd.profit, fmt:fmtINR,
        plan_steps:[`Salary ${fmtINR(salary)}`, `× ${G.nbdProfitX} (NBD profit multiplier)`, `${W.ftxt} (period)`, `Plan = ${fmtINR(profitPlan)}`],
        how:`salary × ${G.nbdProfitX} ${W.ftxt}`, drill:()=>({ title:`${sp} — NBD invoices (profit)`, rows: rows.slice().sort((a,b)=>b.profit-a.profit) }) }),
      mkKpi({ key:'revenue', label:'Revenue', actual:revenue, plan:revPlan, weight:G.wNbd.revenue, fmt:fmtINR,
        plan_steps:[`Profit plan ${fmtINR(profitPlan)}`, `× ${G.nbdRevX} (NBD revenue multiplier)`, `Plan = ${fmtINR(revPlan)}`],
        how:`profit plan × ${G.nbdRevX}`, drill:()=>({ title:`${sp} — NBD invoices (revenue)`, rows }) }),
      mkKpi({ key:'avg', label:'Avg sale', actual: custs.size ? avgAct : null, plan:avgPlan, weight:G.wNbd.avg, fmt:fmtINR,
        plan_steps:[`Revenue plan ${fmtINR(revPlan)}`, `÷ customer target ${fmtC(custPlan)}`, `Plan = ${fmtINR(avgPlan)}`, `Actual = ${fmtINR(revenue)} ÷ ${custs.size} customer${custs.size===1?'':'s'}`],
        how:`revenue plan ÷ customer target`, drill:()=>({ title:`${sp} — NBD invoices by customer`, rows, group:'cust' }) })
    ];
    const prevRev = sumOf(prev,'net');
    return finish({ sp, dept:'NBD', salary, target, rows, k, noSalary: !salary, growth: prevRev ? (revenue-prevRev)/prevRev*100 : (revenue ? null : 0),
      revenue, profit, custCount: custs.size });
  });

  const crr = names('CRR').map(sp=>{
    const salary = ADMIN.salaries[sp] || 0;
    const mine = ALL_ROWS.filter(r=>r.salesperson===sp && r.ordertype==='CRR' && !isCo(r));
    const rows = mine.filter(r=>inWin(r,W.start,W.end)), prev = mine.filter(r=>inWin(r,W.pStart,W.pEnd));
    const revenue = sumOf(rows,'net'), profit = sumOf(rows,'profit');
    const profitPlan = salary*G.crrProfitX*W.f, revPlan = profitPlan*G.crrRevX;
    // retention: short periods use a rolling window (default 30 days) so it isn't unfair week to week
    let r2a, r2b, r1a, r1b, retNote;
    if(W.lenDays < 28){
      const rw = G.retWindow || 30;
      r2b = W.end; r2a = new Date(W.end.getTime() - rw*DAY_MS + 1);
      r1b = new Date(r2a.getTime()-1); r1a = new Date(r1b.getTime() - rw*DAY_MS + 1);
      retNote = `rolling ${rw} days`;
    } else { r2a = W.start; r2b = W.end; r1a = W.pStart; r1b = W.pEnd; retNote = 'vs previous period'; }
    const set1 = uniq(mine.filter(r=>inWin(r,r1a,r1b))), set2 = uniq(mine.filter(r=>inWin(r,r2a,r2b)));
    const back = [...set1].filter(c=>set2.has(c)), lost = [...set1].filter(c=>!set2.has(c));
    const ret = set1.size ? back.length/set1.size*100 : null;
    const margin = revenue ? profit/revenue*100 : null;
    const k = [
      mkKpi({ key:'profit', label:'Profit', actual:profit, plan:profitPlan, weight:G.wCrr.profit, fmt:fmtINR,
        plan_steps:[`Salary ${fmtINR(salary)}`, `× ${G.crrProfitX} (CRR profit multiplier)`, `${W.ftxt} (period)`, `Plan = ${fmtINR(profitPlan)}`],
        how:`salary × ${G.crrProfitX} ${W.ftxt}`, drill:()=>({ title:`${sp} — CRR invoices (profit)`, rows: rows.slice().sort((a,b)=>b.profit-a.profit) }) }),
      mkKpi({ key:'revenue', label:'Revenue', actual:revenue, plan:revPlan, weight:G.wCrr.revenue, fmt:fmtINR,
        plan_steps:[`Profit plan ${fmtINR(profitPlan)}`, `× ${G.crrRevX} (CRR revenue multiplier)`, `Plan = ${fmtINR(revPlan)}`],
        how:`profit plan × ${G.crrRevX}`, drill:()=>({ title:`${sp} — CRR invoices (revenue)`, rows }) }),
      mkKpi({ key:'retention', label:'Retention', actual:ret, plan:G.crrRetention, weight:G.wCrr.retention, fmt:v=>fmtPct(v),
        plan_steps:[`Target ${G.crrRetention}% (Admin)`, `Customers ${fmtShort(r1a)}–${fmtShort(r1b)}: ${set1.size}`, `Ordered again ${fmtShort(r2a)}–${fmtShort(r2b)}: ${back.length}`, lost.length ? `Not back yet: ${lost.slice(0,6).join(', ')}${lost.length>6?` +${lost.length-6} more`:''}` : 'Everyone came back'],
        how:retNote, drill:()=>({ title:`${sp} — customers who ordered again`, rows: mine.filter(r=>inWin(r,r2a,r2b) && back.includes(r.customer)), group:'cust' }),
        drill2: lost.length ? ()=>({ title:`${sp} — customers not back yet (their earlier invoices)`, rows: mine.filter(r=>inWin(r,r1a,r1b) && lost.includes(r.customer)), group:'cust' }) : null }),
      mkKpi({ key:'margin', label:'Margin', actual:margin, plan:G.crrMargin, weight:G.wCrr.margin, fmt:v=>fmtPct(v),
        plan_steps:[`Target ${G.crrMargin}% (Admin)`, `Actual = profit ${fmtINR(profit)} ÷ revenue ${fmtINR(revenue)}`],
        how:'profit ÷ revenue', drill:()=>({ title:`${sp} — CRR invoices by margin`, rows: rows.slice().sort((a,b)=>(a.net?a.profit/a.net:0)-(b.net?b.profit/b.net:0)) }) })
    ];
    const prevRev = sumOf(prev,'net');
    return finish({ sp, dept:'CRR', salary, rows, k, noSalary: !salary, growth: prevRev ? (revenue-prevRev)/prevRev*100 : (revenue ? null : 0),
      revenue, profit, custCount: uniq(rows).size });
  });

  const byScore = (a,b)=>(b.total??-1)-(a.total??-1);
  nbd.sort(byScore); crr.sort(byScore);
  nbd.forEach((r,i)=>r.rank=i+1); crr.forEach((r,i)=>r.rank=i+1);
  const co = ALL_ROWS.filter(r=>inWin(r,W.start,W.end) && (ADMIN.departments[r.salesperson]==='OTHER' || r.companysales==='YES'));
  return { W, nbd, crr, co };
}

/* ---------------- rendering ---------------- */
function kpiBarHtml(x, team, sp){
  const cap = ADMIN.scoring.cap || 120;
  const w = x.na ? 0 : Math.max(x.raw>0?3:0, Math.min(x.raw, cap)/cap*100);
  return `<button class="sk-row" type="button" data-sk="${team}|${escAttr(sp)}|${x.key}" title="Open the invoices behind this number">
    <span class="sk-l">${x.label}</span><span class="sk-v">${x.na ? 'n/a' : `${x.fmt(x.actual)} <em>/ ${x.fmt(x.plan)}</em>`}</span>
    <span class="sk-bar"><i class="b-${x.na?'n':bandOf(x.raw)}" style="width:${w}%"></i><b style="left:${100/cap*100}%"></b></span></button>`;
}
function cardHtml(r){
  const b = bandOf(r.total), cap = ADMIN.scoring.cap || 120;
  const g = r.growth;
  const growth = g===null ? '<span class="sc-g">new</span>' : `<span class="sc-g ${g>=0?'up':'down'}">${g>=0?'▲':'▼'} ${Math.abs(g).toFixed(0)}% vs prev</span>`;
  return `<article class="sc-card" data-sc="${r.dept}|${escAttr(r.sp)}" tabindex="0" aria-label="${escAttr(r.sp)} score details">
    ${spPhotoHtml(r.sp, 'sc-photo')}
    <div class="sc-body">
      <div class="sc-head"><h4>${escAttr(r.sp)}</h4><span class="sc-rank">#${r.rank}</span></div>
      <div class="sc-kpis">${r.k.map(x=>kpiBarHtml(x, r.dept, r.sp)).join('')}</div>
      <div class="sc-total">
        ${r.total===null ? `<div class="sc-num n">—</div><div class="sc-cap">${r.noSalary?'Set salary in Admin':'No activity'}</div>`
          : `<div class="sc-num ${b}">${r.total.toFixed(1)}<small>/100</small></div><div class="sc-cap">Overall score${r.partial?' · some KPIs n/a':''}</div>`}
        <div class="sc-foot"><span class="sk-bar big"><i class="b-${b}" style="width:${r.total===null?0:Math.min(r.total,cap)/cap*100}%"></i><b style="left:${100/cap*100}%"></b></span>
          <div class="sc-meta"><span>${fmtINR(r.revenue)} · ${fmtNum(r.custCount)} cust.</span>${growth}</div></div>
      </div>
    </div>
  </article>`;
}
function tableHtml(list, team){
  if(!list.length) return '';
  const labels = list[0].k.map(x=>x.label);
  return `<table class="sc-table" data-caption="${team} team scorecard"><thead><tr><th>Salesperson</th><th style="text-align:right">Overall</th>
    ${labels.map(l=>`<th style="text-align:right">${l} actual</th><th style="text-align:right">${l} plan</th><th style="text-align:right">${l} %</th>`).join('')}
    <th style="text-align:right">Growth</th></tr></thead><tbody>` +
    list.map(r=>`<tr class="clickable" data-sc="${r.dept}|${escAttr(r.sp)}"><td class="name">${escAttr(r.sp)}</td>
      <td style="text-align:right"><span class="pill ${bandOf(r.total)}">${r.total===null?'—':r.total.toFixed(1)}</span></td>
      ${r.k.map(x=>{ const isMoney = x.fmt===fmtINR;
        const val = v => x.na && v===x.actual ? 'n/a' : isMoney ? money(v) : x.fmt(v);
        return `<td style="text-align:right">${val(x.actual)}</td><td style="text-align:right">${isMoney?money(x.plan):x.fmt(x.plan)}</td><td style="text-align:right">${x.na?'n/a':fmtPct(x.raw)}</td>`; }).join('')}
      <td style="text-align:right">${r.growth===null?'new':fmtPct(r.growth)}</td></tr>`).join('') + '</tbody></table>';
}
function renderScoringV2(){
  const S = SCORE2 = computeScoring();
  const W = S.W, G = ADMIN.scoring;
  document.getElementById('scoreFactor').innerHTML =
    `<b>${W.label}</b><span>Targets ${W.ftxt} · ${W.kind==='range'?'working days':W.kind} · cap ${G.cap}% · company sales ${G.excludeCompany?'excluded':'included'}</span>`;
  const team = (list, id, name)=>{
    const el = document.getElementById(id);
    if(!list.length){ el.innerHTML = `<div class="dept-note">No one assigned to ${name} yet. Open Admin → Salesperson settings.</div>`; return; }
    el.innerHTML = scoreView==='cards'
      ? `<div class="sc-grid">${list.map(cardHtml).join('')}</div>`
      : `<div class="table-scroll">${tableHtml(list, name)}</div>`;
  };
  team(S.nbd, 'nbdCards', 'NBD'); team(S.crr, 'crrCards', 'CRR');
  const avg = l => { const v = l.filter(r=>r.total!==null); return v.length ? v.reduce((s,r)=>s+r.total,0)/v.length : null; };
  const tile = (label, v, sub) => `<div class="st-tile"><span>${label}</span><strong class="${bandOf(v)}">${v===null?'—':v.toFixed(1)}<small>/100</small></strong><em>${sub}</em></div>`;
  const on = l => l.filter(r=>r.total!==null && r.total>=G.green).length;
  document.getElementById('scoreTeamTiles').innerHTML =
    tile('NBD team average', avg(S.nbd), `${on(S.nbd)} of ${S.nbd.length} on target`) +
    tile('CRR team average', avg(S.crr), `${on(S.crr)} of ${S.crr.length} on target`) +
    `<div class="st-tile clickable" data-drill="${registerDrill('Company sales (not scored)', S.co, W.label)}"><span>Company sales (not scored)</span><strong>${fmtINR(sumOf(S.co,'net'))}</strong><em>OTHER + COMPANY SALES = YES · ${fmtNum(S.co.length)} invoices</em></div>`;
}

/* ---------------- detail popup ---------------- */
function findScore(key){
  const [team, sp] = key.split('|');
  return SCORE2 && (team==='NBD' ? SCORE2.nbd : SCORE2.crr).find(r=>r.sp===sp);
}
function openScoreDetail(key){
  const r = findScore(key); if(!r) return;
  const W = SCORE2.W, G = ADMIN.scoring, b = bandOf(r.total);
  document.getElementById('sdHead').innerHTML = `${spPhotoHtml(r.sp,'sd-photo')}
    <div class="sd-id"><h3>${escAttr(r.sp)}</h3>
      <div class="sd-chips"><span class="chip">${r.dept} team</span><span class="chip">${W.label}</span><span class="chip">Targets ${W.ftxt}</span><span class="chip">Rank #${r.rank}</span>${r.salary?`<span class="chip">Salary ${fmtINR(r.salary)}</span>`:'<span class="chip warn">No salary set</span>'}</div></div>
    <div class="sd-score ${b}">${r.total===null?'—':r.total.toFixed(1)}<small>/100</small></div>`;
  const rows = r.k.map((x,i)=>`<tr>
      <td><b>${x.label}</b><div class="muted">${x.how}</div></td>
      <td class="n"><button class="link-btn" data-sd-actual="${i}" ${x.na&&x.actual==null?'disabled':''}>${x.actual==null?'n/a':x.fmt(x.actual)}</button>${x.drill2?`<div><button class="link-btn sm" data-sd-actual2="${i}">not back →</button></div>`:''}</td>
      <td class="n"><button class="link-btn" data-sd-plan="${i}">${x.plan>0?x.fmt(x.plan):'not set'}</button></td>
      <td class="n">${x.na?'n/a':fmtPct(x.raw)}${!x.na && x.raw>G.cap?`<div class="capnote">counted ${G.cap}%</div>`:''}</td>
      <td class="n">${x.weight}%</td><td class="n"><b>${x.na?'—':x.points.toFixed(1)}</b></td></tr>
      <tr class="sd-plan" id="sdPlan${i}" style="display:none"><td colspan="6"><ol>${x.plan_steps.map(s=>`<li>${s}</li>`).join('')}</ol></td></tr>`).join('');
  const inc = r.k.filter(x=>!x.na);
  const best = inc.slice().sort((a,c)=>c.raw-a.raw)[0], worst = inc.slice().sort((a,c)=>a.raw-c.raw)[0];
  const lost = inc.map(x=>({ l:x.label, gap:x.weight - x.points })).sort((a,c)=>c.gap-a.gap)[0];
  document.getElementById('sdBody').innerHTML = `
    <div class="table-scroll"><table class="sd-table"><thead><tr><th>KPI and how the plan is set</th><th class="n">Actual</th><th class="n">Plan</th><th class="n">Achievement</th><th class="n">Weight</th><th class="n">Points</th></tr></thead>
    <tbody>${rows}<tr class="tot"><td colspan="5">Overall score${r.partial?' (KPIs marked n/a are left out and the rest re-weighted)':''}</td><td class="n">${r.total===null?'—':r.total.toFixed(1)+' / 100'}</td></tr></tbody></table></div>
    <p class="muted" style="margin:8px 0 14px">Click any <b>Actual</b> to see the invoices behind it, or any <b>Plan</b> to see how the target was worked out.</p>
    <div class="insight-grid">
      ${best?`<div class="insight good"><span class="ins-ico">▲</span><p>Strongest: <b>${best.label}</b> at ${fmtPct(best.raw)} of plan.</p></div>`:''}
      ${worst?`<div class="insight ${worst.raw<G.amber?'bad':'warn'}"><span class="ins-ico">▼</span><p>Weakest: <b>${worst.label}</b> at ${fmtPct(worst.raw)}. ${lost?` Most points were lost on <b>${lost.l}</b> (${lost.gap.toFixed(1)} short of its full share).`:''}</p></div>`:''}
      <div class="insight info clickable" data-drill="${registerDrill(`${r.sp} — all invoices in this score`, r.rows, W.label)}"><span class="ins-ico">i</span><p>${fmtNum(r.rows.length)} ${r.dept} invoices counted, ${fmtINR(r.revenue)} sales, ${fmtNum(r.custCount)} customers. <span class="ins-more">View →</span></p></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="util-btn small" data-open-sp="${escAttr(r.sp)}">Full salesperson profile →</button></div>`;
  document.getElementById('sdBody').dataset.key = key;
  showModal('scoreDetailOverlay');
}

/* ---------------- wiring ---------------- */
(function wireScoring(){
  const $ = id => document.getElementById(id);
  document.querySelectorAll('#scoreViewToggle button').forEach(b=>b.addEventListener('click', ()=>{
    scoreView = b.dataset.v;
    document.querySelectorAll('#scoreViewToggle button').forEach(x=>x.classList.toggle('active', x===b));
    renderScoringV2();
  }));
  document.addEventListener('click', e=>{
    const sk = e.target.closest('[data-sk]');
    if(sk){
      e.stopPropagation();
      const [team, sp, key] = sk.dataset.sk.split('|');
      const r = findScore(team+'|'+sp), x = r && r.k.find(k=>k.key===key);
      if(x){ const d = x.drill(); openInvoiceList(d.title, d.rows, SCORE2.W.label); if(d.group) setInvGroup(d.group); }
      return;
    }
    const card = e.target.closest('[data-sc]');
    if(card && !e.target.closest('button')){ openScoreDetail(card.dataset.sc); return; }
    const a = e.target.closest('[data-sd-actual],[data-sd-actual2]');
    if(a){
      const r = findScore($('sdBody').dataset.key), x = r.k[+(a.dataset.sdActual ?? a.dataset.sdActual2)];
      const d = a.dataset.sdActual2!==undefined ? x.drill2() : x.drill();
      openInvoiceList(d.title, d.rows, SCORE2.W.label); if(d.group) setInvGroup(d.group);
      return;
    }
    const p = e.target.closest('[data-sd-plan]');
    if(p){ const row = $('sdPlan'+p.dataset.sdPlan); row.style.display = row.style.display==='none' ? '' : 'none'; }
  }, true);
  document.addEventListener('keydown', e=>{ if((e.key==='Enter'||e.key===' ') && e.target.matches && e.target.matches('.sc-card')){ e.preventDefault(); openScoreDetail(e.target.dataset.sc); } });
  $('scoreDetailClose').addEventListener('click', ()=>{ $('scoreDetailOverlay').style.display='none'; });
  $('scoreDetailOverlay').addEventListener('click', e=>{ if(e.target.id==='scoreDetailOverlay') e.target.style.display='none'; });
})();

/* switch the invoice popup to a grouped view programmatically */
function setInvGroup(g){
  INV.group = g; INV.sort = 'net'; INV.dir = -1;
  document.querySelectorAll('#invListGroup button').forEach(b=>b.classList.toggle('active', b.dataset.g===g));
  renderInvoiceList();
}
