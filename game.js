// ============================================================
// FREEWAY (1981) - Atari Remake
// Atravesse a estrada evitando os carros!
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 480
const H = canvas.height;  // 640

// ---- CONSTANTES ----
const TILE = 40;                    // tamanho base do grid
const LANES = 10;                   // faixas de trânsito
const LANE_HEIGHT = 48;             // altura de cada faixa
const SAFE_ZONE_TOP = 40;           // zona segura (chegada)
const SAFE_ZONE_BOTTOM = 56;        // zona segura (partida)
const ROAD_TOP = SAFE_ZONE_TOP;
const ROAD_BOTTOM = H - SAFE_ZONE_BOTTOM;
const GAME_TIME = 60;               // segundos
const PLAYER_SPEED = LANE_HEIGHT;   // move 1 faixa por vez
const PLAYER_SIZE = 28;

// ---- CORES RETRÔ ----
const COLORS = {
    bg: '#1a1a2e',
    road: '#2d2d44',
    laneMarking: '#3a3a55',
    safeZoneTop: '#0f380f',
    safeZoneBottom: '#0f380f',
    grass: '#306230',
    grassLight: '#3a7a3a',
    player: '#f7d354',
    playerOutline: '#c9a82a',
    playerEye: '#1a1a2e',
    hud: '#e8e8e8',
    hudAccent: '#f7d354',
    timerLow: '#e74c3c',
    cars: [
        '#e74c3c', // vermelho
        '#3498db', // azul
        '#2ecc71', // verde
        '#e67e22', // laranja
        '#9b59b6', // roxo
        '#1abc9c', // turquesa
        '#f39c12', // amarelo escuro
        '#e84393', // rosa
        '#00b894', // verde-água
        '#fdcb6e', // dourado
    ],
    carWindow: '#87ceeb',
    carWindowDark: '#5a9ebd',
    white: '#ffffff',
    black: '#000000',
    titleGlow: '#00ff88',
};

// ---- ESTADO DO JOGO ----
let gameState = 'TITLE'; // TITLE | PLAYING | GAMEOVER
let score = 0;
let highScore = parseInt(localStorage.getItem('freeway_highscore') || '0');
let timeLeft = GAME_TIME;
let lastTime = 0;
let timerAccumulator = 0;
let flashTimer = 0;
let screenShake = 0;
let titleAnimTimer = 0;

// ---- JOGADOR ----
const player = {
    x: W / 2,
    y: H - SAFE_ZONE_BOTTOM / 2,
    targetY: H - SAFE_ZONE_BOTTOM / 2,
    moving: false,
    animFrame: 0,
    animTimer: 0,
    hitAnim: 0,
};

// ---- CARROS ----
let cars = [];

// Configuração das faixas (velocidade, direção, intervalo de spawn)
const laneConfigs = [];
function initLaneConfigs() {
    laneConfigs.length = 0;
    for (let i = 0; i < LANES; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const baseSpeed = 1.2 + Math.random() * 1.5;
        const speed = baseSpeed + (i * 0.15);
        laneConfigs.push({
            direction: dir,
            speed: speed,
            spawnInterval: 1800 + Math.random() * 1500,
            timeSinceSpawn: Math.random() * 1000,
            color: COLORS.cars[i % COLORS.cars.length],
            carLength: 50 + Math.floor(Math.random() * 30),
            carHeight: 28 + Math.floor(Math.random() * 8),
        });
    }
}

function getLaneY(laneIndex) {
    return ROAD_TOP + (laneIndex * LANE_HEIGHT) + LANE_HEIGHT / 2;
}

function spawnCar(laneIndex) {
    const cfg = laneConfigs[laneIndex];
    const x = cfg.direction === 1 ? -cfg.carLength : W + cfg.carLength;
    cars.push({
        x: x,
        y: getLaneY(laneIndex),
        width: cfg.carLength,
        height: cfg.carHeight,
        speed: cfg.speed * cfg.direction,
        color: cfg.color,
        lane: laneIndex,
    });
}

// ---- INPUT ----
const keys = {};

document.addEventListener('keydown', (e) => {
    if (keys[e.key]) return;
    keys[e.key] = true;

    if (gameState === 'TITLE') {
        if (e.key === 'Enter' || e.key === ' ') {
            startGame();
        }
        return;
    }

    if (gameState === 'GAMEOVER') {
        if (e.key === 'Enter' || e.key === ' ') {
            gameState = 'TITLE';
        }
        return;
    }

    if (gameState === 'PLAYING') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            movePlayerUp();
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            movePlayerDown();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// ---- LÓGICA DO JOGADOR ----
function movePlayerUp() {
    if (player.moving) return;
    const newY = player.y - PLAYER_SPEED;
    if (newY >= SAFE_ZONE_TOP / 2) {
        player.targetY = newY;
        player.moving = true;
    }
}

function movePlayerDown() {
    if (player.moving) return;
    const newY = player.y + PLAYER_SPEED;
    if (newY <= H - SAFE_ZONE_BOTTOM / 2) {
        player.targetY = newY;
        player.moving = true;
    }
}

function resetPlayerPosition() {
    player.x = W / 2;
    player.y = H - SAFE_ZONE_BOTTOM / 2;
    player.targetY = player.y;
    player.moving = false;
    player.hitAnim = 0;
}

function startGame() {
    gameState = 'PLAYING';
    score = 0;
    timeLeft = GAME_TIME;
    timerAccumulator = 0;
    cars = [];
    initLaneConfigs();
    resetPlayerPosition();
}

// ---- COLISÃO ----
function checkCollisions() {
    const px = player.x - PLAYER_SIZE / 2;
    const py = player.y - PLAYER_SIZE / 2;
    const pw = PLAYER_SIZE;
    const ph = PLAYER_SIZE;

    for (const car of cars) {
        const cx = car.x - car.width / 2;
        const cy = car.y - car.height / 2;

        // AABB collision com margem de tolerância
        const margin = 4;
        if (
            px + margin < cx + car.width &&
            px + pw - margin > cx &&
            py + margin < cy + car.height &&
            py + ph - margin > cy
        ) {
            // Colisão!
            screenShake = 12;
            player.hitAnim = 20;
            flashTimer = 8;
            resetPlayerPosition();
            return;
        }
    }
}

// ---- PONTUAÇÃO ----
function checkScoring() {
    if (player.y <= SAFE_ZONE_TOP / 2 + LANE_HEIGHT / 2) {
        score++;
        flashTimer = 6;
        resetPlayerPosition();
    }
}

// ---- UPDATE ----
function update(dt) {
    if (gameState === 'TITLE') {
        titleAnimTimer += dt;
        return;
    }

    if (gameState !== 'PLAYING') return;

    // Timer
    timerAccumulator += dt;
    if (timerAccumulator >= 1000) {
        timerAccumulator -= 1000;
        timeLeft--;
        if (timeLeft <= 0) {
            timeLeft = 0;
            gameState = 'GAMEOVER';
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('freeway_highscore', highScore.toString());
            }
            return;
        }
    }

    // Movimento suave do jogador
    if (player.moving) {
        const diff = player.targetY - player.y;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), 6);
        player.y += step;
        if (Math.abs(player.y - player.targetY) < 1) {
            player.y = player.targetY;
            player.moving = false;
        }
    }

    // Animação do jogador
    player.animTimer += dt;
    if (player.animTimer > 200) {
        player.animTimer = 0;
        player.animFrame = (player.animFrame + 1) % 2;
    }

    // Hit animation
    if (player.hitAnim > 0) player.hitAnim--;

    // Spawn de carros
    for (let i = 0; i < LANES; i++) {
        const cfg = laneConfigs[i];
        cfg.timeSinceSpawn += dt;
        if (cfg.timeSinceSpawn >= cfg.spawnInterval) {
            cfg.timeSinceSpawn = 0;
            spawnCar(i);
        }
    }

    // Mover carros
    for (const car of cars) {
        car.x += car.speed;
    }

    // Remover carros fora da tela
    cars = cars.filter(car => car.x > -100 && car.x < W + 100);

    // Colisões
    checkCollisions();

    // Pontuação
    checkScoring();

    // Screen shake decay
    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;

    // Flash decay
    if (flashTimer > 0) flashTimer--;
}

// ---- DESENHO ----

function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function drawRoad() {
    // Fundo
    drawPixelRect(0, 0, W, H, COLORS.bg);

    // Zona segura superior (chegada) - grama
    const grassPattern = (x, y) => {
        return (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
    };
    for (let x = 0; x < W; x += 8) {
        for (let y = 0; y < SAFE_ZONE_TOP; y += 8) {
            drawPixelRect(x, y, 8, 8, grassPattern(x, y) ? COLORS.grass : COLORS.grassLight);
        }
    }

    // Texto "CHEGADA" na zona superior
    ctx.fillStyle = COLORS.white;
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('★ CHEGADA ★', W / 2, SAFE_ZONE_TOP - 12);

    // Estrada
    drawPixelRect(0, SAFE_ZONE_TOP, W, ROAD_BOTTOM - ROAD_TOP, COLORS.road);

    // Linhas das faixas
    for (let i = 1; i < LANES; i++) {
        const y = ROAD_TOP + i * LANE_HEIGHT;
        for (let x = 0; x < W; x += 24) {
            drawPixelRect(x, y - 1, 12, 2, COLORS.laneMarking);
        }
    }

    // Zona segura inferior (partida) - grama
    for (let x = 0; x < W; x += 8) {
        for (let y = H - SAFE_ZONE_BOTTOM; y < H; y += 8) {
            drawPixelRect(x, y, 8, 8, grassPattern(x, y) ? COLORS.grass : COLORS.grassLight);
        }
    }

    // Texto "PARTIDA"
    ctx.fillStyle = COLORS.white;
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('PARTIDA', W / 2, H - 18);
}

function drawCar(car) {
    const x = Math.floor(car.x - car.width / 2);
    const y = Math.floor(car.y - car.height / 2);
    const w = car.width;
    const h = car.height;
    const goingRight = car.speed > 0;

    // Sombra
    drawPixelRect(x + 2, y + 2, w, h, 'rgba(0,0,0,0.3)');

    // Corpo do carro
    drawPixelRect(x, y, w, h, car.color);

    // Teto/cabine
    const cabinW = w * 0.4;
    const cabinH = h * 0.6;
    const cabinX = goingRight ? x + w * 0.35 : x + w * 0.25;
    const cabinY = y + (h - cabinH) / 2;

    // Escurecer cor do carro para a cabine
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(Math.floor(cabinX), Math.floor(cabinY), Math.floor(cabinW), Math.floor(cabinH));

    // Janelas
    const winW = cabinW * 0.35;
    const winH = cabinH * 0.6;
    const winY = cabinY + cabinH * 0.2;

    drawPixelRect(cabinX + 3, winY, winW, winH, COLORS.carWindow);
    drawPixelRect(cabinX + cabinW - winW - 3, winY, winW, winH, COLORS.carWindowDark);

    // Faróis
    if (goingRight) {
        drawPixelRect(x + w - 4, y + 3, 4, 4, '#ffee88');
        drawPixelRect(x + w - 4, y + h - 7, 4, 4, '#ffee88');
        // Lanternas traseiras
        drawPixelRect(x, y + 3, 3, 4, '#ff3333');
        drawPixelRect(x, y + h - 7, 3, 4, '#ff3333');
    } else {
        drawPixelRect(x, y + 3, 4, 4, '#ffee88');
        drawPixelRect(x, y + h - 7, 4, 4, '#ffee88');
        // Lanternas traseiras
        drawPixelRect(x + w - 3, y + 3, 3, 4, '#ff3333');
        drawPixelRect(x + w - 3, y + h - 7, 3, 4, '#ff3333');
    }

    // Rodas
    drawPixelRect(x + 6, y - 2, 8, 4, '#222');
    drawPixelRect(x + w - 14, y - 2, 8, 4, '#222');
    drawPixelRect(x + 6, y + h - 2, 8, 4, '#222');
    drawPixelRect(x + w - 14, y + h - 2, 8, 4, '#222');

    // Brilho
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, w, Math.floor(h * 0.3));
}

function drawPlayer() {
    if (player.hitAnim > 0 && player.hitAnim % 4 < 2) return; // piscar

    const x = Math.floor(player.x);
    const y = Math.floor(player.y);
    const s = PLAYER_SIZE;
    const half = s / 2;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + half + 2, half * 0.7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Corpo (galinha pixel art style)
    // Corpo principal
    drawPixelRect(x - 8, y - 6, 16, 16, COLORS.player);
    // Contorno
    drawPixelRect(x - 10, y - 4, 2, 12, COLORS.playerOutline);
    drawPixelRect(x + 8, y - 4, 2, 12, COLORS.playerOutline);
    drawPixelRect(x - 8, y - 8, 16, 2, COLORS.playerOutline);
    drawPixelRect(x - 8, y + 10, 16, 2, COLORS.playerOutline);

    // Cabeça
    drawPixelRect(x - 6, y - 12, 12, 6, COLORS.player);
    drawPixelRect(x - 8, y - 10, 2, 4, COLORS.playerOutline);
    drawPixelRect(x + 6, y - 10, 2, 4, COLORS.playerOutline);
    drawPixelRect(x - 6, y - 14, 12, 2, COLORS.playerOutline);

    // Crista (vermelha)
    drawPixelRect(x - 2, y - 18, 4, 4, '#e74c3c');
    drawPixelRect(x + 2, y - 16, 4, 2, '#e74c3c');

    // Olhos
    drawPixelRect(x - 4, y - 10, 3, 3, COLORS.playerEye);
    drawPixelRect(x + 2, y - 10, 3, 3, COLORS.playerEye);

    // Bico
    drawPixelRect(x - 1, y - 6, 4, 3, '#e67e22');

    // Pernas (animadas)
    if (player.moving) {
        if (player.animFrame === 0) {
            drawPixelRect(x - 4, y + 10, 2, 6, '#e67e22');
            drawPixelRect(x + 2, y + 12, 2, 4, '#e67e22');
        } else {
            drawPixelRect(x - 4, y + 12, 2, 4, '#e67e22');
            drawPixelRect(x + 2, y + 10, 2, 6, '#e67e22');
        }
    } else {
        drawPixelRect(x - 4, y + 10, 2, 5, '#e67e22');
        drawPixelRect(x + 2, y + 10, 2, 5, '#e67e22');
    }

    // Asas (pequenas)
    drawPixelRect(x - 12, y - 2, 4, 8, COLORS.playerOutline);
    drawPixelRect(x + 8, y - 2, 4, 8, COLORS.playerOutline);
}

function drawHUD() {
    // Fundo do HUD
    ctx.fillStyle = 'rgba(0,0,0,0.7)';

    // Score (canto superior esquerdo sobre a grama)
    ctx.font = '11px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText('SCORE', 12, 16);
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(score.toString().padStart(3, '0'), 100, 16);

    // High Score
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText('HI', 180, 16);
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(highScore.toString().padStart(3, '0'), 220, 16);

    // Timer (canto superior direito)
    ctx.textAlign = 'right';
    ctx.fillStyle = timeLeft <= 10 ? COLORS.timerLow : COLORS.hudAccent;

    // Piscar timer quando baixo
    if (timeLeft <= 10 && Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = COLORS.hud;
    }
    ctx.fillText('TIME', W - 80, 16);
    ctx.fillStyle = timeLeft <= 10 ? COLORS.timerLow : COLORS.hud;
    ctx.fillText(timeLeft.toString().padStart(2, '0'), W - 12, 16);

    // Barra de tempo
    const barW = 120;
    const barH = 6;
    const barX = W - barW - 12;
    const barY = 24;
    const fillRatio = timeLeft / GAME_TIME;

    drawPixelRect(barX, barY, barW, barH, '#222');
    const barColor = timeLeft <= 10 ? '#e74c3c' : timeLeft <= 20 ? '#f39c12' : '#2ecc71';
    drawPixelRect(barX, barY, barW * fillRatio, barH, barColor);
    // Borda
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
}

function drawTitleScreen() {
    // Fundo animado
    drawPixelRect(0, 0, W, H, COLORS.bg);

    // Estrada decorativa no fundo
    drawPixelRect(0, 200, W, 300, COLORS.road);
    for (let i = 0; i < 6; i++) {
        const y = 200 + i * 50;
        for (let x = 0; x < W; x += 24) {
            drawPixelRect(x, y + 24, 12, 2, COLORS.laneMarking);
        }
    }

    // Carros decorativos animados
    const t = titleAnimTimer / 1000;
    for (let i = 0; i < 6; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = 40 + i * 15;
        const carX = ((t * speed * dir) % (W + 100)) + (dir === 1 ? -50 : W + 50);
        const adjustedX = dir === 1 ? ((carX % (W + 100)) + (W + 100)) % (W + 100) - 50 : W + 50 - (((W + 50 - carX) % (W + 100)) + (W + 100)) % (W + 100);
        drawCar({
            x: adjustedX,
            y: 225 + i * 50,
            width: 55,
            height: 30,
            speed: dir,
            color: COLORS.cars[i],
        });
    }

    // Grama superior
    for (let x = 0; x < W; x += 8) {
        for (let y = 0; y < 200; y += 8) {
            const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
            drawPixelRect(x, y, 8, 8, checker ? COLORS.grass : COLORS.grassLight);
        }
    }

    // Grama inferior
    for (let x = 0; x < W; x += 8) {
        for (let y = 500; y < H; y += 8) {
            const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
            drawPixelRect(x, y, 8, 8, checker ? COLORS.grass : COLORS.grassLight);
        }
    }

    // Título com efeito de sombra
    ctx.textAlign = 'center';

    // Sombra do título
    ctx.font = '32px "Press Start 2P"';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText('FREEWAY', W / 2 + 3, 103);

    // Título principal com glow
    const glowIntensity = Math.sin(titleAnimTimer / 400) * 0.3 + 0.7;
    ctx.shadowColor = COLORS.titleGlow;
    ctx.shadowBlur = 15 * glowIntensity;
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText('FREEWAY', W / 2, 100);
    ctx.shadowBlur = 0;

    // Subtítulo
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = '#888';
    ctx.fillText('ATARI 1981 REMAKE', W / 2, 130);

    // Galinha no título
    ctx.save();
    ctx.translate(W / 2, 168);
    const bobY = Math.sin(titleAnimTimer / 300) * 3;
    ctx.translate(0, bobY);

    // Corpo
    drawPixelRect(W / 2 - 8 - W / 2, 168 - 6 - 168 + bobY, 16, 16, COLORS.player);
    drawPixelRect(W / 2 - 6 - W / 2, 168 - 12 - 168 + bobY, 12, 6, COLORS.player);
    drawPixelRect(W / 2 - 2 - W / 2, 168 - 18 - 168 + bobY, 4, 4, '#e74c3c');
    drawPixelRect(W / 2 - 4 - W / 2, 168 - 10 - 168 + bobY, 3, 3, COLORS.playerEye);
    drawPixelRect(W / 2 + 2 - W / 2, 168 - 10 - 168 + bobY, 3, 3, COLORS.playerEye);
    drawPixelRect(W / 2 - 1 - W / 2, 168 - 6 - 168 + bobY, 4, 3, '#e67e22');
    drawPixelRect(W / 2 - 4 - W / 2, 168 + 10 - 168 + bobY, 2, 5, '#e67e22');
    drawPixelRect(W / 2 + 2 - W / 2, 168 + 10 - 168 + bobY, 2, 5, '#e67e22');
    ctx.restore();

    // Instruções piscantes
    if (Math.floor(titleAnimTimer / 600) % 2 === 0) {
        ctx.font = '12px "Press Start 2P"';
        ctx.fillStyle = COLORS.hud;
        ctx.fillText('PRESS ENTER TO START', W / 2, 560);
    }

    // High score
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText('HIGH SCORE: ' + highScore.toString().padStart(3, '0'), W / 2, 595);

    // Controles
    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = '#666';
    ctx.fillText('↑↓ OU W/S PARA MOVER', W / 2, 620);
}

function drawGameOverScreen() {
    // Escurecer o fundo
    drawRoad();
    for (const car of cars) drawCar(car);
    drawPlayer();

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    // Painel central
    const panelW = 360;
    const panelH = 260;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // Borda do painel
    drawPixelRect(panelX - 4, panelY - 4, panelW + 8, panelH + 8, COLORS.hudAccent);
    drawPixelRect(panelX, panelY, panelW, panelH, '#111');

    ctx.textAlign = 'center';

    // Game Over
    ctx.font = '24px "Press Start 2P"';
    ctx.fillStyle = COLORS.timerLow;
    ctx.fillText('GAME OVER', W / 2, panelY + 50);

    // Linha decorativa
    drawPixelRect(panelX + 20, panelY + 65, panelW - 40, 2, COLORS.hudAccent);

    // Score
    ctx.font = '14px "Press Start 2P"';
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText('PONTUAÇÃO', W / 2, panelY + 100);
    ctx.font = '28px "Press Start 2P"';
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(score.toString().padStart(3, '0'), W / 2, panelY + 140);

    // High Score
    ctx.font = '10px "Press Start 2P"';
    if (score >= highScore && score > 0) {
        ctx.fillStyle = COLORS.hudAccent;
        ctx.fillText('★ NOVO RECORDE! ★', W / 2, panelY + 170);
    } else {
        ctx.fillStyle = '#888';
        ctx.fillText('RECORDE: ' + highScore.toString().padStart(3, '0'), W / 2, panelY + 170);
    }

    // Linha decorativa
    drawPixelRect(panelX + 20, panelY + 185, panelW - 40, 2, COLORS.hudAccent);

    // Restart
    if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.font = '10px "Press Start 2P"';
        ctx.fillStyle = COLORS.hud;
        ctx.fillText('PRESS ENTER', W / 2, panelY + 220);
    }
}

// ---- FLASH EFFECT ----
function drawFlash() {
    if (flashTimer > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashTimer * 0.04})`;
        ctx.fillRect(0, 0, W, H);
    }
}

// ---- GAME LOOP ----
function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    // Limitar dt para evitar saltos grandes
    const clampedDt = Math.min(dt, 50);

    update(clampedDt);

    // Screen shake
    ctx.save();
    if (screenShake > 0) {
        ctx.translate(
            (Math.random() - 0.5) * screenShake,
            (Math.random() - 0.5) * screenShake
        );
    }

    if (gameState === 'TITLE') {
        drawTitleScreen();
    } else if (gameState === 'PLAYING') {
        drawRoad();
        for (const car of cars) drawCar(car);
        drawPlayer();
        drawHUD();
        drawFlash();
    } else if (gameState === 'GAMEOVER') {
        drawGameOverScreen();
    }

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

// ---- INICIAR ----
requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});
