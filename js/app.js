'use strict';
/* index.html – 전국 시·군·구 날씨 / 대기질 / 러닝 지수 / 옷차림
   (공통 유틸 $, store, toast 는 common.js, 지역 데이터는 regions.js) */
const API_KEY = '749acc0820180b6bd3f997630d9103378512ae25fb49431f07aee542fc7d0d20'; // data.go.kr (기상청·에어코리아 공용)
let current = null;   // last result

/* ---------- Level 1: calculations ---------- */
function feelsLike(T, windMs){
  const V = windMs * 3.6; // km/h
  if (T <= 10 && V >= 4.8) // wind chill
    return 13.12 + 0.6215*T - 11.37*Math.pow(V,0.16) + 0.3965*Math.pow(V,0.16)*T;
  return T;
}
function runningScore({feels, pm10, pm25, rain, humidity}){
  let s = 100;
  const d = Math.abs(feels - 12);                // ideal ≈ 12 °C
  s -= d <= 4 ? d*1 : 4 + (d-4)*3.2;
  if (humidity > 70) s -= (humidity-70)*0.3;
  s -= pm10 <= 30 ? 0 : pm10 <= 80 ? (pm10-30)*0.4 : pm10 <= 150 ? 20+(pm10-80)*0.5 : 55;
  s -= pm25 <= 15 ? 0 : pm25 <= 35 ? (pm25-15)*0.8 : pm25 <= 75 ? 16+(pm25-35)*0.8 : 48;
  if (rain) s -= 20;
  return Math.max(0, Math.min(100, Math.round(s)));
}
function level(score){
  if (score >= 80) return {t:'Optimal',  c:'var(--g1)', m:'Optimal running conditions. Go for it!'};
  if (score >= 60) return {t:'Suitable', c:'var(--g2)', m:'Good enough for a run. Stay hydrated.'};
  if (score >= 40) return {t:'Caution',  c:'var(--g3)', m:'Run lightly or shorten the distance.'};
  return {t:'Risk', c:'var(--g4)', m:'Avoid outdoor running. Try indoor exercise.'};
}
function dustGrade(v, a){ return v<=a[0]?'Good':v<=a[1]?'Moderate':v<=a[2]?'Bad':'Very bad'; }
/* ---------- 의류 추천: 체감온도 4구간 레이어링 ---------- */
const GEAR_TIERS = [
  {max: 0, key: 'freezing', icon: '❄️', name: '영하권', range: '< 0°C',
   desc: '보온과 방풍이 최우선. 노출 부위 없이 겹쳐 입으세요.',
   gear: {top: [['👕', '기능성 긴팔 이너 (보온 베이스레이어)']],
          outer: [['🧥', '방풍 기능성 아우터 (윈드브레이커)']],
          bottom: [['👖', '기모 러닝 타이츠']],
          acc: [['🧤', '러닝용 장갑'], ['🧣', '넥워머'], ['🧢', '방한모']]}},
  {max: 10, key: 'chilly', icon: '🥶', name: '쌀쌀한 날씨', range: '0 ~ 9°C',
   desc: '몸이 데워지면 벗을 수 있도록 가볍게 겹쳐 입으세요.',
   gear: {top: [['👕', '긴팔 기능성 셔츠 (롱슬리브)']],
          outer: [['🦺', '얇은 자켓 또는 조끼']],
          bottom: [['👖', '롱 타이츠']],
          acc: [['🧤', '가벼운 장갑']]}},
  {max: 17, key: 'cool', icon: '🌤️', name: '선선한 날씨', range: '10 ~ 16°C',
   desc: '러닝하기 가장 좋은 구간. 가볍고 땀 배출이 좋은 옷이면 충분해요.',
   gear: {top: [['👕', '반팔 또는 얇은 긴팔 셔츠']],
          bottom: [['🩳', '쇼츠(반바지) 또는 7부 타이츠']]}},
  {max: Infinity, key: 'warm', icon: '☀️', name: '따뜻한 / 더운 날씨', range: '17°C 이상',
   desc: '통기성과 열 배출이 핵심. 수분 보충과 자외선 차단도 챙기세요.',
   gear: {top: [['🎽', '통기성 좋은 싱글렛(민소매) 또는 반팔']],
          bottom: [['🩳', '러닝 쇼츠']],
          acc: [['🧢', '캡모자']]}}
];
const GEAR_CATS = {top: '상의', bottom: '하의', outer: '아우터', acc: '액세서리'};
function gearTier(f){ return GEAR_TIERS.find(t => f < t.max); }
/* 실시간 변수 기반 추가 팁 */
function extraTips({wind, pm10, pm25, rain}){
  const t = [];
  if (wind >= 3.5) t.push(['', '💡 바람이 강합니다! 방풍 자켓을 꼭 챙기세요.']);
  if (pm10 > 80 || pm25 > 35) t.push(['', '💡 대기질이 좋지 않으니 러닝용 마스크(KF94 등) 착용을 권장해요.']);
  if (rain) t.push(['', '💡 비 예보가 있어요. 방수 자켓과 챙 있는 모자를 준비하세요.']);
  return t;
}
const icon = e => `<span class="emo" aria-hidden="true">${e}</span>`;
function renderWear(f, w, a){
  const t = gearTier(f);
  $('tier').innerHTML = `${icon(t.icon)}<span>${t.name} · ${t.range}</span>`;
  $('tier').dataset.tier = t.key;
  $('tierDesc').textContent = `체감온도 ${f.toFixed(1)}°C 기준 — ${t.desc}`;
  $('gear').innerHTML = Object.keys(GEAR_CATS).filter(k => t.gear[k]).map(k => `
    <article class="gear-card" data-cat="${k}">
      <h3>${GEAR_CATS[k]}</h3>
      <ul>${t.gear[k].map(([ic, label]) => `<li><span class="gi">${icon(ic)}</span><span>${label}</span></li>`).join('')}</ul>
    </article>`).join('');
  $('extraTips').innerHTML = extraTips({wind: w.wind, pm10: a.pm10, pm25: a.pm25, rain: w.rain})
    .map(([, msg]) => `<p class="tip">${msg}</p>`).join('');
}

/* ---------- Level 3: async APIs + mock fallback ---------- */
function kmaBase(){
  const now = new Date(Date.now() - 40*60000);
  const times = [2,5,8,11,14,17,20,23];
  const h = now.getHours(); let b = times.filter(t=>t<=h).pop();
  if (b === undefined){ now.setDate(now.getDate()-1); b = 23; }
  const p = n => String(n).padStart(2,'0');
  return {date: `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}`, time: p(b)+'00'};
}
async function fetchJSON(url){
  const ctl = new AbortController(); const id = setTimeout(()=>ctl.abort(), 6000);
  try{
    const r = await fetch(url, {signal: ctl.signal});
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } finally { clearTimeout(id); }
}
async function fetchWeather(r){
  const {date,time} = kmaBase();
  const url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
    + `?serviceKey=${encodeURIComponent(API_KEY)}&pageNo=1&numOfRows=300&dataType=JSON`
    + `&base_date=${date}&base_time=${time}&nx=${r.nx}&ny=${r.ny}`;
  const items = (await fetchJSON(url)).response.body.items.item;
  const by = cat => items.filter(i=>i.category===cat);
  const nowKey = (() => { const d = new Date(Date.now() - 3600e3), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}00`; })();
  let tmp = by('TMP').filter(i => i.fcstDate + i.fcstTime >= nowKey);
  if (!tmp.length) tmp = by('TMP');
  if (!tmp.length) throw new Error('no data');
  const first = tmp[0], at = cat => by(cat).find(i=>i.fcstDate===first.fcstDate && i.fcstTime===first.fcstTime) || by(cat)[0];
  return {
    temp: +first.fcstValue, humidity: +at('REH').fcstValue, wind: +at('WSD').fcstValue,
    rain: by('PTY').some(i=>i.fcstDate===first.fcstDate && i.fcstTime===first.fcstTime && +i.fcstValue>0),
    hourly: tmp.slice(0,12).map(i=>({h: +i.fcstTime.slice(0,2), v: +i.fcstValue}))
  };
}
/* 에어코리아: 시·군·구 주소로 측정소 검색 → 해당 측정소 실시간 측정값.
   실패하면 시·도 단위 측정소 목록에서 첫 유효값 사용 */
async function findStation(r){
  const ck = 'runcast.station.' + r.short + r.name, cached = store.get(ck, null);
  if (cached) return cached;
  const url = 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList'
    + `?serviceKey=${encodeURIComponent(API_KEY)}&returnType=json&numOfRows=5&pageNo=1&addr=${encodeURIComponent(r.short + ' ' + r.name)}`;
  const items = (await fetchJSON(url)).response.body.items;
  if (!items || !items.length) throw new Error('no station');
  store.set(ck, items[0].stationName);
  return items[0].stationName;
}
async function fetchAir(r){
  const parse = it => { const pm10 = parseInt(it.pm10Value), pm25 = parseInt(it.pm25Value);
    return (isNaN(pm10) || isNaN(pm25)) ? null : {pm10, pm25, station: it.stationName}; };
  try{
    const st = await findStation(r);
    const url = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty'
      + `?serviceKey=${encodeURIComponent(API_KEY)}&returnType=json&numOfRows=3&pageNo=1`
      + `&stationName=${encodeURIComponent(st)}&dataTerm=DAILY&ver=1.3`;
    const items = (await fetchJSON(url)).response.body.items;
    for (const it of items){ const v = parse({...it, stationName: st}); if (v) return v; }
  } catch(e){ /* fall through to sido-level */ }
  const url = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty'
    + `?serviceKey=${encodeURIComponent(API_KEY)}&returnType=json&numOfRows=30&pageNo=1`
    + `&sidoName=${encodeURIComponent(r.short)}&ver=1.3`;
  const items = (await fetchJSON(url)).response.body.items;
  for (const it of items){ const v = parse(it); if (v) return {...v, station: v.station + ' (' + r.short + ' 대체 측정소)'}; }
  throw new Error('no data');
}
function mockData(r){
  const t0 = Math.round(21 - (r.lat - 33) * 0.9), w0 = r.lon > 129 || r.lat < 34 ? 5 : 2, now = new Date().getHours();
  const hourly = Array.from({length:12}, (_,i)=>{
    const h = (now+i)%24;
    return {h, v: Math.round((t0 + 5*Math.sin((h-9)/24*2*Math.PI))*10)/10};
  });
  return {weather:{temp:hourly[0].v, humidity:55, wind:w0, rain:false, hourly},
          air:{pm10: 28 + Math.round(Math.random()*20), pm25: 12 + Math.round(Math.random()*10), station:null}};
}
async function loadData(r){
  const mock = mockData(r);
  if (!API_KEY) return {...mock, mock:true};
  const [w, a] = await Promise.allSettled([fetchWeather(r), fetchAir(r)]);
  return {
    weather: w.status==='fulfilled' ? w.value : mock.weather,
    air: a.status==='fulfilled' ? a.value : mock.air,
    mock: !(w.status==='fulfilled' && a.status==='fulfilled')
  };
}

/* ---------- Render ---------- */
async function showRegion(r){
  const btn = document.querySelector('#searchForm button[type=submit]');
  btn.disabled = true; btn.textContent = 'Loading…';
  try{
    const d = await loadData(r), w = d.weather, a = d.air;
    const feels = feelsLike(w.temp, w.wind);
    const score = runningScore({feels, pm10:a.pm10, pm25:a.pm25, rain:w.rain, humidity:w.humidity});
    const lv = level(score);
    current = {r, score, hourly: w.hourly};
    $('result').hidden = false;
    $('place').textContent = r.sido + ' ' + r.name;
    $('scoreNum').textContent = score;
    const ring = $('ring'); ring.style.setProperty('--p', score); ring.style.setProperty('--c', lv.c);
    const b = $('badge'); b.textContent = lv.t; b.style.setProperty('--c', lv.c);
    $('summary').textContent = lv.m;
    $('sTemp').textContent = w.temp.toFixed(1)+' °C';
    $('sFeel').textContent = feels.toFixed(1)+' °C';
    $('sWind').textContent = w.wind.toFixed(1)+' m/s';
    $('sHum').textContent = w.humidity+' %';
    $('sPm10').textContent = a.pm10+' µg/m³ ('+dustGrade(a.pm10,[30,80,150])+')';
    $('sPm25').textContent = a.pm25+' µg/m³ ('+dustGrade(a.pm25,[15,35,75])+')';
    $('airStation').textContent = a.station ? 'Air station: ' + a.station + ' · KMA grid ' + r.nx + ',' + r.ny : 'KMA grid ' + r.nx + ',' + r.ny;
    $('source').textContent = d.mock ? '⚠ Some data is sample (mock) – live API unavailable or no data for this area.' : 'Live data: KMA Short-term Forecast + AirKorea.';
    renderWear(feels, w, a);
    drawChart(w.hourly);
    addRecent(r);
    renderFavs();
  } catch(e){
    toast('Something went wrong. Please try again.', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Check'; }
}

/* ---------- Level 4: Canvas chart ---------- */
function drawChart(data){
  const cv = $('chart'), dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W*dpr; cv.height = H*dpr;
  const g = cv.getContext('2d'); g.scale(dpr,dpr); g.clearRect(0,0,W,H);
  const pad = {l:40,r:16,t:20,b:30};
  const vals = data.map(d=>d.v);
  const min = Math.floor(Math.min(...vals))-1, max = Math.ceil(Math.max(...vals))+1;
  const x = i => pad.l + i*(W-pad.l-pad.r)/(data.length-1 || 1);
  const y = v => pad.t + (max-v)*(H-pad.t-pad.b)/(max-min);
  g.font = '12px system-ui'; g.fillStyle = '#94a3b8'; g.strokeStyle = '#334155'; g.lineWidth = 1;
  for (let k=0;k<=4;k++){
    const v = min + (max-min)*k/4, yy = y(v);
    g.beginPath(); g.moveTo(pad.l,yy); g.lineTo(W-pad.r,yy); g.stroke();
    g.textAlign='right'; g.fillText(v.toFixed(0), pad.l-6, yy+4);
  }
  g.textAlign='center';
  data.forEach((d,i)=>{ if (data.length<8 || i%2===0) g.fillText(String(d.h).padStart(2,'0')+':00', x(i), H-8); });
  g.strokeStyle = '#38bdf8'; g.lineWidth = 2.5; g.beginPath();
  data.forEach((d,i)=> i ? g.lineTo(x(i),y(d.v)) : g.moveTo(x(i),y(d.v))); g.stroke();
  g.fillStyle = '#38bdf8';
  data.forEach((d,i)=>{ g.beginPath(); g.arc(x(i),y(d.v),3.5,0,7); g.fill(); });
}
window.addEventListener('resize', ()=>{ if (current) drawChart(current.hourly); });

/* ---------- Level 5: LocalStorage (favorites + recent) ---------- */
const rid = r => r.sido + '|' + r.name;
const fromId = id => { const [s, n] = String(id).split('|'); return getRegion(s, n); };
const getFavs = () => store.get('runcast.favs2', []).filter(id => fromId(id));
const getRecent = () => store.get('runcast.recent2', []).filter(id => fromId(id));
function addRecent(r){
  store.set('runcast.recent2', [rid(r), ...getRecent().filter(k=>k!==rid(r))].slice(0,5));
  store.set('runcast.last2', rid(r));
}
function selectRegion(r){ $('sido').value = r.sido; fillSigungu(r.sido, r.name); }
function renderFavs(){
  const box = $('favs'); box.innerHTML = '';
  const favs = getFavs(), recent = getRecent().filter(k=>!favs.includes(k));
  const mk = (id, star) => {
    const r = fromId(id), s = document.createElement('span'); s.className = 'chip';
    const b = document.createElement('button'); b.className = 'name'; b.type = 'button';
    b.textContent = (star?'★ ':'🕘 ') + r.short + ' ' + r.name;
    b.onclick = () => { selectRegion(r); showRegion(r); };
    s.appendChild(b);
    if (star){
      const x = document.createElement('button'); x.type='button'; x.textContent='✕'; x.setAttribute('aria-label','Remove '+r.name);
      x.onclick = () => { store.set('runcast.favs2', getFavs().filter(k=>k!==id)); renderFavs(); toast('Removed from favorites'); };
      s.appendChild(x);
    }
    box.appendChild(s);
  };
  favs.forEach(k=>mk(k,true)); recent.forEach(k=>mk(k,false));
}

/* ---------- 지역 셀렉트 UI ---------- */
function fillSigungu(sidoName, pick){
  const s = REGIONS.find(x => x.sido === sidoName), sel = $('sigungu');
  sel.innerHTML = s.list.map(d => `<option value="${d[0]}">${d[0]}</option>`).join('');
  if (pick) sel.value = pick;
}
$('sido').innerHTML = REGIONS.map(s => `<option value="${s.sido}">${s.sido}</option>`).join('');
$('sido').addEventListener('change', e => fillSigungu(e.target.value));

/* ---------- Events ---------- */
$('searchForm').addEventListener('submit', e=>{
  e.preventDefault();
  const r = getRegion($('sido').value, $('sigungu').value);
  if (!r) return toast('Please select a region.', 'error');
  showRegion(r);
});
$('favBtn').addEventListener('click', ()=>{
  if (!current) return toast('Check a region first.', 'error');
  const f = getFavs(), id = rid(current.r);
  if (f.includes(id)) return toast('Already in favorites.');
  store.set('runcast.favs2', [...f, id]); renderFavs(); toast('Saved to favorites ★', 'ok');
});

/* ---------- Init ---------- */
const lastId = store.get('runcast.last2', '서울특별시|강남구');
const lastR = fromId(lastId) || getRegion('서울특별시', '강남구');
selectRegion(lastR);
renderFavs();
if (store.get('runcast.last2', null)) showRegion(lastR);
