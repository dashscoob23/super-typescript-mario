import "./style.css";

type Mode = "menu" | "playing" | "win" | "lose";

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Coin = {
  x: number;
  y: number;
  r: number;
  collected: boolean;
};

type Enemy = {
  x: number;
  y: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  vx: number;
  alive: boolean;
};

type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: -1 | 1;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app not found");
}

const worldWidth = 3600;
const worldHeight = 540;
const canvas = document.createElement("canvas");
canvas.width = 960;
canvas.height = 540;
canvas.setAttribute("aria-label", "Super TypeScript Mario game canvas");
app.append(canvas);

const panel = document.createElement("div");
panel.style.display = "flex";
panel.style.gap = "8px";
panel.style.alignItems = "center";

const startBtn = document.createElement("button");
startBtn.id = "start-btn";
startBtn.textContent = "Start";
startBtn.style.padding = "8px 16px";
startBtn.style.fontWeight = "700";
startBtn.style.cursor = "pointer";
panel.append(startBtn);

const hint = document.createElement("span");
hint.textContent = "Arrows/A-D move, Space jump, R restart, F fullscreen";
panel.append(hint);

app.append(panel);

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D context unavailable");
}

const gravity = 1700;
const moveSpeed = 290;
const jumpSpeed = 640;
const dtFixed = 1 / 60;

const floorY = 490;
const platforms: Rect[] = [
  { x: 0, y: floorY, w: worldWidth, h: 50 },
  { x: 280, y: 420, w: 180, h: 22 },
  { x: 620, y: 360, w: 160, h: 22 },
  { x: 890, y: 300, w: 120, h: 22 },
  { x: 1180, y: 420, w: 210, h: 22 },
  { x: 1520, y: 350, w: 180, h: 22 },
  { x: 1840, y: 300, w: 120, h: 22 },
  { x: 2050, y: 250, w: 120, h: 22 },
  { x: 2260, y: 300, w: 130, h: 22 },
  { x: 2450, y: 360, w: 150, h: 22 },
  { x: 2740, y: 300, w: 200, h: 22 },
  { x: 3050, y: 240, w: 140, h: 22 }
];

const spawnCoins = (): Coin[] => [
  { x: 340, y: 380, r: 12, collected: false },
  { x: 660, y: 320, r: 12, collected: false },
  { x: 930, y: 260, r: 12, collected: false },
  { x: 1260, y: 380, r: 12, collected: false },
  { x: 1570, y: 310, r: 12, collected: false },
  { x: 2090, y: 210, r: 12, collected: false },
  { x: 2330, y: 260, r: 12, collected: false },
  { x: 2820, y: 260, r: 12, collected: false },
  { x: 3110, y: 200, r: 12, collected: false }
];

const spawnEnemies = (): Enemy[] => [
  { x: 760, y: 452, w: 36, h: 38, minX: 700, maxX: 980, vx: 110, alive: true },
  { x: 1390, y: 452, w: 36, h: 38, minX: 1180, maxX: 1470, vx: -100, alive: true },
  { x: 2470, y: 322, w: 36, h: 38, minX: 2450, maxX: 2590, vx: 90, alive: true },
  { x: 2880, y: 262, w: 36, h: 38, minX: 2740, maxX: 2940, vx: -95, alive: true }
];

const goal = { x: 3390, y: 380, w: 28, h: 110 };
const pressed = new Set<string>();

let mode: Mode = "menu";
let score = 0;
let cameraX = 0;
let lastTs = performance.now();

const player: Player = {
  x: 70,
  y: 420,
  w: 38,
  h: 52,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1
};

let coins = spawnCoins();
let enemies = spawnEnemies();

function resetWorld() {
  player.x = 70;
  player.y = 420;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.facing = 1;
  score = 0;
  coins = spawnCoins();
  enemies = spawnEnemies();
  cameraX = 0;
  mode = "menu";
}

function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectCollision(coin: Coin, rect: Rect) {
  const cx = Math.max(rect.x, Math.min(coin.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(coin.y, rect.y + rect.h));
  const dx = coin.x - cx;
  const dy = coin.y - cy;
  return dx * dx + dy * dy <= coin.r * coin.r;
}

function resolveX(rect: Rect, prevX: number) {
  for (const platform of platforms) {
    if (intersects(rect, platform)) {
      if (prevX + rect.w <= platform.x) {
        rect.x = platform.x - rect.w;
      } else if (prevX >= platform.x + platform.w) {
        rect.x = platform.x + platform.w;
      }
      return true;
    }
  }
  return false;
}

function resolveY(rect: Rect, prevY: number) {
  let grounded = false;
  for (const platform of platforms) {
    if (intersects(rect, platform)) {
      if (prevY + rect.h <= platform.y) {
        rect.y = platform.y - rect.h;
        grounded = true;
      } else if (prevY >= platform.y + platform.h) {
        rect.y = platform.y + platform.h;
      }
    }
  }
  return grounded;
}

function update(dt: number) {
  if (mode !== "playing") {
    return;
  }

  const left = pressed.has("ArrowLeft") || pressed.has("KeyA");
  const right = pressed.has("ArrowRight") || pressed.has("KeyD");
  const jump = pressed.has("Space") || pressed.has("ArrowUp") || pressed.has("KeyW");

  if (left === right) {
    player.vx *= 0.8;
    if (Math.abs(player.vx) < 1) {
      player.vx = 0;
    }
  } else {
    player.vx = left ? -moveSpeed : moveSpeed;
    player.facing = left ? -1 : 1;
  }

  if (jump && player.onGround) {
    player.vy = -jumpSpeed;
    player.onGround = false;
  }

  player.vy += gravity * dt;

  const prevX = player.x;
  player.x += player.vx * dt;
  if (resolveX(player, prevX)) {
    player.vx = 0;
  }
  player.x = Math.max(0, Math.min(worldWidth - player.w, player.x));

  const prevY = player.y;
  player.y += player.vy * dt;
  const grounded = resolveY(player, prevY);
  if (grounded) {
    if (player.vy > 0) {
      player.vy = 0;
    }
    player.onGround = true;
  } else {
    if (player.y + player.h >= worldHeight) {
      mode = "lose";
    }
    player.onGround = false;
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.vx * dt;
    if (enemy.x < enemy.minX) {
      enemy.x = enemy.minX;
      enemy.vx *= -1;
    }
    if (enemy.x + enemy.w > enemy.maxX) {
      enemy.x = enemy.maxX - enemy.w;
      enemy.vx *= -1;
    }

    if (intersects(player, enemy)) {
      const playerBottomPrev = prevY + player.h;
      if (playerBottomPrev <= enemy.y + 8 && player.vy > 0) {
        enemy.alive = false;
        player.vy = -jumpSpeed * 0.58;
        score += 150;
      } else {
        mode = "lose";
      }
    }
  }

  for (const coin of coins) {
    if (!coin.collected && circleRectCollision(coin, player)) {
      coin.collected = true;
      score += 100;
    }
  }

  if (intersects(player, goal)) {
    score += 300;
    mode = "win";
  }

  const targetCam = player.x - canvas.width * 0.34;
  cameraX = Math.max(0, Math.min(worldWidth - canvas.width, targetCam));
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#c8f0ff");
  gradient.addColorStop(0.65, "#95d8ff");
  gradient.addColorStop(1, "#75beef");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffffc0";
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 300 - cameraX * 0.25) % (canvas.width + 320)) - 120;
    const cy = 70 + (i % 3) * 35;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.arc(cx + 28, cy + 7, 22, 0, Math.PI * 2);
    ctx.arc(cx - 28, cy + 9, 18, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const px = player.x - cameraX;
  ctx.fillStyle = "#e53935";
  ctx.fillRect(px, player.y, player.w, player.h * 0.42);
  ctx.fillStyle = "#1b4fbe";
  ctx.fillRect(px, player.y + player.h * 0.42, player.w, player.h * 0.58);
  ctx.fillStyle = "#ffd8a6";
  ctx.fillRect(px + 9, player.y + 10, 20, 13);
  ctx.fillStyle = "#3d2a1f";
  const eyeX = player.facing > 0 ? px + 25 : px + 11;
  ctx.fillRect(eyeX, player.y + 15, 3, 3);
}

function draw() {
  drawBackground();

  ctx.save();
  ctx.translate(-cameraX, 0);

  for (const platform of platforms) {
    const isGround = platform.y >= floorY;
    ctx.fillStyle = isGround ? "#4f7f2e" : "#a86e31";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = isGround ? "#76b93f" : "#d49046";
    ctx.fillRect(platform.x, platform.y, platform.w, 7);
  }

  for (const coin of coins) {
    if (coin.collected) continue;
    ctx.fillStyle = "#f8d018";
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f1a503";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    ctx.fillStyle = "#6f4c2c";
    ctx.fillRect(enemy.x, enemy.y + 8, enemy.w, enemy.h - 8);
    ctx.fillStyle = "#4f3119";
    ctx.fillRect(enemy.x, enemy.y, enemy.w, 12);
    ctx.fillStyle = "#fff";
    ctx.fillRect(enemy.x + 8, enemy.y + 15, 6, 6);
    ctx.fillRect(enemy.x + 22, enemy.y + 15, 6, 6);
  }

  ctx.fillStyle = "#2f2f2f";
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
  ctx.fillStyle = "#ff4949";
  ctx.beginPath();
  ctx.moveTo(goal.x + goal.w, goal.y + 5);
  ctx.lineTo(goal.x + goal.w + 46, goal.y + 22);
  ctx.lineTo(goal.x + goal.w, goal.y + 39);
  ctx.closePath();
  ctx.fill();

  drawPlayer();

  ctx.restore();

  ctx.fillStyle = "#16213e";
  ctx.font = "700 24px Trebuchet MS";
  ctx.fillText(`Score: ${score}`, 20, 36);

  if (mode === "menu") {
    ctx.fillStyle = "#00000085";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "700 60px Trebuchet MS";
    ctx.fillText("Super TypeScript Mario", 180, 220);
    ctx.font = "600 30px Trebuchet MS";
    ctx.fillText("Press Start or Enter", 330, 280);
  }

  if (mode === "win" || mode === "lose") {
    ctx.fillStyle = "#00000085";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "700 72px Trebuchet MS";
    ctx.fillText(mode === "win" ? "You Win!" : "Game Over", 310, 240);
    ctx.font = "600 30px Trebuchet MS";
    ctx.fillText("Press R to restart", 355, 300);
  }
}

function step(ms: number) {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    update(dtFixed);
  }
  draw();
}

(window as typeof window & { advanceTime?: (ms: number) => void }).advanceTime = (ms: number) => {
  step(ms);
};

(window as typeof window & { render_game_to_text?: () => string }).render_game_to_text = () => {
  const payload = {
    coordinateSystem: "origin top-left, +x right, +y down",
    mode,
    camera: { x: Math.round(cameraX), y: 0, viewport: { w: canvas.width, h: canvas.height } },
    player: {
      x: Math.round(player.x),
      y: Math.round(player.y),
      w: player.w,
      h: player.h,
      vx: Math.round(player.vx),
      vy: Math.round(player.vy),
      onGround: player.onGround
    },
    score,
    goal,
    coins: coins.filter((c) => !c.collected).map((coin) => ({ x: coin.x, y: coin.y, r: coin.r })),
    enemies: enemies
      .filter((e) => e.alive)
      .map((enemy) => ({ x: Math.round(enemy.x), y: enemy.y, w: enemy.w, h: enemy.h, vx: Math.round(enemy.vx) }))
  };
  return JSON.stringify(payload);
};

function setPlaying() {
  if (mode === "menu") {
    mode = "playing";
  }
}

startBtn.addEventListener("click", () => {
  setPlaying();
  canvas.focus();
});

window.addEventListener("keydown", async (event) => {
  pressed.add(event.code);
  if (event.code === "Enter") {
    setPlaying();
  }
  if (event.code === "KeyR") {
    resetWorld();
  }
  if (event.code === "KeyF") {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await canvas.requestFullscreen();
    }
  }
});

window.addEventListener("keyup", (event) => {
  pressed.delete(event.code);
});

document.addEventListener("fullscreenchange", () => {
  draw();
});

function frame(ts: number) {
  const delta = Math.min(40, ts - lastTs);
  lastTs = ts;
  step(delta);
  requestAnimationFrame(frame);
}

draw();
requestAnimationFrame(frame);
