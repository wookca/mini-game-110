import { WIDTH, HEIGHT, Input, drawHUD } from "./core.js";
import { Flow } from "./flow.js";

import { GameA } from "./games/GameA.js";
import { GameB } from "./games/GameB.js";
import { GameC } from "./games/GameC.js";

// ---------- DOM ----------
const canvas = document.getElementById("game");
if (!canvas) throw new Error('Canvas not found. Check index.html has <canvas id="game">');

const ctx2d = canvas.getContext("2d");
if (!ctx2d) throw new Error("2D context not available.");

// ✅ 캔버스 내부 좌표계를 core.js의 WIDTH/HEIGHT로 고정 (왜곡 방지)
canvas.width = WIDTH;
canvas.height = HEIGHT;

const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");
if (!btnLeft || !btnRight) {
  throw new Error('Control buttons not found. Check index.html has id="btnLeft"/"btnRight".');
}

const cutsceneEl = document.getElementById("cutscene");
if (!cutsceneEl) throw new Error('Cutscene video not found. Check index.html has <video id="cutscene">');

const titleEl = document.getElementById("titleVideo");
if (!titleEl) throw new Error('Title video not found. Check index.html has <video id="titleVideo">');

// overlay elements (index.html에 있어야 함)
const overlayEl = document.getElementById("cutsceneOverlay");
const overlayTitleEl = document.getElementById("cutsceneOverlayTitle");
const overlayScoreEl = document.getElementById("cutsceneScore");
const overlayHintEl = document.getElementById("cutsceneOverlayHint");
if (!overlayEl || !overlayTitleEl || !overlayScoreEl || !overlayHintEl) {
  throw new Error("cutscene overlay elements not found. Check index.html overlay markup.");
}

// ---------- Stage Scale (표시용 540x960을 화면에 맞춰 스케일) ----------
const stageEl = document.getElementById("stage");
if (!stageEl) throw new Error('Stage not found. Check index.html has <div id="stage">');

const BASE_STAGE_W = 540;
const BASE_STAGE_H = 960;

function resizeStage() {
  const vv = window.visualViewport;

  // ✅ 모바일에서 주소창/툴바로 innerHeight가 흔들리는 문제를 피함
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;

  const scale = Math.min(vw / BASE_STAGE_W, vh / BASE_STAGE_H);
  stageEl.style.transform = `scale(${scale})`;
}

resizeStage();
window.addEventListener("resize", resizeStage);
window.addEventListener("orientationchange", resizeStage);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resizeStage);
  window.visualViewport.addEventListener("scroll", resizeStage);
}


// ---------- Input ----------
const input = new Input(btnLeft, btnRight);

// shared context
const shared = {
  canvas,
  ctx: ctx2d,
  WIDTH,
  HEIGHT,
};

// ---------- Flow ----------
const games = [GameA, GameB, GameC];
const flow = new Flow(games, { stageSeconds: 10 });

// ---------- State ----------
const STATE = {
  TITLE: "TITLE",
  OPENING: "OPENING",
  PLAY: "PLAY",
  GAMEOVER: "GAMEOVER", // 영상 끝난 뒤 멈춘 화면에서 대기
};
let state = STATE.TITLE;

// ---------- Analytics helpers ----------
function gaEvent(name, params = {}) {
  // gtag가 아직 없거나 로드 실패해도 게임은 계속 돌아가게
  window.gtag?.("event", name, params);
}

// 한 판에서 gameover 이벤트가 여러 프레임 찍히는 것 방지용
let gameOverLogged = false;

// ---------- Keys ----------
let restartPressed = false;
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "q" || e.key === "Q") restartPressed = true;
});


// ---------- Audio unlock ----------
let audioUnlocked = false;
function unlockAudio() {
  audioUnlocked = true;
  cutsceneEl.muted = false;
  titleEl.muted = false;
}

// ---------- Score counting ----------
let lastScoreShown = 0; // 이전 스테이지/이전 표시 점수
let animToken = 0;

function animateNumber(el, from, to, durationMs = 900) {
  const token = ++animToken;

  from = Math.floor(from ?? 0);
  to = Math.floor(to ?? 0);

  if (from === to) {
    el.textContent = String(to);
    return;
  }

  const start = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    if (token !== animToken) return;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = easeOutCubic(t);
    const v = Math.round(from + (to - from) * eased);
    el.textContent = String(v);
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ---------- Overlay controls ----------
function showOverlay({ title, fromScore, toScore, hintText = "", showHint = false }) {
  overlayTitleEl.textContent = title ?? "Score";
  overlayScoreEl.textContent = String(Math.floor(fromScore ?? 0));

  overlayHintEl.textContent = hintText;
  overlayEl.classList.toggle("show-hint", !!showHint);

  overlayEl.classList.add("show");
  animateNumber(overlayScoreEl, fromScore ?? 0, toScore ?? 0, 900);
}

function hideOverlay() {
  animToken++;
  overlayEl.classList.remove("show");
  overlayEl.classList.remove("show-hint");
  overlayHintEl.textContent = "";
}

// ---------- Video helpers ----------
let transitionLock = false;

// ✅ 비디오 준비될 때까지 캔버스 렌더를 잠깐 멈추기 위한 플래그
let renderHold = false;

// ✅ Method 1: 실제 video 파이프라인 워밍업 (가장 효과 좋음)
const warmMap = new Map();

function warmupVideoElement(src) {
  if (!src) return null;
  if (warmMap.has(src)) return warmMap.get(src);

  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.crossOrigin = "anonymous";
  v.src = src;
  v.load();

  const ready = new Promise((resolve) => {
    const ok = () => resolve(true);
    const fail = () => resolve(false);
    v.addEventListener("loadeddata", ok, { once: true });
    v.addEventListener("canplay", ok, { once: true });
    v.addEventListener("error", fail, { once: true });
  });

  const entry = { v, ready };
  warmMap.set(src, entry);
  return entry;
}

function warmupAllVideos() {
  // 너가 이미 쓰는 Cloudinary URL 목록 그대로 재사용
  const list = [
    TITLE_SRC,
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/A_opening_cgpss3.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847034/A_finish_havlxa.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847030/B_opening_lmj8ie.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847035/B_finish_stvt9m.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/C_opening_lbrvrv.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/C_finish_bon4qw.mp4",
  ];

  list.forEach((u) => warmupVideoElement(u));
}


function holdRenderOn() {
  renderHold = true;
}
function holdRenderOff() {
  renderHold = false;
}


// ---------- Cache preloader (Method 2) ----------
async function preloadVideoToCache(src) {
  if (!src) return;
  const url = typeof videoUrl === "function" ? videoUrl(src) : src;

  // CacheStorage 지원 안 되는 브라우저면 패스
  if (!("caches" in window)) return;

  const cache = await caches.open("video-cache-v1");
  const hit = await cache.match(url);
  if (hit) return;

  const res = await fetch(url, { mode: "cors" });
  if (res.ok) await cache.put(url, res);
}

function preloadAllCutscenesToCache() {
  const list = [
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767846969/title_mkwkqw.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/A_opening_cgpss3.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847034/A_finish_havlxa.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847030/B_opening_lmj8ie.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847035/B_finish_stvt9m.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/C_opening_lbrvrv.mp4",
    "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/C_finish_bon4qw.mp4",
  ];

  // 동시에 너무 많이 때리지 않도록 “조금씩” 시작(그래도 간단 버전)
  list.forEach((p) => preloadVideoToCache(p));
}


function showVideo(el, src, { loop = false, muted = false } = {}) {
  // ✅ 비디오가 준비될 때까지 게임 렌더를 잠깐 멈춤 (게임 화면이 미리 비치지 않게)
  holdRenderOn();

  // 먼저 설정만 해두고(아직 show 안 함)
  el.classList.remove("show");
  el.loop = loop;
  el.src = src;
  el.currentTime = 0;
  el.muted = muted;

  const onReady = () => {
    el.classList.add("show");
    holdRenderOff(); // ✅ 비디오가 보이기 시작하면 렌더 재개
  };

  const onFail = () => {
    holdRenderOff(); // 실패해도 렌더는 풀어줌
  };

  el.addEventListener("loadeddata", onReady, { once: true });
  el.addEventListener("canplay", onReady, { once: true });
  el.addEventListener("error", onFail, { once: true });

  return el.play().catch(() => {
    onFail();
  });
}


function hideVideo(el) {
  holdRenderOff(); // ✅ 안전장치
  el.pause();
  el.classList.remove("show");
  el.removeAttribute("src");
  el.load();
}

/**
 * 컷씬 재생
 * - showOverlayOpt: 오버레이 띄울 옵션
 * - keepOverlayOnEnd: 영상이 끝나도 오버레이 유지
 * - freezeOnEnd: 영상이 끝나도 마지막 프레임에서 화면 고정 (src/표시 유지)
 */
function playCutscene(
  src,
  {
    skippable = true,
    showOverlayOpt = null,
    keepOverlayOnEnd = false,
    freezeOnEnd = false,
  } = {}
) {
  if (!src) return Promise.resolve();

  const muted = !audioUnlocked;

  return new Promise((resolve) => {
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;

      cutsceneEl.removeEventListener("ended", onEnd);
      cutsceneEl.removeEventListener("error", onEnd);

      if (freezeOnEnd) {
        cutsceneEl.pause();
        cutsceneEl.classList.add("show");
      } else {
        hideVideo(cutsceneEl);
      }

      if (!keepOverlayOnEnd) hideOverlay();
      resolve();
    };

    const onEnd = () => cleanup();

    cutsceneEl.addEventListener("ended", onEnd);
    cutsceneEl.addEventListener("error", onEnd);

    if (showOverlayOpt) showOverlay(showOverlayOpt);
    else hideOverlay();

    showVideo(cutsceneEl, src, { loop: false, muted });
  });
}

async function doStageTransition({ fromGame, toGame, scoreFrom, scoreTo }) {
  await playCutscene(fromGame?.finishVideo, {
    skippable: true,
    showOverlayOpt: {
      title: "Total Score",
      fromScore: scoreFrom,
      toScore: scoreTo,
      showHint: false,
    },
    keepOverlayOnEnd: false,
    freezeOnEnd: false,
  });

  if (typeof flow.advance === "function") flow.advance(shared);
  else if (typeof flow.next === "function") flow.next(shared);

  const nextGame = toGame ?? flow.current;
  await playCutscene(nextGame?.openingVideo, { skippable: true });

  lastScoreShown = scoreTo;
}

// ---------- Title ----------
const TITLE_SRC = "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767846969/title_mkwkqw.mp4";

function startTitle() {
  state = STATE.TITLE;
  showVideo(titleEl, TITLE_SRC, { loop: true, muted: true });

  // ✅ 메인(타이틀)에서 영상들을 미리 다운로드해서 캐시에 넣기 시작
  preloadAllCutscenesToCache();
warmupAllVideos(); // ✅ 추가

  lastScoreShown = 0;
  hideOverlay();
}

async function startGameFromTitle() {
  if (transitionLock) return;
  transitionLock = true;

  unlockAudio();
  hideVideo(titleEl);

  flow.start(shared);

  state = STATE.OPENING;
  await playCutscene(flow.current?.openingVideo, { skippable: true });

  state = STATE.PLAY;
  transitionLock = false;
}

function onAnyStartInput(e) {
  if (state !== STATE.TITLE) return;

  // 2) "아무 키 눌러 게임 실행" 이벤트
  const method =
    e?.type === "keydown" ? "keyboard" :
    e?.currentTarget?.id === "btnLeft" ? "btn_left" :
    e?.currentTarget?.id === "btnRight" ? "btn_right" :
    "unknown";

  gaEvent("game_start", { method });

  startGameFromTitle();
}
window.addEventListener("keydown", onAnyStartInput);
btnLeft.addEventListener("pointerdown", onAnyStartInput);
btnRight.addEventListener("pointerdown", onAnyStartInput);


// ---------- GameOver sequence ----------
async function triggerGameOverSequence() {
  if (transitionLock) return;
  transitionLock = true;

  const fromScore = lastScoreShown;
  const toScore = flow.score;

  const finishSrc = flow.current?.finishVideo;

  if (finishSrc) {
    await playCutscene(finishSrc, {
      skippable: true,
      showOverlayOpt: {
        title: "GAME OVER",
        fromScore,
        toScore,
        hintText: "Press Q to Restart",
        showHint: true,
      },
      keepOverlayOnEnd: true,
      freezeOnEnd: true,
    });
  } else {
    showOverlay({
      title: "GAME OVER",
      fromScore,
      toScore,
      hintText: "Press Q to Restart",
      showHint: true,
    });
  }

  state = STATE.GAMEOVER;
  lastScoreShown = toScore;
  transitionLock = false;
}

// ---------- Render Helpers ----------
function clear() {
  ctx2d.clearRect(0, 0, WIDTH, HEIGHT);
  ctx2d.fillStyle = "#ffffff";
  ctx2d.fillRect(0, 0, WIDTH, HEIGHT);
}

// ---------- Main Loop ----------
let last = performance.now();

// ✅ FPS 상한 (원하면 30으로 바꿔도 됨)
const FPS_CAP = 60;
const FRAME_MS = 1000 / FPS_CAP;
let lastFrameTick = 0;

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  clear();

  if (state === STATE.PLAY && !transitionLock) {
    const prevScoreForThisClear = lastScoreShown;
    const ev = flow.update(shared, dt, input);

    if (ev?.transitioned && ev.status === "cleared") {
      transitionLock = true;
      state = STATE.OPENING;

      const afterScore = flow.score;

      doStageTransition({
        fromGame: ev.from,
        toGame: ev.to,
        scoreFrom: prevScoreForThisClear,
        scoreTo: afterScore,
      }).finally(() => {
        state = STATE.PLAY;
        transitionLock = false;
      });
    }

// 게임 오버 감지
if (flow.isGameOver) {
  if (!gameOverLogged) {
    gameOverLogged = true;

    // 3) 어떤 게임에서 가장 많이 죽는지
    gaEvent("game_death", {
      game_id: flow.current?.id ?? "unknown",
      stage_index: flow.stageIndex,
      score: flow.score,
    });

    // 4) 게임 종료 후 토탈 스코어(평균은 GA에서 자동으로 평균 계산)
    gaEvent("run_end", {
      final_score: flow.score,
      final_stage: flow.stageIndex,
    });
  }

  triggerGameOverSequence();
}

  }

if (state !== STATE.TITLE && !renderHold) {
  flow.current?.render?.(ctx2d);

  drawHUD(ctx2d, {
    stageName: flow.current?.name ?? flow.current?.id ?? "stage",
    stageIndex: flow.stageIndex,
    timeLeft: flow.timeLeft,
    stageSeconds: flow.stageSeconds,
    score: flow.score,
    speedLevel: flow.speedLevel,
  });
}


  if (state === STATE.GAMEOVER && restartPressed) {
    restartPressed = false;

    // 5) Q로 재시작
    gaEvent("game_restart", { from_score: lastScoreShown });
    gameOverLogged = false; // 다음 판의 gameover 로그를 다시 찍을 수 있게 초기화


    if (transitionLock) return;
    transitionLock = true;

    hideVideo(cutsceneEl);
    hideVideo(titleEl);
    hideOverlay();

    if (typeof flow.restartAll === "function") flow.restartAll(shared);
    else flow.start(shared);

    lastScoreShown = 0;

    (async () => {
      state = STATE.OPENING;
      await playCutscene(flow.current?.openingVideo, { skippable: true });
      state = STATE.PLAY;
      transitionLock = false;
    })();
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

startTitle();
requestAnimationFrame(frame);

function updateOverlayTop() {
  const stage = document.getElementById("stage");
  if (!stage) return;

  const rect = stage.getBoundingClientRect();
  const topPx = Math.round(rect.height * 0.14); // 여기 값 바꾸면 바로 반영됨

  stage.style.setProperty("--overlay-top", `${topPx}px`);
}

updateOverlayTop();
window.addEventListener("resize", updateOverlayTop);
window.addEventListener("orientationchange", updateOverlayTop);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateOverlayTop);
  window.visualViewport.addEventListener("scroll", updateOverlayTop);
}
