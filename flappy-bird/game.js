const game = document.querySelector('.game');
const bird = document.querySelector('.bird');
const scoreEl = document.querySelector('.score');
const messageEl = document.querySelector('.message');
const gameOverEl = document.querySelector('.game-over');

const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;
const GRAVITY = 0.35;
const FLAP_STRENGTH = -7;
const PIPE_GAP = 160;
const PIPE_WIDTH = 60;
const PIPE_SPEED = 1.5;
const PIPE_SPAWN_INTERVAL = 1500;

let birdY = 280;
let birdVelocity = 0;
let pipes = [];
let score = 0;
let started = false;
let gameOver = false;
let lastPipeTime = 0;
let animationFrameId = null;

function resetGame() {
    birdY = 280;
    birdVelocity = 0;
    score = 0;
    started = false;
    gameOver = false;
    lastPipeTime = 0;
    pipes.forEach(pipe => {
        pipe.topEl.remove();
        pipe.bottomEl.remove();
    });
    pipes = [];
    scoreEl.textContent = '0';
    bird.style.top = `${birdY}px`;
    gameOverEl.classList.add('hidden');
    messageEl.classList.remove('hidden');
}

function spawnPipe() {
    const minTop = 50;
    const maxTop = GAME_HEIGHT - PIPE_GAP - minTop - 50;
    const topHeight = minTop + Math.random() * maxTop;
    const bottomHeight = GAME_HEIGHT - topHeight - PIPE_GAP;

    const topEl = document.createElement('div');
    topEl.className = 'pipe';
    topEl.style.top = '0px';
    topEl.style.height = `${topHeight}px`;
    topEl.style.left = `${GAME_WIDTH}px`;
    topEl.style.width = `${PIPE_WIDTH}px`;

    const bottomEl = document.createElement('div');
    bottomEl.className = 'pipe';
    bottomEl.style.bottom = '0px';
    bottomEl.style.height = `${bottomHeight}px`;
    bottomEl.style.left = `${GAME_WIDTH}px`;
    bottomEl.style.width = `${PIPE_WIDTH}px`;

    game.appendChild(topEl);
    game.appendChild(bottomEl);

    pipes.push({
        x: GAME_WIDTH,
        topHeight,
        bottomHeight,
        topEl,
        bottomEl,
        passed: false,
    });
}

function flap() {
    if (gameOver) {
        resetGame();
        return;
    }
    if (!started) {
        started = true;
        messageEl.classList.add('hidden');
        lastPipeTime = performance.now();
        animationFrameId = requestAnimationFrame(loop);
    }
    birdVelocity = FLAP_STRENGTH;
}

function endGame() {
    gameOver = true;
    started = false;
    gameOverEl.classList.remove('hidden');
    cancelAnimationFrame(animationFrameId);
}

function checkCollision(pipe) {
    const birdLeft = 60;
    const birdRight = birdLeft + 34;
    const birdTop = birdY;
    const birdBottom = birdY + 24;

    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + PIPE_WIDTH;

    const hitsX = birdRight > pipeLeft && birdLeft < pipeRight;
    const hitsTopPipe = birdTop < pipe.topHeight;
    const hitsBottomPipe = birdBottom > GAME_HEIGHT - pipe.bottomHeight;

    return hitsX && (hitsTopPipe || hitsBottomPipe);
}

function loop(timestamp) {
    if (!started) return;

    birdVelocity += GRAVITY;
    birdY += birdVelocity;
    bird.style.top = `${birdY}px`;

    if (birdY < 0 || birdY + 24 > GAME_HEIGHT) {
        endGame();
        return;
    }

    if (timestamp - lastPipeTime > PIPE_SPAWN_INTERVAL) {
        spawnPipe();
        lastPipeTime = timestamp;
    }

    for (const pipe of pipes) {
        pipe.x -= PIPE_SPEED;
        pipe.topEl.style.left = `${pipe.x}px`;
        pipe.bottomEl.style.left = `${pipe.x}px`;

        if (!pipe.passed && pipe.x + PIPE_WIDTH < 60) {
            pipe.passed = true;
            score += 1;
            scoreEl.textContent = score;
        }

        if (checkCollision(pipe)) {
            endGame();
            return;
        }
    }

    while (pipes.length && pipes[0].x + PIPE_WIDTH < 0) {
        const old = pipes.shift();
        old.topEl.remove();
        old.bottomEl.remove();
    }

    animationFrameId = requestAnimationFrame(loop);
}

game.addEventListener('click', flap);
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        flap();
    }
});

resetGame();
