export const WIDTH = 1080;
export const HEIGHT = 1920;

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export class Input {
  constructor(btnLeft, btnRight) {
    this.state = {
      leftDown: false,
      rightDown: false,
      leftPressed: false,
      rightPressed: false,
    };

    const bindHold = (el, key) => {
      const down = () => {
        const s = this.state;
        if (!s[key + "Down"]) s[key + "Pressed"] = true;
        s[key + "Down"] = true;
      };
      const up = () => { this.state[key + "Down"] = false; };

      el.addEventListener("pointerdown", (e) => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
    };

    bindHold(btnLeft, "left");
    bindHold(btnRight, "right");

    // optional keyboard for dev
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "ArrowLeft" || e.code === "KeyA") { if (!this.state.leftDown) this.state.leftPressed = true; this.state.leftDown = true; }
      if (e.code === "ArrowRight" || e.code === "KeyD") { if (!this.state.rightDown) this.state.rightPressed = true; this.state.rightDown = true; }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") this.state.leftDown = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") this.state.rightDown = false;
    });
  }

  // call once per frame after consuming pressed flags
  endFrame() {
    this.state.leftPressed = false;
    this.state.rightPressed = false;
  }
}

export function drawHUD(ctx, hud) {
  // hud: {stageName, stageIndex, timeLeft, stageSeconds, score, speedLevel}
  ctx.save();

  // ✅ TIME 게이지(10초 동안 좌→우로 채워짐)
  const total = Math.max(0.0001, Number(hud.stageSeconds ?? 10));
  const left = Math.max(0, Number(hud.timeLeft ?? 0));
  const progress = Math.max(0, Math.min(1, 1 - left / total));

  const pad = 24;
  const barH = 18;
  const barY = 14;
  const barW = WIDTH - pad * 2;

  // bar background
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(pad, barY, barW, barH);

  // bar fill
  ctx.fillStyle = "#000";
  ctx.fillRect(pad, barY, barW * progress, barH);

  // bar outline
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, barY, barW, barH);

  // ✅ 텍스트: 흰색 → 블랙
  ctx.fillStyle = "#000";

  ctx.textAlign = "left";
  ctx.font = "550 30px system-ui";
  ctx.fillText(hud.stageName ?? "", 30, 70);

  ctx.textAlign = "right";
  ctx.font = "40px system-ui";
  ctx.fillText(`Total Score : ${hud.score}`, WIDTH - 30, 76);

  // 하단 우측: Speed
  ctx.textAlign = "right";
  ctx.font = "40px system-ui";
  ctx.fillText(`Speed Lv : ${hud.speedLevel}`, WIDTH - 30, 120);

  ctx.restore();
}

