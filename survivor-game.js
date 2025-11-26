// ===== SURVIVOR-STYLE AUTO-SHOOTER GAME =====
const game = {
    canvas: null,
    player: null,
    state: {
        hp: 100,
        maxHp: 100,
        xp: 0,
        xpToLevel: 100,
        level: 1,
        score: 0,
        gameTime: 0,
        gameOver: false,
        paused: false
    },
    stats: {
        moveSpeed: 5,
        projectileCount: 1,
        projectileDamage: 10,
        projectileSpeed: 10,
        projectilePierce: 0,
        projectileSize: 1,
        fireRate: 2,
        pickupRange: 50,
        armor: 0,
        regen: 0,
        critChance: 0,
        critDamage: 1.5,
        lifesteal: 0, // New passive
        aoeRadius: 0, // New passive
        cooldownReduction: 0 // New passive
    },
    skills: {
        Q: { level: 0, cd: 10, remaining: 0, name: 'Fireball Barrage' },
        W: { level: 0, cd: 15, remaining: 0, name: 'Spirit Wolves' },
        E: { level: 0, cd: 8, remaining: 0, name: 'Shield Slam' },
        R: { level: 0, cd: 30, remaining: 0, name: 'Black Hole' },
        T: { level: 0, cd: 120, remaining: 0, name: 'Phoenix Rebirth', isPassive: true },
        Y: { level: 0, critCounter: 0, threshold: 20, name: 'Critical Overload', isPassive: true }
    },
    passives: {
        phoenixReady: true,
        critOverloadCharge: 0
    },
    entities: {
        projectiles: [],
        bullets: [],
        enemies: [],
        items: [],
        obstacles: []
    },
    keys: {},
    velocity: { x: 0, y: 0 },
    lastShot: 0,
    difficultyMultiplier: 1,
    camera: { x: 0, y: 0 },
    chunks: new Map(), // Store generated chunks
    chunkSize: 1600 // Size of each chunk
};

// ===== AUDIO SYSTEM =====
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioSystem = {
    enabled: true,
    volume: 0.2, // Reduced master volume (0.0 to 1.0)
    musicVolume: 0.08, // Background music volume - 20%
    lastShootTime: 0,
    shootThrottle: 100, // Only play shoot sound every 100ms
    bgMusic: null,
    bgMusicGain: null,

    // Initialize background music from URL
    initMusic(url) {
        if (!url) return;

        try {
            // Stop and cleanup old music if exists
            if (this.bgMusic) {
                this.bgMusic.pause();
                this.bgMusic = null;
            }

            // Create new audio element
            this.bgMusic = new Audio(url);
            this.bgMusic.loop = true;
            this.bgMusic.volume = this.musicVolume;
            // Removed crossOrigin to avoid CORS issues

            console.log('Music initialized:', url);
        } catch (e) {
            console.error('Failed to init music:', e);
        }
    },

    playMusic() {
        if (this.bgMusic && this.enabled) {
            this.bgMusic.play()
                .then(() => console.log('Music playing'))
                .catch(e => console.log('Music play failed (click to start):', e));
        }
    },

    stopMusic() {
        if (this.bgMusic) {
            this.bgMusic.pause();
            this.bgMusic.currentTime = 0;
        }
    },

    toggleMusic() {
        if (!this.bgMusic) {
            console.error('No music loaded');
            return false;
        }

        console.log('Toggle called. Current paused state:', this.bgMusic.paused);

        // Check if music is currently playing
        if (this.bgMusic.paused) {
            // Music is paused, play it
            console.log('Attempting to play music...');
            this.bgMusic.play()
                .then(() => {
                    console.log('✅ Music resumed successfully');
                })
                .catch(e => {
                    console.error('❌ Music play failed:', e);
                });
            return true; // will be playing
        } else {
            // Music is playing, pause it
            console.log('Attempting to pause music...');
            this.bgMusic.pause();
            console.log('✅ Music paused successfully');
            return false; // will be stopped
        }
    },

    setMusicVolume(vol) {
        this.musicVolume = vol;
        if (this.bgMusic) this.bgMusic.volume = vol;
    },

    // Procedural sound generation
    playTone(frequency, duration, type = 'sine', volumeMultiplier = 1) {
        if (!this.enabled) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        const vol = this.volume * volumeMultiplier;
        gainNode.gain.setValueAtTime(vol, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    },

    // Sound effects - OPTIMIZED
    shoot() {
        // DISABLED - too spammy, removed completely
        return;
    },

    // REMOVED hit() - too spammy, not needed

    enemyHit() {
        // Only play on critical hits or every few hits
        if (Math.random() > 0.3) return; // 30% chance to play
        this.playTone(150, 0.05, 'triangle', 0.12);
    },

    levelUp() {
        setTimeout(() => this.playTone(523, 0.15, 'sine', 0.35), 0);
        setTimeout(() => this.playTone(659, 0.15, 'sine', 0.35), 100);
        setTimeout(() => this.playTone(784, 0.25, 'sine', 0.4), 200);
    },

    pickup() {
        this.playTone(1000, 0.08, 'sine', 0.2);
        setTimeout(() => this.playTone(1200, 0.08, 'sine', 0.2), 40);
    },

    skillActivate() {
        this.playTone(400, 0.12, 'triangle', 0.25);
        setTimeout(() => this.playTone(600, 0.12, 'triangle', 0.25), 60);
    },

    hurt() {
        this.playTone(100, 0.15, 'sawtooth', 0.3);
    },

    explosion() {
        // Quieter explosion
        const bufferSize = audioContext.sampleRate * 0.2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = audioContext.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(audioContext.destination);

        noiseGain.gain.setValueAtTime(this.volume * 0.15, audioContext.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        noise.start();
    },

    toggleMute() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopMusic();
        } else {
            this.playMusic();
        }
        return this.enabled;
    }
};

// ===== SCORE MANAGER =====
const ScoreManager = {
    secretKey: 'dbs2024_survivor_game',
    storageKeys: {
        BEST_SCORE: 'dbs_best',
        MATCH_HISTORY: 'dbs_history',
        CHECKSUM: 'dbs_check'
    },

    // XOR + Base64 encoding
    encode(data) {
        try {
            const json = JSON.stringify(data);
            const key = this.secretKey;
            let encoded = '';

            for (let i = 0; i < json.length; i++) {
                encoded += String.fromCharCode(
                    json.charCodeAt(i) ^ key.charCodeAt(i % key.length)
                );
            }

            return btoa(encoded);
        } catch (e) {
            console.error('Encode failed:', e);
            return null;
        }
    },

    // Decode
    decode(encoded) {
        try {
            const decoded = atob(encoded);
            const key = this.secretKey;
            let json = '';

            for (let i = 0; i < decoded.length; i++) {
                json += String.fromCharCode(
                    decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
                );
            }

            return JSON.parse(json);
        } catch (e) {
            console.error('Decode failed:', e);
            return null;
        }
    },

    // Generate checksum
    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;

        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }

        return hash.toString(36);
    },

    // Validate data integrity
    validateData(data, storedChecksum) {
        const calculatedChecksum = this.generateChecksum(data);
        return calculatedChecksum === storedChecksum;
    },

    // Save best score
    saveBestScore(scoreData) {
        try {
            const current = this.getBestScore();

            // Only save if new score is higher
            if (current && scoreData.score <= current.score) {
                return false;
            }

            const data = {
                score: scoreData.score,
                level: scoreData.level,
                time: scoreData.time,
                difficulty: scoreData.difficulty,
                date: Date.now()
            };

            const encoded = this.encode(data);
            const checksum = this.generateChecksum(data);

            localStorage.setItem(this.storageKeys.BEST_SCORE, encoded);
            localStorage.setItem(this.storageKeys.CHECKSUM, checksum);

            console.log('✅ New best score saved:', data.score);
            return true;
        } catch (e) {
            console.error('Failed to save best score:', e);
            return false;
        }
    },

    // Get best score
    getBestScore() {
        try {
            const encoded = localStorage.getItem(this.storageKeys.BEST_SCORE);
            const checksum = localStorage.getItem(this.storageKeys.CHECKSUM);

            if (!encoded || !checksum) return null;

            const data = this.decode(encoded);
            if (!data) return null;

            // Validate integrity
            if (!this.validateData(data, checksum)) {
                console.warn('⚠️ Best score data corrupted, resetting');
                this.clearBestScore();
                return null;
            }

            return data;
        } catch (e) {
            console.error('Failed to load best score:', e);
            return null;
        }
    },

    // Clear best score
    clearBestScore() {
        localStorage.removeItem(this.storageKeys.BEST_SCORE);
        localStorage.removeItem(this.storageKeys.CHECKSUM);
    },

    // Save match to history
    saveMatch(matchData) {
        try {
            const history = this.getMatchHistory() || [];

            const match = {
                score: matchData.score,
                level: matchData.level,
                time: matchData.time,
                difficulty: matchData.difficulty,
                date: Date.now()
            };

            // Add to beginning of array
            history.unshift(match);

            // Keep only last 10 matches
            if (history.length > 10) {
                history.length = 10;
            }

            const encoded = this.encode(history);
            localStorage.setItem(this.storageKeys.MATCH_HISTORY, encoded);

            console.log('Match saved to history');
            return true;
        } catch (e) {
            console.error('Failed to save match:', e);
            return false;
        }
    },

    // Get match history
    getMatchHistory() {
        try {
            const encoded = localStorage.getItem(this.storageKeys.MATCH_HISTORY);
            if (!encoded) return [];

            const data = this.decode(encoded);
            return data || [];
        } catch (e) {
            console.error('Failed to load match history:', e);
            return [];
        }
    },

    // Format time for display
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    // Get difficulty name
    getDifficultyName(diff) {
        const names = { 1: 'Easy', 2: 'Normal', 3: 'Hard' };
        return names[diff] || 'Unknown';
    }
};


// ===== INIT =====
function init() {
    game.canvas = document.getElementById('gameCanvas');
    // Don't create static obstacles - will be generated procedurally
    updateAllUI();
    updateStartMenuScores();
}

function updateStartMenuScores() {
    // Update Best Score
    const best = ScoreManager.getBestScore();
    const bestContainer = document.getElementById('bestScoreContainer');

    if (best) {
        bestContainer.style.display = 'block';
        document.getElementById('bestScoreValue').textContent = best.score.toLocaleString();
        document.getElementById('bestScoreDetails').textContent =
            `Level ${best.level} | ${ScoreManager.formatTime(best.time)} | ${ScoreManager.getDifficultyName(best.difficulty)}`;
    }

    // Update History
    const history = ScoreManager.getMatchHistory();
    const historyList = document.getElementById('historyList');

    if (history.length > 0) {
        historyList.innerHTML = '';
        history.forEach(match => {
            const div = document.createElement('div');
            div.style.padding = '8px';
            div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            const date = new Date(match.date).toLocaleDateString();

            div.innerHTML = `
                <div>
                    <div style="color: #fff; font-weight: bold;">${match.score.toLocaleString()}</div>
                    <div style="font-size: 10px; color: #888;">${date}</div>
                </div>
                <div style="text-align: right; font-size: 11px; color: #aaa;">
                    <div>Lv ${match.level}</div>
                    <div>${ScoreManager.formatTime(match.time)}</div>
                </div>
            `;
            historyList.appendChild(div);
        });
    }
}

// ===== PROCEDURAL MAP GENERATION =====
function getChunkKey(chunkX, chunkY) {
    return `${chunkX},${chunkY}`;
}

function getChunkCoords(worldX, worldY) {
    return {
        x: Math.floor(worldX / game.chunkSize),
        y: Math.floor(worldY / game.chunkSize)
    };
}

function generateChunk(chunkX, chunkY) {
    const key = getChunkKey(chunkX, chunkY);
    if (game.chunks.has(key)) return; // Already generated

    const chunk = {
        x: chunkX,
        y: chunkY,
        obstacles: [],
        decorations: []
    };

    // Better seeded random - more natural distribution
    let seed = (chunkX * 73856093) ^ (chunkY * 19349663);
    const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    // Generate 3-8 obstacles per chunk
    const obstacleCount = Math.floor(random() * 6) + 3;
    for (let i = 0; i < obstacleCount; i++) {
        const worldX = chunkX * game.chunkSize + random() * game.chunkSize;
        const worldY = chunkY * game.chunkSize + random() * game.chunkSize;
        const w = Math.floor(random() * 80) + 60;
        const h = Math.floor(random() * 80) + 60;

        // Different obstacle types
        const types = ['rock', 'tree', 'wall', 'pillar'];
        const type = types[Math.floor(random() * types.length)];

        chunk.obstacles.push({
            worldX, worldY, w, h, type,
            baseX: worldX, baseY: worldY
        });
    }

    // Generate decorations (visual only, no collision)
    const decorCount = Math.floor(random() * 10) + 5;
    for (let i = 0; i < decorCount; i++) {
        const worldX = chunkX * game.chunkSize + random() * game.chunkSize;
        const worldY = chunkY * game.chunkSize + random() * game.chunkSize;
        const size = Math.floor(random() * 20) + 10;

        const types = ['grass', 'flower', 'stone'];
        const type = types[Math.floor(random() * types.length)];

        chunk.decorations.push({
            worldX, worldY, size, type
        });
    }

    game.chunks.set(key, chunk);
    renderChunk(chunk);
}

function renderChunk(chunk) {
    // Render obstacles
    chunk.obstacles.forEach(obs => {
        if (obs.el) return; // Already rendered

        const div = document.createElement('div');
        div.className = 'obstacle obstacle-' + obs.type;
        div.style.width = obs.w + 'px';
        div.style.height = obs.h + 'px';
        div.style.left = (obs.worldX - game.camera.x) + 'px';
        div.style.top = (obs.worldY - game.camera.y) + 'px';

        // Different colors for different types
        if (obs.type === 'rock') {
            div.style.background = 'linear-gradient(135deg, #666, #444)';
            div.style.borderRadius = '40%';
        } else if (obs.type === 'tree') {
            div.style.background = 'linear-gradient(135deg, #2d5016, #1a3009)';
            div.style.borderRadius = '20%';
        } else if (obs.type === 'wall') {
            div.style.background = 'linear-gradient(135deg, #8b4513, #654321)';
            div.style.borderRadius = '5px';
        } else if (obs.type === 'pillar') {
            div.style.background = 'linear-gradient(135deg, #999, #666)';
            div.style.borderRadius = '10px';
        }

        game.canvas.appendChild(div);
        obs.el = div;
        game.entities.obstacles.push(obs);
    });

    // Render decorations
    chunk.decorations.forEach(decor => {
        if (decor.el) return;

        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.width = decor.size + 'px';
        div.style.height = decor.size + 'px';
        div.style.left = (decor.worldX - game.camera.x) + 'px';
        div.style.top = (decor.worldY - game.camera.y) + 'px';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '5';
        div.style.opacity = '0.6';

        if (decor.type === 'grass') {
            div.textContent = '🌿';
            div.style.fontSize = decor.size + 'px';
        } else if (decor.type === 'flower') {
            div.textContent = '🌸';
            div.style.fontSize = decor.size + 'px';
        } else if (decor.type === 'stone') {
            div.style.background = '#888';
            div.style.borderRadius = '50%';
        }

        game.canvas.appendChild(div);
        decor.el = div;
    });
}

function updateChunks() {
    // Get current chunk player is in
    const playerChunk = getChunkCoords(game.camera.x + 800, game.camera.y + 500);

    // Load chunks around player (3x3 grid)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            generateChunk(playerChunk.x + dx, playerChunk.y + dy);
        }
    }

    // Unload far chunks to save memory
    game.chunks.forEach((chunk, key) => {
        const dist = Math.max(
            Math.abs(chunk.x - playerChunk.x),
            Math.abs(chunk.y - playerChunk.y)
        );

        if (dist > 2) {
            // Remove from DOM
            chunk.obstacles.forEach(obs => {
                if (obs.el && obs.el.parentNode) {
                    game.canvas.removeChild(obs.el);
                    // Remove from entities array
                    const idx = game.entities.obstacles.indexOf(obs);
                    if (idx > -1) game.entities.obstacles.splice(idx, 1);
                }
            });
            chunk.decorations.forEach(decor => {
                if (decor.el && decor.el.parentNode) {
                    game.canvas.removeChild(decor.el);
                }
            });
            game.chunks.delete(key);
        }
    });
}

function createObstacles() {
    const obs = [
        { x: 300, y: 200, w: 100, h: 100 },
        { x: 800, y: 400, w: 120, h: 80 },
        { x: 1200, y: 600, w: 90, h: 90 },
        { x: 500, y: 700, w: 110, h: 70 },
        { x: 1000, y: 150, w: 80, h: 120 }
    ];

    obs.forEach(o => {
        const div = document.createElement('div');
        div.className = 'obstacle';
        div.style.left = o.x + 'px';
        div.style.top = o.y + 'px';
        div.style.width = o.w + 'px';
        div.style.height = o.h + 'px';
        game.canvas.appendChild(div);
        game.entities.obstacles.push({
            x: o.x, y: o.y, w: o.w, h: o.h, el: div,
            baseX: o.x, baseY: o.y // Store original position
        });
    });
}

// ===== START GAME =====
function startGame(difficulty) {
    // Custom background music from Google Drive
    const musicUrl = 'https://s3.w3s.aioz.network/w3ai-platform-staging/uploads/samples/0bb1deb0-b90d-4e0e-b761-4c6e5d153828/2025/11/26/1764153335-c3tr2vZ8Pda2cUupkWQx3X.mp3?AWSAccessKeyId=FTDUBKT77BV34OBAT5MOGQCPMQ&Signature=Ee3TMOavs0uD2ZbqdADfsqGKUQE%3D&Expires=2394873335'

    if (musicUrl) {
        audioSystem.initMusic(musicUrl);

        // Try to play immediately
        setTimeout(() => audioSystem.playMusic(), 500);

        // Also add click listener to start music (bypass autoplay restrictions)
        const playMusicOnClick = () => {
            audioSystem.playMusic();
            document.removeEventListener('click', playMusicOnClick);
        };
        document.addEventListener('click', playMusicOnClick);
    }

    // ===== DIFFICULTY CONFIGURATION =====
    const difficultyConfig = {
        1: { // Easy
            name: 'Easy',
            baseMultiplier: 0.6,
            startHP: 150,
            enemySpawnInterval: 3500,
            bulletSpawnInterval: 2000,
            eliteSpawnInterval: 90000, // 1.5 minutes
            scalingRate: 1.25 // Slower scaling
        },
        2: { // Normal
            name: 'Normal',
            baseMultiplier: 1.0,
            startHP: 100,
            enemySpawnInterval: 2500,
            bulletSpawnInterval: 1500,
            eliteSpawnInterval: 60000, // 1 minute
            scalingRate: 1.35 // Default scaling
        },
        3: { // Hard
            name: 'Hard',
            baseMultiplier: 1.5,
            startHP: 75,
            enemySpawnInterval: 2000,
            bulletSpawnInterval: 1200,
            eliteSpawnInterval: 45000, // 45 seconds
            scalingRate: 1.45 // Faster scaling
        },
        4: { // Nightmare
            name: 'Nightmare',
            baseMultiplier: 2.5,
            startHP: 50,
            enemySpawnInterval: 1500,
            bulletSpawnInterval: 1000,
            eliteSpawnInterval: 30000, // 30 seconds
            scalingRate: 1.6 // Much faster scaling
        }
    };

    const config = difficultyConfig[difficulty] || difficultyConfig[2];

    // Set initial difficulty multiplier based on selected difficulty
    game.difficultyMultiplier = config.baseMultiplier;
    game.difficultyScalingRate = config.scalingRate;
    game.selectedDifficulty = difficulty;

    document.getElementById('startMenu').style.display = 'none';

    // Create player
    game.player = document.createElement('div');
    game.player.className = 'player';
    game.player.style.left = '785px';
    game.player.style.top = '485px';
    game.canvas.appendChild(game.player);

    // Set starting HP based on difficulty
    game.state.hp = config.startHP;
    game.state.maxHp = config.startHP;
    updateUI('hp');

    // Set HUD Best Score
    const best = ScoreManager.getBestScore();
    if (best) {
        document.getElementById('hudBestScore').textContent = best.score.toLocaleString();
    } else {
        document.getElementById('hudBestScore').textContent = '0';
    }

    // Start loops
    requestAnimationFrame(gameLoop);
    setInterval(updateVelocity, 50);
    setInterval(updateCooldowns, 1000);
    setInterval(updateGameTime, 1000);

    // Spawn loops - DIFFERENT for each difficulty
    setInterval(() => spawnEnemies(), config.enemySpawnInterval);
    setInterval(() => spawnBullets(), config.bulletSpawnInterval);

    // Elite enemy spawn rate varies by difficulty
    setInterval(() => {
        if (!game.state.paused && !game.state.gameOver) {
            spawnEliteEnemy();
        }
    }, config.eliteSpawnInterval);

    // Regen
    setInterval(() => {
        if (game.stats.regen > 0 && !game.state.paused) {
            game.state.hp = Math.min(game.state.maxHp, game.state.hp + game.stats.regen);
            updateUI('hp');
        }
    }, 1000);
}

function updateGameTime() {
    if (game.state.paused || game.state.gameOver) return;
    game.state.gameTime++;
    game.state.score++;

    // Check for high score beat
    const currentBest = parseInt(document.getElementById('hudBestScore').textContent.replace(/,/g, '')) || 0;
    if (game.state.score > currentBest) {
        document.getElementById('hudBestScore').textContent = game.state.score.toLocaleString();
        document.getElementById('hudBestScore').style.color = '#00ff00'; // Green for beating record
        document.getElementById('hudBestScore').style.textShadow = '0 0 10px #00ff00';
    }

    // Exponential difficulty increase every 30s - rate varies by difficulty
    if (game.state.gameTime % 30 === 0) {
        game.difficultyMultiplier *= (game.difficultyScalingRate || 1.35);
    }

    // Random environmental events
    if (game.state.gameTime % 45 === 0) {
        spawnRandomEvent();
    }

    updateUI('score');
    updateUI('score');
}

// ===== PAUSE SYSTEM =====
function togglePause(forceState = null) {
    if (game.state.gameOver) return;

    // If forceState is provided, use it, otherwise toggle
    if (forceState !== null) {
        game.state.paused = forceState;
    } else {
        game.state.paused = !game.state.paused;
    }

    const pauseMenu = document.getElementById('pauseMenu');
    if (game.state.paused) {
        pauseMenu.style.display = 'block';
        if (audioSystem.bgMusic && !audioSystem.bgMusic.paused) {
            audioSystem.bgMusic.pause();
            game.state.wasPlayingMusic = true;
        }
    } else {
        pauseMenu.style.display = 'none';
        // Resume music if it was playing before pause
        if (game.state.wasPlayingMusic && audioSystem.bgMusic) {
            audioSystem.bgMusic.play().catch(e => console.log('Resume failed:', e));
            game.state.wasPlayingMusic = false;
        }
    }
}

// Auto-pause on tab switch
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        togglePause(true);
    }
});

// ===== INPUT =====
document.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (!game.state.paused && !game.state.gameOver) {
        game.keys[e.key.toLowerCase()] = true;
    }
});

document.addEventListener('keyup', e => {
    game.keys[e.key.toLowerCase()] = false;
});

function updateVelocity() {
    if (game.state.paused) return;

    game.velocity.x = 0;
    game.velocity.y = 0;

    if (game.keys['arrowleft']) game.velocity.x = -game.stats.moveSpeed;
    if (game.keys['arrowright']) game.velocity.x = game.stats.moveSpeed;
    if (game.keys['arrowup']) game.velocity.y = -game.stats.moveSpeed;
    if (game.keys['arrowdown']) game.velocity.y = game.stats.moveSpeed;

    if (game.keys['q']) useSkill('Q');
    if (game.keys['w']) useSkill('W');
    if (game.keys['e']) useSkill('E');
    if (game.keys['r']) useSkill('R');
    // T and Y are passive skills - no key binding needed
}

// ===== GAME LOOP =====
function gameLoop() {
    if (!game.state.paused && !game.state.gameOver) {
        movePlayer();
        autoShoot();
        updateProjectiles();
        updateBullets();
        updateEnemies();
        updateItems();
    }
    requestAnimationFrame(gameLoop);
}

function movePlayer() {
    if (!game.player) return;

    // Calculate new camera position
    let newCameraX = game.camera.x + game.velocity.x;
    let newCameraY = game.camera.y + game.velocity.y;

    // Player's world position (always at center of screen in world coords)
    const playerWorldX = newCameraX + 785;
    const playerWorldY = newCameraY + 485;

    // Check collision with obstacles
    const playerRect = {
        x: playerWorldX,
        y: playerWorldY,
        w: 30,
        h: 30
    };

    let collides = false;
    for (let obs of game.entities.obstacles) {
        const obsRect = {
            x: obs.baseX || obs.worldX,
            y: obs.baseY || obs.worldY,
            w: obs.w,
            h: obs.h
        };
        if (rectCollision(playerRect, obsRect)) {
            collides = true;
            break;
        }
    }

    // Only move camera if no collision
    if (!collides) {
        game.camera.x = newCameraX;
        game.camera.y = newCameraY;
    }

    // Update all entities positions relative to camera
    updateCameraView();
}

function updateCameraView() {
    // Update chunks (load/unload)
    updateChunks();

    // Update obstacles
    game.entities.obstacles.forEach(obs => {
        if (obs.el) {
            obs.el.style.left = (obs.baseX - game.camera.x) + 'px';
            obs.el.style.top = (obs.baseY - game.camera.y) + 'px';
        }
    });

    // Update decorations
    game.chunks.forEach(chunk => {
        chunk.decorations.forEach(decor => {
            if (decor.el) {
                decor.el.style.left = (decor.worldX - game.camera.x) + 'px';
                decor.el.style.top = (decor.worldY - game.camera.y) + 'px';
            }
        });
    });

    // Update enemies
    game.entities.enemies.forEach(enemy => {
        const worldX = enemy.worldX;
        const worldY = enemy.worldY;
        enemy.el.style.left = (worldX - game.camera.x) + 'px';
        enemy.el.style.top = (worldY - game.camera.y) + 'px';
    });

    // Update bullets
    game.entities.bullets.forEach(bullet => {
        if (!bullet.worldX) {
            // Initialize world coordinates for existing bullets
            bullet.worldX = parseFloat(bullet.el.style.left) + game.camera.x;
            bullet.worldY = parseFloat(bullet.el.style.top) + game.camera.y;
        }
        bullet.el.style.left = (bullet.worldX - game.camera.x) + 'px';
        bullet.el.style.top = (bullet.worldY - game.camera.y) + 'px';
    });

    // Update projectiles
    game.entities.projectiles.forEach(proj => {
        proj.el.style.left = (proj.x - game.camera.x) + 'px';
        proj.el.style.top = (proj.y - game.camera.y) + 'px';
    });

    // Update items
    game.entities.items.forEach(item => {
        if (!item.worldX) {
            // Initialize world coordinates for existing items
            item.worldX = item.x + game.camera.x;
            item.worldY = item.y + game.camera.y;
        }
        item.el.style.left = (item.worldX - game.camera.x) + 'px';
        item.el.style.top = (item.worldY - game.camera.y) + 'px';
    });
}

// ===== AUTO-SHOOT SYSTEM =====
function autoShoot() {
    const now = Date.now();
    const shootDelay = 1000 / game.stats.fireRate;

    if (now - game.lastShot < shootDelay) return;

    const pxWorld = game.camera.x + 785 + 15;
    const pyWorld = game.camera.y + 485 + 15;

    // ALWAYS target nearest enemy for better gameplay
    let nearest = null;
    let minDist = Infinity;
    for (let enemy of game.entities.enemies) {
        const exWorld = enemy.worldX + enemy.w / 2;
        const eyWorld = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(exWorld - pxWorld, eyWorld - pyWorld);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    }

    let angle = 0;
    if (nearest) {
        // Aim at nearest enemy
        const exWorld = nearest.worldX + nearest.w / 2;
        const eyWorld = nearest.worldY + nearest.h / 2;
        angle = Math.atan2(eyWorld - pyWorld, exWorld - pxWorld);
    } else if (game.velocity.x !== 0 || game.velocity.y !== 0) {
        // No enemies - shoot in movement direction
        angle = Math.atan2(game.velocity.y, game.velocity.x);
    } else {
        // Standing still, no enemies - don't shoot
        return;
    }

    // Shoot multiple projectiles
    const count = game.stats.projectileCount;
    const spread = count > 1 ? 0.3 : 0;

    for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread / (count - 1);
        const finalAngle = angle + offset;
        shootProjectile(pxWorld, pyWorld, finalAngle);
    }

    game.lastShot = now;
}

function shootProjectile(xWorld, yWorld, angle) {
    audioSystem.shoot(); // Play shoot sound
    const proj = document.createElement('div');
    proj.className = 'projectile projectile-rotating';
    const size = 12 * game.stats.projectileSize;
    proj.style.width = size + 'px';
    proj.style.height = size + 'px';
    proj.style.left = (xWorld - game.camera.x) + 'px'; // Position relative to camera
    proj.style.top = (yWorld - game.camera.y) + 'px';   // Position relative to camera
    game.canvas.appendChild(proj);

    const isCrit = Math.random() < game.stats.critChance;
    const damage = game.stats.projectileDamage * (isCrit ? game.stats.critDamage : 1);

    // Critical Overload passive - track crits
    if (isCrit && game.skills.Y.level > 0) {
        game.passives.critOverloadCharge++;
        const threshold = game.skills.Y.threshold - game.skills.Y.level * 2;

        if (game.passives.critOverloadCharge >= threshold) {
            game.passives.critOverloadCharge = 0;
            // Next projectile will be mega-crit
        }
    }

    game.entities.projectiles.push({
        el: proj,
        x: xWorld, // Store world coordinates
        y: yWorld, // Store world coordinates
        vx: Math.cos(angle) * game.stats.projectileSpeed,
        vy: Math.sin(angle) * game.stats.projectileSpeed,
        damage: damage,
        pierce: game.stats.projectilePierce,
        hits: 0,
        isCrit: isCrit,
        angle: angle
    });
}

function updateProjectiles() {
    game.entities.projectiles = game.entities.projectiles.filter(proj => {
        proj.x += proj.vx;
        proj.y += proj.vy;
        proj.el.style.left = (proj.x - game.camera.x) + 'px'; // Update screen position
        proj.el.style.top = (proj.y - game.camera.y) + 'px';   // Update screen position

        // Add trail effect
        if (Math.random() < 0.3) {
            createTrailEffect(proj.x - game.camera.x, proj.y - game.camera.y, '#00d4ff', 8);
        }

        // Check if projectile is off-screen (relative to camera view)
        if (proj.x - game.camera.x < -50 || proj.x - game.camera.x > 1650 || proj.y - game.camera.y < -50 || proj.y - game.camera.y > 1050) {
            game.canvas.removeChild(proj.el);
            return false;
        }

        // Hit bullets
        for (let i = 0; i < game.entities.bullets.length; i++) {
            const bullet = game.entities.bullets[i];
            // Use world coordinates for collision
            const bxWorld = bullet.worldX + bullet.size / 2;
            const byWorld = bullet.worldY + bullet.size / 2;

            if (Math.hypot(proj.x - bxWorld, proj.y - byWorld) < 15) {
                createExplosion(bxWorld - game.camera.x, byWorld - game.camera.y, '#00d4ff'); // Explosion at screen pos
                game.canvas.removeChild(bullet.el);
                game.entities.bullets.splice(i, 1);
                gainXP(1);

                proj.hits++;
                if (proj.hits > proj.pierce) {
                    game.canvas.removeChild(proj.el);
                    return false;
                }
                break;
            }
        }

        // Hit enemies
        for (let enemy of game.entities.enemies) {
            // Use world coordinates for collision
            const exWorld = enemy.worldX + enemy.w / 2;
            const eyWorld = enemy.worldY + enemy.h / 2;

            if (Math.hypot(proj.x - exWorld, proj.y - eyWorld) < enemy.w / 2 + 6) {
                damageEnemy(enemy, proj.damage);
                if (proj.isCrit) {
                    showFloatingText(exWorld - game.camera.x, eyWorld - game.camera.y, 'CRIT!', '#ffeb3b'); // Text at screen pos
                }

                proj.hits++;
                if (proj.hits > proj.pierce) {
                    game.canvas.removeChild(proj.el);
                    return false;
                }
                break;
            }
        }

        return true;
    });
}

// ===== SKILLS =====
function useSkill(key) {
    const skill = game.skills[key];
    if (!skill || skill.level === 0) return;

    audioSystem.skillActivate(); // Play skill sound

    // Check passive skills separately
    if (skill.isPassive) {
        if (key === 'T') {
            // Phoenix Rebirth is auto-triggered on death
            showFloatingText(800, 500, 'Phoenix is ready to resurrect!', '#ff6600');
        } else if (key === 'Y') {
            // Critical Overload - show charge status
            const charge = game.passives.critOverloadCharge;
            const threshold = skill.threshold - skill.level * 2;
            showFloatingText(800, 500, `Crit Charge: ${charge}/${threshold}`, '#ffd700');
        }
        return;
    }

    if (skill.remaining > 0) return;

    // Player is always at the center of the screen
    const pxScreen = 785 + 15;
    const pyScreen = 485 + 15;
    const pxWorld = game.camera.x + pxScreen;
    const pyWorld = game.camera.y + pyScreen;

    if (key === 'Q') {
        // 🔥 FIREBALL BARRAGE
        const fireballCount = 5 + skill.level * 2;
        const damage = 30 + skill.level * 15;
        const spreadAngle = Math.PI / 3; // 60 degrees spread

        createFireballBarrage(pxWorld, pyWorld, fireballCount, damage, spreadAngle);
        screenShake(4, 250);
        flashScreen('#ff6600', 0.3, 150);
        showFloatingText(pxScreen, pyScreen, '🔥 FIREBALL BARRAGE!', '#ff6600');

    } else if (key === 'W') {
        // 🐺 SPIRIT WOLVES
        const duration = 12000 + skill.level * 3000;
        const wolfCount = 2 + Math.floor(skill.level / 2);
        const damage = 12 + skill.level * 8;

        summonSpiritWolves(wolfCount, duration, damage);
        showFloatingText(pxScreen, pyScreen, '🐺 SPIRIT WOLVES!', '#00d4ff');

    } else if (key === 'E') {
        // ️ SHIELD SLAM
        const distance = 150 + skill.level * 30;
        const damage = 20 + skill.level * 15;

        executeShieldSlam(distance, damage);
        flashScreen('#ffd700', 0.4, 100);

    } else if (key === 'R') {
        // 🌑 BLACK HOLE (Ultimate)
        const radius = 200 + skill.level * 50;
        const duration = 3000 + skill.level * 500;
        const damage = 80 + skill.level * 40;

        createBlackHole(pxWorld, pyWorld, radius, duration, damage);
        screenShake(8, 500);
        showFloatingText(pxScreen, pyScreen - 50, '🌑 BLACK HOLE!', '#d500f9');
    }

    skill.remaining = skill.cd;
    updateSkillUI(key);
}

// Chain Lightning Implementation
function createChainLightning(startX, startY, jumps, damage, range) {
    let currentTargets = [];
    let currentX = startX;
    let currentY = startY;

    // Find initial targets
    const initialTargets = game.entities.enemies
        .filter(e => Math.hypot(e.worldX - startX, e.worldY - startY) < range)
        .sort((a, b) => {
            const distA = Math.hypot(a.worldX - startX, a.worldY - startY);
            const distB = Math.hypot(b.worldX - startX, a.worldY - startY);
            return distA - distB;
        });

    const processJump = (jumpIndex) => {
        if (jumpIndex >= jumps || initialTargets.length === 0) return;

        const targetIndex = jumpIndex % initialTargets.length;
        const target = initialTargets[targetIndex];

        if (!target || !target.el.parentNode) {
            processJump(jumpIndex + 1);
            return;
        }

        const targetX = target.worldX - game.camera.x + target.w / 2;
        const targetY = target.worldY - game.camera.y + target.h / 2;

        // Create lightning bolt
        createLightningBolt(currentX, currentY, targetX, targetY);

        // Damage enemy
        const actualDamage = damage * Math.pow(0.8, jumpIndex); // Decay damage
        damageEnemy(target, actualDamage);
        addHitFlash(target.el, 100);

        // Electric particles
        createParticles(targetX, targetY, 8, 'electric', {
            speed: 3,
            lifetime: 500,
            size: 4
        });

        currentX = targetX;
        currentY = targetY;

        setTimeout(() => processJump(jumpIndex + 1), 150);
    };

    processJump(0);
}

// Fireball Barrage Implementation
function createFireballBarrage(startX, startY, fireballCount, damage, spreadAngle) {
    // Determine aim direction (towards nearest enemy or movement direction)
    let baseAngle = 0;

    // Find nearest enemy for aiming
    let nearest = null;
    let minDist = Infinity;
    for (let enemy of game.entities.enemies) {
        const ex = enemy.worldX + enemy.w / 2;
        const ey = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(ex - startX, ey - startY);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    }

    if (nearest) {
        const ex = nearest.worldX + nearest.w / 2;
        const ey = nearest.worldY + nearest.h / 2;
        baseAngle = Math.atan2(ey - startY, ex - startX);
    } else {
        // Default to right
        baseAngle = 0;
    }

    // Shoot fireballs in a fan pattern
    for (let i = 0; i < fireballCount; i++) {
        const angleOffset = (i - (fireballCount - 1) / 2) * (spreadAngle / (fireballCount - 1));
        const angle = baseAngle + angleOffset;

        setTimeout(() => {
            createFireball(startX, startY, angle, damage);
        }, i * 50); // Stagger shots slightly
    }
}

function createFireball(xWorld, yWorld, angle, damage) {
    const fireball = document.createElement('div');
    fireball.className = 'projectile';
    // Reset to CSS class defaults
    fireball.style.left = (xWorld - game.camera.x) + 'px';
    fireball.style.top = (yWorld - game.camera.y) + 'px';
    game.canvas.appendChild(fireball);

    const speed = 12;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    let currentX = xWorld;
    let currentY = yWorld;
    let lifetime = 0;
    const maxLifetime = 1000; // 1 second

    const updateFireball = setInterval(() => {
        if (lifetime > maxLifetime || game.state.paused || game.state.gameOver) {
            clearInterval(updateFireball);
            if (fireball.parentNode) game.canvas.removeChild(fireball);
            return;
        }

        currentX += vx;
        currentY += vy;
        lifetime += 16;

        // Update position
        const screenX = currentX - game.camera.x;
        const screenY = currentY - game.camera.y;
        fireball.style.left = screenX + 'px';
        fireball.style.top = screenY + 'px';

        // Add neon trail
        if (lifetime % 32 < 16) {
            createParticles(screenX, screenY, 1, 'fire', {
                speed: 0.5,
                lifetime: 300,
                size: 4,
                color: '#ffaa00'
            });
        }

        // Check collision with enemies
        for (let enemy of game.entities.enemies) {
            const ex = enemy.worldX + enemy.w / 2;
            const ey = enemy.worldY + enemy.h / 2;
            const dist = Math.hypot(currentX - ex, currentY - ey);

            if (dist < 25) {
                // Hit!
                damageEnemy(enemy, damage);
                addHitFlash(enemy.el, 100);

                // Explosion
                createEnhancedExplosion(screenX, screenY, '#ff6600', 12);
                createParticles(screenX, screenY, 15, 'fire', {
                    speed: 4,
                    lifetime: 600,
                    size: 8
                });

                clearInterval(updateFireball);
                if (fireball.parentNode) game.canvas.removeChild(fireball);
                return;
            }
        }

        // Remove if off screen
        if (screenX < -100 || screenX > 1700 || screenY < -100 || screenY > 1100) {
            clearInterval(updateFireball);
            if (fireball.parentNode) game.canvas.removeChild(fireball);
        }
    }, 16);
}

// Blade Storm Implementation
function createBladeStorm(centerX, centerY, bladeCount, radius, duration, damage) {
    const blades = [];
    const startTime = Date.now();

    // Create blades
    for (let i = 0; i < bladeCount; i++) {
        const blade = document.createElement('div');
        blade.className = 'blade-rotating';
        game.canvas.appendChild(blade);
        blades.push({
            el: blade,
            angle: (Math.PI * 2 * i) / bladeCount
        });
    }

    const updateBlades = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            clearInterval(updateBlades);
            blades.forEach(b => {
                if (b.el.parentNode) game.canvas.removeChild(b.el);
            });
            return;
        }

        const playerX = 785 + 15;
        const playerY = 485 + 15;
        const rotation = (elapsed / 1000) * Math.PI * 2; // Full rotation per second

        blades.forEach((blade, idx) => {
            const angle = blade.angle + rotation;
            const x = playerX + Math.cos(angle) * radius;
            const y = playerY + Math.sin(angle) * radius;

            blade.el.style.left = x + 'px';
            blade.el.style.top = y + 'px';
            blade.el.style.transform = `rotate(${angle}rad)`;

            // Check collision with enemies
            game.entities.enemies.forEach(enemy => {
                const exScreen = enemy.worldX - game.camera.x + enemy.w / 2;
                const eyScreen = enemy.worldY - game.camera.y + enemy.h / 2;

                if (Math.hypot(x - exScreen, y - eyScreen) < 40) {
                    if (!enemy.lastBladeHit || Date.now() - enemy.lastBladeHit > 500) {
                        damageEnemy(enemy, damage);
                        addHitFlash(enemy.el, 80);
                        enemy.lastBladeHit = Date.now();
                        createParticles(exScreen, eyScreen, 5, 'magic', {
                            lifetime: 400
                        });
                    }
                }
            });
        });
    }, 16);
}

// Spirit Wolves Implementation  
function summonSpiritWolves(wolfCount, duration, damage) {
    const wolves = [];
    const startTime = Date.now();

    // Spawn wolves around player
    for (let i = 0; i < wolfCount; i++) {
        const angle = (Math.PI * 2 * i) / wolfCount;
        const offsetX = Math.cos(angle) * 60;
        const offsetY = Math.sin(angle) * 60;

        const wolf = document.createElement('div');
        wolf.style.position = 'absolute';
        wolf.style.width = '35px';
        wolf.style.height = '35px';
        wolf.style.borderRadius = '50% 50% 50% 50%';
        wolf.style.background = 'radial-gradient(circle, rgba(0, 212, 255, 0.7), rgba(0, 150, 255, 0.4))';
        wolf.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.8)';
        wolf.style.border = '2px solid rgba(0, 255, 255, 0.6)';
        wolf.style.zIndex = '95';
        wolf.textContent = '🐺';
        wolf.style.fontSize = '20px';
        wolf.style.display = 'flex';
        wolf.style.alignItems = 'center';
        wolf.style.justifyContent = 'center';
        game.canvas.appendChild(wolf);

        wolves.push({
            el: wolf,
            worldX: game.camera.x + 800 + offsetX,
            worldY: game.camera.y + 500 + offsetY,
            targetEnemy: null,
            lastAttack: 0
        });
    }

    const updateWolves = setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (elapsed > duration || game.state.paused || game.state.gameOver) {
            clearInterval(updateWolves);
            wolves.forEach(w => {
                if (w.el.parentNode) {
                    w.el.style.transition = 'opacity 0.5s';
                    w.el.style.opacity = '0';
                    setTimeout(() => {
                        if (w.el.parentNode) game.canvas.removeChild(w.el);
                    }, 500);
                }
            });
            return;
        }

        const playerWorldX = game.camera.x + 800;
        const playerWorldY = game.camera.y + 500;

        wolves.forEach(wolf => {
            // Find nearest enemy
            let nearest = null;
            let minDist = Infinity;

            for (let enemy of game.entities.enemies) {
                const ex = enemy.worldX + enemy.w / 2;
                const ey = enemy.worldY + enemy.h / 2;
                const dist = Math.hypot(ex - wolf.worldX, ey - wolf.worldY);

                if (dist < 400 && dist < minDist) {
                    minDist = dist;
                    nearest = enemy;
                }
            }

            if (nearest) {
                // Chase enemy
                const ex = nearest.worldX + nearest.w / 2;
                const ey = nearest.worldY + nearest.h / 2;
                const angle = Math.atan2(ey - wolf.worldY, ex - wolf.worldX);
                const speed = 6;

                wolf.worldX += Math.cos(angle) * speed;
                wolf.worldY += Math.sin(angle) * speed;

                // Attack if close
                const dist = Math.hypot(ex - wolf.worldX, ey - wolf.worldY);
                if (dist < 30 && Date.now() - wolf.lastAttack > 800) {
                    damageEnemy(nearest, damage);
                    addHitFlash(nearest.el, 80);
                    wolf.lastAttack = Date.now();

                    const enemyScreenX = ex - game.camera.x;
                    const enemyScreenY = ey - game.camera.y;
                    createParticles(enemyScreenX, enemyScreenY, 5, 'magic', {
                        speed: 3,
                        lifetime: 400,
                        size: 4
                    });
                }

                // Trailing particles
                if (Date.now() % 100 < 50) {
                    const wolfScreenX = wolf.worldX - game.camera.x;
                    const wolfScreenY = wolf.worldY - game.camera.y;
                    createTrailEffect(wolfScreenX, wolfScreenY, 'rgba(0, 212, 255, 0.5)', 15);
                }
            } else {
                // Follow player
                const angle = Math.atan2(playerWorldY - wolf.worldY, playerWorldX - wolf.worldX);
                const dist = Math.hypot(playerWorldX - wolf.worldX, playerWorldY - wolf.worldY);

                if (dist > 100) {
                    const speed = 4;
                    wolf.worldX += Math.cos(angle) * speed;
                    wolf.worldY += Math.sin(angle) * speed;
                }
            }

            // Update screen position
            const screenX = wolf.worldX - game.camera.x;
            const screenY = wolf.worldY - game.camera.y;
            wolf.el.style.left = screenX + 'px';
            wolf.el.style.top = screenY + 'px';
        });
    }, 16);
}

// Shield Slam Implementation - Charges forward smoothly
function executeShieldSlam(distance, damage) {
    const vx = game.velocity.x;
    const vy = game.velocity.y;

    // Default to right if not moving
    let angle = Math.atan2(vy, vx);
    if (vx === 0 && vy === 0) {
        angle = 0; // Slam right
    }

    const startWorldX = game.camera.x + 785 + 15;
    const startWorldY = game.camera.y + 485 + 15;

    // Animate smooth movement
    const steps = 15; // Number of animation steps
    const stepDistance = distance / steps;
    const stepDuration = 30; // ms per step

    let currentStep = 0;
    const damagedEnemies = new Set(); // Track enemies already hit

    const animateSlam = setInterval(() => {
        if (currentStep >= steps || game.state.paused || game.state.gameOver) {
            clearInterval(animateSlam);
            return;
        }

        // Move player smoothly - UPDATE BOTH camera AND player world position
        const moveX = Math.cos(angle) * stepDistance;
        const moveY = Math.sin(angle) * stepDistance;

        game.camera.x += moveX;
        game.camera.y += moveY;
        game.state.x += moveX; // FIX: Update player world position
        game.state.y += moveY; // FIX: Update player world position

        // Create trail effect at player position
        if (currentStep % 2 === 0) {
            createTrailEffect(800, 500, '#ffd700', 25);
            createParticles(800, 500, 3, 'spark', {
                speed: 2,
                lifetime: 300,
                size: 4,
                startAngle: angle + Math.PI,
                spread: Math.PI / 4
            });
        }

        // Check collision with enemies
        const playerWorldX = game.camera.x + 785 + 15;
        const playerWorldY = game.camera.y + 485 + 15;

        game.entities.enemies.forEach(enemy => {
            if (damagedEnemies.has(enemy)) return;

            const ex = enemy.worldX + enemy.w / 2;
            const ey = enemy.worldY + enemy.h / 2;
            const dist = Math.hypot(ex - playerWorldX, ey - playerWorldY);

            if (dist < 60) {
                // Damage and knockback
                damageEnemy(enemy, damage);
                addHitFlash(enemy.el, 100);
                damagedEnemies.add(enemy);

                // Knockback enemy
                const knockbackDist = 100;
                enemy.worldX += Math.cos(angle) * knockbackDist;
                enemy.worldY += Math.sin(angle) * knockbackDist;

                // Visual feedback
                const exScreen = ex - game.camera.x;
                const eyScreen = ey - game.camera.y;
                createParticles(exScreen, eyScreen, 8, 'spark', {
                    speed: 4,
                    lifetime: 500
                });
            }
        });

        // Update view
        updateCameraView();

        currentStep++;
    }, stepDuration);

    showFloatingText(800, 500, '�️ SHIELD SLAM!', '#ffd700');
}

// Helper: Point to line distance
function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Black Hole Implementation
function createBlackHole(xWorld, yWorld, radius, duration, damage) {
    const vortex = document.createElement('div');
    vortex.className = 'black-hole-vortex';
    vortex.style.width = radius * 2 + 'px';
    vortex.style.height = radius * 2 + 'px';
    vortex.style.left = (xWorld - game.camera.x - radius) + 'px';
    vortex.style.top = (yWorld - game.camera.y - radius) + 'px';
    game.canvas.appendChild(vortex);

    const startTime = Date.now();
    const pullInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            clearInterval(pullInterval);

            // Final explosion
            game.entities.enemies.forEach(enemy => {
                const ex = enemy.worldX + enemy.w / 2;
                const ey = enemy.worldY + enemy.h / 2;
                if (Math.hypot(ex - xWorld, ey - yWorld) < radius) {
                    damageEnemy(enemy, damage);
                    const exScreen = ex - game.camera.x;
                    const eyScreen = ey - game.camera.y;
                    createEnhancedExplosion(exScreen, eyScreen, '#d500f9', 15);
                }
            });

            if (vortex.parentNode) game.canvas.removeChild(vortex);
            screenShake(6, 400);
            flashScreen('#d500f9', 0.6, 300);
            return;
        }

        // Pull enemies toward center
        game.entities.enemies.forEach(enemy => {
            const ex = enemy.worldX + enemy.w / 2;
            const ey = enemy.worldY + enemy.h / 2;
            const dist = Math.hypot(ex - xWorld, ey - yWorld);

            if (dist < radius * 1.5) {
                const pullStrength = 5 * (1 - dist / (radius * 1.5));
                const angle = Math.atan2(yWorld - ey, xWorld - ex);
                enemy.worldX += Math.cos(angle) * pullStrength;
                enemy.worldY += Math.sin(angle) * pullStrength;
            }
        });

        // Update vortex position
        vortex.style.left = (xWorld - game.camera.x - radius) + 'px';
        vortex.style.top = (yWorld - game.camera.y - radius) + 'px';

        // Add swirl particles
        if (elapsed % 100 < 16) {
            createParticles(xWorld - game.camera.x, yWorld - game.camera.y, 5, 'magic', {
                speed: 2,
                lifetime: 800,
                size: 6
            });
        }
    }, 16);
}

function createNova(xWorld, yWorld, radius, damage) {
    const nova = document.createElement('div');
    nova.style.position = 'absolute';
    nova.style.left = (xWorld - game.camera.x - 10) + 'px'; // Position relative to camera
    nova.style.top = (yWorld - game.camera.y - 10) + 'px';   // Position relative to camera
    nova.style.width = '20px';
    nova.style.height = '20px';
    nova.style.border = '3px solid #00d4ff';
    nova.style.borderRadius = '50%';
    nova.style.boxShadow = '0 0 30px #00d4ff';
    nova.style.pointerEvents = 'none';
    nova.style.transition = 'all 0.5s ease-out';
    game.canvas.appendChild(nova);

    setTimeout(() => {
        nova.style.width = (radius * 2) + 'px';
        nova.style.height = (radius * 2) + 'px';
        nova.style.left = (xWorld - game.camera.x - radius) + 'px'; // Position relative to camera
        nova.style.top = (yWorld - game.camera.y - radius) + 'px';   // Position relative to camera
        nova.style.opacity = '0';

        // Damage enemies in range (using world coordinates)
        game.entities.enemies.forEach(enemy => {
            const exWorld = enemy.worldX + enemy.w / 2;
            const eyWorld = enemy.worldY + enemy.h / 2;
            if (Math.hypot(exWorld - xWorld, eyWorld - yWorld) < radius) {
                damageEnemy(enemy, damage);
            }
        });
    }, 10);

    setTimeout(() => game.canvas.removeChild(nova), 600);
}

function spawnMeteor() {
    // Spawn meteor at a random world coordinate visible on screen
    const xWorld = game.camera.x + Math.random() * 1500;
    const yWorld = game.camera.y + Math.random() * 900;

    const warning = document.createElement('div');
    warning.className = 'warning-zone';
    warning.style.width = '80px';
    warning.style.height = '80px';
    warning.style.left = (xWorld - game.camera.x) + 'px'; // Position relative to camera
    warning.style.top = (yWorld - game.camera.y) + 'px';   // Position relative to camera
    game.canvas.appendChild(warning);

    setTimeout(() => {
        if (warning.parentNode) game.canvas.removeChild(warning);

        createExplosion(xWorld - game.camera.x + 40, yWorld - game.camera.y + 40, '#ff6600'); // Explosion at screen pos

        game.entities.enemies.forEach(enemy => {
            const exWorld = enemy.worldX + enemy.w / 2;
            const eyWorld = enemy.worldY + enemy.h / 2;
            if (Math.hypot(exWorld - (xWorld + 40), eyWorld - (yWorld + 40)) < 60) { // Collision in world coords
                damageEnemy(enemy, 50 + game.skills.R.level * 30);
            }
        });
    }, 1000);
}

function updateCooldowns() {
    if (game.state.paused) return;
    for (let key in game.skills) {
        if (game.skills[key].remaining > 0) {
            game.skills[key].remaining--;
            updateSkillUI(key);
        }
    }
}

// ===== ENEMIES =====
function spawnEnemies() {
    if (game.state.paused || game.state.gameOver) return;

    const maxEnemies = 15 + game.state.level * 3; // Increased from 10 + level*2
    if (game.entities.enemies.length >= maxEnemies) return;

    // Start with fewer enemies, scale up faster
    const count = Math.floor(0.5 + game.difficultyMultiplier * 0.8); // Increased from 0.5
    for (let i = 0; i < count; i++) {
        const types = ['slime', 'zombie', 'shooter'];
        const type = types[Math.floor(Math.random() * types.length)];
        createEnemy(type, false); // Pass false for isElite
    }

    // Chance to spawn an elite enemy
    if (Math.random() < 0.01 * game.difficultyMultiplier) { // Increase chance with difficulty
        spawnEliteEnemy();
    }
}

function createEnemy(type, isElite = false) {
    const enemy = document.createElement('div');
    enemy.className = 'enemy enemy-' + type;

    if (isElite) {
        enemy.style.boxShadow = '0 0 30px #ff00ff, 0 0 60px #ff00ff';
        enemy.style.border = '3px solid #ff00ff';
    }

    // IMPORTANT: Spawn around PLAYER's current position (camera position)
    // Not at fixed map coordinates!
    const edge = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];

    // Spawn in world coordinates (around camera)
    let worldX, worldY;
    if (edge === 'top') {
        worldX = game.camera.x + Math.random() * 1600;
        worldY = game.camera.y - 50;
    } else if (edge === 'bottom') {
        worldX = game.camera.x + Math.random() * 1600;
        worldY = game.camera.y + 1050;
    } else if (edge === 'left') {
        worldX = game.camera.x - 50;
        worldY = game.camera.y + Math.random() * 1000;
    } else {
        worldX = game.camera.x + 1650;
        worldY = game.camera.y + Math.random() * 1000;
    }

    enemy.style.left = (worldX - game.camera.x) + 'px'; // Position relative to camera
    enemy.style.top = (worldY - game.camera.y) + 'px';   // Position relative to camera
    game.canvas.appendChild(enemy);

    const baseStats = {
        slime: { hp: 15, speed: 1.5, damage: 1, xp: 8, w: 35, h: 35 },
        zombie: { hp: 30, speed: 2, damage: 2, xp: 15, w: 40, h: 40 },
        shooter: { hp: 25, speed: 1, damage: 2, xp: 20, w: 38, h: 38 }
    }[type];

    // Exponential scaling with difficulty - MUCH STRONGER
    let stats = {
        hp: Math.floor(baseStats.hp * Math.pow(game.difficultyMultiplier, 1.5)), // Increased from 1.2
        speed: Math.min(baseStats.speed * (1 + game.difficultyMultiplier * 0.15), baseStats.speed * 2.5), // Increased cap
        damage: Math.floor(baseStats.damage * Math.pow(game.difficultyMultiplier, 1.0)), // Increased from 0.8
        xp: Math.floor(baseStats.xp * Math.pow(game.difficultyMultiplier, 0.7)), // Increased from 0.6
        w: baseStats.w,
        h: baseStats.h
    };

    // Elite enemies are 3x stronger
    if (isElite) {
        stats.hp = Math.floor(stats.hp * 3);
        stats.speed *= 1.5;
        stats.damage = Math.floor(stats.damage * 2);
        stats.xp = Math.floor(stats.xp * 5);
        stats.w = Math.floor(stats.w * 1.3);
        stats.h = Math.floor(stats.h * 1.3);
        enemy.style.width = stats.w + 'px';
        enemy.style.height = stats.h + 'px';
    }

    const hpBar = document.createElement('div');
    hpBar.className = 'hp-bar-enemy';
    const hpFill = document.createElement('div');
    hpFill.className = 'hp-bar-enemy-fill';
    hpFill.style.width = '100%';
    hpBar.appendChild(hpFill);
    enemy.appendChild(hpBar);

    game.entities.enemies.push({
        el: enemy,
        type: type,
        hp: stats.hp,
        maxHp: stats.hp,
        speed: stats.speed,
        baseSpeed: stats.speed,
        damage: stats.damage,
        xp: stats.xp,
        w: stats.w,
        h: stats.h,
        hpFill: hpFill,
        frozen: false,
        lastShot: 0,
        lastMeleeAttack: 0, // Track melee attack cooldown
        worldX: worldX, // Store world coordinates
        worldY: worldY,  // Store world coordinates
        isElite: isElite || false,
        // AI behavior tracking
        behaviorTime: Date.now(),
        zigzagOffset: Math.random() * Math.PI * 2 // Random start phase for zigzag
    });
}

function spawnEliteEnemy() {
    const types = ['zombie', 'shooter'];
    const type = types[Math.floor(Math.random() * types.length)];
    createEnemy(type, true);

    // Notify player
    showFloatingText(800, 100, '⚠️ ELITE ENEMY!', '#ff00ff');
}

function updateEnemies() {
    const px = 785 + 15;
    const py = 485 + 15;
    const pxWorld = game.camera.x + px;
    const pyWorld = game.camera.y + py;

    game.entities.enemies.forEach(enemy => {
        if (enemy.frozen) return;

        const exScreen = enemy.worldX - game.camera.x + enemy.w / 2;
        const eyScreen = enemy.worldY - game.camera.y + enemy.h / 2;

        // Calculate distance to player in world space
        const distToPlayer = Math.hypot(enemy.worldX - pxWorld, enemy.worldY - pyWorld);

        // Speed boost if player is far away (prevents running away forever)
        let currentSpeed = enemy.baseSpeed || enemy.speed;
        if (distToPlayer > 500) {
            currentSpeed *= 1.5; // 50% faster when far
        } else if (distToPlayer > 300) {
            currentSpeed *= 1.2; // 20% faster when medium distance
        }

        const angle = Math.atan2(py - eyScreen, px - exScreen);
        let vx = Math.cos(angle) * currentSpeed;
        let vy = Math.sin(angle) * currentSpeed;

        // IMPROVED AI BEHAVIORS
        // Zombie: Zigzag movement
        if (enemy.type === 'zombie') {
            const zigzagTime = (Date.now() - enemy.behaviorTime) / 1000;
            const zigzagAmount = Math.sin(zigzagTime * 3 + enemy.zigzagOffset) * 0.5;
            const perpAngle = angle + Math.PI / 2;
            vx += Math.cos(perpAngle) * zigzagAmount * currentSpeed;
            vy += Math.sin(perpAngle) * zigzagAmount * currentSpeed;
        }

        // Shooter: Keep distance behavior
        if (enemy.type === 'shooter') {
            const optimalRange = 250; // Preferred distance from player
            if (distToPlayer < optimalRange - 50) {
                // Too close, move away
                vx = -vx * 0.8;
                vy = -vy * 0.8;
            } else if (distToPlayer < optimalRange + 50) {
                // In optimal range, strafe
                const strafeAngle = angle + Math.PI / 2;
                const strafeDir = Math.sin((Date.now() - enemy.behaviorTime) / 500) > 0 ? 1 : -1;
                vx = Math.cos(strafeAngle) * currentSpeed * 0.7 * strafeDir;
                vy = Math.sin(strafeAngle) * currentSpeed * 0.7 * strafeDir;
            }
            // Else: too far, chase normally (default vx, vy)
        }

        // Update world position
        let newWorldX = enemy.worldX + vx;
        let newWorldY = enemy.worldY + vy;

        // Check collision with obstacles in world space
        const eRectWorld = {
            x: newWorldX,
            y: newWorldY,
            w: enemy.w,
            h: enemy.h
        };

        let collides = false;
        for (let obs of game.entities.obstacles) {
            const obsRectWorld = {
                x: obs.baseX,
                y: obs.baseY,
                w: obs.w,
                h: obs.h
            };
            if (rectCollision(eRectWorld, obsRectWorld)) {
                collides = true;
                break;
            }
        }


        if (collides) {
            // Revert to old position
            newWorldX = enemy.worldX;
            newWorldY = enemy.worldY;

            // Try perpendicular movement
            const perpAngle1 = angle + Math.PI / 2;
            let testWorldX = enemy.worldX + Math.cos(perpAngle1) * enemy.speed;
            let testWorldY = enemy.worldY + Math.sin(perpAngle1) * enemy.speed;

            let canMove1 = true;
            for (let obs of game.entities.obstacles) {
                const obsRect = { x: obs.baseX, y: obs.baseY, w: obs.w, h: obs.h };
                const testRect = { x: testWorldX, y: testWorldY, w: enemy.w, h: enemy.h };
                if (rectCollision(testRect, obsRect)) {
                    canMove1 = false;
                    break;
                }
            }

            if (canMove1) {
                newWorldX = testWorldX;
                newWorldY = testWorldY;
            }
        }

        // Update enemy world position
        enemy.worldX = newWorldX;
        enemy.worldY = newWorldY;

        // IMPROVED SHOOTER ATTACK with bullet patterns
        if (enemy.type === 'shooter') {
            const now = Date.now();
            const shootCooldown = enemy.isElite ? 2000 : 2500; // Elite shoots faster

            if (now - enemy.lastShot > shootCooldown && distToPlayer < 400) {
                const centerX = enemy.worldX + enemy.w / 2;
                const centerY = enemy.worldY + enemy.h / 2;
                const angleToPlayer = Math.atan2(pyWorld - centerY, pxWorld - centerX);

                if (enemy.isElite) {
                    // Elite: 5-way spread
                    for (let i = -2; i <= 2; i++) {
                        const spreadAngle = angleToPlayer + (i * 0.15);
                        const targetX = centerX + Math.cos(spreadAngle) * 400;
                        const targetY = centerY + Math.sin(spreadAngle) * 400;
                        shootEnemyBullet(centerX, centerY, targetX, targetY, enemy.damage);
                    }
                    audioSystem.explosion(); // Special sound for elite
                } else {
                    // Normal: Triple shot
                    for (let i = -1; i <= 1; i++) {
                        const spreadAngle = angleToPlayer + (i * 0.2);
                        const targetX = centerX + Math.cos(spreadAngle) * 400;
                        const targetY = centerY + Math.sin(spreadAngle) * 400;
                        shootEnemyBullet(centerX, centerY, targetX, targetY, enemy.damage);
                    }
                }

                enemy.lastShot = now;
            }
        }

        // Melee damage - with attack speed cooldown
        if (distToPlayer < 25) {
            const now = Date.now();

            // Base attack speed: 1 second (1000ms)
            // Scales with difficulty: faster as game progresses
            // Min attack speed: 0.4 seconds (400ms) at high difficulty
            const baseAttackSpeed = 1000; // 1 second
            const minAttackSpeed = 400; // 0.4 seconds
            const attackSpeed = Math.max(
                minAttackSpeed,
                baseAttackSpeed - (game.difficultyMultiplier * 50)
            );

            // Check if enough time has passed since last attack
            if (now - enemy.lastMeleeAttack >= attackSpeed) {
                const dmg = Math.max(1, enemy.damage - game.stats.armor);
                game.state.hp -= dmg;
                audioSystem.hurt(); // Play hurt sound
                showFloatingText(px, py, '-' + Math.floor(dmg), '#ff1744');
                updateUI('hp');

                enemy.lastMeleeAttack = now; // Update last attack time

                if (game.state.hp <= 0 && !checkPhoenixRebirth()) endGame();
            }
        }
    });
}

function damageEnemy(enemy, damage) {
    audioSystem.enemyHit(); // Play hit sound

    enemy.hp -= damage;
    enemy.hpFill.style.width = ((enemy.hp / enemy.maxHp) * 100) + '%';

    if (enemy.hp <= 0) {
        killEnemy(enemy);
    }
}

function killEnemy(enemy) {
    const exWorld = enemy.worldX + enemy.w / 2;
    const eyWorld = enemy.worldY + enemy.h / 2;

    // Explosion at screen position
    const exScreen = exWorld - game.camera.x;
    const eyScreen = eyWorld - game.camera.y;
    createExplosion(exScreen, eyScreen, '#76ff03');
    gainXP(enemy.xp);

    // Drop item at world position
    if (Math.random() < 0.15) {
        dropItem(exWorld, eyWorld);
    }

    game.canvas.removeChild(enemy.el);
    const index = game.entities.enemies.indexOf(enemy);
    if (index > -1) game.entities.enemies.splice(index, 1);
}

// ===== ITEMS =====
function dropItem(xWorld, yWorld) {
    const item = document.createElement('div');
    item.className = 'item-drop';

    const types = [
        { name: 'damage', color: '#ff5722', icon: '💥' },
        { name: 'speed', color: '#2196f3', icon: '⚡' },
        { name: 'health', color: '#4caf50', icon: '❤️' },
        { name: 'projectile', color: '#9c27b0', icon: '🔫' },
        { name: 'rare', color: '#ffd700', icon: '⭐' }
    ];

    const rarity = Math.random();
    const type = rarity > 0.9 ? types[4] : types[Math.floor(Math.random() * 4)];

    item.style.background = type.color;
    item.textContent = type.icon;
    item.style.left = (xWorld - game.camera.x) + 'px';
    item.style.top = (yWorld - game.camera.y) + 'px';
    item.dataset.type = type.name;
    game.canvas.appendChild(item);

    game.entities.items.push({ el: item, x: xWorld, y: yWorld, type: type.name, worldX: xWorld, worldY: yWorld });
}

function updateItems() {
    const px = 785 + 15; // Player screen center
    const py = 485 + 15;
    const pxWorld = game.camera.x + px;
    const pyWorld = game.camera.y + py;

    game.entities.items = game.entities.items.filter(item => {
        const dist = Math.hypot(item.worldX - pxWorld, item.worldY - pyWorld);

        if (dist < game.stats.pickupRange) {
            const angle = Math.atan2(pyWorld - item.worldY, pxWorld - item.worldX);
            item.worldX += Math.cos(angle) * 5;
            item.worldY += Math.sin(angle) * 5;
        }

        // Update screen position
        item.el.style.left = (item.worldX - game.camera.x) + 'px';
        item.el.style.top = (item.worldY - game.camera.y) + 'px';

        if (dist < 20) {
            collectItem(item);
            game.canvas.removeChild(item.el);
            return false;
        }

        return true;
    });
}

function collectItem(item) {
    audioSystem.pickup(); // Play pickup sound

    const px = game.player.offsetLeft + 15;
    const py = game.player.offsetTop + 15;

    if (item.type === 'damage') {
        game.stats.projectileDamage += 5;
        showFloatingText(px, py, '+5 Damage', '#ff5722');
    } else if (item.type === 'speed') {
        game.stats.moveSpeed += 0.5;
        showFloatingText(px, py, '+Speed', '#2196f3');
    } else if (item.type === 'health') {
        game.state.maxHp += 20;
        game.state.hp += 20;
        updateUI('hp');
        showFloatingText(px, py, '+20 Max HP', '#4caf50');
    } else if (item.type === 'projectile') {
        game.stats.projectileCount++;
        showFloatingText(px, py, '+1 Projectile', '#9c27b0');
    } else if (item.type === 'rare') {
        game.stats.fireRate += 0.3;
        game.stats.projectilePierce++;
        showFloatingText(px, py, 'RARE UPGRADE!', '#ffd700');
    }

    updateStatsDisplay();
}

// ===== BULLETS =====
function spawnBullets() {
    if (game.state.paused || game.state.gameOver) return;

    const count = Math.floor(1 + game.difficultyMultiplier * 0.5);
    for (let i = 0; i < count; i++) {
        const dir = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];
        if (Math.random() < 0.8) {
            createBullet(dir);
        } else {
            createHeal(dir);
        }
    }
}

function createBullet(dir) {
    const bullet = document.createElement('div');
    bullet.className = 'bullet';
    const size = Math.random() * 12 + 8;
    bullet.style.width = (dir === 'left' || dir === 'right' ? 10 : size) + 'px';
    bullet.style.height = (dir === 'left' || dir === 'right' ? size : 10) + 'px';

    // Spawn at edge of visible area in world coordinates
    let worldX, worldY;
    if (dir === 'top') {
        worldX = game.camera.x + Math.random() * 1580;
        worldY = game.camera.y;
    } else if (dir === 'bottom') {
        worldX = game.camera.x + Math.random() * 1580;
        worldY = game.camera.y + 990;
    } else if (dir === 'left') {
        worldX = game.camera.x;
        worldY = game.camera.y + Math.random() * 980;
    } else {
        worldX = game.camera.x + 1590;
        worldY = game.camera.y + Math.random() * 980;
    }

    bullet.style.left = (worldX - game.camera.x) + 'px';
    bullet.style.top = (worldY - game.camera.y) + 'px';
    game.canvas.appendChild(bullet);

    const speed = 3 + game.difficultyMultiplier * 0.3;
    const velocity = { top: [0, speed], bottom: [0, -speed], left: [speed, 0], right: [-speed, 0] }[dir];

    game.entities.bullets.push({
        el: bullet,
        size: size,
        vx: velocity[0],
        vy: velocity[1],
        damage: Math.floor(size * (1 + game.difficultyMultiplier * 0.2)),
        worldX: worldX,
        worldY: worldY
    });
}

function createHeal(dir) {
    const heal = document.createElement('div');
    heal.className = 'heal';
    const size = Math.random() * 10 + 8;
    heal.style.width = (dir === 'left' || dir === 'right' ? 10 : size) + 'px';
    heal.style.height = (dir === 'left' || dir === 'right' ? size : 10) + 'px';

    // Spawn at edge of visible area in world coordinates
    let worldX, worldY;
    if (dir === 'top') {
        worldX = game.camera.x + Math.random() * 1580;
        worldY = game.camera.y;
    } else if (dir === 'bottom') {
        worldX = game.camera.x + Math.random() * 1580;
        worldY = game.camera.y + 990;
    } else if (dir === 'left') {
        worldX = game.camera.x;
        worldY = game.camera.y + Math.random() * 980;
    } else {
        worldX = game.camera.x + 1590;
        worldY = game.camera.y + Math.random() * 980;
    }

    heal.style.left = (worldX - game.camera.x) + 'px';
    heal.style.top = (worldY - game.camera.y) + 'px';
    game.canvas.appendChild(heal);

    const speed = 3;
    const velocity = { top: [0, speed], bottom: [0, -speed], left: [speed, 0], right: [-speed, 0] }[dir];

    game.entities.bullets.push({
        el: heal,
        size: size,
        vx: velocity[0],
        vy: velocity[1],
        isHeal: true,
        worldX: worldX,
        worldY: worldY
    });
}

function positionAtEdge(el, edge) {
    if (edge === 'top') {
        el.style.left = Math.random() * 1580 + 'px';
        el.style.top = '0px';
    } else if (edge === 'bottom') {
        el.style.left = Math.random() * 1580 + 'px';
        el.style.top = '990px';
    } else if (edge === 'left') {
        el.style.left = '0px';
        el.style.top = Math.random() * 980 + 'px';
    } else {
        el.style.left = '1590px';
        el.style.top = Math.random() * 980 + 'px';
    }
}

function shootEnemyBullet(xWorld, yWorld, txWorld, tyWorld, damage) {
    const bullet = document.createElement('div');
    bullet.className = 'bullet';
    bullet.style.width = '12px';
    bullet.style.height = '12px';
    bullet.style.left = (xWorld - game.camera.x) + 'px';
    bullet.style.top = (yWorld - game.camera.y) + 'px';
    game.canvas.appendChild(bullet);

    const angle = Math.atan2(tyWorld - yWorld, txWorld - xWorld);
    const speed = 5;

    game.entities.bullets.push({
        el: bullet,
        size: 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: damage,
        worldX: xWorld,
        worldY: yWorld
    });
}

function updateBullets() {
    const px = 785; // Player screen position
    const py = 485;
    const pxWorld = game.camera.x + px + 15;
    const pyWorld = game.camera.y + py + 15;

    game.entities.bullets = game.entities.bullets.filter(bullet => {
        // Update world position
        bullet.worldX += bullet.vx;
        bullet.worldY += bullet.vy;

        // Update screen position
        const screenX = bullet.worldX - game.camera.x;
        const screenY = bullet.worldY - game.camera.y;
        bullet.el.style.left = screenX + 'px';
        bullet.el.style.top = screenY + 'px';

        // Remove if off-screen
        if (screenX < -50 || screenX > 1650 || screenY < -50 || screenY > 1050) {
            game.canvas.removeChild(bullet.el);
            if (!bullet.isHeal) gainXP(1);
            return false;
        }

        // Player collision (world coordinates)
        const dist = Math.hypot(bullet.worldX - pxWorld, bullet.worldY - pyWorld);
        if (dist < 20) {
            if (bullet.isHeal) {
                game.state.hp = Math.min(game.state.maxHp, game.state.hp + bullet.size);
                gainXP(Math.floor(bullet.size));
                showFloatingText(px + 15, py + 15, '+' + Math.floor(bullet.size), '#00ffff');
                updateUI('hp');
            } else {
                const dmg = Math.max(1, bullet.damage - game.stats.armor);
                game.state.hp -= dmg;
                audioSystem.hurt(); // Play hurt sound
                showFloatingText(px + 15, py + 15, '-' + Math.floor(dmg), '#ff1744');
                updateUI('hp');

                if (game.state.hp <= 0 && !checkPhoenixRebirth()) endGame();
            }

            game.canvas.removeChild(bullet.el);
            return false;
        }

        return true;
    });
}

// ===== PROGRESSION =====
function gainXP(amount) {
    game.state.xp += amount;
    updateUI('xp');

    if (game.state.xp >= game.state.xpToLevel) {
        levelUp();
    }
}

function levelUp() {
    audioSystem.levelUp(); // Play level up sound

    game.state.level++;
    game.state.xp = 0;
    game.state.xpToLevel = Math.floor(game.state.xpToLevel * 1.3);

    // Auto increase fire rate with level
    game.stats.fireRate += 0.1;

    showLevelUpAnimation();
    setTimeout(showLevelUpMenu, 800);

    updateUI('level');
    updateUI('xp');
}

function showLevelUpAnimation() {
    const anim = document.createElement('div');
    anim.className = 'level-up-anim';
    anim.textContent = 'LEVEL UP!';
    game.canvas.appendChild(anim);
    setTimeout(() => game.canvas.removeChild(anim), 1500);
}

function showLevelUpMenu() {
    game.state.paused = true;
    const menu = document.getElementById('levelUpMenu');
    const options = document.getElementById('upgradeOptions');
    options.innerHTML = '';

    // GUARANTEED SKILL UNLOCKS AT SPECIFIC LEVELS
    const skillUnlockLevels = {
        'Q': 2,  // Fireball Barrage
        'W': 4,  // Spirit Wolves
        'E': 6,  // Shield Slam
        'R': 8,  // Black Hole
        'T': 10, // Phoenix Rebirth
        'Y': 12  // Critical Overload
    };

    // Check if this level should guarantee a skill unlock
    let guaranteedSkill = null;
    for (let key in skillUnlockLevels) {
        if (game.state.level === skillUnlockLevels[key] && game.skills[key].level === 0) {
            guaranteedSkill = key;
            break;
        }
    }

    const upgrades = [
        {
            name: '💥 +15 Damage',
            stat: 'projectileDamage',
            value: 15,
            fn: () => game.stats.projectileDamage += 15
        },
        {
            name: '🔫 +1 Projectile',
            stat: 'projectileCount',
            value: 1,
            fn: () => game.stats.projectileCount++
        },
        {
            name: '⚡ +0.8 Fire Rate',
            stat: 'fireRate',
            value: 0.8,
            fn: () => game.stats.fireRate += 0.8
        },
        {
            name: '🎯 +1 Pierce',
            stat: 'projectilePierce',
            value: 1,
            fn: () => game.stats.projectilePierce++
        },
        {
            name: '❤️ +30 Max HP',
            stat: 'maxHp',
            value: 30,
            fn: () => { game.state.maxHp += 30; game.state.hp += 30; updateUI('hp'); }
        },
        {
            name: '🛡️ +5 Armor',
            stat: 'armor',
            value: 5,
            fn: () => game.stats.armor += 5
        },
        {
            name: '🏃 +1 Speed',
            stat: 'moveSpeed',
            value: 1,
            fn: () => game.stats.moveSpeed += 1
        },
        {
            name: '💚 +1 HP/s Regen',
            stat: 'regen',
            value: 1,
            fn: () => game.stats.regen++
        },
        {
            name: '🧲 +20 Pickup Range',
            stat: 'pickupRange',
            value: 20,
            fn: () => game.stats.pickupRange += 20
        },
        {
            name: '💫 +10% Crit Chance',
            stat: 'critChance',
            value: 0.1,
            fn: () => game.stats.critChance += 0.1
        },
        {
            name: '📏 +30% Projectile Size',
            stat: 'projectileSize',
            value: 0.3,
            fn: () => game.stats.projectileSize += 0.3
        },
        {
            name: '🩸 +5% Lifesteal',
            stat: 'lifesteal',
            value: 0.05,
            fn: () => game.stats.lifesteal += 0.05
        },
        {
            name: '💥 +10% AOE Radius',
            stat: 'aoeRadius',
            value: 0.1,
            fn: () => game.stats.aoeRadius += 0.1
        },
        {
            name: '⏱️ -5% Cooldown',
            stat: 'cooldownReduction',
            value: 0.05,
            fn: () => game.stats.cooldownReduction += 0.05
        }
    ];

    let chosen = [];

    // If there's a guaranteed skill unlock, force it
    if (guaranteedSkill) {
        const skill = game.skills[guaranteedSkill];
        chosen.push({
            name: `🔓 Unlock ${skill.name} (${guaranteedSkill})`,
            isSkill: true,
            fn: () => {
                skill.level = 1;
                updateSkillUI(guaranteedSkill);
                showFloatingText(800, 400, `✨ ${skill.name} Unlocked! ✨`, '#ffd700');
            }
        });
        // Add 2 more random upgrades
        const randomUpgrades = upgrades.sort(() => Math.random() - 0.5).slice(0, 2);
        chosen = chosen.concat(randomUpgrades);
    } else {
        // Normal random selection with skill upgrades
        // Add skill unlocks/upgrades to pool
        for (let key in game.skills) {
            const skill = game.skills[key];
            if (skill.level === 0) {
                upgrades.push({
                    name: `🔓 Unlock ${skill.name} (${key})`,
                    isSkill: true,
                    fn: () => {
                        skill.level = 1;
                        updateSkillUI(key);
                        showFloatingText(800, 400, `✨ ${skill.name} Unlocked! ✨`, '#ffd700');
                    }
                });
            } else if (skill.level < 5) {
                upgrades.push({
                    name: `⬆️ ${skill.name} Lv${skill.level + 1}`,
                    isSkill: true,
                    fn: () => {
                        skill.level++;
                        updateSkillUI(key);
                    }
                });
            }
        }
        chosen = upgrades.sort(() => Math.random() - 0.5).slice(0, 3);
    }

    chosen.forEach(up => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-upgrade';

        // Show stat changes for non-skill upgrades
        if (!up.isSkill && up.stat) {
            const currentValue = up.stat === 'maxHp' ? game.state.maxHp : game.stats[up.stat];
            const newValue = currentValue + up.value;

            // Format values nicely
            const formatValue = (val) => {
                if (up.stat === 'fireRate' || up.stat === 'critChance' || up.stat === 'lifesteal' ||
                    up.stat === 'projectileSize' || up.stat === 'aoeRadius' || up.stat === 'cooldownReduction') {
                    return val.toFixed(1);
                }
                return Math.floor(val);
            };

            btn.innerHTML = `
                <div style="font-size: 16px; font-weight: 700;">${up.name}</div>
                <div style="font-size: 13px; color: #64ffda; margin-top: 4px;">
                    ${formatValue(currentValue)} → ${formatValue(newValue)}
                    <span style="color: #4caf50;">(+${formatValue(up.value)})</span>
                </div>
            `;
        } else {
            btn.textContent = up.name;
        }

        btn.onclick = () => {
            up.fn();
            updateStatsDisplay();
            menu.style.display = 'none';
            game.state.paused = false;
        };
        options.appendChild(btn);
    });

    menu.style.display = 'block';
}

// ===== EFFECTS =====
function createExplosion(x, y, color) {
    for (let i = 0; i < 6; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute';
        p.style.width = '5px';
        p.style.height = '5px';
        p.style.background = color;
        p.style.borderRadius = '50%';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.boxShadow = `0 0 8px ${color}`;
        p.style.pointerEvents = 'none';
        p.style.zIndex = '250';
        game.canvas.appendChild(p);

        const angle = (Math.PI * 2 * i) / 6;
        let life = 1;
        let dist = 0;

        const anim = setInterval(() => {
            dist += 2;
            p.style.left = (x + Math.cos(angle) * dist) + 'px';
            p.style.top = (y + Math.sin(angle) * dist) + 'px';
            life -= 0.05;
            p.style.opacity = life;

            if (life <= 0) {
                clearInterval(anim);
                if (p.parentNode) game.canvas.removeChild(p);
            }
        }, 20);
    }
}

function showFloatingText(x, y, text, color) {
    const ft = document.createElement('div');
    ft.className = 'floating-text';
    ft.textContent = text;
    ft.style.color = color;
    ft.style.left = x + 'px';
    ft.style.top = y + 'px';
    ft.style.textShadow = `0 0 8px ${color}`;
    game.canvas.appendChild(ft);
    setTimeout(() => { if (ft.parentNode) game.canvas.removeChild(ft); }, 1200);
}

// ===== UI =====
function updateUI(type) {
    if (type === 'hp' || !type) {
        const percent = (game.state.hp / game.state.maxHp) * 100;
        document.getElementById('hpBar').style.width = percent + '%';
        document.getElementById('hpText').textContent = Math.floor(game.state.hp) + '/' + game.state.maxHp;
        updateVignette(); // Update low HP vignette
    }
    if (type === 'xp' || !type) {
        const percent = (game.state.xp / game.state.xpToLevel) * 100;
        document.getElementById('xpBar').style.width = percent + '%';
        document.getElementById('xpText').textContent = game.state.xp + '/' + game.state.xpToLevel;
    }
    if (type === 'level' || !type) {
        document.getElementById('levelNum').textContent = game.state.level;
    }
    if (type === 'score' || !type) {
        const mins = Math.floor(game.state.gameTime / 60);
        const secs = game.state.gameTime % 60;
        document.getElementById('scoreNum').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

function updateAllUI() {
    updateUI();
    for (let key in game.skills) updateSkillUI(key);
    updateStatsDisplay();
}

function updateSkillUI(key) {
    const skill = game.skills[key];
    const slot = document.getElementById('skill' + key);
    const cd = document.getElementById('cd' + key);
    const lvl = document.getElementById('lvl' + key);

    lvl.textContent = skill.level;

    if (skill.level === 0) {
        slot.classList.add('locked');
        slot.classList.remove('ready');
        slot.style.display = 'none'; // Hide locked skills
        cd.textContent = '🔒';
    } else {
        slot.style.display = 'flex'; // Show unlocked skills
        if (skill.remaining > 0) {
            slot.classList.remove('locked', 'ready');
            cd.textContent = skill.remaining;
        } else {
            slot.classList.remove('locked');
            slot.classList.add('ready');
            cd.textContent = '';
        }
    }
}

function updateStatsDisplay() {
    const stats = [
        `💥 ${game.stats.projectileDamage} DMG`,
        `🔫 ${game.stats.projectileCount} Proj`,
        `⚡ ${game.stats.fireRate.toFixed(1)}/s`,
        `🎯 ${game.stats.projectilePierce} Pierce`
    ];
    document.getElementById('statsText').textContent = stats.join(' • ');
}

// ===== UTILS =====
function rectCollision(r1, r2) {
    return r1.x < r2.x + r2.w &&
        r1.x + r1.w > r2.x &&
        r1.y < r2.y + r2.h &&
        r1.y + r1.h > r2.y;
}

// Phoenix Rebirth - Check and trigger before death
function checkPhoenixRebirth() {
    const phoenixSkill = game.skills.T;

    if (phoenixSkill && phoenixSkill.level > 0 && phoenixSkill.remaining === 0 && game.state.hp <= 0) {
        // Resurrect!
        game.state.hp = game.state.maxHp * 0.5; // Resurrect with 50% HP
        updateUI('hp');

        // Visual effect
        const phoenix = document.createElement('div');
        phoenix.className = 'phoenix-wings';
        phoenix.textContent = '🔥🦅🔥';
        phoenix.style.left = '800px';
        phoenix.style.top = '500px';
        game.canvas.appendChild(phoenix);

        setTimeout(() => {
            if (phoenix.parentNode) game.canvas.removeChild(phoenix);
        }, 2000);

        flashScreen('#ff6600', 0.7, 500);
        screenShake(10, 600);
        showFloatingText(800, 500, '🔥 PHOENIX REBIRTH! 🔥', '#ff6600');

        // Explosion effect
        createEnhancedExplosion(800, 500, '#ff6600', 20);

        // Damage nearby enemies
        game.entities.enemies.forEach(enemy => {
            const ex = enemy.worldX - game.camera.x + enemy.w / 2;
            const ey = enemy.worldY - game.camera.y + enemy.h / 2;
            if (Math.hypot(ex - 800, ey - 500) < 200) {
                damageEnemy(enemy, 100);
            }
        });

        //Start cooldown
        phoenixSkill.remaining = phoenixSkill.cd;
        updateSkillUI('T');

        return true; // Prevented death
    }

    return false; // No phoenix available
}

function endGame() {
    game.state.gameOver = true;

    // Save score and history
    const scoreData = {
        score: game.state.score,
        level: game.state.level,
        time: game.state.gameTime,
        difficulty: game.difficultyMultiplier
    };

    const isNewBest = ScoreManager.saveBestScore(scoreData);
    ScoreManager.saveMatch(scoreData);

    const mins = Math.floor(game.state.gameTime / 60);
    const secs = game.state.gameTime % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    let msg = `Game Over!\nLevel: ${game.state.level}\nScore: ${game.state.score}\nSurvived: ${timeStr}`;
    if (isNewBest) msg += `\n\n🏆 NEW HIGH SCORE!`;

    alert(msg);
    location.reload();
}

// ===== RANDOM EVENTS =====
function spawnRandomEvent() {
    const events = ['meteor_shower', 'lightning_storm'];
    const event = events[Math.floor(Math.random() * events.length)];

    if (event === 'meteor_shower') {
        spawnMeteorShower();
    } else if (event === 'lightning_storm') {
        spawnLightningStorm();
    }
}

function spawnMeteorShower() {
    showFloatingText(800, 100, '☄️ METEOR SHOWER!', '#ff6600');

    const count = 8 + Math.floor(game.difficultyMultiplier * 2);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            // USE WORLD COORDINATES - spawn relative to player's world position
            const playerWorldX = game.camera.x + 800;
            const playerWorldY = game.camera.y + 500;

            const worldX = playerWorldX + (Math.random() - 0.5) * 1200;
            const worldY = playerWorldY + (Math.random() - 0.5) * 800;

            const warning = document.createElement('div');
            warning.className = 'warning-zone';
            warning.style.width = '100px';
            warning.style.height = '100px';
            // Position in screen coords but track world coords
            warning.style.left = (worldX - game.camera.x) + 'px';
            warning.style.top = (worldY - game.camera.y) + 'px';
            warning.style.borderColor = '#ff6600';
            warning.style.background = 'rgba(255, 102, 0, 0.15)';
            warning.dataset.worldX = worldX;
            warning.dataset.worldY = worldY;
            game.canvas.appendChild(warning);

            // Update warning position as camera moves
            const updateWarning = setInterval(() => {
                if (!warning.parentNode) {
                    clearInterval(updateWarning);
                    return;
                }
                warning.style.left = (parseFloat(warning.dataset.worldX) - game.camera.x) + 'px';
                warning.style.top = (parseFloat(warning.dataset.worldY) - game.camera.y) + 'px';
            }, 16);

            setTimeout(() => {
                clearInterval(updateWarning);
                if (warning.parentNode) game.canvas.removeChild(warning);

                // Create falling meteor visual
                const meteor = document.createElement('div');
                meteor.style.position = 'absolute';
                meteor.style.width = '30px';
                meteor.style.height = '30px';
                meteor.style.borderRadius = '50%';
                meteor.style.background = 'radial-gradient(circle, #fff, #ff6600)';
                meteor.style.boxShadow = '0 0 20px #ff6600, 0 0 40px #ff4400, 0 0 60px #ff0000';
                meteor.style.left = (worldX - game.camera.x + 50) + 'px';
                meteor.style.top = '-50px'; // Start from top
                meteor.style.zIndex = '100';
                game.canvas.appendChild(meteor);

                // Animate meteor falling
                let meteorY = -50;
                const targetY = worldY - game.camera.y + 50;
                const fallSpeed = 15;

                const fallInterval = setInterval(() => {
                    meteorY += fallSpeed;
                    meteor.style.top = meteorY + 'px';

                    // Fire trail
                    if (meteorY % 20 < 10) {
                        createParticles(
                            parseFloat(meteor.style.left),
                            meteorY,
                            2,
                            'fire',
                            { speed: 1, lifetime: 400, size: 8, color: '#ff6600' }
                        );
                    }

                    // Impact
                    if (meteorY >= targetY) {
                        clearInterval(fallInterval);
                        if (meteor.parentNode) game.canvas.removeChild(meteor);

                        const explosionScreenX = worldX - game.camera.x + 50;
                        const explosionScreenY = worldY - game.camera.y + 50;
                        createExplosion(explosionScreenX, explosionScreenY, '#ff6600');

                        // Enhanced explosion particles
                        createParticles(explosionScreenX, explosionScreenY, 20, 'fire', {
                            speed: 6,
                            lifetime: 800,
                            size: 12,
                            color: '#ff6600'
                        });

                        const damage = 10 + Math.floor(game.difficultyMultiplier * 2);

                        // Damage player - use world coordinates
                        const playerX = game.camera.x + 785 + 15;
                        const playerY = game.camera.y + 485 + 15;
                        if (Math.hypot(playerX - (worldX + 50), playerY - (worldY + 50)) < 70) {
                            game.state.hp -= damage;
                            showFloatingText(800, 500, '-' + damage + ' ☄️', '#ff6600');
                            updateUI('hp');
                            if (game.state.hp <= 0 && !checkPhoenixRebirth()) endGame();
                        }

                        // Damage enemies - use world coordinates
                        game.entities.enemies.forEach(enemy => {
                            const ex = enemy.worldX + enemy.w / 2;
                            const ey = enemy.worldY + enemy.h / 2;
                            if (Math.hypot(ex - (worldX + 50), ey - (worldY + 50)) < 70) {
                                damageEnemy(enemy, damage * 2);
                            }
                        });
                    }
                }, 16); // End fallInterval
            }, 1200); // End warning timeout
        }, i * 300); // End meteor spawn delay
    }
}

function spawnLightningStorm() {
    showFloatingText(800, 100, '⚡ LIGHTNING STORM!', '#ffeb3b');

    const count = 6 + Math.floor(game.difficultyMultiplier * 1.5);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            // USE WORLD COORDINATES - spawn relative to player's world position
            const playerWorldX = game.camera.x + 800;
            const playerWorldY = game.camera.y + 500;

            const worldX = playerWorldX + (Math.random() - 0.5) * 1200;
            const worldY = playerWorldY + (Math.random() - 0.5) * 800;

            // Lightning warning
            const warning = document.createElement('div');
            warning.style.position = 'absolute';
            warning.style.left = (worldX - game.camera.x) + 'px';
            warning.style.top = '0px';
            warning.style.width = '4px';
            warning.style.height = (worldY - game.camera.y) + 'px';
            warning.style.background = 'linear-gradient(to bottom, transparent, rgba(255, 235, 59, 0.5))';
            warning.style.pointerEvents = 'none';
            warning.style.zIndex = '90';
            warning.dataset.worldX = worldX;
            warning.dataset.worldY = worldY;
            game.canvas.appendChild(warning);

            // Update warning position as camera moves
            const updateWarning = setInterval(() => {
                if (!warning.parentNode) {
                    clearInterval(updateWarning);
                    return;
                }
                const screenX = parseFloat(warning.dataset.worldX) - game.camera.x;
                const screenY = parseFloat(warning.dataset.worldY) - game.camera.y;
                warning.style.left = screenX + 'px';
                warning.style.height = screenY + 'px';
            }, 16);

            setTimeout(() => {
                clearInterval(updateWarning);
                if (warning.parentNode) game.canvas.removeChild(warning);

                // Lightning strike
                const screenX = worldX - game.camera.x;
                const screenY = worldY - game.camera.y;

                // Main lightning bolt (animated zigzag)
                const lightning = document.createElement('div');
                lightning.style.position = 'absolute';
                lightning.style.left = (screenX - 15) + 'px';
                lightning.style.top = '0px';
                lightning.style.width = '30px';
                lightning.style.height = (screenY + 50) + 'px';
                lightning.style.pointerEvents = 'none';
                lightning.style.zIndex = '95';
                lightning.style.overflow = 'visible';
                game.canvas.appendChild(lightning);

                // Create branching lightning paths
                const branches = 3 + Math.floor(Math.random() * 3);
                for (let b = 0; b < branches; b++) {
                    const branch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    branch.style.position = 'absolute';
                    branch.style.width = '30px';
                    branch.style.height = (screenY + 50) + 'px';
                    branch.style.left = '0';
                    branch.style.top = '0';
                    branch.style.pointerEvents = 'none';
                    branch.style.filter = 'drop-shadow(0 0 5px #ffeb3b) drop-shadow(0 0 10px #fff)';

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    let d = `M 15 0`; // Start from center top
                    let currentY = 0;
                    const segments = 8;
                    const segmentHeight = (screenY + 50) / segments;

                    for (let s = 0; s < segments; s++) {
                        currentY += segmentHeight;
                        const offsetX = 15 + (Math.random() - 0.5) * 20; // Zigzag
                        d += ` L ${offsetX} ${currentY}`;
                    }

                    path.setAttribute('d', d);
                    path.setAttribute('stroke', '#fff');
                    path.setAttribute('stroke-width', b === 0 ? '3' : '2'); // Main bolt thicker
                    path.setAttribute('fill', 'none');
                    path.setAttribute('opacity', b === 0 ? '1' : '0.6');

                    branch.appendChild(path);
                    lightning.appendChild(branch);
                }

                // Flash effect
                createExplosion(screenX, screenY, '#ffeb3b');
                createParticles(screenX, screenY, 15, 'electric', {
                    speed: 5,
                    lifetime: 600,
                    size: 6,
                    color: '#ffeb3b'
                });

                const damage = 15 + Math.floor(game.difficultyMultiplier * 3);

                // Damage player - use world coordinates
                const playerX = game.camera.x + 785 + 15;
                const playerY = game.camera.y + 485 + 15;
                if (Math.abs(playerX - worldX) < 40) {
                    game.state.hp -= damage;
                    showFloatingText(800, 500, '-' + damage + ' ⚡', '#ffeb3b');
                    updateUI('hp');
                    if (game.state.hp <= 0 && !checkPhoenixRebirth()) endGame();
                }

                // Damage enemies in line - use world coordinates
                game.entities.enemies.forEach(enemy => {
                    const ex = enemy.worldX + enemy.w / 2;
                    if (Math.abs(ex - worldX) < 40) {
                        damageEnemy(enemy, damage * 1.5);
                    }
                });

                setTimeout(() => {
                    if (lightning.parentNode) game.canvas.removeChild(lightning);
                }, 200);
            }, 600);
        }, i * 400);
    }
}

// ===== ENHANCED VISUAL EFFECTS SYSTEM =====

// Particle Pool for performance
const particlePool = {
    particles: [],
    maxParticles: 200,

    get() {
        if (this.particles.length > 0) {
            return this.particles.pop();
        }
        const p = document.createElement('div');
        p.className = 'particle';
        return p;
    },

    release(particle) {
        if (this.particles.length < this.maxParticles && particle.parentNode) {
            game.canvas.removeChild(particle);
            this.particles.push(particle);
        } else if (particle.parentNode) {
            game.canvas.removeChild(particle);
        }
    }
};

// Advanced Particle System
function createParticles(x, y, count, type, options = {}) {
    const defaults = {
        speed: 2,
        lifetime: 1000,
        size: 5,
        sizeVariation: 2,
        spread: Math.PI * 2,
        startAngle: 0
    };
    const opts = { ...defaults, ...options };

    for (let i = 0; i < count; i++) {
        const particle = particlePool.get();
        particle.className = `particle particle-${type}`;

        const size = opts.size + Math.random() * opts.sizeVariation;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';

        game.canvas.appendChild(particle);

        const angle = opts.startAngle + (opts.spread * i / count) + (Math.random() - 0.5) * 0.3;
        const speed = opts.speed * (0.8 + Math.random() * 0.4);

        animateParticle(particle, angle, speed, opts.lifetime);
    }
}

function animateParticle(particle, angle, speed, lifetime) {
    let life = 1;
    let dist = 0;
    const startTime = Date.now();

    const anim = setInterval(() => {
        const elapsed = Date.now() - startTime;
        life = 1 - (elapsed / lifetime);

        if (life <= 0) {
            clearInterval(anim);
            particlePool.release(particle);
            return;
        }

        dist += speed;
        const currentX = parseFloat(particle.style.left);
        const currentY = parseFloat(particle.style.top);

        particle.style.left = (currentX + Math.cos(angle) * speed) + 'px';
        particle.style.top = (currentY + Math.sin(angle) * speed) + 'px';
        particle.style.opacity = life;
        particle.style.transform = `scale(${life})`;
    }, 16);
}

// Trail Effect
function createTrailEffect(x, y, color, size = 12) {
    const trail = document.createElement('div');
    trail.className = 'trail-effect';
    trail.style.width = size + 'px';
    trail.style.height = size + 'px';
    trail.style.left = x + 'px';
    trail.style.top = y + 'px';
    trail.style.background = color;
    trail.style.boxShadow = `0 0 10px ${color}`;
    game.canvas.appendChild(trail);

    setTimeout(() => {
        if (trail.parentNode) game.canvas.removeChild(trail);
    }, 500);
}

// Screen Shake
function screenShake(intensity = 5, duration = 300) {
    const canvas = game.canvas;
    canvas.classList.add('shake');

    setTimeout(() => {
        canvas.classList.remove('shake');
    }, duration);
}

// Flash Screen
function flashScreen(color, opacity = 0.5, duration = 200) {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    flash.style.background = color;
    flash.style.opacity = opacity;
    game.canvas.appendChild(flash);

    setTimeout(() => {
        if (flash.parentNode) game.canvas.removeChild(flash);
    }, duration);
}

// Add Vignette on Low HP
function updateVignette() {
    const existing = document.querySelector('.vignette-overlay');

    if (game.state.hp < game.state.maxHp * 0.25 && !existing) {
        const vignette = document.createElement('div');
        vignette.className = 'vignette-overlay';
        game.canvas.appendChild(vignette);
    } else if (game.state.hp >= game.state.maxHp * 0.25 && existing) {
        game.canvas.removeChild(existing);
    }
}

// Hit Flash Effect
function addHitFlash(element, duration = 100) {
    element.style.animation = `hit-flash ${duration}ms ease-out`;
    setTimeout(() => {
        element.style.animation = '';
    }, duration);
}

// Create Lightning Bolt
function createLightningBolt(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const bolt = document.createElement('div');
    bolt.className = 'lightning-bolt';
    bolt.style.width = distance + 'px';
    bolt.style.height = '4px';
    bolt.style.left = x1 + 'px';
    bolt.style.top = y1 + 'px';
    bolt.style.transform = `rotate(${angle}rad)`;
    game.canvas.appendChild(bolt);

    // Add electric particles along the bolt
    for (let i = 0; i < 5; i++) {
        const particleX = x1 + (dx * i / 5);
        const particleY = y1 + (dy * i / 5);
        createParticles(particleX, particleY, 3, 'electric', {
            speed: 1,
            lifetime: 300,
            size: 3
        });
    }

    setTimeout(() => {
        if (bolt.parentNode) game.canvas.removeChild(bolt);
    }, 200);

    return bolt;
}

// Enhanced Explosion with more particles
function createEnhancedExplosion(x, y, color, particleCount = 12) {
    // Original explosion particles
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute';
        p.style.width = '6px';
        p.style.height = '6px';
        p.style.background = color;
        p.style.borderRadius = '50%';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.boxShadow = `0 0 10px ${color}`;
        p.style.pointerEvents = 'none';
        p.style.zIndex = '250';
        game.canvas.appendChild(p);

        const angle = (Math.PI * 2 * i) / particleCount;
        let life = 1;
        let dist = 0;

        const anim = setInterval(() => {
            dist += 3;
            p.style.left = (x + Math.cos(angle) * dist) + 'px';
            p.style.top = (y + Math.sin(angle) * dist) + 'px';
            life -= 0.04;
            p.style.opacity = life;

            if (life <= 0) {
                clearInterval(anim);
                if (p.parentNode) game.canvas.removeChild(p);
            }
        }, 16);
    }
}

// Dash Trail Effect
function createDashTrail(startX, startY, endX, endY, width = 30) {
    const trail = document.createElement('div');
    trail.className = 'dash-trail';

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    trail.style.width = distance + 'px';
    trail.style.height = width + 'px';
    trail.style.left = startX + 'px';
    trail.style.top = (startY - width / 2) + 'px';
    trail.style.transform = `rotate(${angle}rad)`;
    trail.style.transformOrigin = 'left center';

    game.canvas.appendChild(trail);

    setTimeout(() => {
        if (trail.parentNode) game.canvas.removeChild(trail);
    }, 500);
}

window.onload = init;
