'use strict';
/* running.html – GPS 러닝 트래커 (Leaflet + watchPosition) / 대시보드 / LocalStorage */
const KEY = 'runcast.runs';
let runs = store.get(KEY, []);
let selectedId = null;

/* ---------- 포맷 ---------- */
const p2 = n => String(n).padStart(2,'0');
const fmtPace = s => { if (!s) return '–'; let m = Math.floor(s/60), x = Math.round(s%60); if (x === 60){ m++; x = 0; } return `${m}'${p2(x)}"`; };
const fmtTime = s => { s = Math.round(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return h ? `${h}:${p2(m)}:${p2(x)}` : `${p2(m)}:${p2(x)}`; };
const dash = (v, unit) => v == null ? '–' : v + ' ' + unit;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`; };
function haversine(a, b){            // 두 좌표 사이 거리 (m)
  const R = 6371000, D = Math.PI/180;
  const dLat = (b[0]-a[0])*D, dLon = (b[1]-a[1])*D;
  const h = Math.sin(dLat/2)**2 + Math.cos(a[0]*D)*Math.cos(b[0]*D)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

/* ---------- Leaflet 지도 ---------- */
function makeMap(id){
  const m = L.map(id, {zoomControl: true}).setView([37.5665, 126.978], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(m);
  return m;
}
const liveMap = makeMap('liveMap');
let detailMap = null, detailLayer = null;
const dotIcon = c => L.divIcon({className: '', html: `<span class="pin" style="background:${c}"></span>`, iconSize: [16,16], iconAnchor: [8,8]});

/* ---------- 트래킹 상태 ---------- */
const MAX_ACC = 30;        // m: 정확도가 이보다 나쁜 측정값은 무시
const MIN_STEP = 3;        // m: 이보다 짧은 이동은 GPS 떨림으로 간주
const MAX_SPEED = 12;      // m/s: 이보다 빠르면 튐(오류)으로 간주
let watchId = null, tick = null, wakeLock = null;
let S = null;              // {start, path, dist, gain, refAlt, startAlt, lastT}
let liveLine = null, liveMarker = null, startMarker = null;

function resetLive(){
  [liveLine, liveMarker, startMarker].forEach(l => l && liveMap.removeLayer(l));
  liveLine = liveMarker = startMarker = null;
  $('lTime').textContent = '00:00'; $('lDist').textContent = '0.00 km'; $('lPace').textContent = '–'; $('lAcc').textContent = '–';
}
function updateLive(){
  if (!S) return;
  const el = (Date.now() - S.start)/1000;
  $('lTime').textContent = fmtTime(el);
  $('lDist').textContent = (S.dist/1000).toFixed(2) + ' km';
  $('lPace').textContent = S.dist > 20 ? fmtPace(el/(S.dist/1000)) + ' /km' : '–';
}
function onPosition(p){
  if (!S) return;
  const {latitude: lat, longitude: lon, accuracy, altitude} = p.coords;
  $('lAcc').textContent = '±' + Math.round(accuracy) + ' m';
  if (accuracy > MAX_ACC){ $('gpsMsg').textContent = 'Weak GPS signal – waiting for a better fix…'; return; }
  $('gpsMsg').textContent = 'Tracking… keep this page open.';
  const pt = [lat, lon], now = p.timestamp || Date.now();
  if (!S.path.length){
    S.path.push(pt); S.lastT = now; S.startAlt = altitude != null ? Math.round(altitude) : null; S.refAlt = altitude;
    startMarker = L.marker(pt, {icon: dotIcon('#22c55e')}).addTo(liveMap);
    liveLine = L.polyline([pt], {color: '#22c55e', weight: 6, opacity: .9}).addTo(liveMap);
    liveMarker = L.marker(pt, {icon: dotIcon('#38bdf8')}).addTo(liveMap);
    liveMap.setView(pt, 17); return;
  }
  const last = S.path[S.path.length-1], d = haversine(last, pt), dt = (now - S.lastT)/1000;
  liveMarker.setLatLng(pt);
  if (d < MIN_STEP) return;
  if (dt > 0 && d/dt > MAX_SPEED) return;                  // GPS 점프 무시
  S.path.push(pt); S.dist += d; S.lastT = now;
  if (altitude != null){                                    // 고도 상승: 3m 이상 변할 때만 반영해 떨림 제거
    if (S.refAlt == null) S.refAlt = altitude;
    const diff = altitude - S.refAlt;
    if (Math.abs(diff) >= 3){ if (diff > 0) S.gain += diff; S.refAlt = altitude; }
  }
  liveLine.addLatLng(pt);
  liveMap.panTo(pt);
  updateLive();
}
function onError(err){
  const msg = {1: 'Location permission denied. Allow it in your browser settings.', 2: 'Position unavailable. Try going outdoors.', 3: 'Timed out waiting for GPS.'}[err.code] || 'GPS error.';
  $('gpsMsg').textContent = msg; toast(msg, 'error');
  if (err.code === 1) stopTracking(true);
}

async function startRun(){
  if (!navigator.geolocation) return toast('Geolocation is not supported by this browser.', 'error');
  if (!window.isSecureContext) toast('GPS usually requires HTTPS or localhost.', 'error');
  const w = Number($('fWeight').value);
  if (!(w >= 20 && w <= 300)) return toast('Enter a weight between 20 and 300 kg.', 'error');
  resetLive();
  S = {start: Date.now(), path: [], dist: 0, gain: 0, refAlt: null, startAlt: null, lastT: 0};
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {enableHighAccuracy: true, maximumAge: 0, timeout: 15000});
  tick = setInterval(updateLive, 1000);
  try{ if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }catch{}
  $('startBtn').disabled = true; $('stopBtn').disabled = false;
  $('gpsMsg').textContent = 'Acquiring GPS signal…';
}
function stopTracking(discard){
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  clearInterval(tick); watchId = tick = null;
  try{ wakeLock && wakeLock.release(); }catch{} wakeLock = null;
  $('startBtn').disabled = false; $('stopBtn').disabled = true;
  if (discard) S = null;
}
function finishRun(){
  const s = S, timeSec = Math.round((Date.now() - s.start)/1000);
  stopTracking(false); S = null;
  if (s.dist < 50 || s.path.length < 2){
    $('gpsMsg').textContent = 'Run was too short (under 50 m) – not saved.';
    return toast('Too short to save (under 50 m).', 'error');
  }
  const km = s.dist/1000, kg = Number($('fWeight').value);
  const hr = Number($('fHr').value), cad = Number($('fCad').value);
  const run = {
    id: Date.now(), date: today(), timeSec, dist: Math.round(km*100)/100, paceSec: Math.round(timeSec/km),
    kcal: Math.round(kg * km * 1.036),            // 러닝 에너지 소비 ≈ 1.036 kcal × 체중(kg) × 거리(km)
    hr: hr >= 30 && hr <= 240 ? Math.round(hr) : null, cad: cad >= 40 && cad <= 300 ? Math.round(cad) : null,
    elev: Math.round(s.gain), alt: s.startAlt, place: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + ' run',
    path: s.path.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)])
  };
  runs.unshift(run);
  if (!store.set(KEY, runs)) toast('Could not save to this browser (storage full?).', 'error');
  else toast('Run saved ✓', 'ok');
  selectedId = run.id; $('gpsMsg').textContent = 'Saved! See the route in “Run detail” below.';
  renderAll();
  $('det-h').scrollIntoView({behavior: 'smooth'});
}
$('startBtn').onclick = startRun;
$('stopBtn').onclick = finishRun;
window.addEventListener('beforeunload', e => { if (S){ e.preventDefault(); e.returnValue = ''; } });

/* ---------- 삭제 ---------- */
function removeRun(id){
  if (!confirm('Delete this run?')) return;
  runs = runs.filter(r => r.id !== id); store.set(KEY, runs);
  if (selectedId === id) selectedId = runs[0] ? runs[0].id : null;
  renderAll(); toast('Deleted');
}

/* ---------- 렌더링 ---------- */
function renderTotals(){
  const withD = runs.filter(r => r.dist), dSum = withD.reduce((a, r) => a + r.dist, 0), tSum = withD.reduce((a, r) => a + r.timeSec, 0);
  const items = [['Runs', runs.length], ['Total distance', dSum.toFixed(1) + ' km'], ['Total time', fmtTime(runs.reduce((a, r) => a + r.timeSec, 0))],
                 ['Avg pace', dSum ? fmtPace(tSum/dSum) + ' /km' : '–']];
  $('totals').innerHTML = items.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
}
function renderDetail(){
  const r = runs.find(x => x.id === selectedId);
  $('empty').hidden = !!r; $('detail').hidden = !r;
  $('detDate').textContent = r ? '· ' + r.date : '';
  if (!r) return;
  $('dDist').textContent = dash(r.dist, 'km');
  $('dTime').textContent = fmtTime(r.timeSec);
  $('dPace').textContent = r.paceSec ? fmtPace(r.paceSec) + ' /km' : '–';
  $('dKcal').textContent = dash(r.kcal, 'kcal');
  $('dHr').textContent = dash(r.hr, 'bpm');
  $('dCad').textContent = dash(r.cad, 'spm');
  $('dElev').textContent = dash(r.elev, 'm');
  $('dAlt').textContent = dash(r.alt, 'm');
  $('dPlace').textContent = r.place || 'Unnamed course';
  if (!detailMap) detailMap = makeMap('detailMap');
  if (detailLayer){ detailMap.removeLayer(detailLayer); detailLayer = null; }
  const path = r.path || [];
  $('noRoute').hidden = path.length > 1; $('detailMap').hidden = path.length <= 1;
  if (path.length > 1){
    detailLayer = L.layerGroup([
      L.polyline(path, {color: '#facc15', weight: 6, opacity: .95}),
      L.marker(path[0], {icon: dotIcon('#22c55e')}), L.marker(path[path.length-1], {icon: dotIcon('#ef4444')})
    ]).addTo(detailMap);
    detailMap.invalidateSize();
    detailMap.fitBounds(L.latLngBounds(path), {padding: [24, 24]});
  }
}
function renderList(){
  const ul = $('runList'); ul.innerHTML = '';
  if (!runs.length){ ul.innerHTML = '<li class="note">Nothing here yet.</li>'; return; }
  runs.forEach(r => {
    const li = document.createElement('li'); if (r.id === selectedId) li.className = 'sel';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'runbtn';
    b.textContent = `${r.date} · ${r.dist ? r.dist + ' km · ' : ''}${fmtTime(r.timeSec)}` + (r.paceSec ? ` · ${fmtPace(r.paceSec)}/km` : '') + (r.place ? ` · ${r.place}` : '');
    b.onclick = () => { selectedId = r.id; renderAll(); };
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost del'; x.textContent = '✕';
    x.setAttribute('aria-label', 'Delete run on ' + r.date); x.onclick = () => removeRun(r.id);
    li.append(b, x); ul.appendChild(li);
  });
}
function renderAll(){ renderTotals(); renderList(); renderDetail(); }

/* ---------- Init ---------- */
selectedId = runs[0] ? runs[0].id : null;
renderAll();
