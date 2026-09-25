/* =====================================================================
   customer-map.js — "Where our customers are"
   • States shaded by net sales (Place of Supply)
   • Bubbles at each Billing Code (pin code) sized by sales
   • Hover for details, click to open the invoices, zoom and drag
   Map outlines: js/vendor/india-map.js (always loaded, 43 KB)
   Pin codes:    js/vendor/pincodes.js  (loaded the first time, ~590 KB)
   ===================================================================== */

const MAPV = { vb:null, mode:'both', zoom:1 };
let PIN_INDEX = null, pinDbPromise = null, MAP_DATA = null;

const STATE_ALIAS = {
  'orissa':'odisha', 'pondicherry':'puducherry', 'new delhi':'delhi', 'nct of delhi':'delhi', 'uttaranchal':'uttarakhand',
  'daman and diu':'dadra and nagar haveli and daman and diu', 'dadra and nagar haveli':'dadra and nagar haveli and daman and diu',
  'andaman and nicobar':'andaman and nicobar islands', 'jammu and kashmir':'jammu and kashmir', 'telengana':'telangana'
};
function mapKey(stateName){ const k = String(stateName||'').toLowerCase().trim(); return STATE_ALIAS[k] || k; }

function loadPinDb(){
  if(PIN_INDEX) return Promise.resolve(PIN_INDEX);
  if(pinDbPromise) return pinDbPromise;
  pinDbPromise = new Promise((res, rej)=>{
    const build = ()=>{
      const db = window.PINCODE_DB, idx = new Map();
      db.pins.split(';').forEach(line=>{ const [p, la, ln, ci] = line.split(','); idx.set(p, [+la, +ln, ci==='' ? '' : db.cities[+ci]]); });
      // most common city per 3-digit pin area, used to name pins missing from the database
      const cnt = {}; idx.forEach((v,p)=>{ if(!v[2]) return; const k = p.slice(0,3); (cnt[k] ||= {})[v[2]] = (cnt[k][v[2]]||0) + 1; });
      idx.prefixCity = {}; Object.entries(cnt).forEach(([k,o])=>{ idx.prefixCity[k] = Object.entries(o).sort((a,b)=>b[1]-a[1])[0][0]; });
      idx.prefix = db.prefix; PIN_INDEX = idx; res(idx);
    };
    if(window.PINCODE_DB) return build();
    const s = document.createElement('script');
    s.src = 'js/vendor/pincodes.js?v=20260924';
    s.onload = build;
    s.onerror = ()=>{ pinDbPromise = null; rej(new Error('js/vendor/pincodes.js not found')); };
    document.body.appendChild(s);
  });
  return pinDbPromise;
}
function pinInfo(pin){
  if(!PIN_INDEX || !pin) return null;
  const hit = PIN_INDEX.get(pin);
  if(hit) return { lat:hit[0], lng:hit[1], city:hit[2], exact:true };
  const pre = PIN_INDEX.prefix[pin.slice(0,3)];
  return pre ? { lat:pre[0], lng:pre[1], city: PIN_INDEX.prefixCity[pin.slice(0,3)] ? PIN_INDEX.prefixCity[pin.slice(0,3)] + ' area' : '', exact:false } : null;
}
function project(lat, lng){
  const M = window.INDIA_MAP, merc = Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360));
  return [ (lng - M.lng0)*Math.PI/180*M.k, (M.ytop - merc)*M.k ];
}
const mixColor = t => { const a=[238,235,255], b=[68,58,168]; return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`; };

function renderCustomerMap(){
  const M = window.INDIA_MAP, host = document.getElementById('mapSvgHost');
  if(!M || !host) return;
  if(!MAPV.vb) MAPV.vb = [0, 0, M.w, M.h];
  const cur = currentRows();

  // ---- aggregate by state
  const st = {};
  let noState = 0;
  cur.forEach(r=>{
    if(!r.state){ noState++; return; }
    const k = mapKey(r.state);
    const o = st[k] || (st[k] = { name:r.state, net:0, profit:0, inv:0, cust:new Set(), rows:[] });
    o.net += r.net; o.pnet = (o.pnet||0) + r.pnet; o.profit += r.profit; o.inv++; o.cust.add(r.customer); o.rows.push(r);
  });
  const maxSt = Math.max(1, ...Object.values(st).map(o=>o.net));

  // ---- aggregate by pin code (needs the pin database)
  const pins = {}, cities = {};
  let noPin = 0, approx = 0;
  if(PIN_INDEX){
    cur.forEach(r=>{
      const info = pinInfo(r.pincode);
      if(!info){ noPin++; return; }
      if(!info.exact) approx++;
      const p = pins[r.pincode] || (pins[r.pincode] = { pin:r.pincode, ...info, state:r.state, net:0, profit:0, inv:0, cust:{}, rows:[] });
      p.net += r.net; p.pnet = (p.pnet||0) + r.pnet; p.profit += r.profit; p.inv++; p.cust[r.customer] = (p.cust[r.customer]||0) + r.net; p.rows.push(r);
      const cname = info.city || `Pin ${r.pincode.slice(0,3)}xxx`;
      const ck = cname + '|' + (r.state||'');
      const c = cities[ck] || (cities[ck] = { city:cname, state:r.state||'—', net:0, inv:0, cust:new Set(), rows:[] });
      c.net += r.net; c.inv++; c.cust.add(r.customer); c.rows.push(r);
    });
  }
  const pinList = Object.values(pins).sort((a,b)=>b.net-a.net);
  const maxPin = Math.max(1, ...pinList.map(p=>p.net));
  MAP_DATA = { st, pins, maxSt };

  // ---- draw
  const showStates = MAPV.mode !== 'pins', showPins = MAPV.mode !== 'states';
  const paths = M.states.map(s=>{
    const o = st[s.n.toLowerCase()];
    const fill = showStates ? (o ? mixColor(0.12 + 0.88*Math.sqrt(o.net/maxSt)) : '#DEDBEF') : (o ? '#D4D0EE' : '#E4E1F2');
    return `<path class="map-state" d="${s.d}" fill="${fill}" data-st="${escAttr(s.n.toLowerCase())}"><title>${escAttr(s.n)}</title></path>`;
  }).join('');
  const z = MAPV.zoom;
  const circles = showPins ? pinList.slice().reverse().map(p=>{
    const [x,y] = project(p.lat, p.lng), r0 = 3 + 13*Math.sqrt(p.net/maxPin);
    return `<circle class="map-pin" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r0/Math.sqrt(z)).toFixed(2)}" data-r0="${r0.toFixed(2)}" data-mpin="${p.pin}" fill="#F6A623" fill-opacity=".78"></circle>`;
  }).join('') : '';
  host.innerHTML = `<svg viewBox="${MAPV.vb.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of India showing customer locations"><g>${paths}</g><g>${circles}</g></svg>`;

  // ---- side panel
  const statesCovered = Object.keys(st).length;
  const custCount = new Set(cur.map(r=>r.customer)).size;
  document.getElementById('mapStats').innerHTML = [
    ['States with sales', `${fmtNum(statesCovered)} of 36`], ['Pin codes', PIN_INDEX ? fmtNum(pinList.length) : '…'],
    ['Cities / towns', PIN_INDEX ? fmtNum(Object.keys(cities).length) : '…'], ['Customers', fmtNum(custCount)]
  ].map(([l,v])=>`<div class="kpi-mini"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('');
  document.getElementById('mapStatus').textContent = !PIN_INDEX ? 'Loading pin code locations…'
    : `${fmtNum(cur.length - noPin)} of ${fmtNum(cur.length)} invoices placed on the map` + (approx ? ` (${fmtNum(approx)} placed by pin area, exact pin not in the database)` : '') +
      (noPin ? `. ${fmtNum(noPin)} have no valid pin code.` : '.') + (noState ? ` ${fmtNum(noState)} have no Place of Supply.` : '');
  const cityList = Object.values(cities).sort((a,b)=>b.net-a.net).slice(0, 25);
  const tot = cur.reduce((s,r)=>s+r.net,0);
  document.getElementById('mapCityTable').innerHTML = cityList.map((c,i)=>`<tr class="clickable" data-drill="${registerDrill(`${c.city} (${c.state}) — invoices`, c.rows)}">
      <td>${i+1}</td><td class="name" title="${escAttr(c.city)}">${escAttr(c.city)}<br><span class="muted">${escAttr(c.state)}</span></td>
      <td style="text-align:right">${fmtNum(c.cust.size)}</td><td style="text-align:right;font-weight:600">${money(c.net)}</td>
      <td style="text-align:right">${fmtPct(tot ? c.net/tot*100 : 0)}</td></tr>`).join('')
    || `<tr><td colspan="5" class="empty-note">${PIN_INDEX ? 'No pin codes in this filter.' : 'Loading…'}</td></tr>`;
  document.getElementById('mapLegend').innerHTML = (showStates ? `<div><b style="color:var(--ink)">State sales</b></div><div class="scale"></div><div class="row"><span>low</span><span>${fmtINRShort(maxSt)}</span></div>` : '') +
    (showPins ? `<div style="margin-top:${showStates?6:0}px;display:flex;align-items:center;gap:6px"><svg width="34" height="18"><circle cx="6" cy="12" r="3" fill="#F6A623"/><circle cx="22" cy="10" r="8" fill="#F6A623" fill-opacity=".78"/></svg>Pin code, size = sales</div>` : '');
  document.getElementById('custMapDesc').textContent = `Selected period · ${fmtINR(tot)} from ${fmtNum(custCount)} customers. Hover for details, click a state, bubble or city to see its invoices.`;

  if(!PIN_INDEX) loadPinDb().then(()=>renderCustomerMap()).catch(err=>{ document.getElementById('mapStatus').textContent = 'Pin code file missing (js/vendor/pincodes.js). States are still shown.'; console.error(err); });
}

/* ---------------- zoom / pan / tooltip ---------------- */
function setViewBox(vb){
  const M = window.INDIA_MAP;
  const w = Math.min(M.w, Math.max(M.w/12, vb[2])), h = w * M.h / M.w;
  const x = Math.min(M.w - w*0.25, Math.max(-w*0.75, vb[0])), y = Math.min(M.h - h*0.25, Math.max(-h*0.75, vb[1]));
  MAPV.vb = [x, y, w, h]; MAPV.zoom = M.w / w;
  const svg = document.querySelector('#mapSvgHost svg');
  if(svg){
    svg.setAttribute('viewBox', MAPV.vb.join(' '));
    svg.querySelectorAll('circle[data-r0]').forEach(c=>c.setAttribute('r', (+c.dataset.r0/Math.sqrt(MAPV.zoom)).toFixed(2)));
  }
}
function zoomAt(f, cx, cy){
  const [x,y,w,h] = MAPV.vb;
  if(cx===undefined){ cx = x + w/2; cy = y + h/2; }
  const nw = w / f, nh = h / f;
  setViewBox([cx - (cx - x)/f, cy - (cy - y)/f, nw, nh]);
}
function svgPoint(evt){
  const svg = document.querySelector('#mapSvgHost svg'), r = svg.getBoundingClientRect(), [x,y,w,h] = MAPV.vb;
  const s = Math.min(r.width/w, r.height/h), ox = (r.width - w*s)/2, oy = (r.height - h*s)/2;
  return [x + (evt.clientX - r.left - ox)/s, y + (evt.clientY - r.top - oy)/s, s];
}
(function wireMap(){
  const box = document.getElementById('mapBox'), tip = document.getElementById('mapTip');
  if(!box) return;
  document.getElementById('mapZoomIn').addEventListener('click', ()=>zoomAt(1.5));
  document.getElementById('mapZoomOut').addEventListener('click', ()=>zoomAt(1/1.5));
  document.getElementById('mapReset').addEventListener('click', ()=>{ const M = window.INDIA_MAP; setViewBox([0,0,M.w,M.h]); });
  document.querySelectorAll('#mapModeToggle button').forEach(b=>b.addEventListener('click', ()=>{
    MAPV.mode = b.dataset.m;
    document.querySelectorAll('#mapModeToggle button').forEach(x=>x.classList.toggle('active', x===b));
    renderCustomerMap();
  }));
  box.addEventListener('wheel', e=>{ e.preventDefault(); const [px,py] = svgPoint(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive:false });
  let drag = null, moved = false;
  box.addEventListener('pointerdown', e=>{ if(e.target.closest('.map-ctrl')) return; drag = { x:e.clientX, y:e.clientY, vb:MAPV.vb.slice(), s:svgPoint(e)[2] }; moved = false; });
  window.addEventListener('pointermove', e=>{
    if(drag){
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if(Math.abs(dx)+Math.abs(dy) > 4){ moved = true; document.querySelector('#mapSvgHost svg')?.classList.add('dragging'); }
      if(moved) setViewBox([drag.vb[0] - dx/drag.s, drag.vb[1] - dy/drag.s, drag.vb[2], drag.vb[3]]);
    }
  });
  window.addEventListener('pointerup', ()=>{ drag = null; document.querySelector('#mapSvgHost svg')?.classList.remove('dragging'); });
  box.addEventListener('click', e=>{
    if(moved){ moved = false; e.stopPropagation(); return; }
    if(!MAP_DATA) return;
    const c = e.target.closest('circle[data-mpin]'), s = e.target.closest('path[data-st]');
    if(c){ const p = MAP_DATA.pins[c.dataset.mpin]; openInvoiceList(`Pin code ${p.pin}${p.city?` · ${p.city}`:''} — invoices`, p.rows); }
    else if(s){ const o = MAP_DATA.st[s.dataset.st]; if(o) openInvoiceList(`${o.name} — invoices`, o.rows); }
  });
  box.addEventListener('mousemove', e=>{
    if(!MAP_DATA || drag){ tip.style.display = 'none'; return; }
    const c = e.target.closest('circle[data-mpin]'), s = e.target.closest('path[data-st]');
    let html = '';
    if(c){
      const p = MAP_DATA.pins[c.dataset.mpin], top = Object.entries(p.cust).sort((a,b)=>b[1]-a[1]);
      html = `<b>${p.city || 'Pin area'} · ${p.pin}</b><br>${escAttr(p.state||'')}<br>Sales ${fmtINR(p.net)} · GP ${p.pnet ? fmtPct(gpOf(p)) : 'n/a'}<br>${fmtNum(top.length)} customer${top.length===1?'':'s'}, ${fmtNum(p.inv)} invoices<br>Top: ${escAttr(top[0][0])}${p.exact?'':'<br><i>placed by pin area</i>'}`;
    } else if(s){
      const o = MAP_DATA.st[s.dataset.st], name = s.querySelector('title').textContent;
      html = o ? `<b>${escAttr(name)}</b><br>Sales ${fmtINR(o.net)} (${fmtPct(o.net/Object.values(MAP_DATA.st).reduce((a,b)=>a+b.net,0)*100)})<br>GP ${o.pnet ? fmtPct(gpOf(o)) : 'n/a'} · ${fmtNum(o.cust.size)} customers<br>${fmtNum(o.inv)} invoices` : `<b>${escAttr(name)}</b><br>No sales in this filter`;
    }
    if(!html){ tip.style.display = 'none'; return; }
    tip.innerHTML = html; tip.style.display = 'block';
    const r = box.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if(x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 14;
    if(y + tip.offsetHeight > r.height - 8) y = e.clientY - r.top - tip.offsetHeight - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  box.addEventListener('mouseleave', ()=>{ tip.style.display = 'none'; });
})();
