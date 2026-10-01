import { CATEGORIES } from './words.js';

const $ = (s) => document.querySelector(s);
const ALL = { id: 'all', name: '모두', icon: '🌈', color: '#FFE3F1',
  words: CATEGORIES.flatMap((c) => c.words.map((w) => ({ ...w, color: c.color }))) };

// ---------- 설정 (브라우저에 저장) ----------
const DEFAULTS = { autoSpeak: true, speakSound: true, showWord: true, shuffle: false, choices: 2, rate: 0.8 };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('wordcards.settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('wordcards.settings', JSON.stringify(settings)); } catch {} };

// ---------- 음성 ----------
// 안드로이드 앱에서는 WebView가 Web Speech API를 지원하지 않아 기기의 TTS 엔진(네이티브 플러그인)을 씁니다.
const native = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
const nativeTTS = native?.TextToSpeech;

let koVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ko'));
  // 가능하면 자연스러운(온라인/고품질) 목소리를 고릅니다.
  koVoice = voices.find((v) => /natural|online|premium|enhanced|yuna|sunhi/i.test(v.name)) || voices[0] || null;
}
if (!nativeTTS && 'speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
function stopSpeaking() {
  if (nativeTTS) nativeTTS.stop().catch(() => {});
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function speak(text) {
  if (!text) return;
  if (nativeTTS) {
    // queueStrategy 0 = 앞의 말을 끊고 바로 읽기
    nativeTTS.speak({ text, lang: 'ko-KR', rate: Number(settings.rate), pitch: 1.15, queueStrategy: 0 })
      .catch(() => {});
    return;
  }
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = Number(settings.rate);
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}
const sayWord = (w) => speak(settings.speakSound && w.sound ? `${w.word}. ${w.sound}!` : w.word);

// ---------- 화면 전환 ----------
let current = 'home';
function show(id) {
  current = id;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'home') stopSpeaking();
}
document.querySelectorAll('.home-btn').forEach((b) => b.addEventListener('click', () => show('home')));

const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ---------- 홈 ----------
let mode = 'cards';
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.mode').forEach((m) => m.classList.toggle('active', m === b));
}));

const catBox = $('#categories');
for (const cat of [ALL, ...CATEGORIES]) {
  const b = document.createElement('button');
  b.className = 'cat';
  b.style.background = cat.color;
  b.innerHTML = `<span class="ic">${cat.icon}</span><span>${cat.name}</span>`;
  b.addEventListener('click', () => (mode === 'cards' ? startCards(cat) : startQuiz(cat)));
  catBox.append(b);
}

// ---------- 카드 보기 ----------
const cardEl = $('#card');
let deck = [], idx = 0, deckColor = '';

function startCards(cat) {
  deck = settings.shuffle || cat === ALL ? shuffled(cat.words) : [...cat.words];
  deckColor = cat.color;
  idx = 0;
  show('cards');
  renderCard();
}

// 사진이 있으면 사진을, 없으면(또는 못 읽으면) 이모지를 보여줍니다.
function picture(el, w, cls) {
  el.innerHTML = '';
  if (w.photo) {
    const img = document.createElement('img');
    img.src = `photos/${w.photo}.jpg`;
    img.alt = '';
    img.draggable = false;
    img.className = cls;
    img.onerror = () => { el.textContent = w.emoji; };
    el.append(img);
  } else {
    el.textContent = w.emoji;
  }
}

function renderCard() {
  const w = deck[idx];
  picture($('#card-emoji'), w, 'photo');
  $('#card-word').textContent = w.word;
  $('#card-sound').textContent = settings.speakSound && w.sound ? w.sound : '';
  cardEl.classList.toggle('hide-word', !settings.showWord);
  cardEl.style.setProperty('--cat', w.color || deckColor);
  cardEl.setAttribute('aria-label', w.word);
  $('#progress').innerHTML = deck.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
  if (settings.autoSpeak) sayWord(w);
}

let animating = false;
function go(step) {
  if (animating) return;
  animating = true;
  cardEl.classList.add(step > 0 ? 'out-left' : 'out-right');
  setTimeout(() => {
    idx = (idx + step + deck.length) % deck.length;  // 끝에 가면 처음으로 돌아갑니다
    cardEl.classList.add('no-anim');
    cardEl.classList.remove('out-left', 'out-right');
    renderCard();
    requestAnimationFrame(() => { cardEl.classList.remove('no-anim'); animating = false; });
  }, 220);
}
$('#next').addEventListener('click', () => go(1));
$('#prev').addEventListener('click', () => go(-1));

// 카드를 누르면 다시 읽어주고 통통 튀는 효과
cardEl.addEventListener('click', () => {
  if (swiped) return;
  sayWord(deck[idx]);
  cardEl.classList.remove('bounce');
  void cardEl.offsetWidth;
  cardEl.classList.add('bounce');
});

// 좌우로 밀어서 넘기기
let startX = null, swiped = false;
cardEl.addEventListener('pointerdown', (e) => { startX = e.clientX; swiped = false; });
cardEl.addEventListener('pointerup', (e) => {
  if (startX === null) return;
  const dx = e.clientX - startX;
  startX = null;
  if (Math.abs(dx) > 60) { swiped = true; go(dx < 0 ? 1 : -1); }
});

// ---------- 찾기 놀이 ----------
let pool = [], answer = null, locked = false, stars = 0;

function startQuiz(cat) {
  pool = cat.words;
  stars = 0;
  $('#stars').textContent = '';
  show('quiz');
  nextQuestion();
}

function nextQuestion() {
  locked = false;
  const n = Math.min(Number(settings.choices), pool.length);
  answer = pool[Math.floor(Math.random() * pool.length)];
  // 같은 이름(예: 과일 배 / 탈것 배)이 선택지에 같이 나오지 않게 합니다.
  const others = shuffled(pool.filter((w) => w.word !== answer.word)).slice(0, n - 1);
  const options = shuffled([answer, ...others]);

  const box = $('#choices');
  const cols = n <= 2 ? (innerWidth > innerHeight ? 2 : 1) : 2;
  box.style.setProperty('--cols', cols);
  box.style.setProperty('--size', n <= 2 ? 'min(30vw, 24dvh, 180px)' : 'min(22vw, 18dvh, 140px)');
  box.innerHTML = '';
  for (const w of options) {
    const b = document.createElement('button');
    b.className = 'choice';
    picture(b, w, 'photo');
    b.setAttribute('aria-label', w.word);
    b.addEventListener('click', () => pick(b, w));
    box.append(b);
  }
  $('#quiz-prompt span').textContent = `${answer.word} 어디 있어?`;
  setTimeout(() => speak(`${answer.word} 어디 있어?`), 250);
}

function pick(btn, w) {
  if (locked) return;
  if (w === answer) {
    locked = true;
    btn.classList.add('correct');
    document.querySelectorAll('.choice').forEach((c) => c !== btn && c.classList.add('dim'));
    stars = (stars % 5) + 1;
    $('#stars').textContent = '⭐'.repeat(stars);
    speak(`맞았어! ${answer.word}${settings.speakSound && answer.sound ? `, ${answer.sound}` : ''}!`);
    cheer();
    setTimeout(nextQuestion, 2200);
  } else {
    // 틀려도 혼내지 않고, 고른 그림의 이름을 알려줍니다.
    btn.classList.remove('wrong');
    void btn.offsetWidth;
    btn.classList.add('wrong');
    speak(`이건 ${w.word}야. ${answer.word} 찾아볼까?`);
  }
}
$('#quiz-prompt').addEventListener('click', () => answer && speak(`${answer.word} 어디 있어?`));

function cheer() {
  const box = $('#cheer');
  const bits = ['⭐', '🎉', '💖', '✨', '🌟', '🎈'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.textContent = bits[i % bits.length];
    s.style.left = `${Math.random() * 90}%`;
    s.style.top = `${60 + Math.random() * 35}%`;
    s.style.animationDelay = `${Math.random() * 0.3}s`;
    box.append(s);
    setTimeout(() => s.remove(), 1800);
  }
}

// ---------- 부모 설정: 1.5초 길게 눌러야 열림 (아이가 실수로 못 열게) ----------
const dlg = $('#settings');
const form = dlg.querySelector('form');
const parentBtn = $('#parent-btn');
let holdTimer = null, holdStart = 0;
function holdTick() {
  const p = Math.min((performance.now() - holdStart) / 1500, 1);
  parentBtn.style.setProperty('--p', p);
  if (p >= 1) { cancelHold(); openSettings(); return; }
  holdTimer = requestAnimationFrame(holdTick);
}
function cancelHold() { cancelAnimationFrame(holdTimer); holdTimer = null; parentBtn.style.setProperty('--p', 0); }
parentBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); holdStart = performance.now(); holdTimer = requestAnimationFrame(holdTick); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => parentBtn.addEventListener(ev, cancelHold));

function openSettings() {
  for (const [k, v] of Object.entries(settings)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  dlg.showModal();
}
form.addEventListener('change', () => {
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
  }
  saveSettings();
});
$('#test-voice').addEventListener('click', () => speak('안녕! 강아지. 멍멍!'));

// 사진 출처 (위키미디어 공용 사진은 저작자 표시가 필요합니다)
$('#show-credits').addEventListener('click', async () => {
  const box = $('#credits');
  if (!box.hidden) { box.hidden = true; return; }
  try {
    const credits = await (await fetch('photos/credits.json')).json();
    box.innerHTML = '<p>사진: 위키미디어 공용(Wikimedia Commons)</p>' + Object.values(credits)
      .map((c) => `<div>${c.word} — <a href="${c.page}" target="_blank" rel="noopener">${c.title.replace(/^File:/, '')}</a> · ${c.author || '작자 미상'} · ${c.license}</div>`)
      .join('');
  } catch { box.textContent = '사진 출처 정보를 읽지 못했어요.'; }
  box.hidden = false;
});

// 길게 눌러 메뉴 뜨는 것 막기
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 안드로이드 앱 전용 ----------
if (native) {
  // 뒤로 가기: 설정창 닫기 → 홈으로 → (홈에서는) 앱을 백그라운드로. 아이가 실수로 앱을 꺼버리지 않게 합니다.
  native.App?.addListener('backButton', () => {
    if (dlg.open) dlg.close();
    else if (current !== 'home') show('home');
    else native.App.minimizeApp();
  });
  native.App?.addListener('pause', stopSpeaking);
}

// ---------- 오프라인 지원 (웹 버전만. 앱은 파일이 이미 기기 안에 있음) ----------
if (!native && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
