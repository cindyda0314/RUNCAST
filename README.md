# RunCast 🏃 – Smart Running & Outdoor Activities Guide

실시간 날씨·대기질 데이터를 분석해 **러닝 적합도 점수(0~100)** 와 **옷차림 가이드**를 제공하고, GPS로 러닝 기록까지 남길 수 있는 웹 앱입니다.
(Web Programming Final Project · 20240065 변다빈)

## 1. 프로젝트 구조

```
20240065/
├── index.html      # 메인: 전국 시·군·구 날씨 / 대기질 / 러닝 지수 / 옷차림 / 시간별 그래프
├── running.html    # GPS 러닝 트래커 (실시간 지도, 기록 대시보드, 히스토리)
├── css/
│   └── style.css   # 두 페이지 공용 다크 테마 스타일
├── js/
│   ├── common.js   # 공용 유틸 ($, store, toast)
│   ├── regions.js  # 17개 시·도 / 229개 시·군·구 좌표 + 기상청 격자 변환(toGrid, getRegion)
│   ├── app.js      # index.html 로직 (지역 셀렉트, API, 지수, 옷차림, 차트, 즐겨찾기)
│   └── running.js  # running.html 로직 (GPS 추적, 기록 저장/삭제, Leaflet 지도)
└── README.md
```

- 빌드 과정과 프레임워크는 없습니다 (순수 HTML/CSS/JavaScript).
- 외부 라이브러리는 `running.html`의 **Leaflet 1.9.4**(unpkg CDN)뿐이며, 지도 타일은 OpenStreetMap을 사용합니다. `index.html`은 외부 라이브러리 없이 동작합니다.

## 2. 실행 방법

1. `index.html`을 더블클릭하거나 VS Code Live Server 등으로 엽니다.
2. **시·도 → 시·군·구** 순서로 셀렉트에서 지역을 고르고 **Check**를 누릅니다. (이전에 조회한 지역이 있으면 다음 접속 시 자동 조회됩니다.)
3. API 키([data.go.kr](https://www.data.go.kr), 기상청·에어코리아 공용)는 `js/app.js` 상단의 `API_KEY` 상수에 들어 있습니다.
   키가 비어 있거나 호출이 실패하면 해당 데이터는 **Mock 데이터**로 대체됩니다.
4. 러닝 기록은 상단 메뉴의 **My Runs**(`running.html`)에서 합니다. GPS는 **HTTPS 또는 localhost**에서만 동작하므로 Live Server 사용을 권장합니다.

지역: 17개 시·도 × 시·군·구 229곳. 위·경도에서 기상청 격자(nx, ny)를 계산하고, 에어코리아는 `주소(예: 서울 강남구)`로 측정소를 찾아 조회합니다(실패 시 시·도 측정소로 대체).

## 3. 핵심 기능

### index.html – 날씨 / 러닝 지수

| 기능 | 설명 |
|---|---|
| 러닝 적합도 지수 | 체감온도 + 미세먼지(PM10/PM2.5) + 습도 + 강수를 합산한 100점 만점 점수 |
| 체감온도 계산 | 기온(T)과 풍속(V) 기반 (기온 10°C 이하, 풍속 4.8km/h 이상일 때 윈드칠 공식) |
| 호흡기 위험 보정 | PM10, PM2.5 수치에 따른 감점 |
| 4단계 가이드 | Optimal(80~) · Suitable(60~) · Caution(40~) · Risk(~39) |
| 옷차림 추천 | 체감온도 4구간별 상의·하의·아우터·액세서리 카드 + 실시간 팁 |
| 시간별 기온 차트 | Canvas 2D로 직접 그린 12시간 꺾은선 그래프 (창 크기 변경 시 다시 그림) |
| 즐겨찾기/최근 검색 | LocalStorage에 저장되어 새로고침 후에도 유지 (최근 검색 최대 5개) |

### running.html – GPS 러닝 트래커

- **Leaflet + OpenStreetMap** 지도 위에 이동 경로를 실시간으로 그립니다.
- **Start run** → `navigator.geolocation.watchPosition()`으로 위치를 수집하고, 이동할 때마다 초록색 `L.polyline`을 이어 붙입니다. 시간·거리·페이스·GPS 정확도를 실시간 표시합니다.
- 입력 항목: 체중(kg, 20~300, 칼로리 계산용, 필수), 평균 심박(30~240 bpm, 선택), 케이던스(40~300 spm, 선택). 거리·시간·페이스·고도는 GPS에서 자동 계산됩니다.
- **GPS 보정:** 정확도 30m 초과 무시, 3m 미만 이동 무시(떨림), 12m/s 초과 점프 무시, 고도는 3m 이상 변할 때만 상승분 반영.
- **Finish run** → 거리(Haversine), 시간, 평균 페이스, 칼로리(1.036 × 체중 × km), 고도 상승을 계산해 경로 좌표와 함께 `runcast.runs`에 저장합니다. 50m 미만이면 저장하지 않습니다.
- **Overview**(기록 수·총 거리·총 시간·평균 페이스), **Run detail**(선택한 기록의 지표와 지도: 노란 궤적, 시작 초록 / 끝 빨강 마커), **History**(목록 선택 및 삭제).
- 주의: 화면이 꺼지면 추적이 끊길 수 있어 지원 브라우저에서는 Screen Wake Lock으로 화면을 유지하며, 추적 중 페이지를 떠나려 하면 경고합니다.

## 4. 개발 로드맵과 코드 매핑

| Level | 내용 | `js/app.js` 위치 |
|---|---|---|
| 1 | 체감온도·러닝지수 알고리즘 | `feelsLike`, `runningScore`, `level`, `dustGrade`, `GEAR_TIERS`, `gearTier`, `renderWear`, `extraTips` |
| 2 | 입력 검증 + 토스트 알림 | `toast`(`common.js`), `searchForm` / `favBtn` 이벤트 핸들러, `getRegion`(`regions.js`) |
| 3 | 비동기 API (`Promise.allSettled`) + Mock 대체 | `fetchJSON`, `fetchWeather`, `findStation`, `fetchAir`, `mockData`, `loadData` |
| 4 | Canvas 시각화 | `drawChart` |
| 5 | LocalStorage 영속화 | `store`(`common.js`), `addRecent`, `renderFavs`, `getFavs` |
| 6 | GPS 러닝 트래커 | `js/running.js`: `startRun`, `onPosition`, `finishRun`, `renderDetail` 등 |

## 5. 사용 API

| | 기상청 단기예보 | 에어코리아 대기오염정보 |
|---|---|---|
| Endpoint | `/getVilageFcst` | `/getMsrstnList`(측정소 검색), `/getMsrstnAcctoRltmMesureDnsty`(측정소별 실시간), `/getCtprvnRltmMesureDnsty`(시·도별, 대체용) |
| 사용 데이터 | TMP(기온), REH(습도), WSD(풍속), PTY(강수형태) | pm10Value, pm25Value |
| 용도 | 체감온도·강수 판단, 12시간 기온 차트 | 호흡기 위험 점수 |

지역마다 기상청 격자 좌표(`nx`, `ny`)는 `regions.js`의 위·경도에서 `toGrid()`로 계산하며, 에어코리아 측정소는 지역 주소로 검색해 `localStorage`에 캐시합니다.

**예외 처리:** 타임아웃(6초), CORS 오류, 키 누락, 응답 없음 → 실패한 쪽(날씨/대기질)만 Mock 데이터로 대체하고 화면에 안내 문구(`⚠ Some data is sample (mock)…`)를 표시합니다.

## 6. 점수 계산 방식 (요약)

- 시작 100점, 체감온도가 이상적 값(12°C)에서 벗어날수록 감점 (차이 4°C까지 1점/°C, 초과분은 3.2점/°C)
- 습도 70% 초과분 × 0.3 감점, 강수 시 −20
- PM10 > 30, PM2.5 > 15부터 단계별 감점 (PM10 최대 −55, PM2.5 최대 −48)
- 최종 0~100 범위로 반올림·제한

## 7. LocalStorage 키

| 키 | 내용 |
|---|---|
| `runcast.favs2` | 즐겨찾기 지역 (`시·도\|시·군·구`) |
| `runcast.recent2` | 최근 검색 (최대 5개) |
| `runcast.last2` | 마지막 조회 지역 |
| `runcast.station.*` | 지역별 에어코리아 측정소 캐시 |
| `runcast.runs` | 러닝 기록 배열 (경로 좌표 포함) |

## 8. 접근성 & 반응형

- 시맨틱 요소, `aria-live`, `aria-label`, 스크린리더 전용 레이블(`sr-only`) 사용
- Grid/Flexbox 기반 레이아웃: 700px 이하에서 카드 1열, 통계 2열로 전환하고 600px/480px 이하에서 입력 필드를 1열로 정렬

## 9. 의류 추천 (What to wear)

체감온도 4구간(< 0 / 0~9 / 10~16 / 17°C 이상)별로 상의·하의·아우터·액세서리 카드를 렌더링하고, 아래에 실시간 팁(풍속 ≥ 3.5 m/s, PM10 > 80 또는 PM2.5 > 35, 강수)을 표시합니다. 각 항목은 이모지(🧥 👕 👖 🩳 🧤 🧣 🧢)로 표시하며 외부 아이콘 라이브러리는 사용하지 않습니다.
