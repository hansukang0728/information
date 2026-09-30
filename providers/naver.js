// 네이버 증권 시세 제공자.
// 공식 공개 API가 아니므로 개인 용도로만 사용하고, 요청 빈도를 낮게 유지하세요.
// 다른 제공자(예: 한국투자증권 KIS API)로 바꾸려면 같은 함수들을 가진 파일을 만들어
// server.js 의 import 만 교체하면 됩니다.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (stock-board personal app)',
  Accept: 'application/json',
};

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`upstream ${res.status}: ${url}`);
  return res.json();
}

const toNumber = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// 상승(2), 상한(1)이면 +1, 하락(5), 하한(4)이면 -1, 보합(3)이면 0
function direction(code) {
  if (code === '1' || code === '2') return 1;
  if (code === '4' || code === '5') return -1;
  return 0;
}

function normalizeQuote(d) {
  const dir = direction(d.compareToPreviousPrice?.code);
  const change = Math.abs(toNumber(d.compareToPreviousClosePrice) ?? 0) * dir;
  const rate = Math.abs(toNumber(d.fluctuationsRatio) ?? 0) * dir;
  return {
    code: d.itemCode,
    name: d.stockName ?? d.itemCode,
    market: d.stockExchangeType?.name ?? null,
    price: toNumber(d.closePrice),
    change,
    rate,
    open: toNumber(d.openPrice),
    high: toNumber(d.highPrice),
    low: toNumber(d.lowPrice),
    volume: toNumber(d.accumulatedTradingVolume),
    tradingValue: d.accumulatedTradingValue ?? null,
    marketStatus: d.marketStatus ?? null, // OPEN / CLOSE / PREOPEN ...
    tradedAt: d.localTradedAt ?? null,
  };
}

export async function getQuotes(codes) {
  if (codes.length === 0) return { quotes: [], pollingInterval: 7000 };
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.join(',')}`;
  const data = await getJson(url);
  return {
    quotes: (data.datas ?? []).map(normalizeQuote),
    pollingInterval: data.pollingInterval ?? 7000,
  };
}

export async function getIndices(codes = ['KOSPI', 'KOSDAQ', 'KPI200']) {
  const url = `https://polling.finance.naver.com/api/realtime/domestic/index/${codes.join(',')}`;
  const data = await getJson(url);
  return (data.datas ?? []).map((d) => ({
    ...normalizeQuote(d),
    name: d.stockName ?? d.itemCode,
  }));
}

export async function search(query) {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`;
  const data = await getJson(url);
  return (data.items ?? [])
    .filter((it) => it.nationCode === 'KOR' && /^\d{6}$/.test(it.code))
    .slice(0, 10)
    .map((it) => ({ code: it.code, name: it.name, market: it.typeName }));
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// range: '1d' (당일 분봉), '3m', '1y' (일봉)
export async function getChart(code, range = '1d') {
  const now = new Date();
  if (range === '1d') {
    // 오늘 거래가 없으면(주말·공휴일) 최근 7일 중 마지막 거래일의 분봉을 사용
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const url =
      `https://api.stock.naver.com/chart/domestic/item/${code}/minute` +
      `?startDateTime=${ymd(start)}0000&endDateTime=${ymd(now)}2359`;
    const rows = await getJson(url);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const lastDay = rows[rows.length - 1].localDateTime.slice(0, 8);
    return rows
      .filter((r) => r.localDateTime.startsWith(lastDay))
      .map((r) => ({ t: r.localDateTime, v: r.currentPrice }));
  }
  const days = range === '1y' ? 365 : 92;
  const start = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const url =
    `https://api.stock.naver.com/chart/domestic/item/${code}/day` +
    `?startDateTime=${ymd(start)}0000&endDateTime=${ymd(now)}2359`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ t: r.localDate, v: r.closePrice }));
}
