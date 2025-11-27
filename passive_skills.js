// ===== PASSIVE AOE SKILLS SYSTEM =====

// Update all passive skills
function updatePassiveSkills() {
    if (game.skills.LIGHTNING_RING.level > 0) updateLightningRing();
    if (game.skills.BLADE_ORBIT.level > 0) updateBladeOrbit();
}

// ===== LIGHTNING RING ⚡ =====
function updateLightningRing() {
    const skill = game.passiveSkills.lightningRing;
    const skillLevel = game.skills.LIGHTNING_RING.level;

    // Initialize rings if not created
    if (skill.rings.length === 0) {
        initializeLightningRings(skillLevel);
    }

    const now = Date.now();

    // Damage tick
    if (now - skill.lastTick >= skill.tickRate) {
        dealLightningDamage(skillLevel);
        skill.lastTick = now;
    }

    // Update ring visual positions and rotation
    skill.rings.forEach((ring, index) => {
        // Rotate rings
        ring.rotation += ring.rotationSpeed;
        ring.el.style.transform = `translate(-50%, -50%) rotate(${ring.rotation}deg)`;

        // Position relative to player
        const playerScreenX = 800;
        const playerScreenY = 500;
        ring.el.style.left = playerScreenX + 'px';
        ring.el.style.top = playerScreenY + 'px';
    });
}

function initializeLightningRings(level) {
    const skill = game.passiveSkills.lightningRing;

    // Calculate number of rings based on level
    const ringCount = level >= 5 ? 2 : 1;

    for (let i = 0; i < ringCount; i++) {
        const ring = createLightningRingSVG(i, ringCount, level);
        skill.rings.push(ring);
    }
}

function createLightningRingSVG(index, total, level) {
    // Create SVG container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '85';

    const radius = game.passiveSkills.lightningRing.radius;
    const size = radius * 2;

    container.style.width = size + 'px';
    container.style.height = size + 'px';

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.filter = 'drop-shadow(0 0 8px #00ffff) drop-shadow(0 0 15px #00ffff)';

    // Create lightning ring path with zigzag pattern
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const segments = 24; // Number of zigzag segments
    let pathData = '';

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const nextAngle = ((i + 1) / segments) * Math.PI * 2;

        // Alternate between inner and outer radius for zigzag effect
        const currentRadius = radius + (i % 2 === 0 ? -5 : 5);
        const x = radius + Math.cos(angle) * currentRadius;
        const y = radius + Math.sin(angle) * currentRadius;

        if (i === 0) {
            pathData += `M ${x} ${y}`;
        } else {
            pathData += ` L ${x} ${y}`;
        }
    }

    path.setAttribute('d', pathData + ' Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#00ffff');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('opacity', '0.8');

    svg.appendChild(path);
    container.appendChild(svg);
    game.canvas.appendChild(container);

    // Rotation direction alternates for multiple rings
    const rotationSpeed = (index % 2 === 0 ? 1 : -1) * 0.5;

    return {
        el: container,
        rotation: 0,
        rotationSpeed: rotationSpeed,
        radius: radius
    };
}

function dealLightningDamage(level) {
    const skill = game.passiveSkills.lightningRing;
    const playerWorldX = game.camera.x + 800;
    const playerWorldY = game.camera.y + 500;

    game.entities.enemies.forEach(enemy => {
        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - playerWorldX, enemyY - playerWorldY);

        if (dist <= skill.radius) {
            damageEnemy(enemy, skill.damage);

            // Create electric particle effect
            const screenX = enemy.worldX - game.camera.x;
            const screenY = enemy.worldY - game.camera.y;
            createParticles(screenX, screenY, 3, 'electric', {
                speed: 3,
                lifetime: 300,
                size: 4,
                color: '#00ffff'
            });

            // Evolution: Chain lightning at level 9
            if (level >= 9 && Math.random() < 0.3) {
                chainLightning(enemy, playerWorldX, playerWorldY);
            }
        }
    });
}

function chainLightning(sourceEnemy, playerX, playerY) {
    // Find nearest enemy to chain to
    let closestEnemy = null;
    let closestDist = 200; // Max chain range

    const sourceX = sourceEnemy.worldX + sourceEnemy.w / 2;
    const sourceY = sourceEnemy.worldY + sourceEnemy.h / 2;

    game.entities.enemies.forEach(enemy => {
        if (enemy === sourceEnemy) return;

        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - sourceX, enemyY - sourceY);

        if (dist < closestDist) {
            closestDist = dist;
            closestEnemy = enemy;
        }
    });

    if (closestEnemy) {
        // Deal damage
        damageEnemy(closestEnemy, game.passiveSkills.lightningRing.damage * 0.5);

        // Visual: draw lightning bolt between enemies
        const targetX = closestEnemy.worldX + closestEnemy.w / 2;
        const targetY = closestEnemy.worldY + closestEnemy.h / 2;
        createChainLightningVisual(sourceX, sourceY, targetX, targetY);
    }
}

function createChainLightningVisual(x1, y1, x2, y2) {
    const screenX1 = x1 - game.camera.x;
    const screenY1 = y1 - game.camera.y;
    const screenX2 = x2 - game.camera.x;
    const screenY2 = y2 - game.camera.y;

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '0';
    container.style.top = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '95';
    game.canvas.appendChild(container);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '1600');
    svg.setAttribute('height', '1000');
    svg.style.filter = 'drop-shadow(0 0 5px #00ffff)';

    // Create zigzag path between points
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const segments = 5;
    let pathData = `M ${screenX1} ${screenY1}`;

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const x = screenX1 + (screenX2 - screenX1) * t + (Math.random() - 0.5) * 15;
        const y = screenY1 + (screenY2 - screenY1) * t + (Math.random() - 0.5) * 15;
        pathData += ` L ${x} ${y}`;
    }
    pathData += ` L ${screenX2} ${screenY2}`;

    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#00ffff');
    path.setAttribute('stroke-width', '2');

    svg.appendChild(path);
    container.appendChild(svg);

    // Remove after short duration
    setTimeout(() => {
        if (container.parentNode) game.canvas.removeChild(container);
    }, 150);
}

// ===== BLADE ORBIT 🌀 =====
function updateBladeOrbit() {
    const skill = game.passiveSkills.bladeOrbit;
    const skillLevel = game.skills.BLADE_ORBIT.level;

    // Initialize blades if not created
    if (skill.blades.length === 0) {
        initializeBlades(skillLevel);
    }

    // Update rotation
    skill.rotation += 2; // Degrees per frame

    const playerScreenX = 800;
    const playerScreenY = 500;
    const playerWorldX = game.camera.x + playerScreenX;
    const playerWorldY = game.camera.y + playerScreenY;

    // Update each blade
    skill.blades.forEach((blade, index) => {
        const angleOffset = (index / skill.blades.length) * 360;
        const currentAngle = (skill.rotation + angleOffset) * (Math.PI / 180);

        const x = playerScreenX + Math.cos(currentAngle) * skill.orbitRadius;
        const y = playerScreenY + Math.sin(currentAngle) * skill.orbitRadius;

        blade.el.style.left = x + 'px';
        blade.el.style.top = y + 'px';
        blade.el.style.transform = `translate(-50%, -50%) rotate(${skill.rotation + angleOffset + 90}deg)`;

        // Collision detection
        const bladeWorldX = game.camera.x + x;
        const bladeWorldY = game.camera.y + y;

        game.entities.enemies.forEach(enemy => {
            const enemyX = enemy.worldX + enemy.w / 2;
            const enemyY = enemy.worldY + enemy.h / 2;
            const dist = Math.hypot(enemyX - bladeWorldX, enemyY - bladeWorldY);

            if (dist < 25) {
                damageEnemy(enemy, skill.damage);

                // Slash effect
                createParticles(x, y, 5, 'spark', {
                    speed: 4,
                    lifetime: 300,
                    size: 3,
                    color: '#00ffff',
                    startAngle: currentAngle,
                    spread: Math.PI / 6
                });
            }
        });
    });
}

function initializeBlades(level) {
    const skill = game.passiveSkills.bladeOrbit;

    // Calculate blade count based on level
    let bladeCount = skill.bladeCount;
    if (level >= 2) bladeCount = Math.min(6, blade3 + (level - 1));
    if (level >= 6) bladeCount = Math.min(9, blade6 + Math.floor((level - 5) / 2));

    for (let i = 0; i < bladeCount; i++) {
        const blade = createBladeSVG();
        skill.blades.push(blade);
    }
}

function createBladeSVG() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '90';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.style.filter = 'drop-shadow(0 0 5px #00ffff) blur(0.5px)'; // Motion blur effect

    // Create blade shape (sword silhouette)
    const blade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    blade.setAttribute('d', 'M20,5 L22,15 L22,30 L20,35 L18,30 L18,15 Z M18,3 L20,2 L22,3 L22,5 L18,5 Z');
    blade.setAttribute('fill', 'url(#bladeGradient)');
    blade.setAttribute('stroke', '#00ffff');
    blade.setAttribute('stroke-width', '1');

    // Gradient for metallic look
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'bladeGradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '0%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#6dd5ed');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '50%');
    stop2.setAttribute('stop-color', '#ffffff');

    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', '100%');
    stop3.setAttribute('stop-color', '#2193b0');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);
    defs.appendChild(gradient);
    svg.appendChild(defs);
    svg.appendChild(blade);

    container.appendChild(svg);
    game.canvas.appendChild(container);

    return {
        el: container
    };
}




// ===== FIRE AURA 🔥 =====
function updateFireAura() {
    const skill = game.passiveSkills.fireAura;
    const skillLevel = game.skills.FIRE_AURA.level;
    const now = Date.now();

    // Continuous damage tick
    if (now - skill.lastTick >= skill.tickRate) {
        dealFireAuraDamage(skillLevel);
        skill.lastTick = now;
    }

    // Generate flame particles around player
    if (Math.random() < 0.3) { // 30% chance per frame
        const playerScreenX = 800;
        const playerScreenY = 500;

        // Random position within aura radius
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * skill.radius;
        const x = playerScreenX + Math.cos(angle) * dist;
        const y = playerScreenY + Math.sin(angle) * dist;

        createParticles(x, y, 1, 'fire', {
            speed: 1,
            lifetime: 800,
            size: 8,
            color: '#ff6600',
            vx: 0,
            vy: -1 // Float upward
        });
    }

    // Update burn DOT on enemies
    skill.burnedEnemies.forEach((burnData, enemy) => {
        if (now - burnData.lastTick >= 1000) {
            if (!enemy.el.parentNode) {
                // Enemy dead, remove from map
                skill.burnedEnemies.delete(enemy);
                return;
            }

            damageEnemy(enemy, skill.burnDOT);
            burnData.lastTick = now;
            burnData.duration -= 1000;

            // Show burn effect
            const screenX = enemy.worldX - game.camera.x;
            const screenY = enemy.worldY - game.camera.y;
            createParticles(screenX, screenY, 2, 'fire', {
                speed: 0.5,
                lifetime: 500,
                size: 4,
                color: '#ff3300'
            });

            if (burnData.duration <= 0) {
                skill.burnedEnemies.delete(enemy);
            }
        }
    });
}

function dealFireAuraDamage(level) {
    const skill = game.passiveSkills.fireAura;
    const playerWorldX = game.camera.x + 800;
    const playerWorldY = game.camera.y + 500;

    game.entities.enemies.forEach(enemy => {
        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - playerWorldX, enemyY - playerWorldY);

        if (dist <= skill.radius) {
            damageEnemy(enemy, skill.damage);

            // Apply burn DOT
            if (!skill.burnedEnemies.has(enemy)) {
                skill.burnedEnemies.set(enemy, {
                    lastTick: Date.now(),
                    duration: skill.burnDuration
                });
            } else {
                // Refresh burn duration
                const burnData = skill.burnedEnemies.get(enemy);
                burnData.duration = skill.burnDuration;
            }

            // Level 5: Burn spreads to nearby enemies
            if (level >= 5 && Math.random() < 0.1) {
                spreadBurn(enemy, playerWorldX, playerWorldY);
            }
        }
    });
}

function spreadBurn(sourceEnemy, playerX, playerY) {
    const skill = game.passiveSkills.fireAura;
    const sourceX = sourceEnemy.worldX + sourceEnemy.w / 2;
    const sourceY = sourceEnemy.worldY + sourceEnemy.h / 2;

    game.entities.enemies.forEach(enemy => {
        if (enemy === sourceEnemy) return;
        if (skill.burnedEnemies.has(enemy)) return;

        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - sourceX, enemyY - sourceY);

        if (dist < 100) {
            skill.burnedEnemies.set(enemy, {
                lastTick: Date.now(),
                duration: skill.burnDuration
            });
        }
    });
}

// ===== ICE NOVA ❄️ =====
function updateIceNova() {
    const skill = game.passiveSkills.iceNova;
    const skillLevel = game.skills.ICE_NOVA.level;
    const now = Date.now();

    // Periodic cast
    if (now - skill.lastCast >= skill.cooldown) {
        castIceNova(skillLevel);
        skill.lastCast = now;
    }
}

function castIceNova(level) {
    const skill = game.passiveSkills.iceNova;
    const playerScreenX = 800;
    const playerScreenY = 500;
    const playerWorldX = game.camera.x + playerScreenX;
    const playerWorldY = game.camera.y + playerScreenY;

    // Create expanding frost wave
    const wave = document.createElement('div');
    wave.style.position = 'absolute';
    wave.style.left = playerScreenX + 'px';
    wave.style.top = playerScreenY + 'px';
    wave.style.width = skill.radius * 2 + 'px';
    wave.style.height = skill.radius * 2 + 'px';
    wave.style.borderRadius = '50%';
    wave.style.border = '3px solid #00ffff';
    wave.style.background = 'radial-gradient(circle, rgba(0,255,255,0.3), transparent 70%)';
    wave.style.transform = 'translate(-50%, -50%) scale(0)';
    wave.style.pointerEvents = 'none';
    wave.style.zIndex = '95';
    wave.style.boxShadow = '0 0 20px #00ffff, inset 0 0 20px #00ffff';
    game.canvas.appendChild(wave);

    // Animate expansion
    let currentRadius = 0;
    const expandDuration = 800; // ms
    const startTime = Date.now();

    const expandInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / expandDuration, 1);

        currentRadius = skill.radius + (skill.maxRadius - skill.radius) * progress;
        const scale = currentRadius / skill.radius;

        wave.style.transform = `translate(-50%, -50%) scale(${scale})`;
        wave.style.opacity = 1 - progress * 0.5;

        // Deal damage and slow enemies in wave
        game.entities.enemies.forEach(enemy => {
            const enemyX = enemy.worldX + enemy.w / 2;
            const enemyY = enemy.worldY + enemy.h / 2;
            const dist = Math.hypot(enemyX - playerWorldX, enemyY - playerWorldY);

            if (dist <= currentRadius && dist > currentRadius - 30) {
                damageEnemy(enemy, skill.damage);

                // Apply slow/freeze
                const freezeDuration = level >= 5 ? 500 : 0;
                const slowDuration = skill.slowDuration;

                if (freezeDuration > 0) {
                    enemy.frozen = true;
                    setTimeout(() => { enemy.frozen = false; }, freezeDuration);
                }

                // Slow effect
                const originalSpeed = enemy.speed;
                enemy.speed *= (1 - skill.slow);
                setTimeout(() => {
                    if (!enemy.frozen) enemy.speed = originalSpeed;
                }, slowDuration);

                // Ice particles
                const screenX = enemy.worldX - game.camera.x;
                const screenY = enemy.worldY - game.camera.y;
                createParticles(screenX, screenY, 5, 'ice', {
                    speed: 2,
                    lifetime: 600,
                    size: 5,
                    color: '#00ffff'
                });
            }
        });

        if (progress >= 1) {
            clearInterval(expandInterval);
            setTimeout(() => {
                if (wave.parentNode) game.canvas.removeChild(wave);
            }, 200);
        }
    }, 16);
}

// ===== POISON CLOUD ☠️ =====
function updatePoisonCloud() {
    const skill = game.passiveSkills.poisonCloud;
    const skillLevel = game.skills.POISON_CLOUD.level;
    const playerWorldX = game.camera.x + 800;
    const playerWorldY = game.camera.y + 500;

    // Generate poison fog particles
    if (Math.random() < 0.2) {
        const playerScreenX = 800;
        const playerScreenY = 500;

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * skill.radius;
        const x = playerScreenX + Math.cos(angle) * dist;
        const y = playerScreenY + Math.sin(angle) * dist;

        createParticles(x, y, 1, 'poison', {
            speed: 0.3,
            lifetime: 2000,
            size: 12,
            color: '#00ff00',
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5
        });
    }

    const now = Date.now();

    // Apply poison DOT to enemies in cloud
    game.entities.enemies.forEach(enemy => {
        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - playerWorldX, enemyY - playerWorldY);

        if (dist <= skill.radius) {
            if (!skill.poisonedEnemies.has(enemy)) {
                skill.poisonedEnemies.set(enemy, {
                    stacks: 1,
                    lastTick: now,
                    leftCloud: 0
                });
            } else {
                const poisonData = skill.poisonedEnemies.get(enemy);
                // Increase stacks up to 3
                if (skillLevel >= 9 && poisonData.stacks < 3) {
                    poisonData.stacks++;
                }
                poisonData.leftCloud = 0; // Still in cloud
            }
        } else {
            // Enemy left cloud
            if (skill.poisonedEnemies.has(enemy)) {
                const poisonData = skill.poisonedEnemies.get(enemy);
                if (poisonData.leftCloud === 0) {
                    poisonData.leftCloud = now;
                }
            }
        }
    });

    // Deal poison damage over time
    skill.poisonedEnemies.forEach((poisonData, enemy) => {
        if (!enemy.el.parentNode) {
            skill.poisonedEnemies.delete(enemy);
            return;
        }

        if (now - poisonData.lastTick >= 1000) {
            const totalDOT = skill.dot * (skillLevel >= 9 ? poisonData.stacks : 1);
            damageEnemy(enemy, totalDOT);
            poisonData.lastTick = now;

            // Poison particles
            const screenX = enemy.worldX - game.camera.x;
            const screenY = enemy.worldY - game.camera.y;
            createParticles(screenX, screenY, 2, 'poison', {
                speed: 1,
                lifetime: 400,
                size: 6,
                color: '#00ff00'
            });
        }

        // Remove poison after linger duration
        if (poisonData.leftCloud > 0 && now - poisonData.leftCloud >= skill.lingerDuration) {
            skill.poisonedEnemies.delete(enemy);
        }
    });
}

// ===== HOLY WATER 🌟 =====
function updateHolyWater() {
    const skill = game.passiveSkills.holyWater;
    const skillLevel = game.skills.HOLY_WATER.level;
    const now = Date.now();

    // Drop puddles periodically
    if (now - skill.lastDrop >= skill.dropInterval) {
        dropHolyWaterPuddles(skillLevel);
        skill.lastDrop = now;
    }

    // Update existing puddles
    skill.puddles = skill.puddles.filter(puddle => {
        if (now - puddle.created >= skill.puddleDuration) {
            // Evolution: Explode on expiry
            if (skillLevel >= 9) {
                puddleExplosion(puddle);
            }
            if (puddle.el.parentNode) game.canvas.removeChild(puddle.el);
            return false;
        }

        // Deal damage to enemies in puddle
        if (now - puddle.lastTick >= skill.tickRate) {
            dealPuddleDamage(puddle, skillLevel);
            puddle.lastTick = now;
        }

        // Update puddle position (follows world coords)
        puddle.el.style.left = (puddle.worldX - game.camera.x) + 'px';
        puddle.el.style.top = (puddle.worldY - game.camera.y) + 'px';

        return true;
    });
}

function dropHolyWaterPuddles(level) {
    const skill = game.passiveSkills.holyWater;
    const playerWorldX = game.camera.x + 800;
    const playerWorldY = game.camera.y + 500;

    for (let i = 0; i < skill.puddleCount; i++) {
        // Random position near player
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 80;
        const worldX = playerWorldX + Math.cos(angle) * dist;
        const worldY = playerWorldY + Math.sin(angle) * dist;

        // Create puddle element
        const puddle = document.createElement('div');
        puddle.style.position = 'absolute';
        puddle.style.width = skill.puddleSize * 2 + 'px';
        puddle.style.height = skill.puddleSize * 2 + 'px';
        puddle.style.borderRadius = '50%';
        puddle.style.background = 'radial-gradient(circle, rgba(255,215,0,0.6), rgba(255,215,0,0.1))';
        puddle.style.boxShadow = '0 0 15px #ffd700, inset 0 0 10px #ffd700';
        puddle.style.transform = 'translate(-50%, -50%)';
        puddle.style.pointerEvents = 'none';
        puddle.style.zIndex = '80';
        puddle.style.animation = 'pulse 2s infinite';

        puddle.style.left = (worldX - game.camera.x) + 'px';
        puddle.style.top = (worldY - game.camera.y) + 'px';

        game.canvas.appendChild(puddle);

        skill.puddles.push({
            el: puddle,
            worldX: worldX,
            worldY: worldY,
            created: Date.now(),
            lastTick: Date.now()
        });
    }
}

function dealPuddleDamage(puddle, level) {
    const skill = game.passiveSkills.holyWater;

    game.entities.enemies.forEach(enemy => {
        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - puddle.worldX, enemyY - puddle.worldY);

        if (dist <= skill.puddleSize) {
            damageEnemy(enemy, skill.damage);

            // Slow effect at level 5+
            if (level >= 5 && !enemy.slowed) {
                const originalSpeed = enemy.speed;
                enemy.speed *= 0.7;
                enemy.slowed = true;
                setTimeout(() => {
                    enemy.speed = originalSpeed;
                    enemy.slowed = false;
                }, 1000);
            }

            // Sparkle effect
            const screenX = puddle.worldX - game.camera.x;
            const screenY = puddle.worldY - game.camera.y;
            if (Math.random() < 0.3) {
                createParticles(screenX, screenY, 3, 'holy', {
                    speed: 1.5,
                    lifetime: 500,
                    size: 4,
                    color: '#ffd700'
                });
            }
        }
    });
}

function puddleExplosion(puddle) {
    const skill = game.passiveSkills.holyWater;
    const explosionRadius = skill.puddleSize * 2;

    // Visual explosion
    const screenX = puddle.worldX - game.camera.x;
    const screenY = puddle.worldY - game.camera.y;
    createExplosion(screenX, screenY, '#ffd700');
    createParticles(screenX, screenY, 20, 'holy', {
        speed: 5,
        lifetime: 800,
        size: 6,
        color: '#ffd700'
    });

    // Damage enemies
    game.entities.enemies.forEach(enemy => {
        const enemyX = enemy.worldX + enemy.w / 2;
        const enemyY = enemy.worldY + enemy.h / 2;
        const dist = Math.hypot(enemyX - puddle.worldX, enemyY - puddle.worldY);

        if (dist <= explosionRadius) {
            damageEnemy(enemy, skill.damage * 3);
        }
    });
}



// Cleanup function when skills are deactivated or game ends
function cleanupPassiveSkills() {
    // Remove lightning rings
    game.passiveSkills.lightningRing.rings.forEach(ring => {
        if (ring.el.parentNode) game.canvas.removeChild(ring.el);
    });
    game.passiveSkills.lightningRing.rings = [];

    // Remove blades
    game.passiveSkills.bladeOrbit.blades.forEach(blade => {
        if (blade.el.parentNode) game.canvas.removeChild(blade.el);
    });
    game.passiveSkills.bladeOrbit.blades = [];
}



