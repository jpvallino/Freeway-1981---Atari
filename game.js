// ============================================================
// FREEWAY (1981) - Atari 2600 Faithful Remake
// Atravesse a estrada evitando os carros!
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 480
const H = canvas.height;  // 640

// ---- LAYOUT DE FAIXAS ----
// Total de faixas verticais (incluindo zonas seguras)
// Faixa 0 = partida (base), Faixas 1-10 = trânsito, Faixa 11 = chegada (topo)
const TOTAL_LANES = 12;
const LANE_HEIGHT = Math.floor(H / TOTAL_LANES); // ~53px por faixa
const TRAFFIC_LANES = 10; // faixas 1 a 10

const GAME_TIME = 60; // segundos

// Pixel size unit — tudo é múltiplo desse valor para manter o look blocado
const PX = 4;

// ---- PALETA ATARI 2600 ----
// Cores fiéis ao hardware do Atari: limitadas e sólidas
const PAL = {
    black:      '#000000',
    darkGray:   '#404040',
    gray:       '#6c6c6c',
    road:       '#444444',
    laneLine:   '#6c6c6c',
    grassDark:  '#008a00',
    grassLight: '#00ba00',
    chicken:    '#d8d800', // amarelo
    chickenDark:'#a8a800',
    comb:       '#d04040', // crista vermelha
    beak:       '#d08020',
    legs:       '#d08020',
    white:      '#fcfcfc',
    scoreP1:    '#00d800', // verde para score
    scoreP2:    '#5c5cfc', // azul
    timerColor: '#fcfcfc',
    timerLow:   '#d04040',
    // Cores dos carros por faixa (paleta Atari)
    cars: [
        '#d04040', // vermelho
        '#5c5cfc', // azul
        '#00a800', // verde
        '#d0a000', // amarelo escuro
        '#b040b0', // roxo
        '#00a8a8', // cyan
        '#d06000', // laranja
        '#fc5cfc', // rosa
        '#00d800', // verde claro
        '#8080fc', // azul claro
    ],
};

// ---- ESTADO DO JOGO ----
let gameState = 'TITLE'; // TITLE | PLAYING | GAMEOVER
let score = 0;
let highScore = parseInt(localStorage.getItem('freeway_highscore') || '0');
let timeLeft = GAME_TIME;
let lastTime = 0;
let timerAccumulator = 0;
let titleBlinkTimer = 0;
let hitBlinkFrames = 0;

// ---- JOGADOR (SISTEMA DE FAIXAS) ----
// playerLane: índice da faixa onde o jogador está
// 0 = partida, 11 = chegada, 1-10 = trânsito
const player = {
    lane: 0,       // faixa atual
    x: W / 2,     // posição X fixa (centro da tela)
};

// Calcula a posição Y central de uma faixa
function laneToY(laneIndex) {
    // Faixa 0 fica embaixo, faixa 11 fica em cima
    // Invertemos: faixa 0 = base da tela, faixa 11 = topo
    return H - (laneIndex * LANE_HEIGHT) - LANE_HEIGHT / 2;
}

// Retorna a Y do jogador baseado na faixa
function getPlayerY() {
    return laneToY(player.lane);
}

// ---- CARROS ----
let cars = [];

// Configuração fixa das faixas de trânsito (1-10)
const laneConfigs = [];
function initLaneConfigs() {
    laneConfigs.length = 0;
    for (let i = 0; i < TRAFFIC_LANES; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        // Velocidades variadas mas discretas (múltiplos de PX/2)
        const speeds = [1.0, 1.5, 2.0, 2.5, 1.2, 1.8, 2.2, 1.4, 2.8, 1.6];
        const speed = speeds[i] * PX * 0.5;
        laneConfigs.push({
            direction: dir,
            speed: speed,
            spawnInterval: 1600 + (i % 3) * 600,
            timeSinceSpawn: i * 200, // escalonado para não spawnar junto
            color: PAL.cars[i],
        });
    }
}

function trafficLaneToY(trafficIndex) {
    // Faixas de trânsito são lanes 1-10 no sistema do jogador
    return laneToY(trafficIndex + 1);
}

function spawnCar(trafficIndex) {
    const cfg = laneConfigs[trafficIndex];
    const carW = PX * 12; // 48px — bloco simples
    const carH = PX * 5;  // 20px
    const startX = cfg.direction === 1 ? -carW : W + carW;
    cars.push({
        x: startX,
        y: trafficLaneToY(trafficIndex),
        width: carW,
        height: carH,
        speed: cfg.speed * cfg.direction,
        color: cfg.color,
        trafficLane: trafficIndex,
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

// ---- LÓGICA DO JOGADOR (BASEADO EM FAIXAS) ----
function movePlayerUp() {
    if (player.lane < TOTAL_LANES - 1) {
        player.lane++;
    }
}

function movePlayerDown() {
    if (player.lane > 0) {
        player.lane--;
    }
}

function resetPlayerToStart() {
    player.lane = 0;
    hitBlinkFrames = 0;
}

function startGame() {
    gameState = 'PLAYING';
    score = 0;
    timeLeft = GAME_TIME;
    timerAccumulator = 0;
    cars = [];
    hitBlinkFrames = 0;
    initLaneConfigs();
    resetPlayerToStart();
}

// ---- COLISÃO ----
function checkCollisions() {
    const py = getPlayerY();
    const px = player.x;
    // Hitbox da galinha: bem simples, um bloco
    const chickenW = PX * 5;  // 20px
    const chickenH = PX * 6;  // 24px
    const pLeft = px - chickenW / 2;
    const pRight = px + chickenW / 2;
    const pTop = py - chickenH / 2;
    const pBottom = py + chickenH / 2;

    for (const car of cars) {
        const cLeft = car.x - car.width / 2;
        const cRight = car.x + car.width / 2;
        const cTop = car.y - car.height / 2;
        const cBottom = car.y + car.height / 2;

        if (pLeft < cRight && pRight > cLeft && pTop < cBottom && pBottom > cTop) {
            // Colisão! Voltar ao início
            hitBlinkFrames = 30;
            resetPlayerToStart();
            return;
        }
    }
}

// ---- PONTUAÇÃO ----
function checkScoring() {
    if (player.lane >= TOTAL_LANES - 1) {
        // Chegou na faixa de chegada!
        score++;
        resetPlayerToStart();
    }
}

// ---- UPDATE ----
function update(dt) {
    if (gameState === 'TITLE') {
        titleBlinkTimer += dt;
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

    // Hit blink countdown
    if (hitBlinkFrames > 0) hitBlinkFrames--;

    // Spawn de carros
    for (let i = 0; i < TRAFFIC_LANES; i++) {
        const cfg = laneConfigs[i];
        cfg.timeSinceSpawn += dt;
        if (cfg.timeSinceSpawn >= cfg.spawnInterval) {
            cfg.timeSinceSpawn = 0;
            spawnCar(i);
        }
    }

    // Mover carros (discreto, sem sub-pixel)
    for (const car of cars) {
        car.x += car.speed;
    }

    // Remover carros fora da tela
    cars = cars.filter(car => car.x > -80 && car.x < W + 80);

    // Colisões
    checkCollisions();

    // Pontuação
    checkScoring();
}

// ---- DESENHO ----

// Função utilitária: retângulo alinhado ao grid de pixels
function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

// ---- DESENHO DA ESTRADA ----
function drawRoad() {
    // Fundo preto (Atari style)
    px(0, 0, W, H, PAL.black);

    // Zona de chegada (faixa 11) — verde claro
    const topY = laneToY(TOTAL_LANES - 1) - LANE_HEIGHT / 2;
    px(0, topY, W, LANE_HEIGHT, PAL.grassDark);
    // Padrão blocado na grama superior
    for (let bx = 0; bx < W; bx += PX * 4) {
        px(bx, topY, PX * 2, LANE_HEIGHT, PAL.grassLight);
    }

    // Zona de partida (faixa 0) — verde escuro
    const botY = laneToY(0) - LANE_HEIGHT / 2;
    px(0, botY, W, LANE_HEIGHT, PAL.grassDark);
    for (let bx = PX * 2; bx < W; bx += PX * 4) {
        px(bx, botY, PX * 2, LANE_HEIGHT, PAL.grassLight);
    }

    // Estrada (faixas 1-10)
    for (let i = 0; i < TRAFFIC_LANES; i++) {
        const y = trafficLaneToY(i) - LANE_HEIGHT / 2;
        px(0, y, W, LANE_HEIGHT, PAL.road);
    }

    // Linhas separadoras entre faixas de trânsito
    for (let i = 0; i <= TRAFFIC_LANES; i++) {
        const lineY = laneToY(i + 1) + LANE_HEIGHT / 2 - 1;
        px(0, lineY, W, 2, PAL.laneLine);
    }
}

// ---- DESENHO DO CARRO (ATARI STYLE) ----
// Bloco extremamente simples: corpo + para-choques
function drawCar(car) {
    const cx = Math.floor(car.x);
    const cy = Math.floor(car.y);
    const hw = Math.floor(car.width / 2);
    const hh = Math.floor(car.height / 2);
    const goingRight = car.speed > 0;

    // Corpo principal — bloco sólido
    px(cx - hw, cy - hh, car.width, car.height, car.color);

    // Faixa central mais escura (simula janelas como no Atari)
    const stripeH = PX;
    px(cx - hw, cy - Math.floor(stripeH / 2), car.width, stripeH, PAL.black);

    // Para-choque dianteiro (branco, 1 pixel de largura)
    if (goingRight) {
        px(cx + hw - PX, cy - hh, PX, car.height, PAL.white);
    } else {
        px(cx - hw, cy - hh, PX, car.height, PAL.white);
    }
}

// ---- DESENHO DA GALINHA (ATARI STYLE) ----
// Sprite mínimo: ~5x8 "pixels" Atari (cada "pixel" = PX unidades)
function drawChicken() {
    // Piscar ao ser atingido
    if (hitBlinkFrames > 0 && Math.floor(hitBlinkFrames / 3) % 2 === 0) return;

    const cx = Math.floor(player.x);
    const cy = Math.floor(getPlayerY());

    // A galinha é desenhada com blocos de PXxPX
    // Layout (cada célula = PX pixels):
    //     [C]          <- crista (vermelha)
    //    [H H]         <- cabeça (amarela) com olho
    //    [HHH]         <- cabeça
    //   [BBBBB]        <- corpo
    //   [BBBBB]        <- corpo
    //   [BBBBB]        <- corpo
    //    [L L]         <- pernas

    const p = PX; // atalho

    // Crista (vermelha) — 1 bloco no topo
    px(cx - p * 0.5, cy - p * 4, p, p, PAL.comb);
    px(cx - p * 1.5, cy - p * 3, p, p, PAL.comb);
    px(cx - p * 0.5, cy - p * 3, p, p, PAL.comb);

    // Cabeça (amarela) — 3 blocos de largura
    px(cx - p * 1.5, cy - p * 2, p * 3, p * 2, PAL.chicken);

    // Olho — 1 bloco escuro
    px(cx + p * 0.5, cy - p * 2, p, p, PAL.black);

    // Bico (laranja) — 1 bloco saindo
    px(cx + p * 1.5, cy - p * 1, p, p, PAL.beak);

    // Corpo (amarelo mais claro) — 5 blocos de largura, 3 de altura
    px(cx - p * 2.5, cy, p * 5, p * 3, PAL.chicken);
    // Asa — um tom mais escuro
    px(cx - p * 2.5, cy + p, p, p * 2, PAL.chickenDark);

    // Pernas (laranja) — 2 blocos
    px(cx - p * 1.5, cy + p * 3, p, p * 1, PAL.legs);
    px(cx + p * 0.5, cy + p * 3, p, p * 1, PAL.legs);
}

// ---- HUD (ATARI STYLE) ----
function drawHUD() {
    ctx.font = '12px "Press Start 2P"';
    ctx.textAlign = 'left';

    // Score
    ctx.fillStyle = PAL.scoreP1;
    ctx.fillText('P1:' + score.toString().padStart(2, '0'), 8, 18);

    // High Score
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.white;
    ctx.fillText('HI:' + highScore.toString().padStart(2, '0'), W / 2, 18);

    // Timer
    ctx.textAlign = 'right';
    const timerFlash = timeLeft <= 10 && Math.floor(Date.now() / 400) % 2 === 0;
    ctx.fillStyle = timeLeft <= 10 ? (timerFlash ? PAL.black : PAL.timerLow) : PAL.timerColor;
    ctx.fillText(timeLeft.toString().padStart(2, '0'), W - 8, 18);

    // Barra de tempo simples
    const barX = W - 140;
    const barW = 100;
    const barH = PX;
    const barY = 24;
    const fill = Math.floor(barW * (timeLeft / GAME_TIME));
    px(barX, barY, barW, barH, PAL.darkGray);
    px(barX, barY, fill, barH, timeLeft <= 10 ? PAL.timerLow : PAL.scoreP1);
}

// ---- TELA DE TÍTULO ----
function drawTitleScreen() {
    px(0, 0, W, H, PAL.black);

    // Estrada decorativa
    const roadStart = Math.floor(H * 0.3);
    const roadEnd = Math.floor(H * 0.75);
    px(0, roadStart, W, roadEnd - roadStart, PAL.road);

    // Linhas de faixa na estrada decorativa
    const decorLanes = 6;
    const decorLaneH = (roadEnd - roadStart) / decorLanes;
    for (let i = 1; i < decorLanes; i++) {
        px(0, roadStart + i * decorLaneH - 1, W, 2, PAL.laneLine);
    }

    // Carros decorativos animados
    const t = titleBlinkTimer / 1000;
    for (let i = 0; i < decorLanes; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const speed = 60 + i * 20;
        const carW = PX * 12;
        const carH = PX * 5;
        const carY = roadStart + i * decorLaneH + decorLaneH / 2;

        // Posição cíclica
        let carX;
        if (dir === 1) {
            carX = ((t * speed) % (W + carW * 2)) - carW;
        } else {
            carX = W + carW - ((t * speed) % (W + carW * 2));
        }

        drawCar({
            x: carX,
            y: carY,
            width: carW,
            height: carH,
            speed: dir,
            color: PAL.cars[i],
        });
    }

    // Grama superior
    px(0, 0, W, roadStart, PAL.grassDark);
    for (let bx = 0; bx < W; bx += PX * 4) {
        px(bx, 0, PX * 2, roadStart, PAL.grassLight);
    }

    // Grama inferior
    px(0, roadEnd, W, H - roadEnd, PAL.grassDark);
    for (let bx = PX * 2; bx < W; bx += PX * 4) {
        px(bx, roadEnd, PX * 2, H - roadEnd, PAL.grassLight);
    }

    // Título
    ctx.textAlign = 'center';
    ctx.font = '32px "Press Start 2P"';
    ctx.fillStyle = PAL.chicken;
    ctx.fillText('FREEWAY', W / 2, 70);

    // Subtítulo
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = PAL.gray;
    ctx.fillText('ATARI 2600 - 1981', W / 2, 95);

    // Galinha decorativa no meio da grama superior
    ctx.save();
    const chickenTitleX = W / 2;
    const chickenTitleY = 140;
    const p = PX;
    // Crista
    px(chickenTitleX - p * 0.5, chickenTitleY - p * 4, p, p, PAL.comb);
    px(chickenTitleX - p * 1.5, chickenTitleY - p * 3, p * 2, p, PAL.comb);
    // Cabeça
    px(chickenTitleX - p * 1.5, chickenTitleY - p * 2, p * 3, p * 2, PAL.chicken);
    px(chickenTitleX + p * 0.5, chickenTitleY - p * 2, p, p, PAL.black);
    px(chickenTitleX + p * 1.5, chickenTitleY - p * 1, p, p, PAL.beak);
    // Corpo
    px(chickenTitleX - p * 2.5, chickenTitleY, p * 5, p * 3, PAL.chicken);
    px(chickenTitleX - p * 2.5, chickenTitleY + p, p, p * 2, PAL.chickenDark);
    // Pernas
    px(chickenTitleX - p * 1.5, chickenTitleY + p * 3, p, p, PAL.legs);
    px(chickenTitleX + p * 0.5, chickenTitleY + p * 3, p, p, PAL.legs);
    ctx.restore();

    // "PRESS ENTER" piscante
    if (Math.floor(titleBlinkTimer / 500) % 2 === 0) {
        ctx.font = '12px "Press Start 2P"';
        ctx.fillStyle = PAL.white;
        ctx.fillText('PRESS ENTER', W / 2, H - 70);
    }

    // High Score
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = PAL.scoreP1;
    ctx.fillText('HI:' + highScore.toString().padStart(2, '0'), W / 2, H - 40);

    // Controles
    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = PAL.gray;
    ctx.fillText('SETAS OU W/S', W / 2, H - 18);
}

// ---- TELA DE GAME OVER (ATARI STYLE) ----
function drawGameOverScreen() {
    // Desenhar estado congelado por baixo
    drawRoad();
    for (const car of cars) drawCar(car);
    drawChicken();

    // Overlay escuro
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, W, H);

    // Painel central — borda simples
    const panelW = 300;
    const panelH = 220;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    // Borda branca
    px(panelX - 4, panelY - 4, panelW + 8, panelH + 8, PAL.white);
    // Interior preto
    px(panelX, panelY, panelW, panelH, PAL.black);

    ctx.textAlign = 'center';

    // GAME OVER
    ctx.font = '20px "Press Start 2P"';
    ctx.fillStyle = PAL.timerLow;
    ctx.fillText('GAME OVER', W / 2, panelY + 45);

    // Linha
    px(panelX + 16, panelY + 58, panelW - 32, 2, PAL.gray);

    // Score
    ctx.font = '12px "Press Start 2P"';
    ctx.fillStyle = PAL.white;
    ctx.fillText('SCORE', W / 2, panelY + 90);
    ctx.font = '28px "Press Start 2P"';
    ctx.fillStyle = PAL.scoreP1;
    ctx.fillText(score.toString().padStart(3, '0'), W / 2, panelY + 130);

    // High Score / Novo Recorde
    ctx.font = '10px "Press Start 2P"';
    if (score >= highScore && score > 0) {
        ctx.fillStyle = PAL.chicken;
        ctx.fillText('NEW RECORD!', W / 2, panelY + 158);
    } else {
        ctx.fillStyle = PAL.gray;
        ctx.fillText('HI:' + highScore.toString().padStart(3, '0'), W / 2, panelY + 158);
    }

    // Linha
    px(panelX + 16, panelY + 170, panelW - 32, 2, PAL.gray);

    // PRESS ENTER piscante
    if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.font = '10px "Press Start 2P"';
        ctx.fillStyle = PAL.white;
        ctx.fillText('PRESS ENTER', W / 2, panelY + 200);
    }
}

// ---- GAME LOOP ----
function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    const clampedDt = Math.min(dt, 50);

    update(clampedDt);

    // Sem screen shake (não é Atari)
    if (gameState === 'TITLE') {
        drawTitleScreen();
    } else if (gameState === 'PLAYING') {
        drawRoad();
        for (const car of cars) drawCar(car);
        drawChicken();
        drawHUD();
    } else if (gameState === 'GAMEOVER') {
        drawGameOverScreen();
    }

    requestAnimationFrame(gameLoop);
}

// ---- INICIAR ----
requestAnimationFrame((timestamp) => {
    lastTime = timestamp;
    gameLoop(timestamp);
});
