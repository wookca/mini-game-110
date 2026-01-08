import { WIDTH, HEIGHT, clamp } from "../core.js";

export const GameA = {
  id: "lane-run",
  name: "달려달려 지떼링",

  openingVideo: "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847032/A_opening_cgpss3.mp4",
  finishVideo: "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847034/A_finish_havlxa.mp4",

  init(ctx) {
    this._ctx = ctx;

    // ===== BG =====
    this.bg1 = new Image();
    this.bg1.src = "./assets/img/A_BG1.png"; // 620*500

    this.bg2 = new Image();
    this.bg2.src = "./assets/img/A_BG2.png"; // 1877*500

    this.bg1W = 620;
    this.bg2W = 1877;
    this.bgH = 500;

    this.bottomGap = 500;

    this.trackTopInImg = 140;
    this.trackBottomInImg = 340;

    this.laneCount = 4;
    this.laneExtraGapPx = 10;

    this.clearColor = "#FCF6E0";

    // ===== ✅ 캐릭터 이미지 (GameA) =====
    // 이미지: 400*600
    this.chImg = new Image();
    this.chImg.src = "./assets/img/A_CH.png";
    this.chW = 300;
    this.chH = 450;

    // ✅ 캐릭터 시각 위치 보정(발 위치 느낌 조절)
    // +면 아래로(발이 더 바닥에 붙음), -면 위로
    this.chVisualYOffset = 35;

    // ===== ✅ 오브젝트 이미지 로드 (A_OB1~3) =====
    this.obImgs = [];
    for (let i = 1; i <= 3; i++) {
      const img = new Image();
      img.src = `./assets/img/A_OB${i}.png`;
      this.obImgs.push(img);
    }

    // 오브젝트 크기 (렌더 기준)
    this.obW = 200;
    this.obH = 300;

    // ✅ OB가 너무 위에 떠 보일 때 아래로 내리기(시각 보정)
    this.obVisualYOffset = 30;

    // ✅ OB 판정(히트박스) 가로폭 줄이기: 양쪽에서 줄일 픽셀 수
    this.obHitPaddingX = 80;

    // ✅ 위 레일일수록 OB를 더 오른쪽으로 밀기(겹침 완화/원근감)
    this.obLaneXStep = 80;
  },

  enter({ speedMul, stageSeconds = 10 }) {
    this.stageSeconds = stageSeconds;

    this.startHold = 0.5;

    this.bgY = HEIGHT - this.bottomGap - this.bgH;
    this.laneYs = this._buildLaneYs();

    // ✅ 플레이어 판정(히트박스) 크기: 이건 "충돌 판정"에만 사용됨
    // (이미지는 chW/chH로 따로 그림)
    this.p = {
      lane: 2,
      x: Math.floor(WIDTH * 0.18),
      w: 120,
      h: 150,
    };

    this.obstacles = [];
    this.spawnT = 0;

// ✅ GameA 전체 속도 튜닝 값
const TUNE = 0.9; // ← 0.85~0.95 사이로 취향 조절

this.baseSpeed = 800;
this.speed = this.baseSpeed * speedMul * TUNE;

this.laneChangeCooldown = 0;
this.laneChangeCdSec = 0.08;

this.scorePending = 0;

this.bgScrollX = 0;
this.bgScrollSpeed = this.speed * 1.1;

  },

  _buildLaneYs() {
    const top = this.bgY + this.trackTopInImg;
    const bottom = this.bgY + this.trackBottomInImg;

    const n = this.laneCount;
    const baseStep = (bottom - top) / (n - 1);
    const center = (n - 1) / 2;

    const ys = [];
    for (let i = 0; i < n; i++) {
      const baseY = top + baseStep * i;
      const offset = (i - center) * this.laneExtraGapPx;
      ys.push(baseY + offset);
    }
    return ys;
  },

  update(dt, input) {
    this.scorePending = 0;

    this.bgY = HEIGHT - this.bottomGap - this.bgH;
    this.laneYs = this._buildLaneYs();

    if (this.startHold > 0) {
      this.startHold -= dt;
      this.bgScrollX = 0;
      return { done: false, success: true, scoreDelta: 0 };
    }

    if (this.bg1.complete && this.bg2.complete) {
      this.bgScrollX += this.bgScrollSpeed * dt;
    }

    if (this.laneChangeCooldown > 0) this.laneChangeCooldown -= dt;

    // ✅ 방향키 역할 반대로: 왼쪽=아래, 오른쪽=위
    if (this.laneChangeCooldown <= 0) {
      if (input.state.leftPressed) {
        this.p.lane = clamp(this.p.lane + 1, 0, this.laneCount - 1);
        this.laneChangeCooldown = this.laneChangeCdSec;
      } else if (input.state.rightPressed) {
        this.p.lane = clamp(this.p.lane - 1, 0, this.laneCount - 1);
        this.laneChangeCooldown = this.laneChangeCdSec;
      }
    }

    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this._spawnObstacle();
      this.spawnT = 0.8 + Math.random() * 0.2;
    }

    const pr = this._playerRect();

    for (const o of this.obstacles) {
      o.x -= this.speed * dt;

      // ✅ [점수] OB가 플레이어를 "완전히 지나가면" +2점 (한 번만)
      if (!o.scored && o.x + o.w < this.p.x) {
        o.scored = true;
        this.scorePending += 2;
      }

      // 충돌은 같은 레인일 때만
      if (o.lane === this.p.lane) {
        const or = this._obstacleHitRect(o);
        if (this._aabb(pr, or)) {
          return { done: true, success: false, scoreDelta: 0 };
        }
      }
    }

    // 화면 밖 OB 제거
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -500);

    return { done: false, success: true, scoreDelta: this.scorePending };
  },

  render(ctx) {
    ctx.save();

    // clear
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // BG scroll
    const s = this.bgScrollX;

    if (this.bg1.complete) ctx.drawImage(this.bg1, -s, this.bgY);

    const startX = this.bg1W - s;
    if (this.bg2.complete) {
      let x = startX;
      while (x < WIDTH) {
        ctx.drawImage(this.bg2, x, this.bgY);
        x += this.bg2W;
      }
    }

    // ✅ 레이어 해결: OB + Player를 y(레인) 기준으로 정렬 렌더링
    const drawList = [];

    for (const o of this.obstacles) {
      const r = this._obstacleRenderRect(o);
      drawList.push({ type: "ob", y: r.y, r, img: o.img });
    }

    const pr = this._playerRect();
    drawList.push({ type: "player", y: pr.y, r: pr });

    drawList.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.type === b.type) return 0;
      return a.type === "ob" ? -1 : 1;
    });

    for (const it of drawList) {
      if (it.type === "ob") {
        const r = it.r;
        const img = it.img;
        const drawY = r.y - r.h + this.obVisualYOffset;

        if (img && img.complete) {
          ctx.drawImage(img, r.x, drawY, r.w, r.h);
        } else {
          ctx.fillStyle = "#ff6b6b";
          ctx.fillRect(r.x, drawY, r.w, r.h);
        }
      } else {
        // ✅ 플레이어: 사각형 대신 이미지 렌더
        const r = it.r;

        // r.x/r.y는 "판정용 사각형" 기준
        // 이미지는 가운데 정렬해서 자연스럽게 보이게
        const cx = r.x + r.w / 2;
        const imgX = cx - this.chW / 2;
        const imgY = r.y - this.chH + (this.chVisualYOffset ?? 0);

        if (this.chImg && this.chImg.complete) {
          ctx.drawImage(this.chImg, imgX, imgY, this.chW, this.chH);
        } else {
          // 로딩 중이면 기존처럼 표시
          ctx.fillStyle = "#f2f2f2";
          ctx.fillRect(r.x, r.y - r.h, r.w, r.h);
        }
      }
    }

    ctx.restore();
  },

  // ✅ 한 번에 1~3개 레일에 랜덤 등장 + 위 레일일수록 오른쪽으로 밀기
  _spawnObstacle() {
    const maxSpawn = Math.min(3, this.laneCount);
    const count = 1 + ((Math.random() * maxSpawn) | 0);

    const lanes = [];
    for (let i = 0; i < this.laneCount; i++) lanes.push(i);
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = lanes[i];
      lanes[i] = lanes[j];
      lanes[j] = tmp;
    }
    const picked = lanes.slice(0, count);

    const baseX = WIDTH + 200 + Math.random() * 200;

    for (let k = 0; k < picked.length; k++) {
      const lane = picked[k];

      const img = this.obImgs[(Math.random() * this.obImgs.length) | 0];
      const laneXOffset = (this.laneCount - 1 - lane) * this.obLaneXStep;

      const x = baseX + laneXOffset;

      this.obstacles.push({
        lane,
        x,
        w: this.obW,
        h: this.obH,
        img,
        scored: false,
      });
    }
  },

  _playerRect() {
    const y = this.laneYs[this.p.lane];
    return { x: this.p.x, y, w: this.p.w, h: this.p.h };
  },

  _obstacleRenderRect(o) {
    const y = this.laneYs[o.lane];
    return { x: o.x, y, w: o.w, h: o.h };
  },

  _obstacleHitRect(o) {
    const y = this.laneYs[o.lane];

    const pad = this.obHitPaddingX;
    const w = Math.max(10, o.w - pad * 2);

    return {
      x: o.x + pad,
      y,
      w,
      h: o.h,
    };
  },

  _aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y - a.h < b.y &&
      a.y > b.y - b.h
    );
  },
};
