const STORAGE_KEY = 'stock-board:watchlist';
const DEFAULT_WATCHLIST = ['005930', '000660', '035420', '035720', '005380'];
const CLOSED_POLL_MS = 60_000;

const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('ko-KR');
const fmt2 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const state = {
  watchlist: loadWatchlist(),
  quotes: new Map(),
  pollMs: 7000,
  timer: null,
  detailCode: null,
  detailRange: '1d',
};

// ---------- 저장소 ----------
function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.filter((c) => /^\d{6}$/.test(c));
  } catch { /* 저장소를 쓸 수 없으면 기본값 사용 */ }
  return [...DEFAULT_WATCHLIST];
}
function saveWatchlist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.watchlist)); } catch { /* 무시 */ }
}

// ---------- 공통 ----------
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}
const dirClass = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
const sign = (n) => (n > 0 ? '+' : '');
const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '');
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showError(msg) {
  const el = $('#error');
  el.textContent = msg ?? '';
  el.hidden = !msg;
}

// ---------- 지수 ----------
function renderIndices(list) {
  const labels = { KOSPI: '코스피', KOSDAQ: '코스닥', KPI200: '코스피200' };
  $('#indices').innerHTML = list
    .map((i) => {
      const c = dirClass(i.change);
      return `<div class="index-card">
        <div class="name">${labels[i.code] ?? escapeHtml(i.name)}</div>
        <div class="value num">${i.price == null ? '-' : fmt2.format(i.price)}</div>
        <div class="chg num ${c}">${arrow(i.change)} ${fmt2.format(Math.abs(i.change))} (${sign(i.rate)}${fmt2.format(i.rate)}%)</div>
      </div>`;
    })
    .join('');
}

// ---------- 관심 종목 ----------
function renderWatchlist() {
  const ul = $('#watchlist');
  $('#empty').hidden = state.watchlist.length > 0;
  $('#count').textContent = state.watchlist.length ? `${state.watchlist.length}개` : '';

  // 순서가 바뀌거나 종목이 추가/삭제되면 목록을 다시 만든다
  const current = [...ul.children].map((li) => li.dataset.code).join(',');
  if (current !== state.watchlist.join(',')) {
    ul.innerHTML = state.watchlist
      .map(
        (code) => `<li data-code="${code}">
          <div><div class="name"></div><div class="code">${code}</div></div>
          <div><div class="price num"></div><div class="change num"></div></div>
          <div class="rate num flat">-</div>
        </li>`,
      )
      .join('');
  }

  for (const li of ul.children) {
    const q = state.quotes.get(li.dataset.code);
    if (!q) continue;
    const c = dirClass(q.change);
    li.querySelector('.name').textContent = q.name;
    const priceEl = li.querySelector('.price');
    const prev = Number(priceEl.dataset.value);
    priceEl.textContent = q.price == null ? '-' : fmt.format(q.price);
    priceEl.className = `price num ${c}`;
    if (priceEl.dataset.value && q.price !== prev) {
      li.classList.remove('flash-up', 'flash-down');
      void li.offsetWidth; // 애니메이션 재시작
      li.classList.add(q.price > prev ? 'flash-up' : 'flash-down');
    }
    priceEl.dataset.value = q.price ?? '';
    const changeEl = li.querySelector('.change');
    changeEl.textContent = `${arrow(q.change)} ${fmt.format(Math.abs(q.change))}`;
    changeEl.className = `change num ${c}`;
    const rateEl = li.querySelector('.rate');
    rateEl.textContent = `${sign(q.rate)}${fmt2.format(q.rate)}%`;
    rateEl.className = `rate num ${c}`;
  }
}

function addStock(code) {
  if (!state.watchlist.includes(code)) {
    state.watchlist.push(code);
    saveWatchlist();
    renderWatchlist();
    refresh();
  }
}
function removeStock(code) {
  state.watchlist = state.watchlist.filter((c) => c !== code);
  state.quotes.delete(code);
  saveWatchlist();
  renderWatchlist();
}

// ---------- 시세 갱신 ----------
function renderStatus(quotes) {
  const status = quotes.find((q) => q.marketStatus)?.marketStatus;
  const el = $('#market-status');
  const open = status === 'OPEN';
  el.textContent = open ? '장중' : status === 'PREOPEN' ? '장 시작 전' : '장 마감';
  el.classList.toggle('open', open);
  $('#updated').textContent = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return open;
}

async function refresh() {
  clearTimeout(state.timer);
  let open = false;
  try {
    const [quoteRes, indices] = await Promise.all([
      state.watchlist.length ? api(`/api/quotes?codes=${state.watchlist.join(',')}`) : { quotes: [], pollingInterval: state.pollMs },
      api('/api/indices'),
    ]);
    for (const q of quoteRes.quotes) state.quotes.set(q.code, q);
    state.pollMs = Math.max(3000, quoteRes.pollingInterval ?? 7000);
    renderIndices(indices);
    renderWatchlist();
    open = renderStatus([...indices, ...quoteRes.quotes]);
    if (state.detailCode) renderDetailHeader();
    showError(null);
  } catch (err) {
    showError(`시세를 불러오지 못했습니다. 잠시 후 다시 시도합니다. (${err.message})`);
  }
  if (!document.hidden) state.timer = setTimeout(refresh, open ? state.pollMs : CLOSED_POLL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(state.timer);
  else refresh();
});

// ---------- 검색 ----------
const searchInput = $('#search-input');
const searchResults = $('#search-results');
let searchSeq = 0;
let searchDebounce;
let activeIndex = -1;

function closeSearch() {
  searchResults.hidden = true;
  searchResults.innerHTML = '';
  activeIndex = -1;
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) return closeSearch();
  searchDebounce = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const items = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (seq !== searchSeq) return;
      activeIndex = -1;
      searchResults.innerHTML = items.length
        ? items
            .map(
              (it) => `<li role="option" data-code="${it.code}">
                <span><strong>${escapeHtml(it.name)}</strong> <span class="muted">${it.code} · ${escapeHtml(it.market ?? '')}</span></span>
                ${state.watchlist.includes(it.code) ? '<span class="added">추가됨</span>' : ''}
              </li>`,
            )
            .join('')
        : '<li class="muted">검색 결과가 없습니다.</li>';
      searchResults.hidden = false;
    } catch {
      /* 검색 실패는 조용히 무시 */
    }
  }, 200);
});

function pickSearchResult(li) {
  if (!li?.dataset.code) return;
  addStock(li.dataset.code);
  searchInput.value = '';
  closeSearch();
}

searchResults.addEventListener('mousedown', (e) => {
  e.preventDefault();
  pickSearchResult(e.target.closest('li'));
});

searchInput.addEventListener('keydown', (e) => {
  const items = [...searchResults.querySelectorAll('li[data-code]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
  } else if (e.key === 'Enter') {
    pickSearchResult(items[Math.max(activeIndex, 0)]);
  } else if (e.key === 'Escape') {
    closeSearch();
  }
});
searchInput.addEventListener('blur', () => setTimeout(closeSearch, 100));

// ---------- 상세 & 차트 ----------
$('#watchlist').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-code]');
  if (li) openDetail(li.dataset.code);
});

function openDetail(code) {
  state.detailCode = code;
  state.detailRange = '1d';
  $('#detail').hidden = false;
  document.body.style.overflow = 'hidden';
  renderDetailHeader();
  setRange('1d');
}

function closeDetail() {
  state.detailCode = null;
  $('#detail').hidden = true;
  document.body.style.overflow = '';
}

$('#detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.detailCode) closeDetail();
});

// 상세 화면 하단에 "관심 종목에서 삭제" 버튼
const removeBtn = document.createElement('button');
removeBtn.className = 'icon-btn';
removeBtn.style.cssText = 'width:auto;padding:0 12px;margin-top:16px;font-size:13px;';
removeBtn.textContent = '관심 종목에서 삭제';
removeBtn.addEventListener('click', () => {
  removeStock(state.detailCode);
  closeDetail();
});
$('.detail-sheet').append(removeBtn);

function renderDetailHeader() {
  const q = state.quotes.get(state.detailCode);
  $('#detail-name').textContent = q?.name ?? state.detailCode;
  $('#detail-code').textContent = `${state.detailCode}${q?.market ? ` · ${q.market}` : ''}`;
  if (!q) return;
  const c = dirClass(q.change);
  $('#detail-price').textContent = q.price == null ? '-' : `${fmt.format(q.price)}원`;
  $('#detail-price').className = `big num ${c}`;
  $('#detail-change').innerHTML = `<span class="num ${c}">${arrow(q.change)} ${fmt.format(Math.abs(q.change))} (${sign(q.rate)}${fmt2.format(q.rate)}%)</span>`;
  const stats = [
    ['시가', q.open != null ? fmt.format(q.open) : '-'],
    ['고가', q.high != null ? fmt.format(q.high) : '-'],
    ['저가', q.low != null ? fmt.format(q.low) : '-'],
    ['전일 종가', q.price != null ? fmt.format(q.price - q.change) : '-'],
    ['거래량', q.volume != null ? fmt.format(q.volume) : '-'],
    ['거래대금', q.tradingValue ?? '-'],
  ];
  $('#detail-stats').innerHTML = stats
    .map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${escapeHtml(v)}</dd></div>`)
    .join('');
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-range]');
  if (btn) setRange(btn.dataset.range);
});

async function setRange(range) {
  state.detailRange = range;
  for (const b of document.querySelectorAll('.tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.range === range));
  }
  const code = state.detailCode;
  const chart = $('#chart');
  chart.innerHTML = '<div class="msg">불러오는 중…</div>';
  try {
    const points = await api(`/api/chart/${code}?range=${range}`);
    if (state.detailCode !== code || state.detailRange !== range) return;
    drawChart(chart, points, range);
  } catch {
    chart.innerHTML = '<div class="msg">차트를 불러오지 못했습니다.</div>';
  }
}

function formatTick(t, range) {
  if (range === '1d') return `${t.slice(8, 10)}:${t.slice(10, 12)}`;
  return `${Number(t.slice(4, 6))}/${Number(t.slice(6, 8))}`;
}

function drawChart(container, points, range) {
  if (!points.length) {
    container.innerHTML = '<div class="msg">표시할 데이터가 없습니다.</div>';
    return;
  }
  const W = container.clientWidth || 600;
  const H = container.clientHeight || 220;
  const pad = { l: 4, r: 56, t: 10, b: 22 };
  const q = state.quotes.get(state.detailCode);
  // 1일 차트는 전일 종가, 기간 차트는 시작 가격을 기준선으로 사용
  const base = range === '1d' && q?.price != null ? q.price - q.change : points[0].v;
  const values = points.map((p) => p.v);
  let min = Math.min(...values, base);
  let max = Math.max(...values, base);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => pad.l + (i / Math.max(points.length - 1, 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const last = points[points.length - 1].v;
  const color = last > base ? 'var(--up)' : last < base ? 'var(--down)' : 'var(--flat)';

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${H - pad.b}L${x(0).toFixed(1)},${H - pad.b}Z`;

  const yTicks = [max, (max + min) / 2, min]
    .map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${W - pad.r + 6}" y="${y(v) + 4}">${fmt.format(Math.round(v))}</text>`)
    .join('');
  const xIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xTicks = xIdx
    .map((i, k) => `<text class="axis" x="${x(i)}" y="${H - 4}" text-anchor="${['start', 'middle', 'end'][k]}">${formatTick(points[i].t, range)}</text>`)
    .join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="가격 차트">
    <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${yTicks}
    <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${y(base)}" y2="${y(base)}"/>
    <path d="${area}" fill="url(#fill)"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${xTicks}
    <g class="hover" visibility="hidden">
      <line x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--muted)" stroke-width="1"/>
      <circle r="4" fill="${color}"/>
      <text class="tip" y="${pad.t + 2}"></text>
    </g>
  </svg>`;

  const svg = container.querySelector('svg');
  const hover = svg.querySelector('.hover');
  const move = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
    const p = points[Math.min(Math.max(i, 0), points.length - 1)];
    const idx = points.indexOf(p);
    hover.setAttribute('visibility', 'visible');
    hover.querySelector('line').setAttribute('x1', x(idx));
    hover.querySelector('line').setAttribute('x2', x(idx));
    hover.querySelector('circle').setAttribute('cx', x(idx));
    hover.querySelector('circle').setAttribute('cy', y(p.v));
    const tip = hover.querySelector('text');
    tip.textContent = `${formatTick(p.t, range)}  ${fmt.format(p.v)}`;
    const right = x(idx) > W / 2;
    tip.setAttribute('x', right ? x(idx) - 8 : x(idx) + 8);
    tip.setAttribute('text-anchor', right ? 'end' : 'start');
  };
  svg.addEventListener('pointermove', (e) => move(e.clientX));
  svg.addEventListener('pointerleave', () => hover.setAttribute('visibility', 'hidden'));
}

// ---------- 시작 ----------
renderWatchlist();
refresh();
