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
    function createScoreEffect(x, y) { /* ... 邏輯不變 ... */ 
        const numEffects = Math.floor(Math.random() * 5) + 5;
        for (let i = 0; i < numEffects; i++) {
            const angle = Math.random() * 2 * Math.PI, speed = Math.random() * 2 + 1, size = Math.random() * 5 + 3, shape = effectShapes[Math.floor(Math.random() * effectShapes.length)];
            activeScoreEffects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, size, shape, alpha: 1, frame: 0 });
        }
    }
    function updateScoreEffects() { /* ... 邏輯不變 ... */ 
        for (let i = activeScoreEffects.length - 1; i >= 0; i--) {
            const effect = activeScoreEffects[i]; effect.x += effect.vx; effect.y += effect.vy; effect.vy += GRAVITY * 0.4; effect.alpha = 1 - (effect.frame / SCORE_EFFECT_DURATION); effect.frame++;
            if (effect.alpha <= 0) { activeScoreEffects.splice(i, 1); }
        }
    }
    function drawScoreEffects() { /* ... 繪製邏輯不變 ... */ 
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
    function startMusic() { /* ... 邏輯不變 ... */ 
        if (!musicStarted) {
            if (bgmSound) bgmSound.play().catch(e => console.error("BGM error:", e));
            if (windSound) { windSound.volume = INITIAL_WIND_VOLUME; windSound.play().catch(e => console.error("Wind sound error:", e)); }
            musicStarted = true;
        }
    }
    function stopAllSounds() { /* ... 邏輯不變 ... */ 
        if(bgmSound) { bgmSound.pause(); bgmSound.currentTime = 0; }
        if(windSound) { windSound.pause(); windSound.currentTime = 0; }
        musicStarted = false; 
    }
    function updateWindVolume() { /* ... 邏輯不變 ... */ 
        if (!windSound || !musicStarted) return;
        const speedRange = SPEED_FOR_MAX_WIND_VOLUME - BASE_GAME_SPEED; const currentProgress = Math.max(0, currentGameSpeed - BASE_GAME_SPEED);
        const volumeProgress = Math.min(1, currentProgress / speedRange); const newVolume = INITIAL_WIND_VOLUME + (MAX_WIND_VOLUME - INITIAL_WIND_VOLUME) * volumeProgress;
        windSound.volume = Math.min(newVolume, MAX_WIND_VOLUME);
    }
    function startBackgroundFade() { /* ... 邏輯不變 ... */ 
        if (isFading || backgrounds.length <= 1) return;
        isFading = true; fadeProgress = 0; nextBgIndex = (currentBgIndex + 1) % backgrounds.length;
    }
    function updateBackground() { /* ... 邏輯不變 ... */ 
        backgroundOffsetX -= currentGameSpeed * backgroundScrollSpeedFactor;
        if (isFading) { fadeProgress += 0.01; if (fadeProgress >= 1) { fadeProgress = 0; isFading = false; currentBgIndex = nextBgIndex; } }
        const currentBg = backgrounds[currentBgIndex];
        if (typeof currentBg !== 'string' && currentBg && currentBg.width > 0) { if (Math.abs(backgroundOffsetX) > currentBg.width) { backgroundOffsetX = 0; } }
    }


    // =======================================================================
    // *** 核心整合：Firebase 排行榜函式實作 ***
    // =======================================================================
    // =======================================================================
// *** 核心修正：Firebase 排行榜儲存函式 ***
// =======================================================================
    async function saveScoreToLeaderboard(currentScore) {
        if (currentScore <= 0) return; // 分數為 0 不儲存

        const playerName = prompt("遊戲結束！請輸入你的名字來儲存分數：", "飛天小豬");
        
        // 檢查玩家是否輸入了名字，或是直接按了取消
        if (playerName && playerName.trim() !== "") {
            try {
                // *** 關鍵修正點 ***
                // 使用 addDoc() 來新增一筆全新的紀錄。
                // Firestore 會自動為這筆紀錄產生一個獨一無二的 ID。
                // 這就確保了即使玩家同名，每一筆分數都是獨立的紀錄，絕對不會互相覆蓋。
                await addDoc(leaderboardCol, {
                    name: playerName.trim(),
                    score: currentScore,
                    createdAt: new Date() // 記錄時間以便未來管理
                });

                console.log("分數已成功儲存！");
                await fetchLeaderboard(); // 儲存後立即更新排行榜以顯示最新結果
                
            } catch (error) {
                console.error("儲存分數時發生錯誤:", error);
                alert("抱歉，儲存分數失敗，請檢查網路連線或聯繫管理員。");
            }
        }
    }

    async function fetchLeaderboard() {
        if (!leaderboardList) return;
        leaderboardList.innerHTML = '<li>讀取中...</li>'; // 提示用戶正在讀取

        try {
            // 建立查詢：按分數(score)降序排列，只取前10名
            const q = query(leaderboardCol, orderBy("score", "desc"), limit(10));
            const querySnapshot = await getDocs(q);

            leaderboardList.innerHTML = ''; // 清空舊列表
            if (querySnapshot.empty) {
                leaderboardList.innerHTML = '<li>目前尚無紀錄</li>';
                return;
            }

            let rank = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const listItem = document.createElement('li');
                
                // 創建排名、名稱和分數的 span 元素以便套用 CSS
                const rankSpan = document.createElement('span');
                rankSpan.className = 'rank';
                rankSpan.textContent = `${rank}`;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'name';
                nameSpan.textContent = data.name;

                const scoreSpan = document.createElement('span');
                scoreSpan.className = 'score';
                scoreSpan.textContent = data.score;
                
                listItem.appendChild(rankSpan);
                listItem.appendChild(nameSpan);
                listItem.appendChild(scoreSpan);

                leaderboardList.appendChild(listItem);
                rank++;
            });
        } catch (error) {
            console.error("讀取排行榜時發生錯誤:", error);
            leaderboardList.innerHTML = '<li>讀取排行榜失敗</li>';
        }
    }


    // --- 核心遊戲邏輯 (移植自穩定版) ---
    function resetGame() { /* ... 邏輯不變，重置所有狀態 ... */ 
        pig.y = canvas.height / 2; pig.velocity = 0; pig.rotation = 0;
        fences = []; score = 0; frame = 0; currentGameSpeed = BASE_GAME_SPEED;
        hasSavedScore = false; activeScoreEffects = []; pigTiltFrame = 0;
        canPlayFlapSound = true; isFading = false; currentBgIndex = 0;
        fadeProgress = 0; backgroundOffsetX = 0; stopAllSounds();
        
        let nextFenceX = canvas.width;
        for (let i = 0; i < 3; i++) {
            createFence(nextFenceX);
            const lastFence = fences[fences.length-1];
            nextFenceX += lastFence.width + BASE_FENCE_INTERVAL + (Math.random() * 100);
        }
        gameState = 'start'; updateUI();
    }
    
    function createFence(xPos) { /* ... 邏輯不變 ... */ 
        const gapY = (Math.random() * (canvas.height - BASE_FENCE_GAP - 200)) + 100;
        fences.push({ x: xPos, y: gapY, width: BASE_FENCE_WIDTH, gap: BASE_FENCE_GAP, passed: false });
    }

    function updateFences() { // *** 核心修復：使用穩定版的邏輯 ***
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

    function checkCollisions() { // *** 核心修復：使用穩定版的邏輯 ***
        if (pig.y + pig.height > canvas.height) return true;
        for (const fence of fences) {
            if (pig.x < fence.x + fence.width && pig.x + pig.width > fence.x && (pig.y < fence.y || pig.y + pig.height > fence.y + fence.gap)) {
                return true;
            }
        }
        return false;
    }

    function draw() { // *** 核心修復：使用穩定版的邏輯 ***
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
    
    function updateUI() {
        startScreen.style.display = gameState === 'start' ? 'flex' : 'none';
        gameOverScreen.style.display = gameState === 'gameOver' ? 'flex' : 'none';
        scoreDisplay.style.display = gameState === 'playing' ? 'block' : 'none';
        if(gameState === 'playing') { scoreDisplay.textContent = `分數: ${score}`; }
        if (gameState === 'gameOver') {
            finalScoreDisplay.textContent = score;
            // *** 核心整合：在遊戲結束時觸發儲存分數 ***
            if (!hasSavedScore) {
                saveScoreToLeaderboard(score);
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

    // *** 核心整合：遊戲啟動時，先載入一次排行榜 ***
    resetGame();
    fetchLeaderboard(); 
    gameLoop();
});