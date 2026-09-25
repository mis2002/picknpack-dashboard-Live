/* =====================================================================
   format.js — number formats, colours, small helpers
   Pure functions, no data logic.
   ===================================================================== */
/* ---------------------- Formatters ---------------------- */
const fmtINR = n => (n<0?'-':'')+'₹' + (Math.abs(n)>=10000000 ? (Math.abs(n)/10000000).toFixed(2)+' Cr' : Math.abs(n)>=100000 ? (Math.abs(n)/100000).toFixed(2)+' L' : Math.abs(n).toLocaleString('en-IN',{maximumFractionDigits:0}));
// Compact version used ON the chart (labels have to be short to fit above narrow bars)
const fmtINRShort = n => {
  if(n===null||n===undefined||isNaN(n)) return '';
  const a = Math.abs(n), s = n<0 ? '-' : '';
  if(a>=10000000) return s+'₹'+(a/10000000).toFixed(2)+'Cr';
  if(a>=100000)   return s+'₹'+(a/100000).toFixed(a>=1000000?1:2)+'L';
  if(a>=1000)     return s+'₹'+(a/1000).toFixed(a>=10000?0:1)+'K';
  return s+'₹'+Math.round(a);
};
const fmtNum = n => (n||0).toLocaleString('en-IN');
const fmtPct = n => (isFinite(n)?n:0).toFixed(1)+'%';

const PALETTE = ['#6C5CE7','#F6A623','#3FB8E0','#EF5466','#1FB286','#443AA8','#FFC857','#A78BFA'];
const PERIOD_COLORS = ['#6C5CE7','#3FB8E0','#F6A623','#EF5466','#1FB286','#A78BFA','#FFC857','#443AA8'];
const METRIC_INFO = {
  net:    { key:'net',    label:'Sales (without GST)', short:'Net Sales',       color:'#6C5CE7', colorSoft:'rgba(108,92,231,0.16)' },
  gross:  { key:'gross',  label:'Sales (with GST)',    short:'Sales incl. GST', color:'#3FB8E0', colorSoft:'rgba(63,184,224,0.18)' },
  profit: { key:'profit', label:'Profit',              short:'Profit',          color:'#F6A623', colorSoft:'rgba(246,166,35,0.18)' }
};
const CRR_COLOR = '#3FB8E0', NBD_COLOR = '#6C5CE7';


function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

/* ---------------------- Small UX helpers ---------------------- */
function showToast(msg){
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>el.remove(), 2800);
}
function setAnimatedText(el, text){
  if(!el || el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('val-anim'); void el.offsetWidth; el.classList.add('val-anim');
}

// Money inside tables: shows the short ₹ format but keeps the exact rupee value for CSV export
function money(n){ return `<span data-v="${Math.round(n||0)}">${fmtINR(n||0)}</span>`; }

/* Margin % over invoices whose profit is entered (sales-only / pending invoices are left out of the margin) */
function gpOf(o){ if(!o) return 0; const d = (o.pnet !== undefined && o.pnet !== null) ? o.pnet : o.net; return d ? o.profit/d*100 : 0; }
function rowGp(r){ return r.pp ? null : (r.net ? r.profit/r.net*100 : 0); }
