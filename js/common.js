'use strict';
/* 두 페이지(index / running)가 공유하는 유틸 */
const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } }
};
let toastTimer;
function toast(msg, type=''){
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.className = 'show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=> el.className = '', 2800);
}
