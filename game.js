// =======================================================================
// Firebase 初始化 (從您的新版檔案引入)
// =======================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ******** 請確認您自己的 firebaseConfig 物件已正確填寫 ********
const firebaseConfig = {
    apiKey: "AIzaSyCuCzDqhwaC9Eov--IIZ6aAJMoxI8okiL0", // 請使用您自己的金鑰
    authDomain: "taro-mole-game.firebaseapp.com",
    projectId: "taro-mole-game",
    storageBucket: "taro-mole-game.appspot.com",
    messagingSenderId: "935531410364",
    appId: "1:935531410364:web:588d707f3e16e4fe2b31b9"
};
// **********************************************************

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const leaderboardCol = collection(db, "FlyPigLeaderBoard");


document.addEventListener('DOMContentLoaded', () => {
    // =======================================================================
    // DOM 元素取得 (整合新舊版所有需要的元素)
    // =======================================================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score-display');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreDisplay = document.getElementById('final-score');
    const leaderboardList = document.getElementById('leaderboard-list');
    const leaderboardContainer = document.getElementById('leaderboard-container'); // 新增
    const leaderboardMessage = document.getElementById('leaderboard-message'); // 新增

    // --- 音效元素取得 ---
    const flapSound = document.getElementById('flap-sound');
    const scoreSound = document.getElementById('score-sound');
    const bgmSound = document.getElementById('bgm-sound');
    const windSound = document.getElementById('wind-sound');

    // --- 資源載入 ---
    const pigImage = new Image(); pigImage.src = 'img/pig.png';
    const fenceTopImage = new Image(); fenceTopImage.src = 'img/fence-top.png';
    const fenceBottomImage = new Image(); fenceBottomImage.src = 'img/fence-bottom.png';
    const backgroundImages = [];
    const bgSources = ['img/background-day.jpg', 'img/background-sunset.png', 'img/background-night.png'];
    bgSources.forEach(src => { const img = new Image(); img.src = src; backgroundImages.push(img); });
    const fallbackBackgroundColors = ['#87CEEB', '#4682B4', '#FF7F50'];
    const backgrounds = backgroundImages.length > 0 ? backgroundImages : fallbackBackgroundColors;
    let backgroundOffsetX = 0;

    // --- 遊戲常數設定 (保留您的所有設定) ---
    const backgroundScrollSpeedFactor = 0.5;
    const PIG_WIDTH = 80;
    const PIG_HEIGHT = 60;
    const GRAVITY = 0.2;
    const FLAP_STRENGTH = -5;
    const BASE_FENCE_WIDTH = 52;
    const BASE_FENCE_GAP = 220;
    const BASE_FENCE_INTERVAL = 220;
    const BASE_GAME_SPEED = 2;
    const SPEED_INCREASE_FACTOR = 0.001;
    const PIG_TILT_ANGLE = -0.5;
    const PIG_TILT_DURATION = 15;
    const SCORE_EFFECT_DURATION = 60;
    const INITIAL_WIND_VOLUME = 0.1;
    const MAX_WIND_VOLUME = 0.8;
    const SPEED_FOR_MAX_WIND_VOLUME = 5;
    const FLAP_SOUND_COOLDOWN = 100;

    // ===== 新增功能開關 =====
    const ENABLE_LEADERBOARD = true;      // 總開關：true = 開啟排行榜, false = 關閉
    const LEADERBOARD_SCORE_THRESHOLD = 5; // 分數門檻：超過這個分數才會觸發排行榜

    // --- 遊戲狀態變數 ---
    let pig, fences, score, frame, gameState;
    let currentGameSpeed;
    let pigTiltFrame = 0;
    let musicStarted = false;
    let canPlayFlapSound = true;
    let hasSavedScore = false;
    let activeScoreEffects = [];
    const effectShapes = ['circle', 'star', 'triangle'];
    let currentBgIndex = 0, nextBgIndex = 0, isFading = false, fadeProgress = 0;

    // --- 遊戲物件: 飛天豬 (採用穩定版的音效冷卻機制) ---
    pig = {
        x: 60, y: canvas.height / 2, width: PIG_WIDTH, height: PIG_HEIGHT, velocity: 0, rotation: 0,
        update: function() {
            this.velocity += GRAVITY; this.y += this.velocity;
            if (this.y < 0) { this.y = 0; this.velocity = 0; }
            if (pigTiltFrame > 0) { this.rotation = PIG_TILT_ANGLE; pigTiltFrame--; } 
            else { this.rotation *= 0.9; if (Math.abs(this.rotation) < 0.01) this.rotation = 0; }
        },
        draw: function() {
            ctx.save(); ctx.translate(this.x + this.width / 2, this.y + this.height / 2); ctx.rotate(this.rotation);
            if (pigImage.src && pigImage.complete) { ctx.drawImage(pigImage, -this.width / 2, -this.height / 2, this.width, this.height); } 
            else { ctx.fillStyle = '#FFC0CB'; ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height); }
            ctx.restore();
        },
        flap: function() {
            this.velocity = FLAP_STRENGTH; pigTiltFrame = PIG_TILT_DURATION;
            if (flapSound && canPlayFlapSound) {
                flapSound.currentTime = 0;
                flapSound.play().catch(e => console.error("Flap sound error:", e));
                canPlayFlapSound = false;
                setTimeout(() => { canPlayFlapSound = true; }, FLAP_SOUND_COOLDOWN);
            }
        }
    };

    // --- 特效物件 & 音效 & 背景管理函式 (沿用整合後的版本) ---
    function createScoreEffect(x, y) {
        const numEffects = Math.floor(Math.random() * 5) + 5;
        for (let i = 0; i < numEffects; i++) {
            const angle = Math.random() * 2 * Math.PI, speed = Math.random() * 2 + 1, size = Math.random() * 5 + 3, shape = effectShapes[Math.floor(Math.random() * effectShapes.length)];
            activeScoreEffects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, size, shape, alpha: 1, frame: 0 });
        }
    }
    function updateScoreEffects() {
        for (let i = activeScoreEffects.length - 1; i >= 0; i--) {
            const effect = activeScoreEffects[i]; effect.x += effect.vx; effect.y += effect.vy; effect.vy += GRAVITY * 0.4; effect.alpha = 1 - (effect.frame / SCORE_EFFECT_DURATION); effect.frame++;
            if (effect.alpha <= 0) { activeScoreEffects.splice(i, 1); }
        }
    }
    function drawScoreEffects() {
        activeScoreEffects.forEach(effect => {
            ctx.save(); ctx.globalAlpha = effect.alpha; ctx.fillStyle = 'gold'; ctx.beginPath();
            switch (effect.shape) {
                case 'circle': ctx.arc(effect.x, effect.y, effect.size, 0, Math.PI * 2); break;
                case 'star': const spikes = 5, r1 = effect.size, r2 = r1 / 2; let rot = Math.PI / 2 * 3, sx = effect.x, sy = effect.y; const step = Math.PI / spikes; ctx.moveTo(sx, sy - r1); for (let j = 0; j < spikes; j++) { sx = effect.x + Math.cos(rot) * r1; sy = effect.y + Math.sin(rot) * r1; ctx.lineTo(sx, sy); rot += step; sx = effect.x + Math.cos(rot) * r2; sy = effect.y + Math.sin(rot) * r2; ctx.lineTo(sx, sy); rot += step; } ctx.closePath(); break;
                case 'triangle': ctx.moveTo(effect.x, effect.y - effect.size); ctx.lineTo(effect.x - effect.size, effect.y + effect.size); ctx.lineTo(effect.x + effect.size, effect.y + effect.size); ctx.closePath(); break;
            }
            ctx.fill(); ctx.restore();
        });
    }
    function startMusic() {
        if (!musicStarted) {
            if (bgmSound) bgmSound.play().catch(e => console.error("BGM error:", e));
            if (windSound) { windSound.volume = INITIAL_WIND_VOLUME; windSound.play().catch(e => console.error("Wind sound error:", e)); }
            musicStarted = true;
        }
    }
    function stopAllSounds() {
        if(bgmSound) { bgmSound.pause(); bgmSound.currentTime = 0; }
        if(windSound) { windSound.pause(); windSound.currentTime = 0; }
        musicStarted = false; 
    }
    function updateWindVolume() {
        if (!windSound || !musicStarted) return;
        const speedRange = SPEED_FOR_MAX_WIND_VOLUME - BASE_GAME_SPEED; const currentProgress = Math.max(0, currentGameSpeed - BASE_GAME_SPEED);
        const volumeProgress = Math.min(1, currentProgress / speedRange); const newVolume = INITIAL_WIND_VOLUME + (MAX_WIND_VOLUME - INITIAL_WIND_VOLUME) * volumeProgress;
        windSound.volume = Math.min(newVolume, MAX_WIND_VOLUME);
    }
    function startBackgroundFade() {
        if (isFading || backgrounds.length <= 1) return;
        isFading = true; fadeProgress = 0; nextBgIndex = (currentBgIndex + 1) % backgrounds.length;
    }
    function updateBackground() {
        backgroundOffsetX -= currentGameSpeed * backgroundScrollSpeedFactor;
        if (isFading) { fadeProgress += 0.01; if (fadeProgress >= 1) { fadeProgress = 0; isFading = false; currentBgIndex = nextBgIndex; } }
        const currentBg = backgrounds[currentBgIndex];
        if (typeof currentBg !== 'string' && currentBg && currentBg.width > 0) { if (Math.abs(backgroundOffsetX) > currentBg.width) { backgroundOffsetX = 0; } }
    }


    // ===== 核心修改：排行榜相關函式 =====
    async function saveScoreToLeaderboard(currentScore) {
        if (!ENABLE_LEADERBOARD) return; // 檢查總開關
        if (currentScore <= 0) return;

        try {
            const q = query(leaderboardCol, orderBy("score", "desc"), limit(10));
            const querySnapshot = await getDocs(q);
            const leaderboardDocs = querySnapshot.docs;

            let shouldPromptForName = false;
            // 情況一：排行榜還沒滿10人
            if (leaderboardDocs.length < 10) {
                shouldPromptForName = true;
            } 
            // 情況二：排行榜已滿10人，檢查分數是否高於最低分
            else {
                const lowestScoreOnBoard = leaderboardDocs[leaderboardDocs.length - 1].data().score;
                if (currentScore > lowestScoreOnBoard) {
                    shouldPromptForName = true;
                }
            }
            
            if (shouldPromptForName) {
                const playerName = prompt("恭喜上榜！請輸入你的名字：", "飛天小豬");
                if (playerName && playerName.trim() !== "") {
                    // 使用 addDoc 新增獨立紀錄，避免同名覆蓋
                    await addDoc(leaderboardCol, {
                        name: playerName.trim().substring(0, 10),
                        score: currentScore,
                        createdAt: new Date()
                    });
                    console.log("分數已成功儲存！");
                    await fetchLeaderboard(); // 儲存後立即更新排行榜
                }
            } else {
                 console.log(`分數 ${currentScore} 未達上榜標準。`);
            }
        } catch (error) {
            console.error("儲存分數時發生錯誤:", error);
            alert("抱歉，儲存分數失敗，請檢查網路連線。");
        }
    }

    async function fetchLeaderboard() {
        if (!ENABLE_LEADERBOARD) { // 檢查總開關
            leaderboardContainer.style.display = 'none';
            return;
        }
        if (!leaderboardList) return;
        leaderboardList.innerHTML = '<li>讀取中...</li>';

        try {
            const q = query(leaderboardCol, orderBy("score", "desc"), limit(10));
            const querySnapshot = await getDocs(q);

            leaderboardList.innerHTML = '';
            if (querySnapshot.empty) {
                leaderboardList.innerHTML = '<li>目前尚無紀錄</li>';
                return;
            }
            let rank = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const listItem = document.createElement('li');
                listItem.innerHTML = `<span class="rank">${rank}.</span><span class="name">${data.name}</span><span class="score">${data.score}</span>`;
                leaderboardList.appendChild(listItem);
                rank++;
            });
        } catch (error) {
            console.error("讀取排行榜時發生錯誤:", error);
            leaderboardList.innerHTML = '<li>讀取排行榜失敗</li>';
        }
    }


    // --- 核心遊戲邏輯 (移植自穩定版) ---
    function resetGame() {
        pig.y = canvas.height / 2; pig.velocity = 0; pig.rotation = 0;
        fences = []; score = 0; frame = 0; currentGameSpeed = BASE_GAME_SPEED;
        hasSavedScore = false; activeScoreEffects = []; pigTiltFrame = 0;
        canPlayFlapSound = true; isFading = false; currentBgIndex = 0;
        fadeProgress = 0; backgroundOffsetX = 0; stopAllSounds();
        
        // ===== 核心修改：重設時隱藏/清理 UI =====
        if (leaderboardContainer) leaderboardContainer.style.display = 'none';
        if (leaderboardMessage) leaderboardMessage.textContent = '';
        
        let nextFenceX = canvas.width;
        for (let i = 0; i < 3; i++) {
            createFence(nextFenceX);
            const lastFence = fences[fences.length-1];
            nextFenceX += lastFence.width + BASE_FENCE_INTERVAL + (Math.random() * 100);
        }
        gameState = 'start'; updateUI();
    }
    
    function createFence(xPos) {
        const gapY = (Math.random() * (canvas.height - BASE_FENCE_GAP - 200)) + 100;
        fences.push({ x: xPos, y: gapY, width: BASE_FENCE_WIDTH, gap: BASE_FENCE_GAP, passed: false });
    }

    function updateFences() {
        if (fences.length > 0 && fences[0].x + fences[0].width < 0) {
            fences.shift();
            const lastFence = fences[fences.length - 1];
            let nextX = lastFence.x + lastFence.width + BASE_FENCE_INTERVAL + (Math.random() * 100);
            createFence(nextX);
        }
        fences.forEach(fence => {
            fence.x -= currentGameSpeed;
            if (!fence.passed && fence.x + fence.width < pig.x) {
                score++; fence.passed = true;
                if(scoreSound) { scoreSound.currentTime = 0; scoreSound.play().catch(e => {}); }
                createScoreEffect(pig.x, pig.y);
                if (score > 0 && score % 10 === 0) { startBackgroundFade(); }
            }
        });
    }

    function checkCollisions() {
        if (pig.y + pig.height > canvas.height) return true;
        for (const fence of fences) {
            if (pig.x < fence.x + fence.width && pig.x + pig.width > fence.x && (pig.y < fence.y || pig.y + pig.height > fence.y + fence.gap)) {
                return true;
            }
        }
        return false;
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const drawScrollingBackground = (index, alpha) => {
            ctx.save(); ctx.globalAlpha = alpha; const bg = backgrounds[index];
            if (typeof bg === 'string') { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); } 
            else if (bg && bg.complete && bg.width > 0) {
                let bgX = backgroundOffsetX % bg.width;
                ctx.drawImage(bg, bgX, 0, bg.width, canvas.height);
                ctx.drawImage(bg, bgX + bg.width, 0, bg.width, canvas.height);
            }
            ctx.restore();
        };
        if (isFading) { drawScrollingBackground(currentBgIndex, 1 - fadeProgress); drawScrollingBackground(nextBgIndex, fadeProgress); } 
        else { drawScrollingBackground(currentBgIndex, 1); }
        fences.forEach(fence => {
            const hasFenceImages = fenceTopImage.complete && fenceBottomImage.complete;
            if (hasFenceImages) {
                ctx.drawImage(fenceTopImage, fence.x, 0, fence.width, fence.y);
                ctx.drawImage(fenceBottomImage, fence.x, fence.y + fence.gap, fence.width, canvas.height - (fence.y + fence.gap));
            } else {
                ctx.fillStyle = '#8B4513'; ctx.fillRect(fence.x, 0, fence.width, fence.y); ctx.fillRect(fence.x, fence.y + fence.gap, fence.width, canvas.height);
            }
        });
        pig.draw(); drawScoreEffects();
    }
    
    // ===== 核心修改：遊戲結束邏輯 =====
    function updateUI() {
        startScreen.style.display = gameState === 'start' ? 'flex' : 'none';
        gameOverScreen.style.display = gameState === 'gameOver' ? 'flex' : 'none';
        scoreDisplay.style.display = gameState === 'playing' ? 'block' : 'none';
        if(gameState === 'playing') { scoreDisplay.textContent = `分數: ${score}`; }
        
        if (gameState === 'gameOver') {
            finalScoreDisplay.textContent = score;
            if (!hasSavedScore) {
                // 檢查總開關是否開啟
                if (ENABLE_LEADERBOARD) {
                    // 檢查分數是否達到門檻
                    if (score >= LEADERBOARD_SCORE_THRESHOLD) {
                        leaderboardContainer.style.display = 'flex'; // 顯示排行榜
                        fetchLeaderboard(); // 顯示最新排名
                        saveScoreToLeaderboard(score); // 觸發儲存流程
                    } else {
                        // 未達門檻，顯示提示訊息
                        leaderboardMessage.textContent = '離排行榜還很遠，再加把勁！';
                    }
                }
                hasSavedScore = true;
            }
        }
    }

    function gameLoop() {
        if (gameState === 'playing') {
            currentGameSpeed += SPEED_INCREASE_FACTOR;
            pig.update(); updateFences(); updateBackground(); updateScoreEffects(); updateWindVolume();
            if (checkCollisions()) {
                gameState = 'gameOver'; stopAllSounds();
            }
        }
        draw(); updateUI(); requestAnimationFrame(gameLoop);
    }

    function handleInput() {
        switch (gameState) {
            case 'start': gameState = 'playing'; startMusic(); pig.flap(); break;
            case 'playing': pig.flap(); break;
            case 'gameOver': resetGame(); break;
        }
    }

    // --- 事件監聽器與遊戲啟動 ---
    document.addEventListener('click', handleInput);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') { e.preventDefault(); handleInput(); }
    });

    // ===== 核心修改：移除初始的 fetchLeaderboard =====
    resetGame();
    // fetchLeaderboard(); // <- 移除此行，改為遊戲結束時按條件觸發
    gameLoop();
});
