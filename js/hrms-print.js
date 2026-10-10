/* =====================================================================
   PicknPack HRMS — One-page result print  (js/hrms-print.js)
   Drop-in file: hrms.js ko chhede bina kaam karta hai.
   1) Kisi bhi candidate ke result popup me "Print (1 page)" button
   2) Results tab me "Print all (1 page each)" — list ke saare results,
      har candidate ek A4 page par (kisi bhi test ka: Aptitude, Accounts…)
   Har page apne aap chhota (auto-fit) hota hai taaki ek hi A4 me aa jaye.
   ===================================================================== */
(function () {
  'use strict';
  var BRAND = '#2F2A7A';
  var MAX_BULK = 150;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hrState() { try { return HR; } catch (e) { return null; } } // eslint-disable-line no-undef
  function fDate(d) {
    try { if (typeof hrDate === 'function') return hrDate(d); } catch (e) { /* ignore */ } // eslint-disable-line no-undef
    var x = new Date(d); return isNaN(x) ? (d || '—') : x.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fTime(s) { s = Math.round(Number(s) || 0); return s ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : '—'; }
  function fPct(p) { var n = Number(p); return isNaN(n) ? '—' : n.toFixed(1) + '%'; }
  function findResult(ref) { var H = hrState(); return H && Array.isArray(H.results) ? H.results.find(function (x) { return x.ref_id === ref; }) : null; }
  function candidateOf(r) { var H = hrState(); try { return (H && H.byMobile && H.byMobile.get(r.mobile)) || {}; } catch (e) { return {}; } }
  async function answersOf(ref) {
    if (typeof loadHrmsAnswers !== 'function') return []; // eslint-disable-line no-undef
    try { return (await loadHrmsAnswers(ref)) || []; } catch (e) { return null; } // eslint-disable-line no-undef
  }

  /* ---------------- one A4 sheet ---------------- */
  function sheetHtml(r, ans) {
    var c = candidateOf(r);
    var pass = String(r.result || '').toUpperCase() === 'PASS';
    var list = ans || [];
    var right = list.filter(function (a) { return a.ok; }).length;
    var skipped = list.filter(function (a) { return !a.u; }).length;
    var wrong = list.length - right - skipped;
    var info = [
      ['Mobile', r.mobile], ['Email', r.email || c.email], ['City / State', [r.city || c.city, r.state || c.state].filter(Boolean).join(', ')],
      ['Experience', r.experience || c.experience], ['Test date', fDate(r.date)], ['Ref ID', r.ref_id]
    ];
    var kpi = [
      ['Score', (r.score != null ? r.score : '—') + ' / ' + (r.total != null ? r.total : '—')], ['Percent', fPct(r.percent)],
      ['Time taken', fTime(r.time_taken_sec)], ['Attempted', r.attempted != null ? r.attempted : '—'],
      ['Correct / Wrong / Skip', list.length ? right + ' / ' + wrong + ' / ' + skipped : '—'], ['Tab switches', r.tab_switches || 0]
    ];
    var opt = function (a, k) { var o = a.o || {}; return k ? '<b>' + esc(k) + '</b>' + (o[k] ? ' · ' + esc(o[k]) : '') : '<i class="na">Not answered</i>'; };
    var rows = list.map(function (a, i) {
      var st = !a.u ? 'sk' : a.ok ? 'ok' : 'no';
      return '<tr class="' + st + '"><td class="n">' + esc(a.sno || i + 1) + '</td><td class="q">' + esc(a.q || '') +
        (a.tag ? ' <span class="tag">' + esc(a.tag) + '</span>' : '') + '</td><td>' + opt(a, a.u) + '</td><td>' + opt(a, a.c) +
        '</td><td class="m">' + (st === 'ok' ? '✓' : st === 'no' ? '✗' : '–') + '</td></tr>';
    }).join('');
    var note = [r.notes, r.source === 'unverified' ? 'Submitted after session expired (unverified)' : ''].filter(Boolean).join(' · ');

    return '<section class="sheet">' +
      '<header><div><div class="brand">PicknPack Solutions</div><div class="sub">Hiring test — candidate result</div></div>' +
      '<div class="test">' + esc(r.dept_name || 'Test') + '</div></header>' +
      '<div class="who"><div><div class="name">' + esc(r.name || '—') + '</div>' +
      '<div class="grid">' + info.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + esc(x[1] || '—') + '</b></div>'; }).join('') + '</div></div>' +
      '<div class="verdict ' + (pass ? 'pass' : 'fail') + '"><div class="big">' + esc(r.result || '—') + '</div><div>' + fPct(r.percent) + '</div></div></div>' +
      '<div class="kpis">' + kpi.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      (note ? '<div class="note">' + esc(note) + '</div>' : '') +
      (ans === null ? '<div class="note">Answer detail load nahi hua.</div>' : list.length ?
        '<table><thead><tr><th class="n">#</th><th>Question</th><th>Answer given</th><th>Correct answer</th><th class="m"></th></tr></thead><tbody>' + rows + '</tbody></table>' :
        '<div class="note">Is attempt ka question-wise detail save nahi hai.</div>') +
      '<div class="sign"><div>HR remarks</div><div>Interviewer</div><div>Signature &amp; date</div></div>' +
      '<footer><span>Confidential — PicknPack HR</span><span>Printed ' + esc(new Date().toLocaleString('en-IN')) + '</span></footer>' +
      '</section>';
  }

  var CSS =
    '@page{size:A4 portrait;margin:8mm}' +
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'html,body{margin:0;padding:0;background:#fff}' +
    'body{font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#1d1a3a;font-size:9pt;line-height:1.3}' +
    '.sheet{width:194mm;overflow:hidden;page-break-after:always;break-after:page;transform-origin:top left}' +
    '.sheet:last-child{page-break-after:auto;break-after:auto}' +
    'header{display:flex;justify-content:space-between;align-items:center;background:' + BRAND + ';color:#fff;padding:7px 12px;border-radius:8px}' +
    '.brand{font-weight:700;font-size:12pt}.sub{font-size:7.5pt;opacity:.75}.test{font-weight:700;font-size:11pt;text-align:right}' +
    '.who{display:flex;gap:10px;margin:8px 0 6px;align-items:stretch}.who>div:first-child{flex:1}' +
    '.name{font-size:15pt;font-weight:700;margin-bottom:4px}' +
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 12px}.grid span,.kpis span{display:block;font-size:6.8pt;color:#7a7799}.grid b{font-size:8.5pt;font-weight:600;word-break:break-all}' +
    '.verdict{min-width:30mm;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:600;font-size:9pt}' +
    '.verdict .big{font-size:18pt;font-weight:800}.pass{background:#e6f7ef;color:#12805c;border:1.5px solid #8bd9b8}.fail{background:#fdecee;color:#c8203b;border:1.5px solid #f3a5b2}' +
    '.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:6px}.kpis div{background:#f3f2fa;border-radius:6px;padding:4px 7px}.kpis b{font-size:10pt}' +
    '.note{background:#fff7e6;border-radius:6px;padding:4px 8px;font-size:7.5pt;color:#8a5a00;margin-bottom:5px}' +
    'table{width:100%;border-collapse:collapse;font-size:8pt}th{background:#f3f2fa;text-align:left;font-size:7pt;color:#6b6890;padding:4px 5px;font-weight:600}' +
    'td{padding:3px 5px;border-bottom:1px solid #ecebf5;vertical-align:top}td.n,th.n{width:7mm;color:#7a7799}td.m,th.m{width:6mm;text-align:center;font-weight:800}' +
    'tr.ok td.m{color:#12805c}tr.no td.m{color:#c8203b}tr.sk td.m{color:#b7791f}tr.no{background:#fff6f7}' +
    'td.q{width:52%}.tag{color:#8a87a8;font-size:6.8pt}.na{color:#b7791f}tr{page-break-inside:avoid}' +
    '.sign{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-top:10px}.sign div{border-top:1px solid #9a97b5;padding-top:3px;font-size:7pt;color:#7a7799;height:13mm}' +
    'footer{display:flex;justify-content:space-between;font-size:6.8pt;color:#9a97b5;margin-top:2px}';

  /* A4 (297mm − 16mm margin) me fit karne ke liye har sheet ko zoom karo */
  var FIT_SCRIPT = 'function fit(){var mm=96/25.4,H=279*mm;document.querySelectorAll(".sheet").forEach(function(s){s.style.zoom=1;s.style.width="194mm";' +
    'for(var i=0;i<3;i++){var h=s.scrollHeight*(parseFloat(s.style.zoom)||1);if(h<=H)break;var z=Math.max(.42,(parseFloat(s.style.zoom)||1)*H/h*0.985);s.style.zoom=z;s.style.width=(194/z)+"mm";}});}';

  function docHtml(sheets, title) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">' +
      '<style>' + CSS + '</style></head><body>' + sheets.join('') + '<script>' + FIT_SCRIPT + '<\/script></body></html>';
  }
  window.hrPrintDocHtml = function (pairs, title) { return docHtml(pairs.map(function (p) { return sheetHtml(p[0], p[1]); }), title || 'Results'); }; // testing helper

  function printDoc(html) {
    var old = document.getElementById('hrPrintFrame'); if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = 'hrPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    var go = function () {
      try { f.contentWindow.fit(); } catch (e) { /* ignore */ }
      setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); }, 150);
    };
    var fontsReady = f.contentWindow.document.fonts && f.contentWindow.document.fonts.ready;
    setTimeout(function () { fontsReady ? fontsReady.then(go, go) : go(); }, 300);
  }

  /* ---------------- single result ---------------- */
  async function printOne(ref, btn) {
    var r = findResult(ref);
    if (!r) return alert('Result nahi mila. Page refresh karke dobara try karein.');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    var ans = await answersOf(ref);
    printDoc(docHtml([sheetHtml(r, ans)], (r.name || 'Result') + ' - ' + (r.dept_name || '')));
    if (btn) { btn.disabled = false; btn.textContent = '🖨 Print (1 page)'; }
  }

  function decorateModal() {
    var ov = document.getElementById('hrModal');
    if (!ov || !ov.querySelector('#hrAns')) return;
    var head = ov.querySelector('.modal-head'); if (!head) return;
    var sub = (ov.querySelector('#hrModalSub') || {}).textContent || '';
    var ref = sub.split('·')[0].trim();
    if (!ref || !findResult(ref)) return;
    var btn = head.querySelector('.hr-print-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'hr-print-btn'; btn.textContent = '🖨 Print (1 page)';
      btn.style.cssText = 'margin-left:auto;margin-right:10px;padding:8px 14px;border-radius:10px;border:0;background:' + BRAND + ';color:#fff;font:600 13px inherit;font-family:inherit;cursor:pointer;white-space:nowrap';
      var close = head.querySelector('.modal-close');
      head.insertBefore(btn, close || null);
      btn.addEventListener('click', function () { printOne(btn.dataset.ref, btn); });
    }
    btn.dataset.ref = ref;
  }

  /* ---------------- bulk: Results tab ---------------- */
  function visibleRefs() {
    var root = document.getElementById('dashRoot') || document;
    var refs = [];
    root.querySelectorAll('[data-hrres]').forEach(function (el) { var v = el.getAttribute('data-hrres'); if (v && refs.indexOf(v) < 0) refs.push(v); });
    return refs;
  }

  async function printAll(btn) {
    var refs = visibleRefs();
    if (!refs.length) return alert('List me koi result nahi hai. Filter/period check karein.');
    if (refs.length > MAX_BULK && !confirm(refs.length + ' results hain. Pehle ' + MAX_BULK + ' print honge. Continue?')) return;
    refs = refs.slice(0, MAX_BULK);
    var label = btn.textContent;
    btn.disabled = true;
    var pairs = new Array(refs.length), done = 0, next = 0;
    async function worker() {
      while (next < refs.length) {
        var i = next++;
        var r = findResult(refs[i]);
        pairs[i] = r ? [r, await answersOf(refs[i])] : null;
        btn.textContent = 'Loading ' + (++done) + '/' + refs.length + '…';
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    btn.disabled = false; btn.textContent = label;
    var sheets = pairs.filter(Boolean).map(function (p) { return sheetHtml(p[0], p[1]); });
    if (!sheets.length) return alert('Results load nahi hue.');
    printDoc(docHtml(sheets, 'PicknPack results - ' + new Date().toISOString().slice(0, 10)));
  }

  function decorateResults() {
    var H = hrState();
    var root = document.getElementById('dashRoot');
    if (!H || H.tab !== 'results' || !root) return;
    if (root.querySelector('.hr-printall-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hr-printall-btn';
    btn.textContent = '🖨 Print all (1 page each)';
    btn.title = 'List me dikh rahe saare results — har candidate ek A4 page par';
    btn.style.cssText = 'padding:8px 14px;border-radius:10px;border:0;background:' + BRAND + ';color:#fff;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap;margin-left:8px';
    btn.addEventListener('click', function () { printAll(btn); });
    var exportBtn = Array.prototype.find.call(root.querySelectorAll('button, a'), function (b) { return /export/i.test(b.textContent); });
    if (exportBtn && exportBtn.parentNode) exportBtn.parentNode.insertBefore(btn, exportBtn.nextSibling);
    else {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 10px';
      btn.style.marginLeft = '0'; wrap.appendChild(btn);
      root.insertBefore(wrap, root.firstChild);
    }
  }

  var queued = false;
  function tick() {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; try { decorateModal(); decorateResults(); } catch (e) { console.warn('hrms-print', e); } });
  }
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
  tick();
})();
