import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';
import webRTCManager from '../network/WebRTCManager.js';
import { generateWorkerTextures, destroyWorkerTextures } from '../utils/workerTexture.js';

const TILE = 16;
const MAP_COLS = 44;
const MAP_ROWS = 32;

const WALKABLE = 0;
const SOLID = 1;

const PROXIMITY_TILES = 1; // How close (in tiles) to trigger video/audio

export default class OfficeScene extends Phaser.Scene {
  constructor() {
    super('OfficeScene');
    this.players = new Map(); // id -> sprite
    this.localId = null;
    this.collisionMap = [];
    this.moveTimer = 0;
    this.cameraPeers = new Set(); // IDs of players with camera on
    this.micPeers = new Set(); // IDs of players with mic on
    this.currentNearbyId = null; // Currently displayed remote video peer
  }

  create() {
    this.localId = this.registry.get('myId');
    const initialPlayers = this.registry.get('players') || [];

    this.buildOffice();
    this.setupInput();
    this.createInfoPanel();
    this.setupCamera();

    // Create sprites for all initial players
    console.log(`[OfficeScene] localId=${this.localId}, initialPlayers=${initialPlayers.length}`);
    initialPlayers.forEach((p) => {
      console.log(`[OfficeScene] Adding initial player: ${p.name} (${p.id}) at (${p.x},${p.y}) color=`, p.color);
      this.addPlayer(p);
      if (p.cameraOn) this.cameraPeers.add(p.id);
      if (p.micOn) this.micPeers.add(p.id);
    });

    // Socket listeners
    socketManager.on('player:joined', (data) => {
      console.log(`[OfficeScene] player:joined ${data.name} (${data.id})`);
      this.addPlayer(data);
    });

    socketManager.on('player:moved', (data) => {
      this.moveRemotePlayer(data.id, data.x, data.y);
    });

    socketManager.on('player:left', (data) => {
      this.cameraPeers.delete(data.id);
      this.micPeers.delete(data.id);
      this.removePlayer(data.id);
      this.updateProximityVideo();
    });

    socketManager.on('camera:on', ({ id }) => {
      this.cameraPeers.add(id);
      this.updateProximityVideo();
    });

    socketManager.on('camera:off', ({ id }) => {
      this.cameraPeers.delete(id);
      this.updateProximityVideo();
    });

    socketManager.on('mic:on', ({ id }) => {
      this.micPeers.add(id);
      this.updateProximityVideo();
    });

    socketManager.on('mic:off', ({ id }) => {
      this.micPeers.delete(id);
      this.updateProximityVideo();
    });

    // Chat message listener
    socketManager.on('chat:message', (data) => {
      this.addChatToPanel(data);
      this.showSpeechBubble(data.id, data.message);
    });

    // Bug fix: request full sync after listeners are set up
    socketManager.on('game:sync', ({ players: syncPlayers }) => {
      console.log(`[OfficeScene] game:sync received, ${syncPlayers.length} players`);
      syncPlayers.forEach((p) => {
        if (p.id === this.localId) return;
        if (!this.players.has(p.id)) {
          console.log(`[OfficeScene] Sync adding missing player: ${p.name} (${p.id})`);
          this.addPlayer(p);
        }
        if (p.cameraOn) this.cameraPeers.add(p.id);
        if (p.micOn) this.micPeers.add(p.id);
      });
    });
    // Sync immediately and again after a short delay to catch late arrivals
    this._requestSync();
    this.time.delayedCall(1000, () => this._requestSync());
    this.time.delayedCall(3000, () => this._requestSync());

    // Chat setup
    this.setupChat();

    // Idle animation
    this.time.addEvent({
      delay: 500,
      callback: this.animateWorkers,
      callbackScope: this,
      loop: true,
    });

    // Proximity check every 300ms
    this.time.addEvent({
      delay: 300,
      callback: () => this.updateProximityVideo(),
      callbackScope: this,
      loop: true,
    });

    // Camera follows local player so they stay centered
    const localSprite = this.players.get(this.localId);
    if (localSprite) {
      this.cameras.main.startFollow(localSprite, true, 0.15, 0.15);
      this.cameras.main.setBounds(0, 0, MAP_COLS * TILE, MAP_ROWS * TILE);
    }
  }

  // --- Camera setup ---

  setupCamera() {
    const btn = document.getElementById('cam-toggle-btn');
    const micBtn = document.getElementById('mic-toggle-btn');
    const panel = document.getElementById('cam-panel');
    const localVideo = document.getElementById('cam-local');

    // Show the button now that we're in the game
    btn.classList.remove('cam-btn-hidden');

    btn.addEventListener('click', async () => {
      if (!webRTCManager.cameraOn) {
        try {
          const stream = await webRTCManager.startCamera();
          localVideo.srcObject = stream;
          btn.textContent = 'Close cam';
          btn.classList.add('cam-on');
          panel.classList.remove('cam-hidden');
          micBtn.classList.remove('mic-btn-hidden');

          // Connect to existing camera peers
          await webRTCManager.connectToExistingPeers(this.cameraPeers);
        } catch (err) {
          console.error('Camera error:', err);
        }
      } else {
        webRTCManager.stopCamera();
        localVideo.srcObject = null;
        btn.textContent = 'Open cam';
        btn.classList.remove('cam-on');
        panel.classList.add('cam-hidden');
        micBtn.classList.add('mic-btn-hidden');
        micBtn.classList.remove('mic-on');
        micBtn.textContent = 'Open mic';
        this._hideRemoteVideo();
      }
    });

    micBtn.addEventListener('click', () => {
      if (!webRTCManager.cameraOn) return;
      const isOn = webRTCManager.toggleMic();
      if (isOn) {
        micBtn.textContent = 'Close mic';
        micBtn.classList.add('mic-on');
      } else {
        micBtn.textContent = 'Open mic';
        micBtn.classList.remove('mic-on');
      }
    });
  }

  updateProximityVideo() {
    if (!webRTCManager.cameraOn) return;

    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;

    const lx = localSprite.getData('gridX');
    const ly = localSprite.getData('gridY');

    let closestId = null;
    let closestDist = Infinity;

    // Build set of nearby peers (within PROXIMITY_TILES)
    const nearbyPeers = new Set();

    for (const peerId of this.cameraPeers) {
      if (peerId === this.localId) continue;
      const sprite = this.players.get(peerId);
      if (!sprite) continue;

      const px = sprite.getData('gridX');
      const py = sprite.getData('gridY');
      const dist = Math.max(Math.abs(lx - px), Math.abs(ly - py)); // Chebyshev (includes diagonals)

      if (dist <= PROXIMITY_TILES) {
        nearbyPeers.add(peerId);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = peerId;
        }
      }
    }

    // Video: show closest peer's video
    if (closestId !== this.currentNearbyId) {
      this.currentNearbyId = closestId;
      if (closestId) {
        this._showRemoteVideo(closestId);
      } else {
        this._hideRemoteVideo();
      }
    } else if (closestId) {
      this._refreshRemoteVideo(closestId);
    }

    // Audio: unmute nearby peers with mic on, mute everyone else
    for (const [peerId] of webRTCManager.audioElements) {
      const isNearbyWithMic = nearbyPeers.has(peerId) && this.micPeers.has(peerId) && webRTCManager.micOn;
      webRTCManager.setRemoteAudioMuted(peerId, !isNearbyWithMic);
    }
  }

  _showRemoteVideo(peerId) {
    const remoteBox = document.getElementById('cam-remote-box');
    const remoteVideo = document.getElementById('cam-remote');
    const remoteLabel = document.getElementById('cam-remote-label');

    const stream = webRTCManager.getRemoteStream(peerId);
    if (stream && remoteVideo.srcObject !== stream) {
      remoteVideo.srcObject = stream;
    }

    const sprite = this.players.get(peerId);
    const name = sprite?.getData('workerData')?.name || 'Nearby';
    remoteLabel.textContent = name;
    remoteBox.classList.remove('cam-hidden');
  }

  _refreshRemoteVideo(peerId) {
    const remoteVideo = document.getElementById('cam-remote');
    const stream = webRTCManager.getRemoteStream(peerId);
    if (stream && remoteVideo.srcObject !== stream) {
      remoteVideo.srcObject = stream;
    }
  }

  _hideRemoteVideo() {
    const remoteBox = document.getElementById('cam-remote-box');
    const remoteVideo = document.getElementById('cam-remote');
    remoteBox.classList.add('cam-hidden');
    remoteVideo.srcObject = null;
    this.currentNearbyId = null;
  }

  _requestSync() {
    if (socketManager.socket) {
      socketManager.socket.emit('game:sync');
    }
  }

  _getOverlayContainer() {
    if (!this._overlayContainer) {
      const gameCanvas = document.querySelector('#game-container canvas');
      let container = document.getElementById('game-overlay');
      if (!container) {
        container = document.createElement('div');
        container.id = 'game-overlay';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
        gameCanvas.parentElement.style.position = 'relative';
        gameCanvas.parentElement.appendChild(container);
      }
      this._overlayContainer = container;
    }
    return this._overlayContainer;
  }

  _worldToScreen(worldX, worldY) {
    const cam = this.cameras.main;
    // Config zoom (canvas scale) is game.config.zoom, camera zoom is cam.zoom
    const configZoom = this.sys.game.config.zoom;
    const totalZoom = cam.zoom * configZoom;
    const sx = (worldX - cam.scrollX) * totalZoom;
    const sy = (worldY - cam.scrollY) * totalZoom;
    return { x: sx, y: sy };
  }

  _updateSpriteLabels(sprite) {
    // Position name right above the sprite's head
    const nameEl = sprite.getData('nameEl');
    const speechEl = sprite.getData('speechEl');
    const topOfSprite = this._worldToScreen(sprite.x, sprite.y - TILE / 2);

    if (nameEl) {
      nameEl.style.left = topOfSprite.x + 'px';
      nameEl.style.top = (topOfSprite.y - 2) + 'px';
    }
    // Speech bubble sits above the name
    if (speechEl) {
      const nameHeight = nameEl ? nameEl.offsetHeight : 0;
      speechEl.style.left = topOfSprite.x + 'px';
      speechEl.style.top = (topOfSprite.y - 2 - nameHeight - 2) + 'px';
    }
  }

  // --- Player management ---

  addPlayer(data) {
    if (this.players.has(data.id)) return;

    // Ensure textures exist (safety net — BootScene may not persist them)
    if (data.color) {
      generateWorkerTextures(this, data.id, data.color);
    }

    const texKey = `worker-${data.id}-0`;
    if (!this.textures.exists(texKey)) {
      console.warn(`[addPlayer] Missing texture for ${data.name} (${data.id})`);
      return;
    }

    const sprite = this.add.sprite(
      data.x * TILE + TILE / 2,
      data.y * TILE + TILE / 2,
      texKey
    );
    sprite.setData('workerData', {
      id: data.id,
      name: data.name,
      position: data.position,
      years: data.years,
      color: data.color,
    });
    sprite.setData('animFrame', 0);
    sprite.setData('gridX', data.x);
    sprite.setData('gridY', data.y);
    sprite.setDepth(data.y + 0.5);

    // Name label — DOM element for crisp text (bypasses Phaser pixel rendering)
    const container = this._getOverlayContainer();
    const nameEl = document.createElement('div');
    nameEl.textContent = data.name || '';
    nameEl.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:bold 11px Arial,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;pointer-events:none;';
    container.appendChild(nameEl);
    sprite.setData('nameEl', nameEl);

    const highlight = this.add.graphics();
    highlight.setVisible(false);
    highlight.setDepth(9999);
    sprite.setData('highlight', highlight);

    this.players.set(data.id, sprite);
  }

  removePlayer(id) {
    const sprite = this.players.get(id);
    if (!sprite) return;

    const highlight = sprite.getData('highlight');
    if (highlight) highlight.destroy();
    const nameEl = sprite.getData('nameEl');
    if (nameEl) nameEl.remove();
    this._removeSpeechBubble(id);

    if (this.selectedWorker === sprite) {
      this.deselectWorker();
    }

    sprite.destroy();
    this.players.delete(id);
    destroyWorkerTextures(this, id);
  }

  moveRemotePlayer(id, x, y) {
    const sprite = this.players.get(id);
    if (!sprite) return;

    // Flip sprite based on horizontal movement
    const prevX = sprite.getData('gridX');
    if (x > prevX) sprite.flipX = false;
    else if (x < prevX) sprite.flipX = true;

    sprite.setData('gridX', x);
    sprite.setData('gridY', y);
    sprite.x = x * TILE + TILE / 2;
    sprite.y = y * TILE + TILE / 2;
    sprite.setDepth(y + 0.5);

    this._updateSpriteLabels(sprite);

    const frame = sprite.getData('animFrame');
    const nextFrame = frame === 0 ? 2 : frame === 2 ? 1 : frame === 1 ? 3 : 0;
    sprite.setData('animFrame', nextFrame);
    sprite.setTexture(`worker-${id}-${nextFrame}`);

    if (this.selectedWorker === sprite) {
      this.updateHighlight(sprite);
    }
  }

  // --- Office building (unchanged) ---

  buildOffice() {
    this.collisionMap = Array.from({ length: MAP_ROWS }, () =>
      Array(MAP_COLS).fill(WALKABLE)
    );

    // --- Office area (rows 0-15) ---
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        let tileKey = null;
        let isSolid = false;

        if (row === 0) {
          // Bathroom doors in top wall
          if ((col === 14 || col === 15)) {
            tileKey = 'door-women';
            isSolid = false; // walkable door
          } else if ((col === 18 || col === 19)) {
            tileKey = 'door-men';
            isSolid = false; // walkable door
          } else {
            tileKey = col >= 28 ? 'hedge' : 'wall-dark-top';
            isSolid = true;
          }
        } else if (row === 15) {
          tileKey = col >= 28 ? 'hedge' : 'wall-dark';
          isSolid = true;
        } else if (col === 0) {
          tileKey = 'wall-dark';
          isSolid = true;
        } else if (col === MAP_COLS - 1) {
          tileKey = 'hedge';
          isSolid = true;
        }
        else if (col === 27) {
          if (row >= 6 && row <= 8) {
            tileKey = 'floor-wood';
          } else if (row >= 1 && row <= 4) {
            tileKey = 'window-big';
            isSolid = true;
          } else {
            tileKey = 'wall-dark';
            isSolid = true;
          }
        }
        else if (col >= 1 && col <= 26) {
          tileKey = 'floor-wood';
        }
        else if (col >= 28) {
          tileKey = 'floor-garden';
        }

        if (tileKey) {
          this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, tileKey);
        }
        if (isSolid) {
          this.collisionMap[row][col] = SOLID;
        }
      }
    }

    // --- Extended area (rows 16-31): all solid by default ---
    for (let row = 16; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        this.collisionMap[row][col] = SOLID;
      }
    }

    // --- Secret Room (cols 1-20, rows 17-30) ---
    this.buildSecretRoom();

    // --- Bathrooms (in extended area) ---
    this.buildBathrooms();

    this.placeSolid('pillar', 8, 1);

    [4, 12, 17, 22].forEach((col) => {
      this.add.image(col * TILE + TILE / 2, TILE / 2, 'ceiling-light').setDepth(0);
    });

    // --- Big TV area (moved down) ---
    // Big screen on wall (2 wide x 4 tall)
    this.placeSolid('big-tv-tl', 1, 7);
    this.placeSolid('big-tv-tr', 2, 7);
    this.placeSolid('big-tv-ml', 1, 8);
    this.placeSolid('big-tv-mr', 2, 8);
    this.placeSolid('big-tv-ml', 1, 9);
    this.placeSolid('big-tv-mr', 2, 9);
    this.placeSolid('big-tv-bl', 1, 10);
    this.placeSolid('big-tv-br', 2, 10);

    // Game console and joysticks below TV
    this.placeDecor('game-console', 1, 11);
    this.placeDecor('joystick', 2, 11);
    this.placeDecor('joystick', 3, 11);

    // Coffee table next to TV
    this.placeSolid('coffee-table', 3, 8);

    // Couch facing TV (separated with gap)
    this.placeSolid('couch-top', 5, 7);
    this.placeSolid('couch-mid', 5, 8);
    this.placeSolid('couch-mid', 5, 9);
    this.placeSolid('couch-bottom', 5, 10);

    this.placeSolid('plant', 7, 1);
    this.placeSolid('wall-shelf', 1, 1);
    this.placeSolid('wall-shelf', 1, 2);
    this.placeDecor('backpack', 7, 12);

    this.placeBigVerticalDesk(10, 8);
    this.placeBigVerticalDesk(15, 8);
    this.placeBigVerticalDesk(20, 8);

    this.placeSolid('wall-shelf', 12, 1);
    this.placeSolid('wall-shelf', 13, 1);
    this.placeSolid('wall-shelf', 17, 1);
    this.placeSolid('wall-shelf', 18, 1);
    this.placeSolid('plant', 9, 1);

    for (let r = 1; r <= 4; r++) {
      this.placeSolid('kitchen-wall', 22, r);
    }
    this.placeSolid('kitchen-wall', 25, 5);
    this.placeSolid('kitchen-wall', 26, 5);

    this.placeSolid('kitchen-fridge', 23, 1);
    this.placeSolid('kitchen-counter', 24, 1);
    this.placeSolid('kitchen-sink', 25, 1);
    this.placeSolid('kitchen-stove', 26, 1);

    this.placeSolid('kitchen-counter', 26, 3);
    this.placeSolid('coffee', 26, 4);

    this.placeSolid('coffee-table', 24, 3);

    for (let c = 28; c <= 31; c++) {
      this.add.image(c * TILE + TILE / 2, 7 * TILE + TILE / 2, 'garden-path');
      this.add.image(c * TILE + TILE / 2, 8 * TILE + TILE / 2, 'garden-path');
    }

    this.placeSolid('bbq-grill', 35, 2);
    this.placeSolid('bbq-grill', 36, 2);
    this.placeSolid('bench', 34, 4);
    this.placeSolid('bench', 37, 4);

    this.placeSolid('big-plant', 29, 12);
    this.placeSolid('big-plant', 30, 12);
    this.placeSolid('big-plant', 29, 13);
    this.placeSolid('big-plant', 30, 13);

    for (let c = 32; c <= 35; c++) {
      this.placeSolid('pool-edge-h', c, 8);
    }
    for (let r = 9; r <= 11; r++) {
      for (let c = 32; c <= 35; c++) {
        this.placeSolid('pool-water', c, r);
      }
    }
    for (let c = 32; c <= 35; c++) {
      this.placeSolid('pool-edge-h', c, 12);
    }
    for (let r = 9; r <= 11; r++) {
      this.placeSolid('pool-edge-v', 31, r);
    }
    for (let r = 9; r <= 11; r++) {
      this.placeSolid('pool-edge-v', 36, r);
    }

    this.placeSolid('tree', 29, 2);
    this.placeSolid('tree', 42, 2);
    this.placeSolid('tree', 42, 13);
    this.placeSolid('tree', 40, 1);

    this.placeSolid('bench', 39, 10);

    this.placeSolid('flower', 33, 3);
    this.placeSolid('flower2', 38, 14);
    this.placeSolid('flower', 41, 5);
    this.placeSolid('flower2', 40, 14);
    this.placeSolid('flower', 36, 1);
    this.placeSolid('flower2', 39, 3);

    this.placeSolid('hammock', 40, 7);

    // Secret garden door (teleport trigger — walkable, top-left of garden near door)
    this.add.image(28 * TILE + TILE / 2, 5 * TILE + TILE / 2, 'secret-door').setDepth(5);
    // Don't mark as solid — it's walkable

    // Store teleport definitions: { fromCol, fromRow, toCol, toRow }
    this.teleports = [
      // Garden door -> Secret room entrance
      { fromCol: 28, fromRow: 5, toCol: 10, toRow: 19 },
      // Secret room exit -> Garden
      { fromCol: 10, fromRow: 17, toCol: 28, toRow: 6 },
      // Women's bathroom door (top wall) -> Women's bathroom
      { fromCol: 14, fromRow: 0, toCol: 24, toRow: 22 },
      { fromCol: 15, fromRow: 0, toCol: 25, toRow: 22 },
      // Women's bathroom return -> Office
      { fromCol: 24, fromRow: 17, toCol: 14, toRow: 1 },
      { fromCol: 25, fromRow: 17, toCol: 15, toRow: 1 },
      // Men's bathroom door (top wall) -> Men's bathroom
      { fromCol: 18, fromRow: 0, toCol: 32, toRow: 22 },
      { fromCol: 19, fromRow: 0, toCol: 33, toRow: 22 },
      // Men's bathroom return -> Office
      { fromCol: 32, fromRow: 17, toCol: 18, toRow: 1 },
      { fromCol: 33, fromRow: 17, toCol: 19, toRow: 1 },
    ];
  }

  buildSecretRoom() {
    // Secret Room: 4x4 interior, cols 8-13, rows 17-22
    // Walls around perimeter
    for (let col = 8; col <= 13; col++) {
      this.placeSolid('wall-dark', col, 17);
      this.placeSolid('wall-dark', col, 22);
    }
    for (let row = 17; row <= 22; row++) {
      this.placeSolid('wall-dark', 8, row);
      this.placeSolid('wall-dark', 13, row);
    }

    // 4x4 interior (cols 9-12, rows 18-21) — dense money everywhere
    for (let row = 18; row <= 21; row++) {
      for (let col = 9; col <= 12; col++) {
        // Corners get money piles, rest alternates money/dark-floor
        const isCorner = (row === 18 || row === 21) && (col === 9 || col === 12);
        const tileKey = isCorner ? 'money-pile' : 'money';
        this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, tileKey);
        this.collisionMap[row][col] = WALKABLE;
      }
    }

    // Exit portal at top wall
    this.add.image(10 * TILE + TILE / 2, 17 * TILE + TILE / 2, 'exit-portal').setDepth(17);
    this.collisionMap[17][10] = WALKABLE;

    // Gangster NPC — top-right corner
    const gangsterCol = 12;
    const gangsterRow = 18;
    const gangster = this.add.sprite(
      gangsterCol * TILE + TILE / 2,
      gangsterRow * TILE + TILE / 2,
      'gangster-npc'
    );
    gangster.setDepth(gangsterRow + 0.5);
    this.collisionMap[gangsterRow][gangsterCol] = SOLID;
    // Name label for gangster
    const container = this._getOverlayContainer();
    const gangsterLabel = document.createElement('div');
    gangsterLabel.textContent = 'Gangster';
    gangsterLabel.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:bold 11px Arial,sans-serif;color:#f5a623;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;pointer-events:none;';
    container.appendChild(gangsterLabel);
    gangster.setData('nameEl', gangsterLabel);
    gangster.setData('gridX', gangsterCol);
    gangster.setData('gridY', gangsterRow);
    this.gangsterSprite = gangster;
  }

  buildBathrooms() {
    // Women's bathroom: cols 22-28, rows 17-23
    this.buildBathroomRoom(22, 28, 17, 23, 'door-women', 24, 25);
    // Men's bathroom: cols 30-36, rows 17-23
    this.buildBathroomRoom(30, 36, 17, 23, 'door-men', 32, 33);
  }

  buildBathroomRoom(colStart, colEnd, rowStart, rowEnd, doorKey, doorCol1, doorCol2) {
    // Walls
    for (let col = colStart; col <= colEnd; col++) {
      this.placeSolid('bathroom-wall', col, rowStart);
      this.placeSolid('bathroom-wall', col, rowEnd);
    }
    for (let row = rowStart; row <= rowEnd; row++) {
      this.placeSolid('bathroom-wall', colStart, row);
      this.placeSolid('bathroom-wall', colEnd, row);
    }
    // Floor
    for (let row = rowStart + 1; row <= rowEnd - 1; row++) {
      for (let col = colStart + 1; col <= colEnd - 1; col++) {
        this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, 'bathroom-floor');
        this.collisionMap[row][col] = WALKABLE;
      }
    }
    // Return doors at top wall
    this.add.image(doorCol1 * TILE + TILE / 2, rowStart * TILE + TILE / 2, 'return-door').setDepth(rowStart);
    this.collisionMap[rowStart][doorCol1] = WALKABLE;
    this.add.image(doorCol2 * TILE + TILE / 2, rowStart * TILE + TILE / 2, 'return-door').setDepth(rowStart);
    this.collisionMap[rowStart][doorCol2] = WALKABLE;
    // Toilets (along back wall)
    this.placeSolid('toilet', colStart + 1, rowEnd - 1);
    this.placeSolid('toilet', colStart + 3, rowEnd - 1);
    // Sinks (along side wall)
    this.placeSolid('sink-tile', colEnd - 1, rowStart + 1);
    this.placeSolid('sink-tile', colEnd - 1, rowStart + 3);
  }

  placeBigVerticalDesk(col, startRow) {
    const tileSequence = [
      'table-edge', 'table-laptop', 'table-items',
      'table-laptop2', 'table-laptop', 'table-items', 'table-edge'
    ];
    const tileSequence2 = [
      'table-edge', 'table-laptop2', 'table-laptop',
      'table-items', 'table-laptop2', 'table-laptop', 'table-edge'
    ];
    for (let r = 0; r < 7; r++) {
      this.placeSolid(tileSequence[r], col, startRow + r);
      this.placeSolid(tileSequence2[r], col + 1, startRow + r);
    }
    this.placeDecor('office-chair', col - 1, startRow + 1);
    this.placeDecor('office-chair', col - 1, startRow + 3);
    this.placeDecor('office-chair', col - 1, startRow + 5);
    this.placeDecor('office-chair', col + 2, startRow + 1);
    this.placeDecor('office-chair', col + 2, startRow + 3);
    this.placeDecor('office-chair', col + 2, startRow + 5);
  }

  placeSolid(key, col, row) {
    this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, key).setDepth(row);
    this.collisionMap[row][col] = SOLID;
  }

  placeDecor(key, col, row) {
    this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, key).setDepth(row);
  }

  // --- Info panel ---

  createInfoPanel() {
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalCard = document.getElementById('modal-card');

    document.getElementById('modal-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deselectWorker();
    });
  }

  selectWorker(sprite) {
    if (this.selectedWorker) {
      const prevHighlight = this.selectedWorker.getData('highlight');
      prevHighlight.setVisible(false);
    }

    this.selectedWorker = sprite;
    const data = sprite.getData('workerData');

    const highlight = sprite.getData('highlight');
    highlight.setVisible(true);
    this.updateHighlight(sprite);

    this.showInfoPanel(data);
  }

  updateHighlight(sprite) {
    const highlight = sprite.getData('highlight');
    highlight.clear();
    highlight.lineStyle(1, 0xf5a623, 1);
    highlight.strokeRect(
      sprite.x - TILE / 2 - 1,
      sprite.y - TILE / 2 - 1,
      TILE + 2,
      TILE + 2
    );
    highlight.fillStyle(0xf5a623);
    highlight.fillTriangle(
      sprite.x - 3, sprite.y - TILE / 2 - 5,
      sprite.x + 3, sprite.y - TILE / 2 - 5,
      sprite.x, sprite.y - TILE / 2 - 2
    );
  }

  showInfoPanel(data) {
    document.getElementById('modal-name').textContent = data.name;
    document.getElementById('modal-position').textContent = data.position;
    document.getElementById('modal-years').textContent =
      `${data.years} year${data.years !== 1 ? 's' : ''} at PAISANOS`;

    const canvas = document.getElementById('modal-avatar');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 64, 64);
      try {
        const tex = this.textures.get(`worker-${data.id}-0`);
        if (tex && tex.getSourceImage()) {
          ctx.drawImage(tex.getSourceImage(), 0, 0, TILE, TILE, 0, 0, 64, 64);
        }
      } catch (e) {
        // Avatar failed, text still shows
      }
    }

    const hintEl = document.getElementById('modal-hint');
    if (data.id === this.localId) {
      hintEl.textContent = 'Use arrow keys to move';
    } else {
      hintEl.textContent = 'Online player';
    }

    this.modalOverlay.classList.remove('modal-hidden');
  }

  hideInfoPanel() {
    if (this.modalOverlay) {
      this.modalOverlay.classList.add('modal-hidden');
    }
  }

  deselectWorker() {
    this.hideInfoPanel();
    if (this.selectedWorker) {
      const highlight = this.selectedWorker.getData('highlight');
      highlight.setVisible(false);
      this.selectedWorker = null;
    }
  }

  findWorkerAt(worldX, worldY) {
    const sprites = Array.from(this.players.values());
    for (let i = sprites.length - 1; i >= 0; i--) {
      const w = sprites[i];
      const left = w.x - TILE / 2 - 2;
      const right = w.x + TILE / 2 + 2;
      const top = w.y - TILE / 2 - 2;
      const bottom = w.y + TILE / 2 + 2;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return w;
      }
    }
    return null;
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.dpadDir = { dx: 0, dy: 0 };

    // D-pad touch/mouse controls
    const dpadMap = [
      { id: 'dpad-up', dx: 0, dy: -1 },
      { id: 'dpad-down', dx: 0, dy: 1 },
      { id: 'dpad-left', dx: -1, dy: 0 },
      { id: 'dpad-right', dx: 1, dy: 0 },
    ];
    dpadMap.forEach(({ id, dx, dy }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const start = (e) => { e.preventDefault(); this.dpadDir = { dx, dy }; btn.classList.add('pressed'); };
      const stop = (e) => { e.preventDefault(); this.dpadDir = { dx: 0, dy: 0 }; btn.classList.remove('pressed'); };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('pointercancel', stop);
    });

    this.input.on('pointerdown', (pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const clickedWorker = this.findWorkerAt(worldX, worldY);

      if (clickedWorker) {
        if (clickedWorker === this.selectedWorker) {
          this.deselectWorker();
        } else {
          this.selectWorker(clickedWorker);
        }
      } else {
        this.deselectWorker();
      }
    });
  }

  // --- Game loop ---

  update(time) {
    // Always update DOM overlay positions (camera may have moved)
    for (const [, sprite] of this.players) {
      this._updateSpriteLabels(sprite);
    }
    if (this.gangsterSprite) {
      this._updateSpriteLabels(this.gangsterSprite);
    }

    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;

    if (time - this.moveTimer < 150) return;

    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;
    else if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;

    // D-pad fallback
    if (dx === 0 && dy === 0 && this.dpadDir) {
      dx = this.dpadDir.dx;
      dy = this.dpadDir.dy;
    }

    if (dx === 0 && dy === 0) return;

    const gridX = localSprite.getData('gridX');
    const gridY = localSprite.getData('gridY');
    const newX = gridX + dx;
    const newY = gridY + dy;

    if (newX < 0 || newX >= MAP_COLS || newY < 0 || newY >= MAP_ROWS) return;
    if (this.collisionMap[newY][newX] === SOLID) return;

    // Flip sprite based on horizontal direction
    if (dx === -1) localSprite.flipX = true;
    else if (dx === 1) localSprite.flipX = false;

    localSprite.setData('gridX', newX);
    localSprite.setData('gridY', newY);
    localSprite.x = newX * TILE + TILE / 2;
    localSprite.y = newY * TILE + TILE / 2;
    localSprite.setDepth(newY + 0.5);

    this._updateSpriteLabels(localSprite);

    const frame = localSprite.getData('animFrame');
    const nextFrame = frame === 0 ? 2 : frame === 2 ? 1 : frame === 1 ? 3 : 0;
    localSprite.setData('animFrame', nextFrame);
    localSprite.setTexture(`worker-${this.localId}-${nextFrame}`);

    if (this.selectedWorker === localSprite) {
      this.updateHighlight(localSprite);
    }

    socketManager.sendMove(newX, newY);

    // Check teleport triggers
    this.checkTeleport(localSprite, newX, newY);

    this.moveTimer = time;
  }

  checkTeleport(sprite, x, y) {
    if (!this.teleports) return;
    for (const tp of this.teleports) {
      if (x === tp.fromCol && y === tp.fromRow) {
        sprite.setData('gridX', tp.toCol);
        sprite.setData('gridY', tp.toRow);
        sprite.x = tp.toCol * TILE + TILE / 2;
        sprite.y = tp.toRow * TILE + TILE / 2;
        sprite.setDepth(tp.toRow + 0.5);
        this._updateSpriteLabels(sprite);
        socketManager.sendMove(tp.toCol, tp.toRow);
        break;
      }
    }
  }

  // --- Chat ---

  setupChat() {
    this.chatInput = document.getElementById('chat-input');
    this.chatSendBtn = document.getElementById('chat-send-btn');
    this.chatMessages = document.getElementById('chat-messages');
    const chatPanel = document.getElementById('chat-panel');
    const chatToggle = document.getElementById('chat-toggle-btn');

    // Show chat panel (collapsed by default)
    chatPanel.classList.remove('chat-hidden');
    chatPanel.classList.add('chat-collapsed');
    chatToggle.textContent = '\u25B2'; // chevron up (click to open)

    // Collapse / expand toggle
    const header = document.getElementById('chat-header');
    header.addEventListener('click', () => {
      chatPanel.classList.toggle('chat-collapsed');
      chatToggle.textContent = chatPanel.classList.contains('chat-collapsed') ? '\u25B2' : '\u25BC';
    });

    const sendMessage = () => {
      const text = this.chatInput.value.trim();
      if (!text) return;
      // Show in chat panel
      this.addChatToPanel({
        id: this.localId,
        name: 'You',
        message: text,
        timestamp: Date.now(),
      });
      // Show speech bubble above local player
      this.showSpeechBubble(this.localId, text);
      socketManager.sendChat(text);
      this.chatInput.value = '';
      // Close chat and return focus to game so arrows work
      this.chatInput.blur();
      chatPanel.classList.add('chat-collapsed');
      chatToggle.textContent = '\u25B2';
    };

    this.chatSendBtn.addEventListener('click', sendMessage);
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Prevent arrow keys in chat from moving the player
    this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());

    // Global Enter key: focus chat input (first press opens chat & focuses, second press sends)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.chatInput) {
        e.preventDefault();
        // Open chat panel if collapsed
        if (chatPanel.classList.contains('chat-collapsed')) {
          chatPanel.classList.remove('chat-collapsed');
          chatToggle.textContent = '\u25BC';
        }
        this.chatInput.focus();
      }
    });
  }

  addChatToPanel(data) {
    const bubble = document.createElement('div');
    const isSelf = data.id === this.localId;
    bubble.className = 'chat-bubble' + (isSelf ? ' chat-bubble-self' : '');

    const headerDiv = document.createElement('div');
    headerDiv.className = 'chat-bubble-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-bubble-name';
    nameSpan.textContent = isSelf ? 'You' : data.name;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-bubble-time';
    const d = new Date(data.timestamp);
    timeSpan.textContent = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');

    headerDiv.appendChild(nameSpan);
    headerDiv.appendChild(timeSpan);

    const msgSpan = document.createElement('span');
    msgSpan.className = 'chat-bubble-text';
    msgSpan.textContent = data.message;

    bubble.appendChild(headerDiv);
    bubble.appendChild(msgSpan);

    this.chatMessages.appendChild(bubble);

    // Scroll to bottom
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  showSpeechBubble(playerId, message) {
    const sprite = this.players.get(playerId);
    if (!sprite) return;

    // Remove existing speech bubble for this player
    this._removeSpeechBubble(playerId);

    const displayMsg = message.length > 50 ? message.slice(0, 50) + '...' : message;

    // DOM speech bubble
    const container = this._getOverlayContainer();
    const el = document.createElement('div');
    el.textContent = displayMsg;
    el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,255,255,0.95);color:#111;font:12px Arial,sans-serif;padding:4px 8px;border-radius:6px;max-width:160px;word-wrap:break-word;text-align:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    container.appendChild(el);
    sprite.setData('speechEl', el);

    // Auto-remove after 3 seconds
    const timer = this.time.delayedCall(3000, () => {
      this._removeSpeechBubble(playerId);
    });
    sprite.setData('speechTimer', timer);

    // Position it
    this._updateSpriteLabels(sprite);
  }

  _removeSpeechBubble(playerId) {
    const sprite = this.players.get(playerId);
    if (!sprite) return;
    const el = sprite.getData('speechEl');
    if (el) { el.remove(); sprite.setData('speechEl', null); }
    const timer = sprite.getData('speechTimer');
    if (timer) { timer.remove(); sprite.setData('speechTimer', null); }
  }

  animateWorkers() {
    for (const [id, sprite] of this.players) {
      if (id === this.localId) continue;

      const data = sprite.getData('workerData');
      const frame = sprite.getData('animFrame');
      const next = frame === 0 ? 1 : 0;
      sprite.setData('animFrame', next);
      sprite.setTexture(`worker-${data.id}-${next}`);
    }
  }
}
