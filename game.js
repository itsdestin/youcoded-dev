const bird = document.getElementById('bird');
const scoreDisplay = document.getElementById('score');
const messageDisplay = document.getElementById('message');
const gameContainer = document.querySelector('.game-container');

// Game Constants
const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;
const BIRD_SIZE = 40;
const GRAVITY = 0.5;
const JUMP_STRENGTH = -10;
const PIPE_WIDTH = 60;
const PIPE_SPEED = 3;
const PIPE_GAP = 150;
const PIPE_SPAWN_RATE = 1500; // milliseconds

let birdY = 250;
let velocity = 0;
let score = 0;
let isGameOver = true;
let gameLoopInterval;
let pipeInterval;
let pipes = [];

// --- Game Initialization ---
function resetGame() {
    birdY = GAME_HEIGHT / 2;
    velocity = 0;
    score = 0;
    isGameOver = false;
    scoreDisplay.textContent = score;
    messageDisplay.textContent = "Click or Space to Start";
    bird.style.top = `${birdY}px`;
    
    // Clear existing pipes
    pipes.forEach(pipe => pipe.element.remove());
    pipes = [];

    // Start game loops
    gameLoopInterval = setInterval(gameLoop, 20); // ~50 FPS
    pipeInterval = setInterval(createPipe, PIPE_SPAWN_RATE);
}

function startGame() {
    if (isGameOver) {
        resetGame();
    }
}

// --- Bird Logic ---
function applyGravity() {
    velocity += GRAVITY;
    birdY += velocity;
    bird.style.top = `${birdY}px`;

    // Check for ground/ceiling collision
    if (birdY + BIRD_SIZE > GAME_HEIGHT || birdY < 0) {
        endGame();
    }
}

function jump() {
    if (!isGameOver) {
        velocity = JUMP_STRENGTH;
    }
}

// --- Pipe Logic ---
function createPipe() {
    if (isGameOver) return;

    // Randomly determine the height of the top pipe
    const minHeight = 50;
    const maxHeight = GAME_HEIGHT - PIPE_GAP - minHeight;
    const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
    const bottomHeight = GAME_HEIGHT - topHeight - PIPE_GAP;

    // Top Pipe
    const pipeTop = document.createElement('div');
    pipeTop.classList.add('pipe', 'top');
    pipeTop.style.height = `${topHeight}px`;
    pipeTop.style.left = `${GAME_WIDTH}px`;
    pipeTop.dataset.passed = 'false'; // To track if the bird has passed it

    // Bottom Pipe
    const pipeBottom = document.createElement('div');
    pipeBottom.classList.add('pipe', 'bottom');
    pipeBottom.style.height = `${bottomHeight}px`;
    pipeBottom.style.left = `${GAME_WIDTH}px`;
    pipeBottom.dataset.passed = 'false';

    gameContainer.appendChild(pipeTop);
    gameContainer.appendChild(pipeBottom);

    pipes.push({
        element: [pipeTop, pipeBottom],
        x: GAME_WIDTH,
        topHeight: topHeight,
        passed: false
    });
}

function movePipes() {
    for (let i = pipes.length - 1; i >= 0; i--) {
        const pipeSet = pipes[i];
        pipeSet.x -= PIPE_SPEED;
        pipeSet.element[0].style.left = `${pipeSet.x}px`;
        pipeSet.element[1].style.left = `${pipeSet.x}px`;

        // Check for scoring
        if (pipeSet.x + PIPE_WIDTH < 50 && !pipeSet.passed) { // Bird's center is at 50px
            score++;
            scoreDisplay.textContent = score;
            pipeSet.passed = true;
        }

        // Remove pipe if it goes off screen
        if (pipeSet.x + PIPE_WIDTH < 0) {
            pipeSet.element[0].remove();
            pipeSet.element[1].remove();
            pipes.splice(i, 1);
        }
    }
}

// --- Collision Detection ---
function checkCollision() {
    const birdRect = bird.getBoundingClientRect();
    const containerRect = gameContainer.getBoundingClientRect();

    // Adjust bird's position relative to the container for accurate collision
    const birdX = birdRect.left - containerRect.left;
    const birdY = birdRect.top - containerRect.top;
    const birdRight = birdX + BIRD_SIZE;
    const birdBottom = birdY + BIRD_SIZE;

    for (const pipeSet of pipes) {
        const pipeLeft = pipeSet.x;
        const pipeRight = pipeSet.x + PIPE_WIDTH;

        // Check horizontal overlap
        if (birdRight > pipeLeft && birdX < pipeRight) {
            // Check vertical overlap (hitting top pipe or bottom pipe)
            const topPipeHeight = pipeSet.topHeight;
            const bottomPipeY = GAME_HEIGHT - (pipeSet.topHeight + PIPE_GAP);

            if (birdY < topPipeHeight || birdBottom > bottomPipeY) {
                endGame();
                return true;
            }
        }
    }
    return false;
}

// --- Game Loop ---
function gameLoop() {
    if (isGameOver) return;

    applyGravity();
    movePipes();
    checkCollision();
}

function endGame() {
    isGameOver = true;
    clearInterval(gameLoopInterval);
    clearInterval(pipeInterval);
    messageDisplay.textContent = `Game Over! Your Score: ${score}. Click to Play Again.`;
    messageDisplay.style.cursor = 'pointer';
}

// --- Event Listeners ---
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault(); // Prevent scrolling
        startGame();
    }
    if (isGameOver && e.code === 'Enter') {
        startGame();
    }
});

gameContainer.addEventListener('click', startGame);

// Initial setup to show the start message
bird.style.top = `${birdY}px`; // Set initial visual position
gameContainer.style.width = `${GAME_WIDTH}px`;
gameContainer.style.height = `${GAME_HEIGHT}px`;