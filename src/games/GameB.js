import { WIDTH, HEIGHT, clamp } from "../core.js";

export const GameB = {
  id: "GameB",
  name: "링성맞춤 징떼링",

  openingVideo: "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847030/B_opening_lmj8ie.mp4",
  finishVideo: "https://res.cloudinary.com/dqyy2q2pb/video/upload/v1767847035/B_finish_stvt9m.mp4",

  init(ctx) {
    this._ctx = ctx;

    // ✅ 캐릭터 이미지 (기본: 왼쪽을 보고 있는 이미지)
    this.chImg = new Image();
    this.chImg.src = "./assets/img/B_CH.png";
    this.chW = 250;
    this.chH = 250;

    // ✅ 오브젝트 이미지 로드: B_OB1.png ~ B_OB5.png (원본 300x300)
    this.obImgs = [];
    for (let i = 1; i <= 5; i++) {
      const img = new Image();
      img.src = `./assets/img/B_OB${i}.png`;
      this.obImgs[i] = img; // 1~5
    }

    // ✅ 오브젝트 시각 크기 랜덤 범위
    this.obSizeMin = 240;
    this.obSizeMax = 300;

    // ✅ 판정 링크 계수(시각 크기와 연동)
    this.hitRadiusK = 0.35;
  },

  enter({ speedMul }) {
    this.scorePending = 0;

    // player (판정은 원형으로 유지)
    this.p = {
      x: WIDTH / 2,
      y: 1600,
      r: 70,
    };

    // ✅ 캐릭터가 바라보는 방향
    // -1 = 왼쪽(기본 이미지 방향), +1 = 오른쪽(좌우 반전해서 보여줌)
    this.pFace = -1;

    // objects
    this.poops = [];
    this.spawnT = 0;

    // speed
    this.baseFall = 900; // px/s
    this.fallSpeed = this.baseFall * speedMul;

    // side movement
    this.moveSpeed = 1000 * (0.9 + speedMul * 0.1);
  },

  exit() {},

  _randInt(min, max) {
    // inclusive
    return min + ((Math.random() * (max - min + 1)) | 0);
  },

  _spawn() {
    // type 1(OB1) = 보너스, type 2~5 = 충돌 시 게임오버
    const type = 1 + ((Math.random() * 5) | 0);

    // 시각 크기 랜덤
    const size = this._randInt(this.obSizeMin, this.obSizeMax);

    // 판정 반지름: 시각 크기와 링크
    const r = size * (this.hitRadiusK ?? 0.35);

    this.poops.push({
      type,
      x: 120 + Math.random() * (WIDTH - 240),
      y: -200,
      size,
      r,
      vy: this.fallSpeed * (0.85 + Math.random() * 0.4),
      counted: false,
      dead: false,
    });
  },

  _circleHit(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const rr = a.r + b.r;
    return dx * dx + dy * dy <= rr * rr;
  },

  update(dt, input) {
    this.scorePending = 0;

    // move (hold)
    let dir = 0;
    if (input.state.leftDown) dir -= 1;
    if (input.state.rightDown) dir += 1;

    // ✅ 이동 방향에 따라 캐릭터 방향 저장
    // 이미지가 "왼쪽 기준"이므로, 오른쪽 이동이면 반전(= pFace +1)
    if (dir < 0) this.pFace = -1;
    else if (dir > 0) this.pFace = 1;

    this.p.x += dir * this.moveSpeed * dt;
    this.p.x = clamp(this.p.x, this.p.r, WIDTH - this.p.r);

    // spawn cadence
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this._spawn();

      const base = 0.30;
      const jitter = 0.20;
      this.spawnT =
        Math.max(0.22, base - (this.fallSpeed - this.baseFall) / 4000) +
        Math.random() * jitter;
    }

    // update objects
    for (const o of this.poops) {
      o.y += o.vy * dt;

      // collision
      if (!o.dead && this._circleHit(this.p, o)) {
        if (o.type === 1) {
          // ✅ OB1: +5점, 오브젝트 제거, 게임 계속
          this.scorePending += 5;
          o.dead = true;
        } else {
          // ✅ OB2~OB5: 게임 오버
          return { done: true, success: false, scoreDelta: 0 };
        }
      }

      // score when avoided (passed below player)
      if (!o.dead && !o.counted && o.y - o.r > this.p.y + this.p.r) {
        o.counted = true;
        this.scorePending += 1;
      }
    }

    // cleanup
    this.poops = this.poops.filter((o) => !o.dead && o.y - o.r < HEIGHT + 250);

    return { done: false, success: true, scoreDelta: this.scorePending };
  },

  render(ctx) {
    ctx.save();

    // background
    ctx.fillStyle = "#F9E3E5";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ✅ player (이미지 렌더: 진행 방향에 따라 좌우 반전)
    // 판정은 this.p.r로 그대로 유지(이미지 크기와 분리)
    ctx.save();
    ctx.translate(this.p.x, this.p.y);

    // 기본 이미지가 왼쪽을 보고 있으므로,
    // 오른쪽을 볼 때만 좌우 반전(scale -1)
    if (this.pFace === 1) {
      ctx.scale(-1, 1);
    }

    const px = -this.chW / 2;
    const py = -this.chH / 2;

    if (this.chImg && this.chImg.complete) {
      ctx.drawImage(this.chImg, px, py, this.chW, this.chH);
    } else {
      // 로딩 중 fallback
      ctx.fillStyle = "#7ee787";
      ctx.beginPath();
      ctx.arc(0, 0, this.p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // objects (이미지 렌더 + 개별 크기)
    for (const o of this.poops) {
      const img = this.obImgs?.[o.type];
      const size = o.size ?? 300;

      const x = o.x - size / 2;
      const y = o.y - size / 2;

      if (img && img.complete) {
        ctx.drawImage(img, x, y, size, size);
      } else {
        // 로딩 중 fallback(판정 크기 기반 원)
        ctx.fillStyle =
          o.type === 1 ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)";
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }



    ctx.restore();
  },
};
