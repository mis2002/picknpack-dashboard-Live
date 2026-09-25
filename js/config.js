/* =====================================================================
   config.js — settings for the LIVE (Supabase) dashboard
   Day-to-day changes go through Admin (saved in Supabase, same for everyone).
   ===================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://cctqwnnezfnrajngwntt.supabase.co',
  // Publishable key (safe to be public — it opens nothing without a login).
  // Supabase → Project Settings → API Keys → "Publishable key" (sb_publishable_…). Paste it between the quotes:
  SUPABASE_KEY: 'sb_publishable_JJXNYfaHB6CKfGrtA3JxYA_cxpUNAHz',
  DEFAULT_LOCATION: 'Delhi- Offline',
  LOCATIONS: ['Delhi- Offline', 'Delhi- Online', 'Gujarat', 'Karnataka'],
  PROFIT_LOCATIONS: ['Delhi- Offline'],            // locations where profit is entered; others are sales-only for now
  REFRESH_MS: 300000                               // 5 minutes (only changed rows are downloaded)
};

/* ========================= ADMIN SETTINGS ========================= */
const ADMIN_SETTINGS_KEY = 'pnp_live_admin_cache_v1';   // local copy of the shared settings (NOT the old dashboard's key)

const PANEL_REGISTRY = [
  { key:'panel-weekstrip',          label:'Main — Last 4 Weeks strip' },
  { key:'panel-mis',                label:'Main — MIS Sales Report' },
  { key:'panel-growth',             label:'Main — Salesperson Weekly Growth table' },
  { key:'panel-trend',              label:'Main — Sales Trend chart' },
  { key:'panel-wow',                label:'Main — Week-over-Week chart' },
  { key:'panel-split',              label:'Main — Order Type Split chart' },
  { key:'panel-sp',                 label:'Main — Salesperson Performance chart' },
  { key:'panel-customers',          label:'Main — Top Customers table' },
  { key:'biTopKpis',                label:'BI Insights — Mini KPI row' },
  { key:'panel-bi-revtaxprofit',    label:'BI Insights — Revenue vs Tax vs Profit' },
  { key:'panel-bi-invoicecount',    label:'BI Insights — Invoice Count trend' },
  { key:'panel-bi-profitpie',       label:'BI Insights — Profit Contribution pie' },
  { key:'panel-bi-rank',            label:'BI Insights — Top 5 / Bottom 5 ranking' },
  { key:'panel-bi-repeatpie',       label:'BI Insights — Repeat vs One-time pie' },
  { key:'panel-bi-margin',          label:'BI Insights — Customer Margin leaderboard' },
  { key:'panel-bi-profitdist',      label:'BI Insights — Profit % Distribution' },
  { key:'panel-bi-flag',            label:'BI Insights — Zero/Low-Profit flags' },
  { key:'panel-bi-efficiency',      label:'BI Insights — Salesperson Efficiency' },
  { key:'panel-bi-taxtrend',        label:'BI Insights — Tax Collected trend' },
  { key:'panel-bi-outlier',         label:'BI Insights — Unusual Invoices' },
  { key:'panel-main-insights',      label:'Main — Key insights' },
  { key:'panel-bi-insights',        label:'BI Insights — Profit insights' },
  { key:'panel-score-insights',     label:'Scoring — Scoring insights' },
  { key:'panel-cust-map',          label:'Customers — Customer map' },
  { key:'panel-cust-insights',      label:'Customers — Key insights' },
  { key:'panel-cust-state',         label:'Customers — Sales by state chart' },
  { key:'panel-cust-region',        label:'Customers — Sales by region' },
  { key:'panel-cust-statetable',    label:'Customers — State-wise report' },
  { key:'panel-cust-segments',      label:'Customers — Segments chart' },
  { key:'panel-cust-conc',          label:'Customers — Concentration' },
  { key:'panel-cust-segtable',      label:'Customers — Segment actions' },
  { key:'panel-cust-nvr',           label:'Customers — New vs returning' },
  { key:'panel-cust-risk',          label:'Customers — At-risk call list' },
  { key:'panel-cust-lowmargin',     label:'Customers — Big customers, low margin' },
  { key:'panel-cust-pins',          label:'Customers — Top pin codes' },
  { key:'panel-cust-table',         label:'Customers — Full customer report' }
];

const DEFAULT_ADMIN_SETTINGS = {
  refreshSeconds: CONFIG.REFRESH_MS / 1000,
  autoRefresh: true,
  brandName: 'PICK N PACK',
  dashboardTitle: 'Sales Dashboard',
  topCustomersN: 15,
  topSalespersonN: 8,
  outlierSD: 2,
  lowProfitPct: 0,
  visiblePanels: {},
  salaries: {},
  departments: {},
  crTargets: {},
  hiddenFromMis: {},
  logo: '',               // company logo (data URL) uploaded in Admin; falls back to assets/logo.png in the repo
  photos: {},             // { [salespersonName]: dataURL } — falls back to assets/team/<name>.jpg in the repo
  custTargets: {},        // { [NBD salespersonName]: new customers per month }
  scoring: {              // MIS scoring (new system) — defaults as agreed
    nbdProfitX: 10, nbdRevX: 10, crrProfitX: 20, crrRevX: 20,
    crrMargin: 5, crrRetention: 70,
    wNbd: { newC: 30, profit: 30, revenue: 25, avg: 15 },
    wCrr: { profit: 35, revenue: 25, retention: 20, margin: 20 },
    workDays: 26, cap: 120, green: 100, amber: 80, retWindow: 30,
    excludeCompany: true
  }
};
function loadAdminSettings(){
  let s = Object.assign({}, DEFAULT_ADMIN_SETTINGS);
  try{
    const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
    if(raw) s = Object.assign({}, DEFAULT_ADMIN_SETTINGS, JSON.parse(raw));
  } catch(e){ console.warn('Could not read admin settings', e); }
  // deep-merge scoring so new defaults appear even for older saved settings
  const d = DEFAULT_ADMIN_SETTINGS.scoring, g = s.scoring || {};
  s.scoring = Object.assign({}, d, g, { wNbd: Object.assign({}, d.wNbd, g.wNbd), wCrr: Object.assign({}, d.wCrr, g.wCrr) });
  s.photos = s.photos || {}; s.custTargets = s.custTargets || {};
  return s;
}
let ADMIN = loadAdminSettings();
CONFIG.REFRESH_MS = ADMIN.refreshSeconds * 1000;

