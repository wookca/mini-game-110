export class Flow {
  constructor(games, { stageSeconds = 10, random = true } = {}) {
    this.games = games;
    this.stageSeconds = stageSeconds;

    this.stageIndex = 1;
    this.score = 0;

    this.timeLeft = stageSeconds;
    this.speedLevel = 1;
    this.speedMul = 1.0;

    this.current = null;
    this.isGameOver = false;

    // ✅ 랜덤 순서 큐
    this.random = random;
    this._order = [];
    this._orderPos = 0;
  }

  start(ctx) {
    for (const g of this.games) g.init?.(ctx);

    this._buildOrder();
    this._enterByOrder(ctx, /*isFirst*/ true);
  }

  _buildOrder() {
    this._order = [...Array(this.games.length)].map((_, i) => i);

    if (this.random) {
      // Fisher–Yates shuffle
      for (let i = this._order.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
      }
    }

    this._orderPos = 0;
  }

  _getIndexByOrder(pos) {
    return this._order[pos];
  }

  _peekNextGame() {
    const nextPos = this._orderPos + 1;
    if (nextPos >= this._order.length) return this.games[this._getIndexByOrder(0)];
    return this.games[this._getIndexByOrder(nextPos)];
  }

  _enterByOrder(ctx, isFirst = false) {
    const idx = this._getIndexByOrder(this._orderPos);
    this.current = this.games[idx];

    this.timeLeft = this.stageSeconds;
    this.speedLevel = this.stageIndex;
    this.speedMul = 1 + (this.stageIndex - 1) * 0.12;
    this.isGameOver = false;

    this.current.enter?.({
      stageIndex: this.stageIndex,
      stageSeconds: this.stageSeconds,
      speedMul: this.speedMul,
      isFirst,
    });
  }

  // ✅ main.js에서 컷씬 끝난 뒤 호출할 “진짜 다음 스테이지 진행”
  advance(ctx) {
    this.stageIndex += 1;

    this._orderPos += 1;
    if (this._orderPos >= this._order.length) {
      this._buildOrder(); // 한 바퀴 돌면 다시 셔플
    }

    this._enterByOrder(ctx);
  }

  restartAll(ctx) {
    this.stageIndex = 1;
    this.score = 0;
    this._buildOrder();
    this._enterByOrder(ctx, true);
  }

  update(ctx, dt, input) {
    if (this.isGameOver) return { transitioned: false, status: "gameover" };

    this.timeLeft -= dt;
    if (this.timeLeft < 0) this.timeLeft = 0;

    const result = this.current.update?.(dt, input, this.timeLeft);
    if (result?.scoreDelta) this.score += result.scoreDelta;

    const clearedByTime = this.timeLeft <= 0;
    const clearedByGame = result?.done && result?.success;
    const failed = result?.done && !result?.success;

    if (failed) {
      this.isGameOver = true;
      return { transitioned: true, status: "gameover" };
    }

    if (clearedByTime || clearedByGame) {
      // ✅ 여기서 advance() 하지 말고, 컷씬 정보만 main에 전달
      return {
        transitioned: true,
        status: "cleared",
        from: this.current,
        to: this._peekNextGame(),
      };
    }

    return { transitioned: false };
  }
}
