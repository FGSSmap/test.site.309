/* =========================================================
   FGSSmap script.js（改変版）
   - 既存構造は可能な限り維持
   - 重複/競合していたコードを統合
   - 世界：未選択→5地域一覧表示、選択→該当地域のみ
   - 地域ズームは 14z（指示どおり）
   - KMLファイル名：placemark/region-*.kml（合意済み命名）
   - 座標はDOM保持（CSSで非表示）
========================================================= */

/* -------------------------
   定数とDOM参照
------------------------- */
const campusMapUrl = "https://www.google.com/maps/d/u/1/embed?mid=1nTgYFWkXf1UQHwGZCwdXuRv-aopgUkY&ehbc=2E312F";
const worldMapUrl  = "https://www.google.com/maps/d/embed?mid=1qtamWdIhe4du3uLXQxcD9IrGgNgaVoc&ehbc=2E312F";

const campusMap   = document.getElementById("campus-map");
const japanMap    = document.getElementById("japan-map");
const prefMap     = document.getElementById("prefecture-map"); // 使わないが既存維持
const worldMap    = document.getElementById("world-map");

const campusButton = document.getElementById('campus-button');
const japanButton  = document.getElementById('japan-button');
const worldButton  = document.getElementById('world-button');

const regionSelector = document.getElementById("region-selector");
const regionSelect   = document.getElementById("region-select");
const selectedRegion = document.querySelector(".selected-region");
const regionName     = document.getElementById("region-name");
const resetRegionBtn = document.getElementById("reset-region");

const placemarkContainer = document.getElementById("placemarks-list");      // キャンパス/都道府県など従来の一覧
const loadingEl          = document.getElementById("loading");

// 世界地域の一覧用（index.htmlに追記済みの領域）
const regionAllContainer = document.getElementById("region-placemarks-container");
const regionBlocks = {
  "asia":          document.querySelector("#region-asia .placemarks-grid"),
  "europe":        document.querySelector("#region-europe .placemarks-grid"),
  "africa":        document.querySelector("#region-africa .placemarks-grid"),
  "oceania":       document.querySelector("#region-oceania .placemarks-grid"),
  "north-america": document.querySelector("#region-north-america .placemarks-grid"),
};

/* -------------------------
   キャッシュ & パス
------------------------- */
const kmlCache = {
  campus: null,
  prefectures: {},      // 例: '35': XMLDoc
  regions: {}           // 'asia' など
};

// 既存合意の命名
const KML_PATHS = {
  campus: 'placemark/campus.kml',
  region: (key) => `placemark/region-${key}.kml`,
  pref:   (code) => `placemark/${code}.kml`
};

/* -------------------------
   ユーティリティ
------------------------- */
function getIframeHTML(url, title = "地図") {
  return `<iframe src="${url}" width="100%" height="100%" style="border:0;" allowfullscreen loading="lazy" title="${title}"></iframe>`;
}

function showLoading(show = true) {
  if (!loadingEl) return;
  loadingEl.classList.toggle('show', show);
  loadingEl.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function handleError(error, context = '') {
  console.error(`エラー ${context}:`, error);
  showLoading(false);
}

function extractImageFromDescription(description) {
  if (!description) return null;
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return imgMatch ? imgMatch[1] : null;
}

function parseCoordinates(coordString) {
  if (!coordString) return null;
  // "lon,lat[,alt] [lon,lat...]"
  const first = coordString.trim().split(/\s+/)[0];
  const [lng, lat] = first.split(',').map(parseFloat);
  if (isFinite(lat) && isFinite(lng)) return { lat, lng };
  return null;
}

function generateMapsUrl(lat, lng, zoom = 15) {
  return `https://www.google.com/maps/@${lat},${lng},${zoom}z`;
}

function escapeHtml(str){return (str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escapeAttr(str){return (str??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

/* -------------------------
   プレースマークカード
------------------------- */
function createPlacemarkCard(placemark) {
  const name = placemark.getElementsByTagName("name")[0]?.textContent || "名称不明";
  const descNode = placemark.getElementsByTagName("description")[0];
  const description = descNode ? (descNode.textContent || descNode.innerHTML || '') : '';
  const coordsNode = placemark.getElementsByTagName("coordinates")[0];
  const coordsString = coordsNode ? coordsNode.textContent.trim() : "";

  const imageUrl = extractImageFromDescription(description);
  const coordinates = parseCoordinates(coordsString);

  const cleanDescription = description
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const card = document.createElement("div");
  card.className = "placemark-card";
  card.setAttribute('role', 'article');
  card.setAttribute('tabindex', '0');

  card.innerHTML = `
    <div class="placemark-header">
      ${imageUrl
        ? `<img src="${imageUrl}" alt="${escapeAttr(name)}" class="placemark-image" loading="lazy" onerror="this.style.display='none';">`
        : `<div class="placemark-overlay" aria-hidden="true"></div>`
      }
      <div class="placemark-overlay">
        <h3 class="placemark-title">${escapeHtml(name)}</h3>
      </div>
    </div>
    <div class="placemark-content">
      ${cleanDescription ? `<p class="placemark-description">${escapeHtml(cleanDescription)}</p>` : ''}
      ${coordinates ? `
        <div class="coordinates" aria-hidden="false">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
          <span>${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}</span>
        </div>` : ''
      }
      <div class="placemark-actions">
        ${coordinates ? `
          <button class="placemark-btn primary zoom-btn"
                  data-lat="${coordinates.lat}"
                  data-lng="${coordinates.lng}"
                  data-name="${escapeAttr(name)}">
            <i class="fas fa-search-plus" aria-hidden="true"></i>
            地図で確認
          </button>` : ''
        }
        ${coordinates ? `
          <a href="${generateMapsUrl(coordinates.lat, coordinates.lng)}"
             target="_blank" rel="noopener noreferrer"
             class="placemark-btn secondary">
            <i class="fas fa-external-link-alt" aria-hidden="true"></i>
            Google Mapsで開く
          </a>` : ''
        }
      </div>
    </div>
  `;
  return card;
}

/* -------------------------
   KMLロード
------------------------- */
async function fetchKml(path) {
  const res = await fetch(`${path}?v=${Date.now()}`);
  if (!res.ok) throw new Error(`KML取得失敗: ${path}`);
  const text = await res.text();
  const parser = new DOMParser();
  return parser.parseFromString(text, "text/xml");
}

async function getCampusKml() {
  if (!kmlCache.campus) kmlCache.campus = await fetchKml(KML_PATHS.campus);
  return kmlCache.campus;
}
async function getPrefKml(code) {
  if (!kmlCache.prefectures[code]) kmlCache.prefectures[code] = await fetchKml(KML_PATHS.pref(code));
  return kmlCache.prefectures[code];
}
async function getRegionKml(key) {
  if (!kmlCache.regions[key]) kmlCache.regions[key] = await fetchKml(KML_PATHS.region(key));
  return kmlCache.regions[key];
}

/* -------------------------
   ズーム（共通iframe）
------------------------- */
function setupZoomButtons(scopeEl) {
  const root = scopeEl || document;
  root.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.onclick = () => {
      const lat  = parseFloat(btn.dataset.lat);
      const lng  = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name || '地点';
      if (!isFinite(lat) || !isFinite(lng)) return;

      // 現在アクティブな地図
      const active = document.querySelector('.map-container.active');
      const iframe = active?.querySelector('iframe');
      if (!iframe) return;

      // 基本URL（キャンパス or 世界）
      const baseUrl = (active.id === 'campus-map') ? campusMapUrl : worldMapUrl;
      // プレースマークズームは細かめ（17z）
      const zoomedUrl = `${baseUrl}&ll=${lat},${lng}&z=17`;
      iframe.src = zoomedUrl;
      iframe.title = `${name} - 詳細地図`;
    };
  });
}

/* -------------------------
   表示切替（地図 / リスト）
------------------------- */
function hideAllMaps() {
  [campusMap, japanMap, prefMap, worldMap].forEach(el => el?.classList.remove('active'));
}
function showMap(kind) {
  hideAllMaps();
  if (kind === 'campus') {
    campusMap.classList.add('active');
    regionSelector.classList.remove('show');
  } else if (kind === 'japan') {
    japanMap.classList.add('active');
    regionSelector.classList.remove('show');
  } else if (kind === 'world') {
    worldMap.classList.add('active');
    regionSelector.classList.add('show');
  }
}

function clearClassicList() {
  if (!placemarkContainer) return;
  placemarkContainer.classList.remove('show');
  placemarkContainer.innerHTML = '';
}

function showClassicList(placemarks) {
  placemarkContainer.innerHTML = '<div class="placemarks-grid"></div>';
  const grid = placemarkContainer.querySelector('.placemarks-grid');
  placemarks.forEach(pm => grid.appendChild(createPlacemarkCard(pm)));
  placemarkContainer.classList.add('show');
  setupZoomButtons(placemarkContainer);
}

function hideAllRegionBlocks() {
  if (!regionAllContainer) return;
  regionAllContainer.querySelectorAll('.region-placemarks').forEach(sec => {
    sec.classList.remove('show');
    const grid = sec.querySelector('.placemarks-grid');
    if (grid) grid.innerHTML = '';
  });
}
function showRegionBlock(key, placemarks) {
  const sec = document.getElementById(`region-${key}`);
  if (!sec) return;
  const grid = sec.querySelector('.placemarks-grid');
  grid.innerHTML = '';
  placemarks.forEach(pm => grid.appendChild(createPlacemarkCard(pm)));
  sec.classList.add('show');
  setupZoomButtons(sec);
}

/* -------------------------
   日本地図（既存SVG埋め込み）
------------------------- */
function loadJapanMapDirectly() {
  // 既存実装そのまま（要約版）
  if (!japanMap) return;
  if (!japanMap.querySelector('svg')) {
    // 既にあなたの版ではフルSVGをセットしていたので省略。
    // ここでは初回だけ campus などと同様に置換しておく。
    // 必要なら元の長大なSVG設定関数をそのまま呼び出してください。
  }
}

/* -------------------------
   都道府県クリック→KML（従来通り）
   ※ map-links 経由の MyMap iframe は既存のまま活かす前提
------------------------- */
// この部分はあなたの既存コードに依存するため、従来の showPrefectureMap()/backToJapanMap() をそのまま使ってOK。
// ここではプレースマーク（KML）だけ既存と同じIDに描画します。
async function loadPrefPlacemarks(code) {
  try {
    showLoading(true);
    const xml = await getPrefKml(code);
    const pms = Array.from(xml.getElementsByTagName('Placemark'));
    showClassicList(pms);
  } catch (e) {
    handleError(e, '都道府県KML');
  } finally {
    showLoading(false);
  }
}

/* -------------------------
   世界：地域切替
------------------------- */
function resetRegionSelection() {
  if (!regionSelect || !selectedRegion) return;
  regionSelect.style.display = 'block';
  selectedRegion.classList.remove('show');
  regionSelect.value = '';
  regionName.textContent = '';
}

async function showWorldAllRegions() {
  // 5地域すべて読み込んで、各ブロックに描画
  try {
    showLoading(true);
    clearClassicList();
    hideAllRegionBlocks();

    const keys = Object.keys(regionBlocks);
    const xmlDocs = await Promise.all(keys.map(k => getRegionKml(k).catch(() => null)));

    keys.forEach((k, idx) => {
      const xml = xmlDocs[idx];
      if (!xml) return;
      const pms = Array.from(xml.getElementsByTagName('Placemark'));
      showRegionBlock(k, pms);
    });

    // 地図は世界全体（ズームはMyMap側基準）
    worldMap.innerHTML = getIframeHTML(worldMapUrl, "世界地図");
  } catch (e) {
    handleError(e, '世界(全地域)');
  } finally {
    showLoading(false);
  }
}

async function showWorldRegion(key) {
  try {
    showLoading(true);
    clearClassicList();
    hideAllRegionBlocks();

    const xml = await getRegionKml(key);
    const pms = Array.from(xml.getElementsByTagName('Placemark'));
    showRegionBlock(key, pms);

    // 地域ズームは 14z（指定どおり）
    // center はKML一発目が必ずしも中心とは限らないので、とりあえず最初のPlacemarkに寄せる
    let iframeUrl = worldMapUrl;
    if (pms.length) {
      const coordsNode = pms[0].getElementsByTagName("coordinates")[0];
      const coords = coordsNode ? parseCoordinates(coordsNode.textContent) : null;
      if (coords) iframeUrl = `${worldMapUrl}&ll=${coords.lat},${coords.lng}&z=14`;
    }
    worldMap.innerHTML = getIframeHTML(iframeUrl, "世界地図（地域）");
  } catch (e) {
    handleError(e, `世界(${key})`);
  } finally {
    showLoading(false);
  }
}

/* -------------------------
   URL履歴
------------------------- */
function updateHistory(view, params = {}) {
  const usp = new URLSearchParams();
  usp.set('view', view);
  Object.entries(params).forEach(([k, v]) => usp.set(k, v));
  history.pushState({ view, ...params }, '', `?${usp.toString()}`);
}

window.addEventListener('popstate', async (ev) => {
  const st = ev.state;
  if (!st) return;
  await applyView(st.view || 'campus', st.region || null, st.code || null, false);
});

/* -------------------------
   ビュー適用
------------------------- */
async function applyView(view, region = null, prefCode = null, push = true) {
  // ボタン状態
  [campusButton, japanButton, worldButton].forEach(b => b?.classList.remove('active'));
  if (view === 'campus') campusButton?.classList.add('active');
  if (view === 'japan')  japanButton?.classList.add('active');
  if (view === 'world')  worldButton?.classList.add('active');

  // 地図切り替え
  showMap(view);

  if (view === 'campus') {
    campusMap.innerHTML = getIframeHTML(campusMapUrl, "キャンパス周辺地図");
    resetRegionSelection();
    await (async () => {
      const xml = await getCampusKml();
      const pms = Array.from(xml.getElementsByTagName('Placemark'));
      showClassicList(pms);
    })();
    if (push) updateHistory('campus');

  } else if (view === 'japan') {
    resetRegionSelection();
    loadJapanMapDirectly();
    clearClassicList(); // ここでは従来通り空。都道府県クリック時に読み込む想定
    if (push) updateHistory('japan');

  } else if (view === 'world') {
    // 地域未選択 → 5地域すべて表示
    if (!region) {
      resetRegionSelection();
      selectedRegion?.classList.remove('show');
      await showWorldAllRegions();
      if (push) updateHistory('world');
    } else {
      // 地域選択時
      if (regionSelect) {
        regionSelect.value = region;
        regionSelect.style.display = 'none';
      }
      if (selectedRegion) {
        selectedRegion.classList.add('show');
        regionName.textContent = regionSelect?.selectedOptions?.[0]?.text || region;
      }
      await showWorldRegion(region);
      if (push) updateHistory('world', { region });
    }
  }

  // 戻るボタン（日本の都道府県iframeを
