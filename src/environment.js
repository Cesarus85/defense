// /src/environment.js
// Umgebungselemente: Bäume, Hindernisse, etc.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TREE_BASE_SCALE = 11;

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.trees = [];
    this.obstacles = []; // Kollisionsobjekte für Pathfinding
  }

  async loadEnvironment(turretPosition) {
    // Verschiedene mögliche Pfade probieren
    const possiblePaths = [
      'assets/graphics/',
      './assets/graphics/',
      '../assets/graphics/',
      '/assets/graphics/',
      ''
    ];
    
    let tree1 = null, tree2 = null;
    
    for (const basePath of possiblePaths) {
      try {
        console.log(`Trying to load trees from: ${basePath}`);
        tree1 = await this.loadModel(`${basePath}nadelbaum1.glb`);
        tree2 = await this.loadModel(`${basePath}nadelbaum2.glb`);
        console.log(`Successfully loaded trees from: ${basePath}`);
        break;
      } catch (error) {
        console.log(`Failed to load from ${basePath}:`, error.message);
        continue;
      }
    }
    
    if (tree1 && tree2) {
      // Bäume strategisch platzieren
      this.placeTrees(tree1, tree2, turretPosition);
      console.log(`Environment loaded: ${this.trees.length} trees placed`);
    } else {
      console.warn('Could not find tree models, using fallback trees');
      // Fallback: einfache Geometrie-Bäume
      this.createFallbackTrees(turretPosition);
    }

    // Zusätzliche Umgebungselemente hinzufügen
    this.addEnvironmentVariety(turretPosition);
  }

  loadModel(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => resolve(gltf),
        (progress) => console.log(`Loading ${path}: ${(progress.loaded / progress.total * 100)}%`),
        (error) => reject(error)
      );
    });
  }

  placeTrees(tree1Model, tree2Model, turretPos) {
    // Basisskalierung, um die Modellgröße in etwa Meterhöhe umzusetzen
    const configs = [
      // Ring 1: Mittlere Entfernung (40-60m vom Turret)
      { distance: 45, angle: 30, model: tree1Model, scale: 1.2 },
      { distance: 52, angle: 75, model: tree2Model, scale: 1.0 },
      { distance: 48, angle: 120, model: tree1Model, scale: 1.1 },
      { distance: 55, angle: 180, model: tree2Model, scale: 1.3 },
      { distance: 50, angle: 225, model: tree1Model, scale: 0.9 },
      { distance: 58, angle: 285, model: tree2Model, scale: 1.1 },
      { distance: 46, angle: 330, model: tree1Model, scale: 1.2 },
      
      // Ring 2: Weitere Entfernung (70-90m vom Turret)
      { distance: 75, angle: 15, model: tree2Model, scale: 1.4 },
      { distance: 82, angle: 60, model: tree1Model, scale: 1.0 },
      { distance: 78, angle: 105, model: tree2Model, scale: 1.2 },
      { distance: 85, angle: 150, model: tree1Model, scale: 1.1 },
      { distance: 80, angle: 200, model: tree2Model, scale: 1.3 },
      { distance: 77, angle: 240, model: tree1Model, scale: 0.8 },
      { distance: 88, angle: 300, model: tree2Model, scale: 1.2 },
      { distance: 83, angle: 345, model: tree1Model, scale: 1.0 },
      
      // Ring 3: Weit entfernt (100-120m vom Turret)
      { distance: 105, angle: 45, model: tree1Model, scale: 1.5 },
      { distance: 112, angle: 90, model: tree2Model, scale: 1.1 },
      { distance: 108, angle: 135, model: tree1Model, scale: 1.3 },
      { distance: 115, angle: 210, model: tree2Model, scale: 1.4 },
      { distance: 110, angle: 270, model: tree1Model, scale: 1.2 },
      { distance: 118, angle: 315, model: tree2Model, scale: 1.0 }
    ];

    configs.forEach((config, index) => {
      this.placeTree(config, turretPos, index);
    });
  }

  placeTree(config, turretPos, index) {
    // Model klonen
    const tree = config.model.scene.clone();
    
    // Position berechnen (Polarkoordinaten)
    const angleRad = THREE.MathUtils.degToRad(config.angle);
    const x = turretPos.x + Math.cos(angleRad) * config.distance;
    const z = turretPos.z + Math.sin(angleRad) * config.distance;
    
    tree.position.set(x, 0, z);
    const treeScale = config.scale * TREE_BASE_SCALE;
    tree.scale.setScalar(treeScale);
    
    // Zufällige Y-Rotation für Variation
    tree.rotation.y = Math.random() * Math.PI * 2;
    
    // Schatten aktivieren
    tree.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Collision-Tag für Raycast
        node.userData.obstacle = true;
        node.userData.treeId = index;
      }
    });
    
    this.scene.add(tree);
    this.trees.push(tree);

    // Kollisionsobjekt für Pathfinding erstellen
    const obstacleRadius = treeScale * 0.2; // Baum-Kollisionsradius anhand des skalierten Modells
    this.obstacles.push({
      position: new THREE.Vector3(x, 0, z),
      radius: obstacleRadius,
      type: 'tree'
    });
  }

  addEnvironmentVariety(turretPosition) {
    // Felsen hinzufügen
    this.addRocks(turretPosition);

    // Kristalle hinzufügen
    this.addCrystals(turretPosition);

    // Metall-Strukturen hinzufügen
    this.addMetalStructures(turretPosition);

    // Nebel-Effekte hinzufügen
    this.addFogClouds(turretPosition);
  }

  addRocks(turretPos) {
    const rockConfigs = [
      { distance: 35, angle: 45, scale: 0.8 },
      { distance: 55, angle: 120, scale: 1.2 },
      { distance: 40, angle: 220, scale: 0.6 },
      { distance: 65, angle: 300, scale: 1.4 },
      { distance: 45, angle: 30, scale: 0.9 },
      { distance: 50, angle: 180, scale: 1.1 }
    ];

    rockConfigs.forEach(config => {
      const rock = this.createRock(config.scale);
      const angleRad = THREE.MathUtils.degToRad(config.angle);
      const x = turretPos.x + Math.cos(angleRad) * config.distance;
      const z = turretPos.z + Math.sin(angleRad) * config.distance;

      rock.position.set(x, 0, z);
      rock.rotation.y = Math.random() * Math.PI * 2;

      this.scene.add(rock);
      this.obstacles.push({
        position: rock.position.clone(),
        radius: config.scale * 3,
        type: 'rock'
      });
    });
  }

  createRock(scale) {
    const geometry = new THREE.SphereGeometry(2 * scale, 8, 6);
    geometry.scale(1, 0.6, 1.2); // Unregelmäßig formen

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a,
      roughness: 0.9,
      metalness: 0.1
    });

    const rock = new THREE.Mesh(geometry, material);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.userData.obstacle = true;

    return rock;
  }

  addCrystals(turretPos) {
    const crystalConfigs = [
      { distance: 70, angle: 80, scale: 1.0, color: 0x4488ff },
      { distance: 85, angle: 160, scale: 0.8, color: 0xff4488 },
      { distance: 75, angle: 250, scale: 1.2, color: 0x44ff88 },
      { distance: 90, angle: 10, scale: 0.9, color: 0xffaa44 }
    ];

    crystalConfigs.forEach(config => {
      const crystal = this.createCrystal(config.scale, config.color);
      const angleRad = THREE.MathUtils.degToRad(config.angle);
      const x = turretPos.x + Math.cos(angleRad) * config.distance;
      const z = turretPos.z + Math.sin(angleRad) * config.distance;

      crystal.position.set(x, 0, z);
      this.scene.add(crystal);
    });
  }

  createCrystal(scale, color) {
    const geometry = new THREE.ConeGeometry(1.5 * scale, 4 * scale, 6);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      metalness: 0.3
    });

    const crystal = new THREE.Mesh(geometry, material);
    crystal.position.y = 2 * scale;
    crystal.castShadow = true;
    crystal.userData.crystal = true;

    return crystal;
  }

  addMetalStructures(turretPos) {
    const structureConfigs = [
      { distance: 95, angle: 50, type: 'antenna' },
      { distance: 100, angle: 130, type: 'pipes' },
      { distance: 85, angle: 280, type: 'antenna' },
      { distance: 110, angle: 350, type: 'pipes' }
    ];

    structureConfigs.forEach(config => {
      let structure;
      if (config.type === 'antenna') {
        structure = this.createAntenna();
      } else {
        structure = this.createPipes();
      }

      const angleRad = THREE.MathUtils.degToRad(config.angle);
      const x = turretPos.x + Math.cos(angleRad) * config.distance;
      const z = turretPos.z + Math.sin(angleRad) * config.distance;

      structure.position.set(x, 0, z);
      structure.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(structure);
    });
  }

  createAntenna() {
    const group = new THREE.Group();

    // Basis
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 })
    );
    base.position.y = 1;

    // Antenne
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 })
    );
    antenna.position.y = 6;

    // Leuchtspitze
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0x440000,
        emissiveIntensity: 0.5
      })
    );
    tip.position.y = 10.2;

    group.add(base, antenna, tip);
    group.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    return group;
  }

  createPipes() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x555577,
      metalness: 0.7,
      roughness: 0.4
    });

    // Drei Rohre in verschiedenen Höhen
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 3 + i, 8),
        material
      );
      pipe.position.set(
        (i - 1) * 1.5,
        (3 + i) / 2,
        0
      );
      group.add(pipe);
    }

    group.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    return group;
  }

  addFogClouds(turretPos) {
    const cloudConfigs = [
      { distance: 120, angle: 20, scale: 8 },
      { distance: 130, angle: 100, scale: 6 },
      { distance: 125, angle: 200, scale: 10 },
      { distance: 135, angle: 320, scale: 7 }
    ];

    cloudConfigs.forEach(config => {
      const cloud = this.createFogCloud(config.scale);
      const angleRad = THREE.MathUtils.degToRad(config.angle);
      const x = turretPos.x + Math.cos(angleRad) * config.distance;
      const z = turretPos.z + Math.sin(angleRad) * config.distance;

      cloud.position.set(x, 3, z);
      this.scene.add(cloud);
    });
  }

  createFogCloud(scale) {
    const geometry = new THREE.SphereGeometry(scale, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0x667788,
      transparent: true,
      opacity: 0.3,
      fog: false
    });

    const cloud = new THREE.Mesh(geometry, material);
    cloud.userData.fog = true;

    return cloud;
  }

  createFallbackTrees(turretPos) {
    // Einfache Fallback-Bäume falls Modelle nicht laden
    console.log('Creating fallback trees...');
    
    const treePositions = [
      { distance: 25, angle: 30 },
      { distance: 28, angle: 120 },
      { distance: 22, angle: 210 },
      { distance: 35, angle: 60 },
      { distance: 32, angle: 150 },
      { distance: 30, angle: 240 },
      { distance: 38, angle: 330 }
    ];

    treePositions.forEach((pos, index) => {
      const angleRad = THREE.MathUtils.degToRad(pos.angle);
      const x = turretPos.x + Math.cos(angleRad) * pos.distance;
      const z = turretPos.z + Math.sin(angleRad) * pos.distance;
      
      // Extrem große Bäume - 100x größer als ursprünglich
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(50, 80, 400, 8),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
      );
      trunk.position.set(x, 200, z);
      trunk.castShadow = true;
      trunk.userData.obstacle = true;
      trunk.userData.treeId = index;
      
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(300, 600, 8),
        new THREE.MeshStandardMaterial({ color: 0x228B22 })
      );
      foliage.position.set(x, 600, z);
      foliage.castShadow = true;
      foliage.userData.obstacle = true;
      foliage.userData.treeId = index;
      
      this.scene.add(trunk);
      this.scene.add(foliage);
      this.trees.push(trunk, foliage);
      
      // Kollisionsobjekt - entsprechend größer
      this.obstacles.push({
        position: new THREE.Vector3(x, 0, z),
        radius: 300, // Entspricht der Kronengröße
        type: 'tree'
      });
    });
  }

  // Prüft ob eine Position mit Bäumen kollidiert
  checkCollision(position, radius = 1.0) {
    for (const obstacle of this.obstacles) {
      const distance = position.distanceTo(obstacle.position);
      if (distance < obstacle.radius + radius) {
        return true;
      }
    }
    return false;
  }

  // Findet freie Spawn-Positionen um Bäume herum
  findFreeSpawnPosition(center, minDistance, maxDistance, attempts = 20) {
    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * (maxDistance - minDistance);
      
      const position = new THREE.Vector3(
        center.x + Math.cos(angle) * distance,
        0,
        center.z + Math.sin(angle) * distance
      );
      
      // Prüfe Kollision mit Bäumen (mit etwas Puffer)
      if (!this.checkCollision(position, 3.0)) {
        return position;
      }
    }
    
    // Fallback: Position ohne Kollisionsprüfung
    const angle = Math.random() * Math.PI * 2;
    const distance = maxDistance * 0.8;
    return new THREE.Vector3(
      center.x + Math.cos(angle) * distance,
      0,
      center.z + Math.sin(angle) * distance
    );
  }

  getObstacles() {
    return this.obstacles;
  }
}