/**
 * Arcade mini-games module.
 * Each game exports a function: (canvas, onScore, onGameOver) => { cleanup }
 * - canvas: the HTMLCanvasElement to draw on
 * - onScore(score): called whenever score changes
 * - onGameOver(finalScore): called when game ends
 * Returns { cleanup(), keyDown(e), keyUp(e) }
 */

// ============================================================
// 1. SPACE INVADERS
// ============================================================
export function startInvaders(canvas, onScore, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let animFrame = null;
  let running = true;

  const game = {
    ship: { x: W / 2, w: 16, h: 8 },
    bullets: [],
    enemies: [],
    particles: [],
    score: 0,
    spawnTimer: 0,
    keys: { left: false, right: false, space: false },
    shootCooldown: 0,
  };

  function spawnWave() {
    const speed = 0.5 + game.score / 5000;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        game.enemies.push({
          x: 40 + col * 42, y: 20 + row * 30,
          w: 12, h: 10, dx: speed, alive: true,
        });
      }
    }
  }
  spawnWave();

  function gameLoop() {
    if (!running) return;

    if (game.keys.left) game.ship.x -= 4;
    if (game.keys.right) game.ship.x += 4;
    game.ship.x = Math.max(10, Math.min(W - 10, game.ship.x));

    if (game.keys.space && game.shootCooldown <= 0) {
      game.bullets.push({ x: game.ship.x, y: H - 50, dy: -6 });
      game.shootCooldown = 12;
    }
    if (game.shootCooldown > 0) game.shootCooldown--;

    game.bullets = game.bullets.filter((b) => { b.y += b.dy; return b.y > -10; });

    let hitEdge = false;
    game.enemies.forEach((e) => {
      if (!e.alive) return;
      e.x += e.dx;
      if (e.x < 10 || e.x > W - 10) hitEdge = true;
    });
    if (hitEdge) {
      game.enemies.forEach((e) => { e.dx *= -1; e.y += 8; });
    }

    game.bullets = game.bullets.filter((b) => {
      for (const e of game.enemies) {
        if (!e.alive) continue;
        if (b.x > e.x - e.w / 2 && b.x < e.x + e.w / 2 &&
            b.y > e.y - e.h / 2 && b.y < e.y + e.h / 2) {
          e.alive = false;
          game.score += 100;
          onScore(game.score);
          for (let i = 0; i < 6; i++) {
            game.particles.push({
              x: e.x, y: e.y,
              dx: (Math.random() - 0.5) * 4, dy: (Math.random() - 0.5) * 4,
              life: 15,
            });
          }
          return false;
        }
      }
      return true;
    });

    game.particles = game.particles.filter((p) => {
      p.x += p.dx; p.y += p.dy; p.life--; return p.life > 0;
    });

    if (game.enemies.every((e) => !e.alive)) {
      game.spawnTimer++;
      if (game.spawnTimer > 30) { game.spawnTimer = 0; spawnWave(); }
    }

    let gameOver = false;
    for (const e of game.enemies) {
      if (e.alive && e.y + e.h / 2 > H - 30) gameOver = true;
    }

    // Draw
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#f5a623';
    ctx.fillRect(game.ship.x - 8, H - 40, 16, 8);
    ctx.fillRect(game.ship.x - 2, H - 48, 4, 8);

    ctx.fillStyle = '#ffdd44';
    game.bullets.forEach((b) => ctx.fillRect(b.x - 1, b.y, 2, 6));

    game.enemies.forEach((e) => {
      if (!e.alive) return;
      ctx.fillStyle = '#00ff66';
      const s = 3;
      ctx.fillRect(e.x - 2 * s, e.y - s, s, s);
      ctx.fillRect(e.x + s, e.y - s, s, s);
      ctx.fillRect(e.x - s, e.y, 2 * s, s);
      ctx.fillRect(e.x - 2 * s, e.y + s, 4 * s, s);
      ctx.fillRect(e.x - 2 * s, e.y + 2 * s, s, s);
      ctx.fillRect(e.x + s, e.y + 2 * s, s, s);
    });

    game.particles.forEach((p) => {
      ctx.fillStyle = `rgba(255, ${100 + p.life * 10}, 0, ${p.life / 15})`;
      ctx.fillRect(p.x, p.y, 3, 3);
    });

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff4444';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 10);
      ctx.fillStyle = '#f5a623';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText(`Puntaje: ${game.score}`, W / 2, H / 2 + 20);
      running = false;
      onGameOver(game.score);
      return;
    }

    animFrame = requestAnimationFrame(gameLoop);
  }
  animFrame = requestAnimationFrame(gameLoop);

  return {
    keyDown(e) {
      if (e.key === 'ArrowLeft') game.keys.left = true;
      if (e.key === 'ArrowRight') game.keys.right = true;
      if (e.key === ' ') game.keys.space = true;
    },
    keyUp(e) {
      if (e.key === 'ArrowLeft') game.keys.left = false;
      if (e.key === 'ArrowRight') game.keys.right = false;
      if (e.key === ' ') game.keys.space = false;
    },
    cleanup() {
      running = false;
      if (animFrame) cancelAnimationFrame(animFrame);
    },
  };
}

// ============================================================
// 2. SNAKE
// ============================================================
export function startSnake(canvas, onScore, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GRID = 16;
  const COLS = Math.floor(W / GRID);
  const ROWS = Math.floor(H / GRID);
  let intervalId = null;
  let running = true;

  const snake = [{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }];
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food = spawnFood();
  let score = 0;

  function spawnFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
    return pos;
  }

  function tick() {
    if (!running) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver(); return;
    }
    // Self collision
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      gameOver(); return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      onScore(score);
      food = spawnFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function draw() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Snake
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#00ff66' : '#00cc44';
      ctx.fillRect(s.x * GRID + 1, s.y * GRID + 1, GRID - 2, GRID - 2);
    });

    // Food
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(food.x * GRID + 2, food.y * GRID + 2, GRID - 4, GRID - 4);
  }

  function gameOver() {
    running = false;
    if (intervalId) clearInterval(intervalId);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff4444';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 10);
    ctx.fillStyle = '#f5a623';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`Puntaje: ${score}`, W / 2, H / 2 + 20);
    onGameOver(score);
  }

  draw();
  intervalId = setInterval(tick, 120);

  return {
    keyDown(e) {
      if (e.key === 'ArrowLeft' && dir.x !== 1) nextDir = { x: -1, y: 0 };
      if (e.key === 'ArrowRight' && dir.x !== -1) nextDir = { x: 1, y: 0 };
      if (e.key === 'ArrowUp' && dir.y !== 1) nextDir = { x: 0, y: -1 };
      if (e.key === 'ArrowDown' && dir.y !== -1) nextDir = { x: 0, y: 1 };
    },
    keyUp() {},
    cleanup() {
      running = false;
      if (intervalId) clearInterval(intervalId);
    },
  };
}

// ============================================================
// 3. PONG (single player vs AI)
// ============================================================
export function startPong(canvas, onScore, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let animFrame = null;
  let running = true;

  const PADDLE_W = 8;
  const PADDLE_H = 50;
  const BALL_SIZE = 8;

  const player = { y: H / 2 - PADDLE_H / 2 };
  const ai = { y: H / 2 - PADDLE_H / 2 };
  const ball = { x: W / 2, y: H / 2, dx: 3, dy: 2 };
  let playerScore = 0;
  let aiScore = 0;
  const keys = { up: false, down: false };

  function resetBall(towardsPlayer) {
    ball.x = W / 2;
    ball.y = H / 2;
    ball.dx = (towardsPlayer ? -1 : 1) * (3 + Math.random());
    ball.dy = (Math.random() - 0.5) * 4;
  }

  function gameLoop() {
    if (!running) return;

    // Player paddle
    if (keys.up) player.y -= 5;
    if (keys.down) player.y += 5;
    player.y = Math.max(0, Math.min(H - PADDLE_H, player.y));

    // AI paddle — follows ball with slight delay
    const aiCenter = ai.y + PADDLE_H / 2;
    const diff = ball.y - aiCenter;
    ai.y += diff * 0.08;
    ai.y = Math.max(0, Math.min(H - PADDLE_H, ai.y));

    // Ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Top/bottom bounce
    if (ball.y <= 0 || ball.y >= H - BALL_SIZE) ball.dy *= -1;

    // Player paddle collision (left)
    if (ball.x <= 20 + PADDLE_W && ball.x >= 20 &&
        ball.y + BALL_SIZE >= player.y && ball.y <= player.y + PADDLE_H) {
      ball.dx = Math.abs(ball.dx) * 1.05;
      ball.dy += (ball.y - (player.y + PADDLE_H / 2)) * 0.15;
    }

    // AI paddle collision (right)
    if (ball.x + BALL_SIZE >= W - 20 - PADDLE_W && ball.x + BALL_SIZE <= W - 20 &&
        ball.y + BALL_SIZE >= ai.y && ball.y <= ai.y + PADDLE_H) {
      ball.dx = -Math.abs(ball.dx) * 1.05;
      ball.dy += (ball.y - (ai.y + PADDLE_H / 2)) * 0.15;
    }

    // Scoring
    if (ball.x < 0) {
      aiScore++;
      if (aiScore >= 5) { endGame(); return; }
      resetBall(true);
    }
    if (ball.x > W) {
      playerScore++;
      onScore(playerScore * 100);
      if (playerScore >= 5) { endGame(); return; }
      resetBall(false);
    }

    // Draw
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = '#333';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddles
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(20, player.y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(W - 20 - PADDLE_W, ai.y, PADDLE_W, PADDLE_H);

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ball.x, ball.y, BALL_SIZE, BALL_SIZE);

    // Score display
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ff66';
    ctx.fillText(playerScore.toString(), W / 2 - 40, 30);
    ctx.fillStyle = '#ff4444';
    ctx.fillText(aiScore.toString(), W / 2 + 40, 30);

    animFrame = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    running = false;
    const won = playerScore >= 5;
    const finalScore = playerScore * 100;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = won ? '#00ff66' : '#ff4444';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(won ? 'GANASTE!' : 'GAME OVER', W / 2, H / 2 - 10);
    ctx.fillStyle = '#f5a623';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`Puntaje: ${finalScore}`, W / 2, H / 2 + 20);
    onGameOver(finalScore);
  }

  animFrame = requestAnimationFrame(gameLoop);

  return {
    keyDown(e) {
      if (e.key === 'ArrowUp') keys.up = true;
      if (e.key === 'ArrowDown') keys.down = true;
    },
    keyUp(e) {
      if (e.key === 'ArrowUp') keys.up = false;
      if (e.key === 'ArrowDown') keys.down = false;
    },
    cleanup() {
      running = false;
      if (animFrame) cancelAnimationFrame(animFrame);
    },
  };
}

// ============================================================
// 4. BREAKOUT
// ============================================================
export function startBreakout(canvas, onScore, onGameOver) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let animFrame = null;
  let running = true;

  const BRICK_ROWS = 5;
  const BRICK_COLS = 10;
  const BRICK_W = W / BRICK_COLS - 4;
  const BRICK_H = 14;
  const PADDLE_W = 60;
  const PADDLE_H = 10;
  const BALL_R = 5;

  const colors = ['#ff4444', '#ff8844', '#ffcc44', '#44dd44', '#44aaff'];

  const paddle = { x: W / 2 - PADDLE_W / 2 };
  const ball = { x: W / 2, y: H - 40, dx: 3, dy: -3 };
  const keys = { left: false, right: false };
  let score = 0;
  let lives = 3;

  const bricks = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: c * (BRICK_W + 4) + 2,
        y: r * (BRICK_H + 4) + 30,
        w: BRICK_W,
        h: BRICK_H,
        alive: true,
        color: colors[r],
      });
    }
  }

  function resetBall() {
    ball.x = paddle.x + PADDLE_W / 2;
    ball.y = H - 40;
    ball.dx = 3 * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = -3;
  }

  function gameLoop() {
    if (!running) return;

    // Paddle
    if (keys.left) paddle.x -= 5;
    if (keys.right) paddle.x += 5;
    paddle.x = Math.max(0, Math.min(W - PADDLE_W, paddle.x));

    // Ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall bounce
    if (ball.x <= BALL_R || ball.x >= W - BALL_R) ball.dx *= -1;
    if (ball.y <= BALL_R) ball.dy *= -1;

    // Bottom — lose life
    if (ball.y > H) {
      lives--;
      if (lives <= 0) { endGame(); return; }
      resetBall();
    }

    // Paddle collision
    if (ball.dy > 0 &&
        ball.y + BALL_R >= H - 25 && ball.y + BALL_R <= H - 15 &&
        ball.x >= paddle.x && ball.x <= paddle.x + PADDLE_W) {
      ball.dy = -Math.abs(ball.dy);
      // Angle based on where ball hits paddle
      const hitPos = (ball.x - paddle.x) / PADDLE_W - 0.5;
      ball.dx = hitPos * 6;
    }

    // Brick collision
    bricks.forEach((b) => {
      if (!b.alive) return;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + b.w &&
          ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + b.h) {
        b.alive = false;
        ball.dy *= -1;
        score += 50;
        onScore(score);
      }
    });

    // Win check
    if (bricks.every((b) => !b.alive)) { endGame(); return; }

    // Draw
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Bricks
    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#0a0a1a';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    });

    // Paddle
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(paddle.x, H - 25, PADDLE_W, PADDLE_H);

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // Lives
    ctx.fillStyle = '#ff4444';
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('❤'.repeat(lives), 8, 22);

    animFrame = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    running = false;
    const won = bricks.every((b) => !b.alive);
    if (won) score += 500; // Bonus for clearing all bricks
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = won ? '#00ff66' : '#ff4444';
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(won ? 'GANASTE!' : 'GAME OVER', W / 2, H / 2 - 10);
    ctx.fillStyle = '#f5a623';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`Puntaje: ${score}`, W / 2, H / 2 + 20);
    onGameOver(score);
  }

  animFrame = requestAnimationFrame(gameLoop);

  return {
    keyDown(e) {
      if (e.key === 'ArrowLeft') keys.left = true;
      if (e.key === 'ArrowRight') keys.right = true;
    },
    keyUp(e) {
      if (e.key === 'ArrowLeft') keys.left = false;
      if (e.key === 'ArrowRight') keys.right = false;
    },
    cleanup() {
      running = false;
      if (animFrame) cancelAnimationFrame(animFrame);
    },
  };
}

// ============================================================
// Thumbnail drawers (for game selection screen)
// ============================================================
export function drawInvadersThumb(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#00ff66';
  const s = 2;
  [[20, 15], [40, 15], [60, 15], [20, 28], [40, 28], [60, 28]].forEach(([x, y]) => {
    ctx.fillRect(x - 2 * s, y, s, s); ctx.fillRect(x + s, y, s, s);
    ctx.fillRect(x - s, y + s, 2 * s, s); ctx.fillRect(x - 2 * s, y + 2 * s, 4 * s, s);
  });
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(W / 2 - 4, H - 12, 8, 4);
  ctx.fillRect(W / 2 - 1, H - 16, 2, 4);
}

export function drawSnakeThumb(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#00ff66';
  const segments = [[40, 32], [46, 32], [52, 32], [52, 38], [52, 44], [46, 44]];
  segments.forEach(([x, y], i) => {
    ctx.fillStyle = i === 0 ? '#00ff66' : '#00cc44';
    ctx.fillRect(x, y, 5, 5);
  });
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(28, 20, 5, 5);
}

export function drawPongThumb(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#333'; ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#00ff66'; ctx.fillRect(8, H / 2 - 12, 4, 24);
  ctx.fillStyle = '#ff4444'; ctx.fillRect(W - 12, H / 2 - 12, 4, 24);
  ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
}

export function drawBreakoutThumb(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, W, H);
  const colors = ['#ff4444', '#ff8844', '#ffcc44', '#44dd44'];
  colors.forEach((c, r) => {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = c;
      ctx.fillRect(col * 10 + 1, r * 6 + 8, 8, 4);
    }
  });
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(W / 2 - 10, H - 8, 20, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(W / 2, H - 16, 3, 3);
}
