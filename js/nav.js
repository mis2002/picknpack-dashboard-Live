/* =====================================================================
   nav.js — the same top navigation on every page:
   Delhi Offline · Delhi Online · Gujarat · (Karnataka when enabled) · Summary · Ask · Settings
   Locations switched off in Settings are hidden automatically.
   ===================================================================== */
function navRender(){
  const page = document.body.dataset.page || 'offline';
  let bar = document.getElementById('dashNav');
  if(!bar){
    bar = document.createElement('nav'); bar.id = 'dashNav'; bar.className = 'dash-nav'; bar.setAttribute('aria-label', 'Dashboards');
    const top = document.querySelector('.topbar'); top.parentNode.insertBefore(bar, top.nextSibling);
  }
  const items = enabledLocs().map(l => ({ href: l.page, key: l.code, label: l.name, color: locColor(l.key) }));
  items.push({ href: 'summary.html', key: 'summary', label: 'Summary', color: '#1E1B4B' });
  const admin = typeof isAdminUser === 'function' && isAdminUser();
  bar.innerHTML = `<div class="dn-links">${items.map(i => `<a href="${i.href}" class="dn-link ${page === i.key ? 'active' : ''}" style="--c:${i.color}"><i></i>${escAttr(i.label)}</a>`).join('')}</div>
    <div class="dn-tools">${dashCfg().qa.enabled ? `<button class="dn-btn" id="navAsk" title="Ask a question"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Ask</button>` : ''}
    ${admin ? `<a class="dn-btn" href="index.html#settings" id="navSettings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>Settings</a>` : ''}</div>`;
  const ask = document.getElementById('navAsk'); if(ask) ask.onclick = () => qaToggle();
  const st = document.getElementById('navSettings');
  if(st && page === 'offline') st.onclick = e => { e.preventDefault(); if(typeof openAdminModal === 'function') openAdminModal(); };
  // floating Ask button (mobile-friendly)
  let fab = document.getElementById('qaFab');
  if(dashCfg().qa.enabled && !fab){ fab = document.createElement('button'); fab.id = 'qaFab'; fab.className = 'qa-fab'; fab.title = 'Ask a question'; fab.setAttribute('aria-label', 'Ask a question'); fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'; fab.onclick = () => qaToggle(); document.body.appendChild(fab); }
  if(fab) fab.style.display = dashCfg().qa.enabled ? '' : 'none';
  document.body.classList.toggle('compact', dashCfg().ui.density === 'compact');
}
