import { WIDTH, HEIGHT, clamp } from "../core.js";

export const GameC = {
  id: "bar-rise",
  name: "포떼링이 내려요",

  openingVideo: "./assets/video/C_opening.mp4",
  finishVideo: "./assets/video/C_finish.mp4",

  init(ctx) {
    this._ctx = ctx;

    // bars
    this.barImages = {
      200: this._loadImg("./assets/img/C_bar200.png"),
      300: this._loadImg("./assets/img/C_bar300.png"),
      400: this._loadImg("./assets/img/C_bar400.png"),
    };

    // character
    this.chImg = this._loadImg("./assets/img/C_CH.png");
    this.chW = 160;
    this.chH = 200;
    this.chFootPad = 10;
  },

  enter({ speedMul }) {
    // ✅ 스테이지 속도 저장 (스폰 간격 계산에 사용)
    this.speedMul = speedMul;

    // ✅ 스폰 기본값(원래 0.3~0.6)
    this.spawnBase = 0.3;
    this.spawnJitter = 0.3;

    // player
    this.p = { x: WIDTH / 2, y: 300, r: 45 };
    this.pHitR = 35;
    this.pFace = 1;

    // speeds
    this.playerDownSpeed = 520 * speedMul;
    this.barUpSpeed = 820 * speedMul;
    this.moveSpeed = 980 * (0.9 + 0.2 * speedMul);

    // stand -> slow -> drop
    this.barSlowSec = 0.8;
    this.barSlowUpMul = 0.95;

    this.barDropMul = 2.0;
    this.barDropSpeed = this.playerDownSpeed * this.barDropMul;

    // hit tuning
    this.standEpsilon = 10;
    this.barHitExtraY = 25;

    // rotation
    this.barMaxRotDeg = 90;
    this.barMaxRotRad = (this.barMaxRotDeg * Math.PI) / 180;

    // 벽에 붙은 바가 더 자주 나오게
    this.wallStickProb = 0.8; // 0~1
    this.wallPad = 30; // 0이면 벽에 딱 붙음, 10~30이면 살짝 안쪽

    // bars
    this.bars = [];
    this.spawnT = 0;

    // score
    this.scorePending = 0;

    // bar variations
    this.barWidths = [200, 300, 400];
    this.barHeight = 30;
    this.barGap = 20;
  },

  update(dt, input) {
    this.scorePending = 0;

    const hitR = this.pHitR ?? this.p.r;

    // 1) input
    let dir = 0;
    if (input.state.leftDown) dir -= 1;
    if (input.state.rightDown) dir += 1;

    if (dir < 0) this.pFace = -1;
    else if (dir > 0) this.pFace = 1;

    this.p.x += dir * this.moveSpeed * dt;
    this.p.x = clamp(this.p.x, hitR, WIDTH - hitR);

    // 2) spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this._spawnBarLine();

      // ✅ 핵심 수정:
      // 스테이지가 빨라질수록(speedMul↑) 스폰 간격을 줄여서(=더 자주 생성)
      // 바가 빨리 사라져서 오히려 쉬워지는 현상을 막음.
      const mul = Math.max(0.6, this.speedMul ?? 1);
      this.spawnT = (this.spawnBase + Math.random() * this.spawnJitter) / mul;
    }

    // 3) bars move
    for (const b of this.bars) {
      b.prevY = b.y;

      if (b.state === "drop") {
        b.y += this.barDropSpeed * dt;

        if (b.rotInit) {
          b.angle += b.angVel * dt;

          if (b.angVel >= 0) {
            if (b.angle > b.targetAngle) b.angle = b.targetAngle;
          } else {
            if (b.angle < b.targetAngle) b.angle = b.targetAngle;
          }
        }
      } else if (b.state === "slow") {
        const slowUpSpeed = this.barUpSpeed * this.barSlowUpMul;
        b.y -= slowUpSpeed * dt;
      } else {
        b.y -= this.barUpSpeed * dt;
      }
    }

    // 4) player down
    const prevPY = this.p.y;
    this.p.y += this.playerDownSpeed * dt;
    this.p.y = Math.min(this.p.y, HEIGHT - hitR);

    const prevBottom = prevPY + hitR;
    const bottomNow = this.p.y + hitR;

    // 5) stand check
    let stoodBar = null;
    let bestTop = Infinity;

    const extraY = this.barHitExtraY ?? 0;

    for (const b of this.bars) {
      if (b.state === "drop") continue;

      const overlapX =
        this.p.x + hitR > b.x &&
        this.p.x - hitR < b.x + b.w;
      if (!overlapX) continue;

      const topPrev = b.prevY;
      const topNow = b.y;

      const topMin = Math.min(topPrev, topNow);
      const topMax = Math.max(topPrev, topNow);

      const bottomMin = Math.min(prevBottom, bottomNow);
      const bottomMax = Math.max(prevBottom, bottomNow);

      const crossed =
        bottomMax >= topMin - this.standEpsilon - extraY &&
        bottomMin <= topMax + this.standEpsilon + extraY;

      if (!crossed) continue;

      if (topNow < bestTop) {
        bestTop = topNow;
        stoodBar = b;
      }
    }

    // continuous stand -> drop
    if (stoodBar) {
      this.p.y = stoodBar.y - hitR;

      if (stoodBar.state === "up") {
        stoodBar.state = "slow";
        stoodBar.slowT = 0;
      }

      stoodBar.slowT += dt;

      if (stoodBar.slowT >= this.barSlowSec) {
        stoodBar.state = "drop";
        this._initBarRotationForDrop(stoodBar);
      }

      for (const b of this.bars) {
        if (b !== stoodBar && b.state === "slow") {
          b.state = "up";
          b.slowT = 0;
        }
      }
    } else {
      for (const b of this.bars) {
        if (b.state === "slow") {
          b.state = "up";
          b.slowT = 0;
        }
      }
    }

    // 6) score
    for (const b of this.bars) {
      if (!b.counted && b.y + b.h / 2 < this.p.y - hitR) {
        b.counted = true;
        this.scorePending += 1;
      }
    }

    // ceiling -> game over
    if (this.p.y - hitR <= 0) {
      return { done: true, success: false, scoreDelta: 0 };
    }

    // cleanup
    this.bars = this.bars.filter((b) => {
      if (b.state === "drop") return b.y < HEIGHT + 200;
      return b.y + b.h > -120;
    });

    return { done: false, success: true, scoreDelta: this.scorePending };
  },

  render(ctx) {
    ctx.save();

    ctx.fillStyle = "#F9E3E5";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // bars
    for (const b of this.bars) {
      const img = this.barImages?.[b.w];
      const angle = b.angle || 0;

      if (angle !== 0) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        if (img && img.complete) {
          ctx.drawImage(img, -b.w / 2, -b.h / 2, b.w, b.h);
        } else {
          ctx.fillStyle = "rgba(245,158,11,0.85)";
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        }

        ctx.restore();
      } else {
        if (img && img.complete) {
          ctx.drawImage(img, b.x, b.y, b.w, b.h);
        } else {
          ctx.fillStyle = "rgba(245,158,11,0.85)";
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
      }
    }

    // character (foot aligned + flip)
    const hitR = this.pHitR ?? this.p.r;
    const footY = this.p.y + hitR + (this.chFootPad ?? 0);

    ctx.save();
    ctx.translate(this.p.x, this.p.y);

    if (this.pFace === -1) ctx.scale(-1, 1);

    const drawX = -this.chW / 2;
    const drawY = (footY - this.p.y) - this.chH;

    if (this.chImg && this.chImg.complete) {
      ctx.drawImage(this.chImg, drawX, drawY, this.chW, this.chH);
    } else {
      ctx.fillStyle = "rgba(96,165,250,0.85)";
      ctx.fillRect(drawX, drawY, this.chW, this.chH);
    }

    ctx.restore();

    // ceiling line
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WIDTH, 0);
    ctx.stroke();

    ctx.restore();
  },

  _initBarRotationForDrop(b) {
    if (b.rotInit) return;

    b.rotInit = true;
    b.angle = 0;

    const sign = Math.random() < 0.5 ? -1 : 1;
    const targetMag = Math.random() * this.barMaxRotRad;
    b.targetAngle = targetMag * sign;

    const exitY = HEIGHT + 200;
    const dist = Math.max(1, exitY - b.y);
    const timeToExit = dist / Math.max(1, this.barDropSpeed);

    b.angVel = b.targetAngle / Math.max(0.2, timeToExit);
  },

  _spawnBarLine() {
    const h = this.barHeight;
    const y = HEIGHT + 120;

    const MIN_SUM_WIDTHS = 500;
    const MAX_SUM_WIDTHS = 900;

    const JOINED_PROB = 0.28;
    const minGap = 180;
    const joinedGap = this.barGap ?? 20;

    const targetCount = 2 + ((Math.random() * 2) | 0); // 2 or 3

    let widths = null;

    for (let attempt = 0; attempt < 80; attempt++) {
      const picked = [];
      let sum = 0;

      for (let i = 0; i < targetCount; i++) {
        const candidates = this.barWidths.filter((w) => sum + w <= MAX_SUM_WIDTHS);
        if (candidates.length === 0) break;

        const w = candidates[(Math.random() * candidates.length) | 0];
        picked.push(w);
        sum += w;
      }

      if (picked.length < 2) continue;
      if (sum < MIN_SUM_WIDTHS) continue;

      if (picked.length === 3) {
        const set = new Set(picked);
        if (set.has(200) && set.has(300) && set.has(400)) continue;
      }

      widths = picked;
      break;
    }

    if (!widths) widths = [300, 200];

    const sumWidths = widths.reduce((a, b) => a + b, 0);
    const joined = Math.random() < JOINED_PROB;

    const wallPad = this.wallPad ?? 0;
    const wallBias = Math.max(0, Math.min(1, this.wallStickProb ?? 0));

    // joined 배치: 벽에 더 자주 붙이기
    if (joined) {
      const totalW = sumWidths + joinedGap * (widths.length - 1);

      if (totalW <= WIDTH - wallPad * 2) {
        let startX;

        if (Math.random() < wallBias) {
          startX = Math.random() < 0.5 ? wallPad : (WIDTH - wallPad - totalW);
        } else {
          const minX = wallPad;
          const maxX = WIDTH - wallPad - totalW;
          startX = minX + ((Math.random() * (maxX - minX + 1)) | 0);
        }

        let x = startX;

        for (let i = 0; i < widths.length; i++) {
          const w = widths[i];
          this.bars.push({
            x,
            y,
            w,
            h,
            counted: false,

            state: "up",
            slowT: 0,

            rotInit: false,
            angle: 0,
            targetAngle: 0,
            angVel: 0,

            prevY: y,
          });
          x += w + joinedGap;
        }
        return;
      }
    }

    // scattered 배치: 1개는 벽에 강제 배치(확률)
    const segments = [];

    const tryPlace = (w, gap) => {
      const minX = wallPad;
      const maxX = WIDTH - wallPad - w;
      if (maxX < minX) return false;

      for (let t = 0; t < 120; t++) {
        const x = minX + ((Math.random() * (maxX - minX + 1)) | 0);

        let ok = true;
        for (const s of segments) {
          const dist = Math.max(s.x - (x + w), x - (s.x + s.w));
          if (dist < gap) {
            ok = false;
            break;
          }
        }
        if (ok) {
          segments.push({ x, w });
          return true;
        }
      }
      return false;
    };

    const sorted = [...widths].sort((a, b) => b - a);

    if (Math.random() < wallBias) {
      const w = sorted[0];
      if (w != null) {
        const sideLeft = Math.random() < 0.5;
        const x = sideLeft ? wallPad : (WIDTH - wallPad - w);
        segments.push({ x, w });
        sorted.shift();
      }
    }

    for (const w of sorted) {
      if (tryPlace(w, minGap)) continue;

      const fallbackGap = Math.max(60, (minGap * 0.55) | 0);
      if (tryPlace(w, fallbackGap)) continue;

      segments.length = 0;
      const w1 = widths[0] ?? 300;
      const w2 = widths[1] ?? 200;
      segments.push(
        { x: wallPad + 80, w: w1 },
        { x: WIDTH - wallPad - 80 - w2, w: w2 }
      );
      break;
    }

    segments.sort((a, b) => a.x - b.x);

    for (const s of segments) {
      this.bars.push({
        x: s.x,
        y,
        w: s.w,
        h,
        counted: false,

        state: "up",
        slowT: 0,

        rotInit: false,
        angle: 0,
        targetAngle: 0,
        angVel: 0,

        prevY: y,
      });
    }
  },

  _loadImg(src) {
    const img = new Image();
    img.src = src;
    return img;
  },
};
