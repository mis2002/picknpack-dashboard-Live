/* =====================================================================
   testpage.js — the page candidates open: test.html?t=<test-link-name>
   No login. Talks to the hiring-tests Apps Script (getTest → startTest → submitTest).
   The Apps Script URL is read from Supabase public_settings (key "hiring"), set in HRMS → Settings.
   ===================================================================== */
const TP_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Chandigarh','Jammu & Kashmir','Ladakh','Puducherry'];
const TP_EXP = ['Fresher (0–1 year)', '1–3 years', '3–5 years', '5–8 years', '8+ years'];
const TP = { api: '', slug: '', test: null, att: null, timer: null, submitting: false };
const $ = id => document.getElementById(id);
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  key: () => 'pnp_attempt_' + TP.slug,
  get(){ try { return JSON.parse(sessionStorage.getItem(this.key())); } catch(e){ return null; } },
  set(v){ try { sessionStorage.setItem(this.key(), JSON.stringify(v)); } catch(e){} },
  clear(){ sessionStorage.removeItem(this.key()); }
};
function clock(sec){ sec = Math.max(0, Math.floor(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }

async function tpApiUrl(){
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/public_settings?key=eq.hiring&select=value`, { headers: { apikey: CONFIG.SUPABASE_KEY } });
  if(!r.ok) throw new Error('This test is not available right now. Please contact HR.');
  const rows = await r.json(); const url = rows[0] && rows[0].value && rows[0].value.apiUrl;
  if(!url) throw new Error('This test is not set up yet. Please contact HR.');
  return url;
}
async function call(action, payload){
  let res, data;
  try { res = await fetch(TP.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action }, payload || {})), redirect: 'follow' }); }
  catch(e){ throw new Error('Could not reach the server. Please check your internet connection and try again.'); }
  try { data = await res.json(); } catch(e){ throw new Error('The server gave an unexpected reply. Please try again.'); }
  if(!data || !data.ok) throw new Error((data && data.error) || 'Something went wrong.');
  return data;
}
function screen(html){ $('tpMain').innerHTML = html; window.scrollTo(0, 0); }
function fail(msg){ screen(`<div class="tp-card tp-center"><div class="tp-ico bad">!</div><h2>Test not available</h2><p class="tp-muted">${esc(msg)}</p></div>`); }

/* ---------------- step 1: details form ---------------- */
function showIntro(){
  const t = TP.test;
  document.documentElement.style.setProperty('--tc', t.color || '#6C5CE7');
  document.title = t.name + ' — PicknPack';
  screen(`<div class="tp-card">
    <div class="tp-tape"></div>
    <p class="tp-kicker">PicknPack hiring test</p>
    <h1>${esc(t.name)}</h1>
    ${t.description ? `<p class="tp-muted">${esc(t.description)}</p>` : ''}
    <div class="tp-chips"><span>${t.questionCount} questions</span><span>${t.timeLimitMin} minutes</span></div>
    <form id="tpForm" novalidate>
      <div class="tp-grid">
        <label>Full name *<input id="f_name" autocomplete="name" maxlength="80"></label>
        <label>Mobile number *<input id="f_mobile" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="10-digit mobile"></label>
        <label>Email *<input id="f_email" type="email" autocomplete="email" maxlength="120"></label>
        <label>State *<select id="f_state"><option value="">Choose state</option>${TP_STATES.map(s => `<option>${s}</option>`).join('')}</select></label>
        <label>City *<input id="f_city" maxlength="60"></label>
        <label>Experience<select id="f_exp"><option value="">Choose (optional)</option>${TP_EXP.map(s => `<option>${s}</option>`).join('')}</select></label>
      </div>
      <div class="tp-rules"><b>Before you start</b><ul>
        <li>The timer starts as soon as you press Start and cannot be paused.</li>
        <li>Stay on this page. Switching to another tab or app is recorded.</li>
        <li>When time runs out, your answers are submitted automatically.</li>
        <li>Refreshing the page keeps your answers, but the timer keeps running.</li></ul></div>
      <p class="tp-err" id="tpErr"></p>
      <button class="tp-btn" id="tpStart" type="submit">Start test →</button>
    </form></div>`);
  $('tpForm').addEventListener('submit', async e => {
    e.preventDefault();
    const c = { name: $('f_name').value.trim(), mobile: $('f_mobile').value.replace(/\D/g, '').slice(-10), email: $('f_email').value.trim(), state: $('f_state').value, city: $('f_city').value.trim(), experience: $('f_exp').value };
    const err = c.name.length < 2 ? 'Please enter your full name.' : !/^[6-9]\d{9}$/.test(c.mobile) ? 'Please enter a valid 10-digit mobile number.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? 'Please enter a valid email address.' : !c.state ? 'Please choose your state.' : !c.city ? 'Please enter your city.' : '';
    if(err){ $('tpErr').textContent = err; return; }
    $('tpErr').textContent = ''; $('tpStart').disabled = true; $('tpStart').textContent = 'Starting…';
    try {
      const r = await call('startTest', { slug: TP.slug, candidate: c });
      TP.att = { attemptId: r.attemptId, questions: r.questions, timeLimitSec: r.timeLimitSec, startedAt: Date.now(), candidate: c, answers: {}, idx: 0, tabSwitches: 0 };
      store.set(TP.att); showTest();
    } catch(ex){ $('tpErr').textContent = ex.message; $('tpStart').disabled = false; $('tpStart').textContent = 'Start test →'; }
  });
}

/* ---------------- step 2: the test ---------------- */
function remaining(){ const a = TP.att; return a.timeLimitSec - (Date.now() - a.startedAt) / 1000; }
function showTest(){
  const a = TP.att;
  screen(`<div class="tp-bar"><div><b>${esc(TP.test.name)}</b><span class="tp-muted"> · ${esc(a.candidate.name)}</span></div><div class="tp-timer" id="tpTimer">--:--</div></div>
    <div class="tp-progress"><i id="tpProg"></i></div>
    <div class="tp-warn" id="tpWarn" style="display:none"></div>
    <div class="tp-layout"><div class="tp-card" id="tpQ"></div>
      <aside class="tp-card tp-side"><p class="tp-kicker">Questions</p><div class="tp-pal" id="tpPal"></div>
        <p class="tp-muted tp-small" id="tpCount"></p><button class="tp-btn" id="tpSubmit">Submit test</button></aside></div>`);
  $('tpSubmit').onclick = confirmSubmit;
  drawQ(); tick();
  clearInterval(TP.timer); TP.timer = setInterval(tick, 500);
}
function tick(){
  const left = remaining(), el = $('tpTimer'); if(!el) return;
  el.textContent = clock(left); el.classList.toggle('low', left <= 60);
  if(left <= 0 && !TP.submitting){ clearInterval(TP.timer); submit(true); }
}
function drawQ(){
  const a = TP.att, q = a.questions[a.idx], n = a.questions.length, pos = ['A', 'B', 'C', 'D'];
  const answered = Object.keys(a.answers).filter(k => a.answers[k]).length;
  $('tpQ').innerHTML = `<p class="tp-kicker">Question ${a.idx + 1} of ${n}${q.tag ? ' · ' + esc(q.tag) : ''}</p><h2 class="tp-qtext">${esc(q.text)}</h2>
    <div class="tp-opts">${q.options.map((o, i) => `<button class="tp-opt ${a.answers[q.id] === o.key ? 'on' : ''}" data-k="${o.key}"><span>${pos[i]}</span>${esc(o.text)}</button>`).join('')}</div>
    <div class="tp-nav"><button class="tp-btn ghost" id="tpPrev" ${a.idx === 0 ? 'disabled' : ''}>← Previous</button>
      ${a.answers[q.id] ? `<button class="tp-link" id="tpClear">Clear answer</button>` : '<span></span>'}
      ${a.idx < n - 1 ? `<button class="tp-btn" id="tpNext">Next →</button>` : `<button class="tp-btn" id="tpFinish">Finish</button>`}</div>`;
  $('tpPal').innerHTML = a.questions.map((x, i) => `<button class="${a.answers[x.id] ? 'done' : ''} ${i === a.idx ? 'cur' : ''}" data-i="${i}">${i + 1}</button>`).join('');
  $('tpCount').textContent = `${answered} of ${n} answered`;
  $('tpProg').style.width = (answered / n * 100) + '%';
  $('tpQ').querySelectorAll('.tp-opt').forEach(b => b.onclick = () => choose(b.dataset.k));
  $('tpPrev').onclick = () => go(a.idx - 1);
  if($('tpNext')) $('tpNext').onclick = () => go(a.idx + 1);
  if($('tpFinish')) $('tpFinish').onclick = confirmSubmit;
  if($('tpClear')) $('tpClear').onclick = () => { delete a.answers[q.id]; store.set(a); drawQ(); };
  $('tpPal').querySelectorAll('button').forEach(b => b.onclick = () => go(+b.dataset.i));
}
function choose(k){ const a = TP.att, q = a.questions[a.idx]; a.answers[q.id] = k; store.set(a); drawQ(); if(a.idx < a.questions.length - 1) setTimeout(() => go(a.idx + 1), 250); }
function go(i){ const a = TP.att; if(i < 0 || i >= a.questions.length) return; a.idx = i; store.set(a); drawQ(); }
function confirmSubmit(){
  const a = TP.att, left = a.questions.filter(q => !a.answers[q.id]).length;
  const ov = document.createElement('div'); ov.className = 'tp-modal';
  ov.innerHTML = `<div class="tp-card"><h2>Submit your test?</h2><p class="tp-muted">${left ? `<b>${left}</b> question${left === 1 ? ' is' : 's are'} not answered yet.` : 'All questions are answered.'} You cannot change answers after submitting.</p>
    <div class="tp-nav"><button class="tp-btn ghost" id="tpBack">Go back</button><button class="tp-btn" id="tpYes">Submit</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#tpBack').onclick = () => ov.remove();
  ov.querySelector('#tpYes').onclick = () => { ov.remove(); submit(false); };
}
async function submit(auto){
  if(TP.submitting) return; TP.submitting = true; clearInterval(TP.timer);
  const a = TP.att;
  screen(`<div class="tp-card tp-center"><div class="tp-spin"></div><h2>${auto ? 'Time is up — submitting…' : 'Submitting…'}</h2><p class="tp-muted">Please keep this page open.</p></div>`);
  for(let tryNo = 0; tryNo < 3; tryNo++){
    try {
      const r = await call('submitTest', { attemptId: a.attemptId, answers: a.answers, tabSwitches: a.tabSwitches,
        fallback: { slug: TP.slug, candidate: a.candidate, qids: a.questions.map(x => x.id), startedAt: a.startedAt, limitSec: a.timeLimitSec } });
      store.clear(); return done(r);
    } catch(e){ if(tryNo === 2){ TP.submitting = false; return screen(`<div class="tp-card tp-center"><div class="tp-ico bad">!</div><h2>Could not submit</h2><p class="tp-muted">${esc(e.message)} Your answers are saved on this device.</p><button class="tp-btn" onclick="TP.submitting=false;submit(false)">Try again</button></div>`); }
      await new Promise(res => setTimeout(res, 1500)); }
  }
}
function done(r){
  const res = r.result;
  screen(`<div class="tp-card tp-center"><div class="tp-ico good">✓</div><h2>Thank you — your test is submitted</h2>
    <p class="tp-muted">Reference: <b>${esc(r.refId)}</b>. HR will contact you about the next steps.</p>
    ${res ? `<div class="tp-score ${res.result === 'PASS' ? 'pass' : 'fail'}"><b>${res.score} / ${res.total}</b><span>${res.percent}% · ${res.result === 'PASS' ? 'Passed' : 'Not passed'}</span></div>` : ''}</div>`);
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden && TP.att && !TP.submitting && $('tpWarn')){
    TP.att.tabSwitches = (TP.att.tabSwitches || 0) + 1; store.set(TP.att);
    const w = $('tpWarn'); w.style.display = ''; w.textContent = `You left the test page (${TP.att.tabSwitches}×). This is shown to HR.`;
  }
});
document.addEventListener('keydown', e => {
  if(!TP.att || TP.submitting || !$('tpQ') || document.querySelector('.tp-modal') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const map = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 }, i = map[e.key.toLowerCase()];
  const q = TP.att.questions[TP.att.idx];
  if(i !== undefined && q.options[i]) choose(q.options[i].key);
  else if(e.key === 'ArrowRight') go(TP.att.idx + 1);
  else if(e.key === 'ArrowLeft') go(TP.att.idx - 1);
});

/* ---------------- boot ---------------- */
(async function(){
  const u = new URL(location.href);
  TP.slug = (u.searchParams.get('t') || location.hash.replace(/^#\/?(t\/)?/, '') || '').trim().toLowerCase();
  if(!TP.slug) return fail('This link is incomplete. Please use the exact link HR sent you.');
  try {
    TP.api = await tpApiUrl();
    const saved = store.get();
    const r = await call('getTest', { slug: TP.slug });
    TP.test = r.test;
    if(saved && saved.attemptId && saved.questions){ TP.att = saved; document.documentElement.style.setProperty('--tc', TP.test.color || '#6C5CE7'); if(remaining() > 0) showTest(); else submit(true); }
    else showIntro();
  } catch(e){ fail(e.message); }
})();
