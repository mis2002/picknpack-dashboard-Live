/* =====================================================================
   dash-config.js — defaults for dashboards, locations, customer rules, Q&A and UI.
   Kept separate from config.js so config.js (with your Supabase key) never needs replacing.
   All of this can be changed in Settings; saved settings override these defaults.
   ===================================================================== */
DEFAULT_ADMIN_SETTINGS.dash = {                 // dashboards, locations, customer rules, Q&A, UI — edited in Settings
    defaultDashboard: 'offline',
    locations: [
      { key:'Delhi- Offline', code:'offline',   name:'Delhi Offline', enabled:true,  order:1, page:'index.html',     idMode:'name'  },
      { key:'Delhi- Online',  code:'online',    name:'Delhi Online',  enabled:true,  order:2, page:'online.html',    idMode:'phone' },
      { key:'Gujarat',        code:'gujarat',   name:'Gujarat',       enabled:true,  order:3, page:'gujarat.html',   idMode:'name'  },
      { key:'Karnataka',      code:'karnataka', name:'Karnataka',     enabled:false, order:4, page:'karnataka.html', idMode:'name'  }
    ],
    customer: { newDays:30, activeDays:45, championDays:30, atRiskMultiplier:2, atRiskMinDays:30, inactiveDays:90 },
    qa: { enabled:true, provider:'builtin', questions:[
      'Top customers', 'Top salesperson', 'Top pincodes', 'New customers this month', 'Repeat customers',
      'At-risk customers', 'Best performing location last month', 'Sales this month', 'Sales growth',
      'Customer growth', 'Declining customers', 'Sales by location' ] },
    ui: { density:'comfortable' }
  };

/* deep-merge dashboard settings so new defaults (e.g. a new location) always appear */
function mergeDash(v){
  const d = JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS.dash)), g = v || {};
  const out = Object.assign({}, d, g);
  out.customer = Object.assign({}, d.customer, g.customer);
  out.qa = Object.assign({}, d.qa, g.qa); if(!Array.isArray(out.qa.questions) || !out.qa.questions.length) out.qa.questions = d.qa.questions;
  out.ui = Object.assign({}, d.ui, g.ui);
  const saved = Array.isArray(g.locations) ? g.locations : [];
  out.locations = d.locations.map(l => Object.assign({}, l, saved.find(x => x.key === l.key) || {}, { key:l.key, code:l.code, page:l.page }));
  saved.filter(x => !d.locations.some(l => l.key === x.key)).forEach(x => out.locations.push(x));
  return out;
}
/* location helpers used by every page */
const LOC_COLORS = { 'Delhi- Offline':'#6C5CE7', 'Delhi- Online':'#3FB8E0', 'Gujarat':'#F6A623', 'Karnataka':'#EF5466' };
function dashCfg(){ return (typeof ADMIN !== 'undefined' && ADMIN && ADMIN.dash) ? ADMIN.dash : DEFAULT_ADMIN_SETTINGS.dash; }
function allLocs(){ return dashCfg().locations.slice().sort((a,b) => (a.order||0) - (b.order||0)); }
function enabledLocs(){ return allLocs().filter(l => l.enabled); }
function locByKey(k){ return allLocs().find(l => l.key === k) || null; }
function locByCode(c){ return allLocs().find(l => l.code === c) || null; }
function locName(k){ const l = locByKey(k); return l ? l.name : k; }
function locColor(k){ return LOC_COLORS[k] || '#9A95C9'; }

/* the cached settings loaded by config.js may not have dash yet */
if(typeof ADMIN !== 'undefined' && ADMIN) ADMIN.dash = mergeDash(ADMIN.dash);
