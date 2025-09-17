// /src/enemies.js
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Enemy {
  constructor(type, opts) {
    this.type = type;
    this.scene = opts.scene;
    this.target = opts.target;   // THREE.Vector3 (Turret-Zentrum, XZ)
    this.hitFx = opts.hitFx || null;
    this.explosions = opts.explosions || null;
    this.environment = opts.environment || null;
    this.onDeath = opts.onDeath || (()=>{});

    this.health = opts.health ?? 40;
    this.speed  = opts.speed ?? 3.0;
    this.reward = opts.reward ?? 10;
    this.radius = opts.hitRadius ?? 0.4; // unsichtbare Trefferkugel
    this.ground = (opts.ground ?? true);
    this.attackRadius = opts.attackRadius ?? 3.0;

    this.group = new THREE.Group();
    this.group.position.copy(opts.spawnPos || new THREE.Vector3());

    // Sichtbarkeit/Skalierung
    const s = opts.scale ?? 1.0;
    this.group.scale.setScalar(s);

    // Körper - verschiedene Typen
    let body, eye, bodyColor, eyeColor, emissiveColor;
    
    switch(this.type) {
      case 'fast':
        // Schlanker, schneller Gegner
        body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.22, 0.45, 6, 12),
          new THREE.MeshStandardMaterial({ color: 0x2f6f2f, metalness: 0.2, roughness: 0.6 })
        );
        bodyColor = 0x2f6f2f;
        eyeColor = 0x66ff66;
        emissiveColor = 0x004000;
        break;
        
      case 'heavy':
        // Massiver, schwerer Gegner
        body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.4, 0.5, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0x6f2f6f, metalness: 0.3, roughness: 0.8 })
        );
        bodyColor = 0x6f2f6f;
        eyeColor = 0xff66ff;
        emissiveColor = 0x400040;
        break;
        
      default: // grunt
        body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.28, 0.35, 6, 12),
          new THREE.MeshStandardMaterial({ color: 0x6f2f2f, metalness: 0.1, roughness: 0.7 })
        );
        bodyColor = 0x6f2f2f;
        eyeColor = 0xff6666;
        emissiveColor = 0x400000;
        break;
    }
    
    body.position.y = this.ground ? (this.type === 'heavy' ? 0.32 : 0.28) : 0.0;

    eye = new THREE.Mesh(
      new THREE.SphereGeometry(this.type === 'heavy' ? 0.12 : 0.08, 12, 8),
      new THREE.MeshStandardMaterial({ color: eyeColor, emissive: emissiveColor })
    );
    eye.position.set(0, body.position.y + (this.type === 'heavy' ? 0.22 : 0.18), this.type === 'heavy' ? 0.25 : 0.18);

    // Unsichtbare Trefferkugel (für Raycast/Schaden)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    if (this.ground) hit.position.y = this.radius;

    // Head hit zone (invisible sphere), tagged as 'head'
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(this.radius*0.45, 0.12), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    head.position.set(0, body.position.y + 0.36, 0.08);

    // Tag zones
    body.userData.zone = 'core';
    hit.userData.zone = 'core';
    head.userData.zone = 'head';

    this.group.add(body, eye, hit, head);

    this.dead = false;
    this.reached = false;
    
    // Animation-Daten
    this.animTime = 0;
    this.baseY = this.group.position.y;
    this.bodyMesh = body;
    this.eyeMesh = eye;
    this.blinkTime = 0;
    
    // Pathfinding-Daten
    this.avoidanceDirection = null;
    this.avoidanceTimer = 0;
    this.lastPosition = this.group.position.clone();

    // Raycast-Tag für die Waffe
    this.group.traverse(o => { o.userData.enemy = this; });

    this.scene.add(this.group);
  }

  takeDamage(amount = 0, zone = 'core') {
    if (this.dead) return;
    const mul = (CONFIG?.zones?.[zone]?.damageMul ?? 1.0);
    this.lastHitZone = zone;
    this.health -= amount * mul;
    if (this.health <= 0) {
      this.dead = true;
      const p = this.group.getWorldPosition(new THREE.Vector3());
      
      // Erweiterte Death-Effekte
      if (this.hitFx) {
        // Mehr intensive Funken beim Tod
        const n = new THREE.Vector3(0, 1, 0);
        this.hitFx.spawnAt(p, n, 2.0); // Höhere Intensität
      }
      
      // Explosion beim Tod (wenn explosions system verfügbar)
      if (this.explosions) {
        this.explosions.createExplosion(p, 0.8, 0xff4444);
      }
      
      this.scene.remove(this.group);
      this.onDeath({ enemy: this, reward: this.reward, zone: (this.lastHitZone||'core') });
    }
  }

  update(dt) {
    if (this.dead) return;

    this.animTime += dt;

    // Zielpunkt (XZ) ist Turret-Zentrum, Y am Boden (oder gleichbleibend wenn fliegend)
    const goal = new THREE.Vector3(this.target.x, this.ground ? 0 : this.group.position.y, this.target.z);

    let moveDirection = this._calculateMovementDirection(goal, dt);
    const isMoving = moveDirection.lengthSq() > 0;
    
    if (isMoving) {
      this.group.position.addScaledVector(moveDirection, this.speed * dt);
      
      // Animationen basierend auf Bewegung und Typ
      this._updateMovementAnimation(dt);
      
      // Blickrichtung
      const yaw = Math.atan2(moveDirection.x, -moveDirection.z);
      this.group.rotation.set(0, yaw, 0);
    }
    
    // Augenblinken-Animation
    this._updateEyeAnimation(dt);
  }

  _calculateMovementDirection(goal, dt) {
    const currentPos = this.group.position;
    const toGoal = goal.clone().sub(currentPos);
    if (this.ground) toGoal.y = 0;

    if (toGoal.lengthSq() < 1e-9) return new THREE.Vector3();

    let direction = toGoal.normalize();

    // Obstacle avoidance (wenn Environment vorhanden)
    if (this.environment) {
      direction = this._applyObstacleAvoidance(direction, currentPos, dt);
    }

    return direction;
  }

  _applyObstacleAvoidance(desiredDirection, currentPos, dt) {
    const obstacles = this.environment.getObstacles();
    const lookAheadDistance = 5.0; // Wie weit vorausschauen
    const avoidanceStrength = 2.0; // Stärke der Ausweichbewegung

    // Verringere Avoidance-Timer
    if (this.avoidanceTimer > 0) {
      this.avoidanceTimer -= dt;
    }

    // Prüfe Kollision in Bewegungsrichtung
    const futurePos = currentPos.clone().addScaledVector(desiredDirection, lookAheadDistance);
    
    for (const obstacle of obstacles) {
      const distToObstacle = futurePos.distanceTo(obstacle.position);
      const safeDistance = obstacle.radius + this.radius + 2.0; // Sicherheitsabstand

      if (distToObstacle < safeDistance) {
        // Berechne Ausweichrichtung
        const avoidDirection = currentPos.clone().sub(obstacle.position).normalize();
        
        // Perpendicular zur Hindernis-Richtung für Umgehung
        const perpendicular = new THREE.Vector3(-avoidDirection.z, 0, avoidDirection.x);
        
        // Wähle die Seite, die näher zum Ziel führt
        const rightSide = avoidDirection.clone().add(perpendicular).normalize();
        const leftSide = avoidDirection.clone().sub(perpendicular).normalize();
        
        const toTarget = this.target.clone().sub(currentPos).normalize();
        const useRight = rightSide.dot(toTarget) > leftSide.dot(toTarget);
        
        this.avoidanceDirection = useRight ? rightSide : leftSide;
        this.avoidanceTimer = 1.0; // 1 Sekunde ausweichen
        
        break;
      }
    }

    // Wende Ausweichrichtung an
    if (this.avoidanceTimer > 0 && this.avoidanceDirection) {
      // Mische gewünschte Richtung mit Ausweichrichtung
      const avoidWeight = this.avoidanceTimer; // Stärker am Anfang
      return desiredDirection.clone()
        .multiplyScalar(1 - avoidWeight)
        .add(this.avoidanceDirection.clone().multiplyScalar(avoidWeight * avoidanceStrength))
        .normalize();
    }

    return desiredDirection;
  }

  _updateMovementAnimation(dt) {
    // Hüpf-Animation beim Laufen
    const bobSpeed = this.type === 'fast' ? 8.0 : (this.type === 'heavy' ? 3.0 : 5.0);
    const bobHeight = this.type === 'fast' ? 0.08 : (this.type === 'heavy' ? 0.03 : 0.05);
    
    const bobOffset = Math.sin(this.animTime * bobSpeed) * bobHeight;
    this.group.position.y = this.baseY + Math.abs(bobOffset);
    
    // Körper-Rotation (leichtes Wippen)
    if (this.bodyMesh) {
      const wiggle = Math.sin(this.animTime * bobSpeed * 0.5) * 0.05;
      this.bodyMesh.rotation.z = wiggle;
    }
  }

  _updateEyeAnimation(dt) {
    // Augenblinken (gelegentlich)
    if (Math.random() < 0.005) { // 0.5% Chance pro Frame
      this._startBlink();
    }
    
    if (this.blinkTime > 0) {
      this.blinkTime -= dt;
      const blinkProgress = 1 - (this.blinkTime / 0.15);
      if (this.eyeMesh) {
        // Augen verkleinern beim Blinzeln
        const scale = blinkProgress < 0.5 ? 
          1 - (blinkProgress * 2) * 0.8 : 
          0.2 + ((blinkProgress - 0.5) * 2) * 0.8;
        this.eyeMesh.scale.y = scale;
      }
    } else if (this.eyeMesh) {
      this.eyeMesh.scale.y = 1;
    }
  }

  _startBlink() {
    this.blinkTime = 0.15; // Blinzel-Dauer
  }

  dispose() {
    this.scene.remove(this.group);
    this.dead = true;
  }
}

export class EnemyManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} turret - Turret-Objekt (liest root.position)
   * @param {object} cfg - CONFIG.enemies
   * @param {HitSparks} hitFx
   * @param {function} onScore - ({type:'kill'|'wave', reward?, wave?, alive?})
   * @param {function} onBaseHit - ({pos})
   * @param {ExplosionEffects} explosions
   * @param {SpawnEffects} spawns
   * @param {EnvironmentManager} environment
   */
  constructor(scene, turret, cfg, hitFx, onScore, onBaseHit, explosions = null, spawns = null, environment = null) {
    this.scene = scene;
    this.turret = turret;
    this.cfg = cfg;
    this.hitFx = hitFx || null;
    this.explosions = explosions || null;
    this.spawns = spawns || null;
    this.environment = environment || null;
    this.onScore = onScore || (()=>{});
    this.onBaseHit = onBaseHit || (()=>{});

    this.center = new THREE.Vector3(); // Turret-Zentrum (XZ)
    this.enemies = [];
    this.wave = 0;
    this.alive = 0;

    this._spawnQueue = 0;
    this._spawnTimer = 0;
    this._wavePause = 0;

    this.enabled = true;

    this._scheduleNextWave();
  }

  _scheduleNextWave() {
    this.wave += 1;
    const count = Math.round(
      (this.wave === 1 ? this.cfg.firstWaveCount : this.cfg.firstWaveCount * Math.pow(this.cfg.waveGrowth, this.wave-1))
    );
    this._spawnQueue = count;
    this._spawnTimer = 0;
    this._wavePause = 0;
    this.onScore({ type: 'wave', wave: this.wave, toSpawn: count });
  }

  _selectEnemyType() {
    // Gewichtete Zufallsauswahl der Gegnertypen
    const types = ['grunt', 'fast', 'heavy'];
    const weights = types.map(type => this.cfg[type]?.spawnWeight || 0);
    
    // Ab Wave 3 mehr variety, ab Wave 5 auch Heavy enemies häufiger
    if (this.wave >= 3) {
      weights[1] *= 1.5; // Mehr fast enemies
    }
    if (this.wave >= 5) {
      weights[2] *= 2.0; // Mehr heavy enemies
    }
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return types[i];
      }
    }
    
    return 'grunt'; // Fallback
  }

  _spawnOne() {
    // Gegnertyp zufällig auswählen basierend auf Gewichtungen
    const enemyType = this._selectEnemyType();
    const enemyData = this.cfg[enemyType];

    // Freie Spawn-Position finden (berücksichtigt Bäume)
    let spawnPos;
    if (this.environment) {
      // Environment-Manager findet freie Position
      spawnPos = this.environment.findFreeSpawnPosition(
        this.center, 
        this.cfg.spawnRadius - 10, 
        this.cfg.spawnRadius + 20
      );
    } else {
      // Fallback: alte Methode
      const r = this.cfg.spawnRadius + (Math.random()*10 - 5);
      const a = Math.random()*Math.PI*2;
      const sx = this.center.x + Math.sin(a) * r;
      const sz = this.center.z + Math.cos(a) * r;
      spawnPos = new THREE.Vector3(sx, 0, sz);
    }

    // Spawn-Effekt erstellen bevor der Gegner erscheint
    if (this.spawns) {
      this.spawns.createSpawnEffect(spawnPos, enemyType);
    }

    const enemy = new Enemy(enemyType, {
      scene: this.scene,
      target: this.center,
      hitFx: this.hitFx,
      explosions: this.explosions,
      environment: this.environment,
      spawnPos: spawnPos,
      ground: true,
      health: enemyData.health,
      speed:  enemyData.speed,
      reward: enemyData.reward,
      attackRadius: this.cfg.attackRadius,
      scale: enemyData.scale,
      hitRadius: enemyData.hitRadius
    });

    enemy.onDeath = ({ reward, zone }) => {
      this.alive = Math.max(0, this.alive - 1);
      this.onScore({ type: 'kill', reward, zone, wave: this.wave, alive: this.alive });
    };

    this.enemies.push(enemy);
    this.alive += 1;
  }

  clearAll() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.alive = 0;
    this._spawnQueue = 0;
    this._spawnTimer = 0;
  }

  update(dt) {
    if (!this.enabled) return;

    // Turret-Zentrum (Boden) lesen
    this.center.copy(this.turret.root.position);

    // Spawns abwickeln
    if (this._spawnQueue > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnOne();
        this._spawnQueue -= 1;
        this._spawnTimer = this.cfg.spawnInterval;
      }
    } else {
      // Wellen-Pause, wenn alles tot
      if (this.alive === 0) {
        this._wavePause += dt;
        if (this._wavePause >= this.cfg.wavePause) this._scheduleNextWave();
      }
    }

    // Gegner updaten + „Ankunft“-Erkennung ROBUST im Manager
    const reachR = this.cfg.attackRadius;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i,1); continue; }

      // Distanz im XZ zur Basis
      const gp = e.group.position;
      const dx = gp.x - this.center.x;
      const dz = gp.z - this.center.z;
      const distXZ = Math.hypot(dx, dz);

      // Treffer-Bonus: berücksichtige (halbe) Gegner-Hitkugel für „Kontakt“
      const reachWithRadius = reachR + (e.radius || 0) * 0.5;

      if (distXZ <= reachWithRadius) {
        // Basistreffer → visuelle FX + Callback + Entfernen
        const hitPos = e.group.getWorldPosition(new THREE.Vector3());

        // etwas Funken
        if (this.hitFx) {
          for (let k=0;k<10;k++) {
            const n = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1)).normalize();
            this.hitFx.spawnAt(hitPos.clone().addScaledVector(n, 0.06), n);
          }
        }

        try { this.onBaseHit({ pos: hitPos }); } catch(_) {}

        e.dispose();
        this.enemies.splice(i,1);
        this.alive = Math.max(0, this.alive - 1);
        continue;
      }

      // „normal“ updaten (Laufen/Orientierung)
      e.update(dt);
      if (e.dead) this.enemies.splice(i,1);
    }
  }
}
