/* =====================================================================
   hrms.js — HRMS: hiring tests + Candidate Master
   Data: Supabase hrms_tests / hrms_candidates / hrms_results (synced from the hiring-tests
   Google Sheet by HrmsSync.gs). Only users with the HRMS right (or admins) can open it.
   ===================================================================== */
const HR_STATUSES = ['New', 'Shortlisted', 'Interview', 'Selected', 'Rejected', 'On hold'];
const HR_ST_COLOR = { 'New': '#3FB8E0', 'Shortlisted': '#6C5CE7', 'Interview': '#F6A623', 'Selected': '#1FB286', 'Rejected': '#EF5466', 'On hold': '#A4A2C0' };
const HR = { tests: [], cands: [], results: [], byMobile: new Map(), tab: 'overview', preset: 'all', custom: {}, test: 'ALL', res: 'ALL', status: 'ALL', dept: 'ALL', q: '', limit: 100, gran: 'week', loaded: false, drill: new Map(), drillId: 0 };
const hrFlagged = r => (r.tab_switches || 0) >= 3 || /late/i.test(r.notes || '') || r.source === 'unverified';
const hrPct = v => v === null || v === undefined || isNaN(v) ? '—' : fmtPct(v);
const hrDate = d => d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const hrTime = s => s ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : '—';
function hrStatusPill(s){ return `<span class="seg-pill sm" style="--c:${HR_ST_COLOR[s] || '#A4A2C0'}">${escAttr(s || 'New')}</span>`; }
function hrResPill(r){ return `<span class="seg-pill sm" style="--c:${r === 'PASS' ? '#1FB286' : '#EF5466'}">${escAttr(r || '—')}</span>`; }
function hrAct(fn){ const id = 'h' + (++HR.drillId); HR.drill.set(id, fn); return id; }

/* ---------------- data ---------------- */
function hrPrepare(raw){
  HR.tests = raw.tests || [];
  HR.results = (raw.results || []).map(r => Object.assign(r, { date: r.ts ? new Date(r.ts) : null, percent: Number(r.percent) || 0 })).sort((a, b) => (b.date || 0) - (a.date || 0));
  const byM = new Map();
  HR.results.forEach(r => { const m = String(r.mobile || '').replace(/\D/g, '').slice(-10); if(!m) return; (byM.get(m) || byM.set(m, []).get(m)).push(r); });
  const list = (raw.cands || []).map(c => Object.assign({}, c));
  const known = new Set(list.map(c => c.mobile));
  byM.forEach((rs, m) => { if(!known.has(m) && /^[6-9]\d{9}$/.test(m)){ const r = rs[0]; list.push({ mobile: m, name: r.name, email: r.email, state: r.state, city: r.city, experience: r.experience, department: r.department, status: 'New', source: 'test', _unsaved: true }); } });
  list.forEach(c => { const rs = byM.get(c.mobile) || []; c.attempts = rs; c.tests = rs.length; c.best = rs.length ? Math.max(...rs.map(r => r.percent)) : null;
    if(!c.department && rs.length) c.department = (rs.find(r => r.department) || {}).department || '';
    c.last = rs[0] || null; c.first = rs.length ? rs[rs.length - 1].date : (c.created_at ? new Date(c.created_at) : null); c.passed = rs.some(r => r.result === 'PASS'); });
  HR.cands = list.sort((a, b) => ((b.last && b.last.date) || b.first || 0) - ((a.last && a.last.date) || a.first || 0));
  HR.byMobile = new Map(list.map(c => [c.mobile, c]));
  HR.loaded = true;
}
function hrPeriod(){
  const latest = HR.results.reduce((m, r) => r.date && r.date > m ? r.date : m, new Date(0));
  return mvPeriod(HR.preset, HR.custom, new Date(Math.max(Date.now(), latest.getTime())));
}
function hrFiltered(P){
  const inTest = r => HR.test === 'ALL' || r.dept_id === HR.test;
  const all = HR.results.filter(inTest);
  const cur = P.all ? all : all.filter(r => r.date && r.date >= P.start && r.date <= P.end);
  const prev = P.all ? [] : all.filter(r => r.date && r.date >= P.prevStart && r.date <= P.prevEnd);
  return { all, cur, prev };
}

/* ---------------- building blocks ---------------- */
function hrKpis(cards){
  return `<div class="kpis mv-kpis">${cards.map(c => `<div class="kpi ${c.go ? 'clickable' : ''}" style="--accent:${c.a}" ${c.go ? `data-hr="${c.go}"` : ''} ${c.t ? `title="${escAttr(c.t)}"` : ''}><div class="kpi-head"><span>${c.l}</span><i>${c.i}</i></div><div class="val">${c.v}</div><div class="sub">${c.s || ''}</div></div>`).join('')}</div>`;
}
function hrInsights(list){
  return `<div class="insight-grid">${list.map(i => `<div class="insight ${i.t} ${i.go ? 'clickable' : ''}" ${i.go ? `data-hr="${i.go}"` : ''}><span class="ins-ico">${i.t === 'good' ? '▲' : i.t === 'bad' ? '▼' : i.t === 'warn' ? '!' : 'i'}</span><p>${i.x}${i.go ? ' <span class="ins-more">View →</span>' : ''}</p></div>`).join('')}</div>`;
}
function hrGo(tab, patch){ return hrAct(() => { Object.assign(HR, patch || {}); hrTab(tab); }); }

/* ---------------- OVERVIEW ---------------- */
function hrOverviewHtml(P, F){
  const cur = F.cur, prev = F.prev, pass = cur.filter(r => r.result === 'PASS').length, ppass = prev.filter(r => r.result === 'PASS').length;
  const rate = cur.length ? pass / cur.length * 100 : null, prate = prev.length ? ppass / prev.length * 100 : null;
  const avg = cur.length ? cur.reduce((s, r) => s + r.percent, 0) / cur.length : null;
  const newC = HR.cands.filter(c => c.first && (P.all || (c.first >= P.start && c.first <= P.end)));
  const pipe = HR.cands.filter(c => c.status === 'Shortlisted' || c.status === 'Interview'), sel = HR.cands.filter(c => c.status === 'Selected');
  const flagged = cur.filter(hrFlagged);
  const g = (a, b) => P.all || !prev.length ? '' : ` · ${mvGrowth(mvPct(a, b))} vs previous`;
  let h = hrKpis([
    { l: 'Candidates', i: '👥', v: fmtNum(HR.cands.length), s: 'in the Candidate Master', a: 'var(--violet)', go: hrGo('candidates', { status: 'ALL', q: '' }) },
    { l: 'New candidates', i: '+', v: fmtNum(newC.length), s: P.all ? 'all time' : 'first test in ' + escAttr(P.label), a: 'var(--good)', go: hrGo('candidates', { status: 'NEWP', q: '' }) },
    { l: 'Tests taken', i: '✎', v: fmtNum(cur.length), s: (P.all ? 'all time' : escAttr(P.label)) + g(cur.length, prev.length), a: 'var(--sky)', go: hrGo('results', { res: 'ALL' }) },
    { l: 'Pass rate', i: '✓', v: hrPct(rate), s: `${fmtNum(pass)} passed` + (rate !== null && prate !== null ? ` · <span class="mv-g ${rate >= prate ? 'up' : 'down'}">${rate >= prate ? '▲' : '▼'} ${Math.abs(rate - prate).toFixed(1)} pts</span>` : ''), a: 'var(--good)', go: hrGo('results', { res: 'PASS' }) },
    { l: 'Average score', i: '%', v: hrPct(avg), s: cur.length ? `best ${fmtPct(Math.max(...cur.map(r => r.percent)))}` : '', a: 'var(--orange)', go: hrGo('results', { res: 'ALL' }) },
    { l: 'In pipeline', i: '→', v: fmtNum(pipe.length), s: 'Shortlisted + Interview', a: 'var(--indigo-2)', go: hrGo('candidates', { status: 'PIPE', q: '' }) },
    { l: 'Selected', i: '★', v: fmtNum(sel.length), s: `${fmtNum(HR.cands.filter(c => c.status === 'Rejected').length)} rejected`, a: 'var(--good)', go: hrGo('candidates', { status: 'Selected', q: '' }) },
    { l: 'Flagged attempts', i: '!', v: fmtNum(flagged.length), s: '3+ tab switches, late or unverified', a: 'var(--coral)', go: hrGo('results', { res: 'FLAG' }) }
  ]);
  h += mvPanel('Key insights', 'Click an insight to open the list behind it', hrInsights(hrOverviewInsights(P, F)));
  h += mvPanel('Tests over time', 'Passed and failed attempts', mvBox('hr_time', true), `<div class="seg-toggle mv-gran">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button data-hrgran="${k}" class="${HR.gran === k ? 'active' : ''}">${l}</button>`).join('')}</div>`);
  h += `<div class="grid3">${mvPanel('Pass rate by test', 'Attempts in brackets · click a bar for its results', mvBox('hr_test', true))}${mvPanel('Score distribution', 'How many attempts scored in each band', mvBox('hr_bins', true))}</div>`;
  h += `<div class="grid3">${mvPanel('Candidate pipeline', 'Current status of every candidate · click to list them', mvBox('hr_pipe'))}${mvPanel('Experience of candidates', 'As entered on the test form', mvBox('hr_exp'))}</div>`;
  h += `<div class="grid3">${mvPanel('Candidates by department', 'Department they applied for · click a bar to list them', mvBox('hr_dept', true))}${mvPanel('Where candidates come from', 'Top states by number of candidates', mvBox('hr_state', true))}</div>`;
  return h;
}
function hrOverviewInsights(P, F){
  const out = [], cur = F.cur;
  const review = HR.cands.filter(c => c.passed && c.status === 'New');
  if(review.length) out.push({ t: 'warn', x: `<b>${fmtNum(review.length)}</b> candidates passed a test but are still <b>New</b> — review and shortlist them.`, go: hrGo('candidates', { status: 'PASSNEW', q: '' }) });
  const byT = hrByTest(cur).filter(t => t.n >= 3).sort((a, b) => b.rate - a.rate);
  if(byT.length) out.push({ t: 'good', x: `Highest pass rate: <b>${escAttr(byT[0].name)}</b> (${fmtPct(byT[0].rate)} of ${fmtNum(byT[0].n)}).` });
  if(byT.length > 1) out.push({ t: 'bad', x: `Lowest pass rate: <b>${escAttr(byT.at(-1).name)}</b> (${fmtPct(byT.at(-1).rate)} of ${fmtNum(byT.at(-1).n)}) — the test may be too hard or candidates a poor fit.`, go: hrGo('results', { test: byT.at(-1).id, res: 'ALL' }) });
  const top = cur.slice().sort((a, b) => b.percent - a.percent || (a.time_taken_sec || 0) - (b.time_taken_sec || 0))[0];
  if(top) out.push({ t: 'info', x: `Top score ${P.all ? 'so far' : 'in ' + escAttr(P.label)}: <b>${escAttr(top.name)}</b> — ${fmtPct(top.percent)} in ${escAttr(top.dept_name)}.`, go: hrAct(() => hrOpenResult(top.ref_id)) });
  const fl = cur.filter(hrFlagged);
  if(fl.length) out.push({ t: 'warn', x: `<b>${fmtNum(fl.length)}</b> attempts are flagged (3+ tab switches, late or unverified) — check before shortlisting.`, go: hrGo('results', { res: 'FLAG' }) });
  const repeat = HR.cands.filter(c => c.tests > 1).length;
  if(repeat) out.push({ t: 'info', x: `<b>${fmtNum(repeat)}</b> candidates have taken more than one test.` });
  const tm = cur.filter(r => r.time_taken_sec), lim = {}; HR.tests.forEach(t => lim[t.id] = (Number(t.time_limit_min) || 0) * 60);
  if(tm.length){ const used = tm.filter(r => lim[r.dept_id]).map(r => r.time_taken_sec / lim[r.dept_id] * 100); if(used.length) out.push({ t: 'info', x: `Candidates use about <b>${fmtPct(used.reduce((a, b) => a + b, 0) / used.length)}</b> of the time limit on average.` }); }
  if(!out.length) out.push({ t: 'info', x: 'No test attempts in this period yet.' });
  return out;
}
function hrByTest(rows){
  const m = {}; rows.forEach(r => { const o = m[r.dept_id] || (m[r.dept_id] = { id: r.dept_id, name: r.dept_name || r.dept_id, n: 0, pass: 0, sum: 0, time: 0 }); o.n++; o.sum += r.percent; o.time += r.time_taken_sec || 0; if(r.result === 'PASS') o.pass++; });
  return Object.values(m).map(o => Object.assign(o, { rate: o.n ? o.pass / o.n * 100 : 0, avg: o.n ? o.sum / o.n : 0, avgTime: o.n ? o.time / o.n : 0 }));
}
function hrOverviewCharts(P, F){
  const cur = F.cur;
  const key = d => { const x = mvDay(d); if(HR.gran === 'week') x.setDate(x.getDate() - (x.getDay() + 6) % 7); if(HR.gran === 'month') x.setDate(1); return +x; };
  const ks = [...new Set(cur.filter(r => r.date).map(r => key(r.date)))].sort((a, b) => a - b);
  const lab = k => HR.gran === 'month' ? new Date(k).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : new Date(k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const cnt = (k, res) => cur.filter(r => r.date && key(r.date) === k && r.result === res).length;
  mvChart('hr_time', { type: 'bar', data: { labels: ks.map(lab), datasets: [{ label: 'Passed', data: ks.map(k => cnt(k, 'PASS')), backgroundColor: '#1FB286', borderRadius: 5, stack: 's' }, { label: 'Failed', data: ks.map(k => cnt(k, 'FAIL')), backgroundColor: '#EF5466', borderRadius: 5, stack: 's' }] },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, afterDataLimits: padValueAxis, ticks: { precision: 0 } } }, plugins: { stackTotals: { enabled: true, formatter: v => fmtNum(v) }, datalabels: { display: false } } } });
  const bt = hrByTest(cur).sort((a, b) => b.n - a.n).slice(0, 12);
  mvChart('hr_test', { type: 'bar', data: { labels: bt.map(t => `${t.name} (${t.n})`), datasets: [{ label: 'Pass rate %', data: bt.map(t => t.rate), backgroundColor: bt.map(t => t.rate >= 60 ? '#1FB286' : t.rate >= 40 ? '#F6A623' : '#EF5466'), borderRadius: 6 }] },
    options: { indexAxis: 'y', onClick: (e, els) => { if(els[0]){ HR.test = bt[els[0].index].id; HR.res = 'ALL'; hrTab('results'); } }, scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'end', color: '#1E1B4B', font: { size: 10, weight: 700 }, formatter: v => fmtPct(v) } } } });
  const bins = Array.from({ length: 10 }, (_, i) => cur.filter(r => Math.min(9, Math.floor(r.percent / 10)) === i).length);
  mvChart('hr_bins', { type: 'bar', data: { labels: bins.map((_, i) => `${i * 10}–${i * 10 + 10}%`), datasets: [{ label: 'Attempts', data: bins, backgroundColor: bins.map((_, i) => i >= 6 ? '#1FB286' : i >= 4 ? '#F6A623' : '#EF5466'), borderRadius: 6 }] },
    options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis, ticks: { precision: 0 } } }, plugins: { legend: { display: false }, datalabels: { display: c => c.raw > 0, anchor: 'end', align: 'end', color: '#1E1B4B', font: { size: 10, weight: 700 } } } } });
  const st = HR_STATUSES.map(s => HR.cands.filter(c => (c.status || 'New') === s).length);
  mvChart('hr_pipe', { type: 'bar', data: { labels: HR_STATUSES, datasets: [{ label: 'Candidates', data: st, backgroundColor: HR_STATUSES.map(s => HR_ST_COLOR[s]), borderRadius: 6 }] },
    options: { onClick: (e, els) => { if(els[0]){ HR.status = HR_STATUSES[els[0].index]; hrTab('candidates'); } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis, ticks: { precision: 0 } } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'end', color: '#1E1B4B', font: { size: 10, weight: 700 } } } } });
  const ex = {}; HR.cands.forEach(c => { const k = (c.experience || 'Not given').trim() || 'Not given'; ex[k] = (ex[k] || 0) + 1; });
  const el = Object.entries(ex).sort((a, b) => b[1] - a[1]).slice(0, 8);
  mvChart('hr_exp', { type: 'doughnut', data: { labels: el.map(x => x[0]), datasets: [{ data: el.map(x => x[1]), backgroundColor: PALETTE.slice(0, el.length), borderWidth: 2, borderColor: '#fff' }] },
    options: { cutout: '58%', plugins: { datalabels: { display: c => c.raw / Math.max(1, HR.cands.length) > .05, color: '#fff', font: { weight: 700, size: 11 } } } } });
  const dm = {}; HR.cands.forEach(c => { const k = (c.department || 'Not given').trim() || 'Not given'; dm[k] = (dm[k] || 0) + 1; });
  const dl = Object.entries(dm).sort((a, b) => b[1] - a[1]).slice(0, 12);
  mvChart('hr_dept', { type: 'bar', data: { labels: dl.map(x => x[0]), datasets: [{ label: 'Candidates', data: dl.map(x => x[1]), backgroundColor: '#3FB8E0', borderRadius: 6 }] },
    options: { indexAxis: 'y', onClick: (e, els) => { if(els[0]){ HR.dept = dl[els[0].index][0]; HR.status = 'ALL'; hrTab('candidates'); } }, scales: { x: { beginAtZero: true, afterDataLimits: padValueAxis, ticks: { precision: 0 } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'end', color: '#1E1B4B', font: { size: 10, weight: 700 } } } } });
  const sm = {}; HR.cands.forEach(c => { const k = (c.state || 'Not given').trim() || 'Not given'; sm[k] = (sm[k] || 0) + 1; });
  const sl = Object.entries(sm).sort((a, b) => b[1] - a[1]).slice(0, 10);
  mvChart('hr_state', { type: 'bar', data: { labels: sl.map(x => x[0]), datasets: [{ label: 'Candidates', data: sl.map(x => x[1]), backgroundColor: '#6C5CE7', borderRadius: 6 }] },
    options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, afterDataLimits: padValueAxis, ticks: { precision: 0 } } }, plugins: { legend: { display: false }, datalabels: { display: true, anchor: 'end', align: 'end', color: '#1E1B4B', font: { size: 10, weight: 700 } } } } });
}

/* ---------------- CANDIDATE MASTER ---------------- */
function hrCandFilter(P){
  const q = HR.q.trim().toLowerCase();
  return HR.cands.filter(c => {
    if(HR.status === 'PIPE' && !(c.status === 'Shortlisted' || c.status === 'Interview')) return false;
    if(HR.status === 'PASSNEW' && !(c.passed && c.status === 'New')) return false;
    if(HR.status === 'NEWP' && !(c.first && (P.all || (c.first >= P.start && c.first <= P.end)))) return false;
    if(HR_STATUSES.includes(HR.status) && (c.status || 'New') !== HR.status) return false;
    if(HR.dept !== 'ALL' && (c.department || 'Not given') !== HR.dept) return false;
    if(q && !`${c.name} ${c.mobile} ${c.email || ''} ${c.city || ''} ${c.state || ''} ${c.department || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function hrCandidatesHtml(P){
  const list = hrCandFilter(P);
  const chip = (k, l, n) => `<button class="mv-chip ${HR.status === k ? 'on' : ''}" data-hrstatus="${k}" style="--c:${HR_ST_COLOR[k] || '#1E1B4B'}"><i></i>${l} <span>${fmtNum(n)}</span></button>`;
  const special = { PIPE: 'In pipeline', PASSNEW: 'Passed, not reviewed', NEWP: 'New in period' };
  return `<div class="mv-chips" style="margin-bottom:12px">${chip('ALL', 'All', HR.cands.length)}${HR_STATUSES.map(s => chip(s, s, HR.cands.filter(c => (c.status || 'New') === s).length)).join('')}${chip('PASSNEW', 'Passed, not reviewed', HR.cands.filter(c => c.passed && c.status === 'New').length)}</div>
    ${mvPanel('Candidate Master', `${fmtNum(list.length)} candidates${special[HR.status] ? ' · ' + special[HR.status] : ''} · change the status right in the table, or click a name to edit details`,
    `<div class="table-scroll"><table><thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Email</th><th>Department</th><th>City / state</th><th>Experience</th><th style="text-align:right">Tests</th><th style="text-align:right">Best score</th><th>Last test</th><th>Result</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
    ${list.slice(0, HR.limit).map((c, i) => `<tr class="clickable" data-hrcand="${c.mobile}"><td>${i + 1}</td><td class="name">${escAttr(c.name)}${c._unsaved ? ' <span class="muted" title="Waiting for the next sync">·</span>' : ''}</td><td>${c.mobile}</td><td>${escAttr(c.email || '')}</td><td>${escAttr(c.department || '')}</td><td>${escAttr(c.city || '')}${c.city && c.state ? ', ' : ''}<span class="muted">${escAttr(c.state || '')}</span></td><td>${escAttr(c.experience || '')}</td>
      <td style="text-align:right">${fmtNum(c.tests)}</td><td style="text-align:right;font-weight:600">${c.best === null ? '—' : fmtPct(c.best)}</td><td>${c.last ? `${escAttr(c.last.dept_name)}<br><span class="muted">${hrDate(c.last.date)}</span>` : '—'}</td><td>${c.last ? hrResPill(c.last.result) : '—'}</td>
      <td><select class="hr-status" data-hrsetstatus="${c.mobile}" style="--c:${HR_ST_COLOR[c.status || 'New']}">${HR_STATUSES.map(s => `<option ${s === (c.status || 'New') ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td class="muted" style="max-width:220px;white-space:normal">${escAttr(c.remarks || '')}</td></tr>`).join('') || '<tr><td colspan="13" class="empty-note">No candidates match.</td></tr>'}
    </tbody></table></div>${list.length > HR.limit ? `<div style="text-align:center;margin-top:10px"><button class="util-btn small" data-hrmore="1">Show more (${fmtNum(list.length - HR.limit)} left)</button></div>` : ''}`,
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="hrDept"><option value="ALL">All departments</option>${[...new Set(HR.cands.map(c => c.department || 'Not given'))].sort().map(d => `<option ${HR.dept === d ? 'selected' : ''}>${escAttr(d)}</option>`).join('')}</select><input class="table-search" id="hrSearch" placeholder="Search name, mobile, email, city…" value="${escAttr(HR.q)}"><button class="refresh-btn" data-hradd="1">+ Add candidate</button><button class="util-btn small" data-hrcsv="candidates">Export CSV</button></div>`)}`;
}

/* ---------------- TEST RESULTS ---------------- */
function hrResultsRows(F){
  const q = HR.q.trim().toLowerCase();
  return F.cur.filter(r => (HR.res === 'ALL' || (HR.res === 'FLAG' ? hrFlagged(r) : r.result === HR.res)) && (!q || `${r.name} ${r.mobile} ${r.email || ''} ${r.ref_id}`.toLowerCase().includes(q)));
}
function hrResultsHtml(P, F){
  const rows = hrResultsRows(F);
  const sel = `<select id="hrRes">${[['ALL', 'All results'], ['PASS', 'Passed'], ['FAIL', 'Failed'], ['FLAG', 'Flagged only']].map(([k, l]) => `<option value="${k}" ${HR.res === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return mvPanel('Test results', `${fmtNum(rows.length)} attempts · ${escAttr(P.label)} · click a row to see every answer`,
    `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Ref</th><th>Candidate</th><th>Mobile</th><th>Test</th><th style="text-align:right">Score</th><th style="text-align:right">%</th><th>Result</th><th style="text-align:right">Time</th><th style="text-align:right">Attempted</th><th style="text-align:right">Tab switches</th><th>Status</th><th>Notes</th></tr></thead><tbody>
    ${rows.slice(0, HR.limit).map(r => { const c = HR.byMobile.get(String(r.mobile || '').slice(-10)); return `<tr class="clickable" data-hrres="${escAttr(r.ref_id)}"><td>${hrDate(r.date)}<br><span class="muted">${r.date ? r.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span></td><td>${escAttr(r.ref_id)}</td><td class="name">${escAttr(r.name)}</td><td>${escAttr(r.mobile)}</td><td>${escAttr(r.dept_name)}</td>
      <td style="text-align:right">${r.score ?? '—'} / ${r.total ?? '—'}</td><td style="text-align:right;font-weight:700">${fmtPct(r.percent)}</td><td>${hrResPill(r.result)}</td><td style="text-align:right">${hrTime(r.time_taken_sec)}</td><td style="text-align:right">${r.attempted ?? '—'}</td>
      <td style="text-align:right">${(r.tab_switches || 0) >= 3 ? `<span class="mv-g down">${r.tab_switches}</span>` : (r.tab_switches ?? 0)}</td><td>${c ? hrStatusPill(c.status) : '—'}</td><td class="muted">${escAttr([r.notes, r.source === 'unverified' ? 'unverified' : ''].filter(Boolean).join('; '))}</td></tr>`; }).join('') || '<tr><td colspan="13" class="empty-note">No attempts match.</td></tr>'}
    </tbody></table></div>${rows.length > HR.limit ? `<div style="text-align:center;margin-top:10px"><button class="util-btn small" data-hrmore="1">Show more (${fmtNum(rows.length - HR.limit)} left)</button></div>` : ''}`,
    `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${sel}<input class="table-search" id="hrSearch" placeholder="Search name, mobile, ref…" value="${escAttr(HR.q)}"><button class="util-btn small" data-hrcsv="results">Export CSV</button></div>`);
}

/* ---------------- TESTS ---------------- */
function hrTestsHtml(P, F){
  const stats = {}; hrByTest(F.cur).forEach(t => stats[t.id] = t);
  const last = {}; HR.results.forEach(r => { if(r.date && (!last[r.dept_id] || r.date > last[r.dept_id])) last[r.dept_id] = r.date; });
  const list = HR.tests.slice().sort((a, b) => ((stats[b.id] || {}).n || 0) - ((stats[a.id] || {}).n || 0));
  return mvPanel('Tests', `${fmtNum(list.length)} tests · attempts for ${escAttr(P.label)} · click a row for its results. Tests and questions are managed in the hiring-tests admin.`,
    `<div class="table-scroll"><table><thead><tr><th>Test</th><th>Status</th><th style="text-align:right">Questions</th><th style="text-align:right">Shown</th><th style="text-align:right">Time limit</th><th style="text-align:right">Pass mark</th><th style="text-align:right">Attempts</th><th style="text-align:right">Pass rate</th><th style="text-align:right">Avg score</th><th style="text-align:right">Avg time</th><th>Last attempt</th></tr></thead><tbody>
    ${list.map(t => { const s = stats[t.id] || { n: 0 }; return `<tr class="clickable" data-hrtest="${escAttr(t.id)}"><td class="name"><span class="mv-dot" style="--c:${escAttr(t.color || '#6C5CE7')}"></span>${escAttr(t.name)}<br><span class="muted">${escAttr(t.slug || '')}</span></td><td>${t.active ? '<span class="seg-pill sm" style="--c:#1FB286">Active</span>' : '<span class="seg-pill sm" style="--c:#A4A2C0">Off</span>'}</td>
      <td style="text-align:right">${t.question_count ?? '—'}</td><td style="text-align:right">${t.questions_to_show ? t.questions_to_show : 'All'}</td><td style="text-align:right">${t.time_limit_min ? t.time_limit_min + ' min' : '—'}</td><td style="text-align:right">${t.pass_percent ?? '—'}%</td>
      <td style="text-align:right;font-weight:600">${fmtNum(s.n)}</td><td style="text-align:right">${s.n ? fmtPct(s.rate) : '—'}</td><td style="text-align:right">${s.n ? fmtPct(s.avg) : '—'}</td><td style="text-align:right">${s.n ? hrTime(Math.round(s.avgTime)) : '—'}</td><td>${hrDate(last[t.id])}</td></tr>`; }).join('') || '<tr><td colspan="11" class="empty-note">No tests synced yet — run hrmsStart in the hiring-tests Apps Script.</td></tr>'}
    </tbody></table></div>`, `<button class="util-btn small" data-hrcsv="tests">Export CSV</button>`);
}

/* ---------------- render ---------------- */
function hrRender(keepFocus){
  if(!HR.loaded) return;
  const focus = keepFocus && document.activeElement && document.activeElement.id === 'hrSearch';
  HR.drill.clear();
  const P = hrPeriod(), F = hrFiltered(P);
  document.querySelectorAll('#hrPreset button').forEach(b => b.classList.toggle('active', b.dataset.p === HR.preset));
  document.getElementById('hrCustom').style.display = HR.preset === 'custom' ? '' : 'none';
  const ts = document.getElementById('hrTest');
  ts.innerHTML = `<option value="ALL">All tests</option>` + HR.tests.slice().sort((a, b) => String(a.name).localeCompare(b.name)).map(t => `<option value="${escAttr(t.id)}" ${HR.test === t.id ? 'selected' : ''}>${escAttr(t.name)}</option>`).join('');
  document.getElementById('hrPeriodBlock').style.opacity = HR.tab === 'candidates' ? .45 : 1;
  const body = document.getElementById('dashRoot');
  if(HR.tab === 'candidates') body.innerHTML = hrCandidatesHtml(P);
  else if(HR.tab === 'results') body.innerHTML = hrResultsHtml(P, F);
  else if(HR.tab === 'tests') body.innerHTML = hrTestsHtml(P, F);
  else { body.innerHTML = hrOverviewHtml(P, F); hrOverviewCharts(P, F); }
  document.getElementById('heroFigTitle').textContent = 'Tests · ' + P.label;
  document.getElementById('heroFig').textContent = fmtNum(F.cur.length);
  const pass = F.cur.filter(r => r.result === 'PASS').length;
  document.getElementById('heroFigSub').textContent = `${fmtNum(pass)} passed · ${fmtNum(HR.cands.length)} candidates`;
  if(focus){ const i = document.getElementById('hrSearch'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function hrTab(t){
  HR.tab = t; HR.limit = 100;
  document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === t));
  if(location.hash.replace('#', '') !== t) history.replaceState(null, '', '#' + t);
  hrRender(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- popups ---------------- */
function hrModal(title, sub, html){
  let ov = document.getElementById('hrModal');
  if(!ov){ ov = document.createElement('div'); ov.id = 'hrModal'; ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal-box" style="max-width:980px"><div class="modal-head"><div><h3 id="hrModalTitle"></h3><p class="muted" id="hrModalSub" style="margin:4px 0 0"></p></div><button class="modal-close" id="hrModalClose" aria-label="Close">✕</button></div><div id="hrModalBody"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if(e.target === ov) ov.style.display = 'none'; });
    ov.querySelector('#hrModalClose').addEventListener('click', () => ov.style.display = 'none');
    document.addEventListener('keydown', e => { if(e.key === 'Escape') ov.style.display = 'none'; }); }
  ov.querySelector('#hrModalTitle').textContent = title; ov.querySelector('#hrModalSub').textContent = sub || '';
  ov.querySelector('#hrModalBody').innerHTML = html; ov.style.display = 'flex';
  return ov;
}
async function hrOpenResult(ref){
  const r = HR.results.find(x => x.ref_id === ref); if(!r) return;
  const ov = hrModal(`${r.name} — ${r.dept_name}`, `${r.ref_id} · ${hrDate(r.date)} · ${r.mobile}`, `<div class="qa-kpis">${[['Score', `${r.score ?? '—'} / ${r.total ?? '—'}`], ['Percent', fmtPct(r.percent)], ['Result', r.result], ['Time', hrTime(r.time_taken_sec)], ['Attempted', r.attempted ?? '—'], ['Tab switches', r.tab_switches ?? 0]].map(([l, v]) => `<div class="qa-kpi"><span>${l}</span><b>${escAttr(String(v))}</b></div>`).join('')}</div>${r.notes || r.source === 'unverified' ? `<div class="mv-note">${escAttr([r.notes, r.source === 'unverified' ? 'Submitted after the session expired (unverified)' : ''].filter(Boolean).join(' · '))}</div>` : ''}<div id="hrAns"><p class="muted">Loading answers…</p></div>`);
  try{
    const ans = await loadHrmsAnswers(ref);
    ov.querySelector('#hrAns').innerHTML = ans.length ? `<div class="table-scroll" style="max-height:52vh"><table><thead><tr><th>#</th><th>Question</th><th>Answer given</th><th>Correct answer</th><th></th></tr></thead><tbody>${ans.map((a, i) => { const o = a.o || {}; const txt = k => k ? `${k}${o[k] ? ' · ' + escAttr(o[k]) : ''}` : '<span class="muted">not answered</span>';
      return `<tr><td>${a.sno || i + 1}</td><td style="white-space:normal;max-width:420px">${escAttr(a.q || '')}${a.tag ? ` <span class="muted">· ${escAttr(a.tag)}</span>` : ''}</td><td>${txt(a.u)}</td><td>${txt(a.c)}</td><td>${a.ok ? '<span class="mv-g up">✓</span>' : '<span class="mv-g down">✗</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No answer detail stored for this attempt.</p>';
  }catch(e){ ov.querySelector('#hrAns').innerHTML = `<div class="dept-note">Could not load answers: ${escAttr(e.message)}</div>`; }
}
function hrOpenCandidate(mobile, isNew){
  const c = isNew ? { mobile: '', name: '', status: 'New' } : HR.byMobile.get(mobile); if(!c) return;
  const f = (k, l, type) => `<div class="admin-field"><label>${l}</label><input id="hc_${k}" type="${type || 'text'}" value="${escAttr(c[k] || '')}" ${k === 'mobile' && !isNew ? 'disabled' : ''}></div>`;
  const attempts = (c.attempts || []).map(r => `<tr class="clickable" data-hrres="${escAttr(r.ref_id)}"><td>${hrDate(r.date)}</td><td>${escAttr(r.dept_name)}</td><td style="text-align:right">${r.score ?? '—'} / ${r.total ?? '—'}</td><td style="text-align:right;font-weight:700">${fmtPct(r.percent)}</td><td>${hrResPill(r.result)}</td><td style="text-align:right">${hrTime(r.time_taken_sec)}</td><td style="text-align:right">${r.tab_switches ?? 0}</td></tr>`).join('');
  hrModal(isNew ? 'Add candidate' : c.name, isNew ? 'Basic details · mobile number is the candidate ID' : `${c.mobile} · ${fmtNum(c.tests || 0)} tests · added ${hrDate(c.first)}${c.updated_by ? ' · last edited by ' + c.updated_by : ''}`,
    `<div class="admin-grid" style="padding:0">${f('name', 'Full name')}${f('mobile', 'Mobile (10 digits)', 'tel')}${f('email', 'Email', 'email')}${f('department', 'Department')}${f('experience', 'Experience')}${f('city', 'City')}${f('state', 'State')}
      <div class="admin-field"><label>Status</label><select id="hc_status">${HR_STATUSES.map(s => `<option ${s === (c.status || 'New') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="admin-field" style="grid-column:1/-1"><label>Remarks</label><textarea id="hc_remarks" rows="3" style="width:100%;font:inherit">${escAttr(c.remarks || '')}</textarea></div></div>
     <div style="display:flex;gap:8px;margin:6px 0 14px"><button class="refresh-btn" id="hcSave">${isNew ? 'Add candidate' : 'Save changes'}</button><span class="muted" id="hcMsg" style="align-self:center"></span></div>
     ${isNew ? '' : `<h3 class="score-h3" style="margin:4px 0 6px">Test attempts</h3><div class="table-scroll"><table><thead><tr><th>Date</th><th>Test</th><th style="text-align:right">Score</th><th style="text-align:right">%</th><th>Result</th><th style="text-align:right">Time</th><th style="text-align:right">Tab switches</th></tr></thead><tbody>${attempts || '<tr><td colspan="7" class="empty-note">No tests yet.</td></tr>'}</tbody></table></div>`}`);
  document.getElementById('hcSave').onclick = async () => {
    const v = k => document.getElementById('hc_' + k).value.trim();
    const row = { mobile: isNew ? v('mobile').replace(/\D/g, '').slice(-10) : c.mobile, name: v('name'), email: v('email'), state: v('state'), city: v('city'), department: v('department'), experience: v('experience'), status: v('status'), remarks: v('remarks') };
    const msg = document.getElementById('hcMsg');
    if(row.name.length < 2){ msg.textContent = 'Please enter the name.'; return; }
    if(!/^[6-9]\d{9}$/.test(row.mobile)){ msg.textContent = 'Please enter a valid 10-digit mobile number.'; return; }
    try{ msg.textContent = 'Saving…'; await saveCandidate(row, isNew || c._unsaved); showToast(isNew ? 'Candidate added ✓' : 'Saved ✓'); document.getElementById('hrModal').style.display = 'none'; await hrLoad(); }
    catch(e){ msg.textContent = e.message; }
  };
}
async function hrSetStatus(mobile, status){
  const c = HR.byMobile.get(mobile); if(!c) return;
  try{ await saveCandidate(Object.assign({}, c, { status }), !!c._unsaved); c.status = status; c._unsaved = false; showToast(`${c.name}: ${status} ✓`); hrRender(); }
  catch(e){ alert(e.message); hrRender(); }
}
function hrCsv(which){
  const P = hrPeriod(), F = hrFiltered(P);
  const csv = (head, rows) => [head.join(',')].concat(rows.map(r => r.map(mvCsvCell).join(','))).join('\n');
  if(which === 'candidates') mvDownload('candidates', csv(['Name', 'Mobile', 'Email', 'Department', 'City', 'State', 'Experience', 'Status', 'Remarks', 'Tests', 'Best %', 'Last test', 'Last test date', 'Last result', 'Source'],
    hrCandFilter(P).map(c => [c.name, c.mobile, c.email, c.department, c.city, c.state, c.experience, c.status, c.remarks, c.tests, c.best === null ? '' : c.best, c.last ? c.last.dept_name : '', c.last && c.last.date ? c.last.date.toLocaleDateString('en-GB') : '', c.last ? c.last.result : '', c.source])));
  else if(which === 'results') mvDownload('test results ' + P.label, csv(['Date', 'Ref', 'Name', 'Mobile', 'Email', 'Test', 'Score', 'Total', 'Percent', 'Result', 'Time (sec)', 'Attempted', 'Tab switches', 'Notes'],
    hrResultsRows(F).map(r => [r.date ? r.date.toLocaleString('en-GB') : '', r.ref_id, r.name, r.mobile, r.email, r.dept_name, r.score, r.total, r.percent, r.result, r.time_taken_sec, r.attempted, r.tab_switches, r.notes])));
  else if(which === 'tests'){ const s = {}; hrByTest(F.cur).forEach(t => s[t.id] = t);
    mvDownload('tests', csv(['Test', 'Active', 'Questions', 'Time limit (min)', 'Pass mark %', 'Attempts', 'Pass rate %', 'Avg score %'], HR.tests.map(t => { const x = s[t.id] || {}; return [t.name, t.active ? 'Yes' : 'No', t.question_count, t.time_limit_min, t.pass_percent, x.n || 0, x.n ? x.rate.toFixed(1) : '', x.n ? x.avg.toFixed(1) : '']; }))); }
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-hr]'); if(a){ const fn = HR.drill.get(a.dataset.hr); if(fn) fn(); return; }
  if(e.target.closest('select')) return;
  const r = e.target.closest('[data-hrres]'); if(r){ hrOpenResult(r.dataset.hrres); return; }
  const c = e.target.closest('[data-hrcand]'); if(c){ hrOpenCandidate(c.dataset.hrcand); return; }
  const t = e.target.closest('[data-hrtest]'); if(t){ HR.test = t.dataset.hrtest; HR.res = 'ALL'; hrTab('results'); return; }
  const s = e.target.closest('[data-hrstatus]'); if(s){ HR.status = s.dataset.hrstatus; HR.limit = 100; hrRender(); return; }
  const g = e.target.closest('[data-hrgran]'); if(g){ HR.gran = g.dataset.hrgran; hrRender(); return; }
  const p = e.target.closest('#hrPreset [data-p]'); if(p){ HR.preset = p.dataset.p; hrRender(); return; }
  if(e.target.closest('[data-hradd]')){ hrOpenCandidate(null, true); return; }
  if(e.target.closest('[data-hrmore]')){ HR.limit += 200; hrRender(); return; }
  const x = e.target.closest('[data-hrcsv]'); if(x) hrCsv(x.dataset.hrcsv);
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.matches('[data-hrsetstatus]')) hrSetStatus(t.dataset.hrsetstatus, t.value);
  else if(t.id === 'hrTest'){ HR.test = t.value; hrRender(); }
  else if(t.id === 'hrRes'){ HR.res = t.value; hrRender(); }
  else if(t.id === 'hrDept'){ HR.dept = t.value; HR.limit = 100; hrRender(); }
  else if(t.id === 'hrCs' || t.id === 'hrCe'){ HR.custom = { start: document.getElementById('hrCs').value, end: document.getElementById('hrCe').value }; if(HR.custom.start && HR.custom.end) hrRender(); }
});
document.addEventListener('input', e => { if(e.target.id === 'hrSearch'){ HR.q = e.target.value; clearTimeout(HR._t); HR._t = setTimeout(() => { HR.limit = 100; hrRender(true); }, 250); } });
document.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => { HR.q = ''; hrTab(b.dataset.stab); }));

/* ---------------- boot ---------------- */
function hrStatus(ok, msg){ document.getElementById('syncStatus').innerHTML = `<span class="live-dot ${ok ? '' : 'err'}"></span>${msg}`; }
async function hrLoad(manual){
  const btn = document.getElementById('refreshBtn'); btn.classList.add('spinning');
  try{
    hrPrepare(await loadHrmsData());
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('dashboardBody').style.display = 'block';
    document.getElementById('errBar').classList.remove('show');
    hrRender();
    hrStatus(true, `Live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if(manual) showToast('Up to date.');
  }catch(err){
    console.error(err); hrStatus(false, 'Connection error');
    const b = document.getElementById('errBar');
    b.innerHTML = `⚠️ ${escAttr(err.message)}<br><br>${/hrms_|relation|does not exist/i.test(err.message) ? 'Run <b>hrms-setup.sql</b> in Supabase, then <b>hrmsStart</b> in the hiring-tests Apps Script.' : 'Check your internet connection and press <b>Refresh</b>.'}`;
    b.classList.add('show'); document.getElementById('loadingScreen').style.display = 'none';
  }finally{ btn.classList.remove('spinning'); }
}
document.getElementById('refreshBtn').addEventListener('click', () => hrLoad(true));
document.getElementById('logoutBtn').addEventListener('click', () => { if(confirm('Log out?')) signOut(); });
async function hrStart(){
  try{
    await requireUser();
    document.getElementById('loadingScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = CURRENT_USER.email;
    document.getElementById('avatarBadge').textContent = CURRENT_USER.email.slice(0, 2).toUpperCase();
    try{ const s = await loadSharedSettings(); if(s) ADMIN = s; }catch(e){ console.warn(e); }
    if(!userCan('hrms')){ const h = homeFor(); if(h && h !== 'hrms.html'){ location.replace(h); return; } }
    document.getElementById('brandLabel').textContent = ADMIN.brandName || 'PICK N PACK';
    const logo = document.getElementById('brandLogo'); logo.onload = () => logo.style.display = ''; logo.src = ADMIN.logo || 'assets/logo.png';
    const icon = document.getElementById('sbLogo'); icon.onload = () => { icon.style.display = ''; document.querySelector('.sb-brand').style.display = 'none'; }; icon.src = 'assets/logo-icon.png';
    navRender();
    const hash = (location.hash || '').replace('#', '');
    if(['overview', 'candidates', 'results', 'tests'].indexOf(hash) >= 0) HR.tab = hash;
    document.querySelectorAll('[data-stab]').forEach(b => b.classList.toggle('active', b.dataset.stab === HR.tab));
    await hrLoad();
    setInterval(() => { if(!document.hidden && !document.getElementById('hrModal')?.style.display.includes('flex')) hrLoad(); }, 5 * 60 * 1000);
  }catch(err){ console.error(err); document.getElementById('loadingScreen').style.display = 'none'; const b = document.getElementById('errBar'); b.innerHTML = '⚠️ ' + escAttr(err.message || String(err)); b.classList.add('show'); }
}
hrStart();
