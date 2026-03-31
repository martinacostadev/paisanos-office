import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';
import webRTCManager from '../network/WebRTCManager.js';
import { generateWorkerTextures, destroyWorkerTextures } from '../utils/workerTexture.js';
import {
  startInvaders, startSnake, startPong, startBreakout,
  drawInvadersThumb, drawSnakeThumb, drawPongThumb, drawBreakoutThumb,
} from '../arcade/ArcadeGames.js';

const TILE = 16;
const MAP_COLS = 44;
const MAP_ROWS = 40;

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
    this.currentNearbyIds = new Set(); // Currently displayed remote video peers
    this.currentMeetingRoom = null; // null or 'meet-1'/'meet-2'
    this.meetingRoomPlayers = new Set(); // player IDs in same meeting room
    this.isFullCamMode = false;
    this.currentRoom = null; // null or 'secret'/'bath-women'/'bath-men'
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
      this.meetingRoomPlayers.delete(data.id);
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
      if (data.message) {
        data.message = data.message.charAt(0).toUpperCase() + data.message.slice(1);
      }
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

    // Meeting room listeners
    this.setupMeetingListeners();

    // Settings button
    this.setupSettings();

    // Chat setup
    this.setupChat();

    // BBQ game setup
    this.setupBBQ();

    // Toilet game setup
    this.setupToiletGame();

    // Fridge proximity setup (disabled)
    // this.setupFridge();

    // Guitar proximity setup
    this.setupGuitar();

    // TV proximity setup
    this.setupTV();

    // Arcade machine setup
    this.setupArcade();

    // Place bot NPCs
    this.setupBots();

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
      // Restrict camera to office area (rows 0-15) so hidden rooms below aren't visible
      this.cameras.main.setBounds(0, 0, MAP_COLS * TILE, 16 * TILE);
      // Instant snap on first frame, then smooth follow
      this.cameras.main.startFollow(localSprite, true, 1, 1);
      this.cameras.main.centerOn(localSprite.x, localSprite.y);
      this.time.delayedCall(100, () => {
        this.cameras.main.setLerp(0.15, 0.15);
      });
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
          btn.textContent = 'Cerrar cam';
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
        btn.textContent = 'Abrir cam';
        btn.classList.remove('cam-on');
        panel.classList.add('cam-hidden');
        micBtn.classList.add('mic-btn-hidden');
        micBtn.classList.remove('mic-on');
        micBtn.textContent = 'Abrir mic';
        this._hideAllRemoteVideos();
      }
    });

    micBtn.addEventListener('click', () => {
      if (!webRTCManager.cameraOn) return;
      const isOn = webRTCManager.toggleMic();
      if (isOn) {
        micBtn.textContent = 'Cerrar mic';
        micBtn.classList.add('mic-on');
      } else {
        micBtn.textContent = 'Abrir mic';
        micBtn.classList.remove('mic-on');
      }
    });
  }

  setupSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    settingsBtn.classList.remove('settings-btn-hidden');

    settingsBtn.addEventListener('click', () => {
      const form = document.getElementById('join-form-overlay');
      const joinBtn = document.getElementById('join-btn');
      joinBtn.disabled = false;
      joinBtn.textContent = 'GUARDAR';
      form.classList.remove('form-hidden');

      // Replace the JOIN button behavior with SAVE behavior
      const saveHandler = () => {
        const name = document.getElementById('join-name').value.trim();
        const position = document.getElementById('join-position').value.trim();
        if (!name || !position) return;

        // Read selected shirt
        let shirtStyle = 'blue-lines';
        const shirtOpts = document.querySelectorAll('.shirt-option');
        shirtOpts.forEach((o) => { if (o.classList.contains('selected')) shirtStyle = o.dataset.shirt; });

        // Read selected hair style
        let hairStyle = 'short';
        const hairOpts = document.querySelectorAll('.hair-option');
        hairOpts.forEach((o) => { if (o.classList.contains('selected')) hairStyle = o.dataset.hair; });

        // Read selected hair color
        let hairColor = '0x3b2417';
        const colorOpts = document.querySelectorAll('.hair-color-option');
        colorOpts.forEach((o) => { if (o.classList.contains('selected')) hairColor = o.dataset.haircolor; });

        // Read selected skin color
        let skinColor = '0xf5d0b0';
        const skinOpts = document.querySelectorAll('.skin-color-option');
        skinOpts.forEach((o) => { if (o.classList.contains('selected')) skinColor = o.dataset.skincolor; });

        // Save to localStorage
        try {
          localStorage.setItem('paisanos_user', JSON.stringify({ name, position, shirtStyle, hairStyle, hairColor, skinColor }));
        } catch (e) { /* ignore */ }

        form.classList.add('form-hidden');

        // Disconnect and rejoin with new data
        socketManager.socket.disconnect();
        socketManager.connect();
        socketManager.on('game:state', (state) => {
          this.registry.set('myId', state.you.id);
          this.registry.set('players', state.players);
          // Clean up old overlays
          const overlay = document.getElementById('game-overlay');
          if (overlay) overlay.innerHTML = '';
          this._overlayContainer = null;
          this.scene.restart();
        });
        socketManager.join({ name, position, shirtStyle, hairStyle, hairColor, skinColor });

        // Remove this handler to avoid duplication
        joinBtn.removeEventListener('click', saveHandler);
      };

      joinBtn.addEventListener('click', saveHandler);
    });
  }

  updateProximityVideo() {
    if (!webRTCManager.cameraOn) return;

    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;

    const nearbyPeers = new Set();

    if (this.currentMeetingRoom) {
      // In meeting room: show ALL members regardless of distance
      for (const peerId of this.meetingRoomPlayers) {
        if (peerId === this.localId) continue;
        if (this.cameraPeers.has(peerId)) {
          nearbyPeers.add(peerId);
        }
      }
    } else {
      // Normal proximity check
      const lx = localSprite.getData('gridX');
      const ly = localSprite.getData('gridY');

      for (const peerId of this.cameraPeers) {
        if (peerId === this.localId) continue;
        const sprite = this.players.get(peerId);
        if (!sprite) continue;

        const px = sprite.getData('gridX');
        const py = sprite.getData('gridY');
        const dist = Math.max(Math.abs(lx - px), Math.abs(ly - py));

        if (dist <= PROXIMITY_TILES) {
          nearbyPeers.add(peerId);
        }
      }
    }

    // Add new nearby peers, remove ones that left
    for (const peerId of nearbyPeers) {
      if (!this.currentNearbyIds.has(peerId)) {
        this._addRemoteVideo(peerId);
      } else {
        this._refreshRemoteVideo(peerId);
      }
    }
    for (const peerId of this.currentNearbyIds) {
      if (!nearbyPeers.has(peerId)) {
        this._removeRemoteVideo(peerId);
      }
    }
    this.currentNearbyIds = nearbyPeers;

    // Audio: unmute nearby peers with mic on, mute everyone else
    for (const [peerId] of webRTCManager.audioElements) {
      const isNearbyWithMic = nearbyPeers.has(peerId) && this.micPeers.has(peerId) && webRTCManager.micOn;
      webRTCManager.setRemoteAudioMuted(peerId, !isNearbyWithMic);
    }
  }

  _addRemoteVideo(peerId) {
    const container = document.getElementById('cam-remote-container');
    // Don't duplicate
    if (document.getElementById(`cam-remote-${peerId}`)) return;

    const box = document.createElement('div');
    box.id = `cam-remote-${peerId}`;
    box.className = 'cam-box';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    const stream = webRTCManager.getRemoteStream(peerId);
    if (stream) video.srcObject = stream;

    const label = document.createElement('span');
    const sprite = this.players.get(peerId);
    label.textContent = sprite?.getData('workerData')?.name || 'Cercano';

    box.appendChild(video);
    box.appendChild(label);
    container.appendChild(box);
  }

  _refreshRemoteVideo(peerId) {
    const box = document.getElementById(`cam-remote-${peerId}`);
    if (!box) return;
    const video = box.querySelector('video');
    const stream = webRTCManager.getRemoteStream(peerId);
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
    }
  }

  _removeRemoteVideo(peerId) {
    const box = document.getElementById(`cam-remote-${peerId}`);
    if (box) {
      const video = box.querySelector('video');
      if (video) video.srcObject = null;
      box.remove();
    }
  }

  _hideAllRemoteVideos() {
    const container = document.getElementById('cam-remote-container');
    if (container) container.innerHTML = '';
    this.currentNearbyIds = new Set();
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
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        gameCanvas.parentElement.style.position = 'relative';
        gameCanvas.parentElement.appendChild(container);
      }
      this._overlayContainer = container;
    }
    return this._overlayContainer;
  }

  _worldToScreen(worldX, worldY) {
    const cam = this.cameras.main;
    const canvas = this.sys.game.canvas;
    // Use worldView which gives the actual visible world rectangle (accounts for zoom)
    const wv = cam.worldView;
    const sx = (worldX - wv.x) / wv.width * canvas.clientWidth;
    const sy = (worldY - wv.y) / wv.height * canvas.clientHeight;
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
          // REUNIONES lobby door in top wall (single door at cols 7-8)
          if (col === 7 || col === 8) {
            tileKey = 'reuniones-door';
            isSolid = false;
          }
          // Bathroom doors in top wall
          else if ((col === 14 || col === 15)) {
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
          // Double entry door on the left wall
          if (row === 3 || row === 4) {
            tileKey = 'entry-door';
            isSolid = false; // walkable door
          } else {
            tileKey = 'wall-dark';
            isSolid = true;
          }
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

    // --- Extended area (rows 16-39): all solid by default ---
    for (let row = 16; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        this.collisionMap[row][col] = SOLID;
      }
    }

    // --- Secret Room (cols 1-20, rows 17-30) ---
    this.buildSecretRoom();

    // --- Bathrooms (in extended area) ---
    this.buildBathrooms();

    // --- Meeting Rooms (rows 25-31 in extended area) ---
    this.buildMeetingRooms();

    // "ENTRADA" label next to the entry door on the left wall
    this.add.text(-2, 3.5 * TILE, 'ENTRADA', {
      fontFamily: 'Arial', fontSize: '5px', color: '#f5a623', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(9999).setAngle(-90);

    this.placeSolid('pillar', 12, 1);

    [4, 17, 22].forEach((col) => {
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

    this.placeSolid('plant', 10, 1);
    this.placeSolid('wall-shelf', 1, 1);
    this.placeSolid('wall-shelf', 1, 2);
    this.placeDecor('backpack', 7, 12);
    this.placeSolid('arcade-machine', 4, 1);
    this.arcadeMachineCol = 4;
    this.arcadeMachineRow = 1;
    this.placeDecor('guitar', 25, 13);
    this.placeDecor('musical-notes', 26, 13);

    this.placeBigVerticalDesk(10, 8);
    this.placeBigVerticalDesk(15, 8);
    this.placeBigVerticalDesk(20, 8);


    for (let r = 1; r <= 4; r++) {
      this.placeSolid('kitchen-wall', 20, r);
    }
    this.placeSolid('kitchen-wall', 25, 5);
    this.placeSolid('kitchen-wall', 26, 5);

    this.placeSolid('kitchen-fridge', 23, 1);
    this.placeSolid('kitchen-counter', 24, 1);
    this.placeSolid('kitchen-sink', 25, 1);
    this.placeSolid('kitchen-stove', 26, 1);

    this.placeSolid('kitchen-counter', 26, 3);
    this.placeSolid('coffee', 26, 4);

    this.placeSolid('coffee-table', 21, 3);
    this.placeSolid('coffee-table', 21, 4);

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

    // Pool — bottom-right corner of garden, touching walls
    for (let c = 39; c <= 42; c++) {
      this.placeSolid('pool-edge-h', c, 10);
    }
    for (let r = 11; r <= 13; r++) {
      for (let c = 39; c <= 42; c++) {
        this.placeSolid('pool-water', c, r);
      }
    }
    for (let c = 39; c <= 42; c++) {
      this.placeSolid('pool-edge-h', c, 14);
    }
    for (let r = 11; r <= 13; r++) {
      this.placeSolid('pool-edge-v', 38, r);
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

    // Concrete bench seating — top edge of garden (row 1, walkable so players can sit)
    for (let c = 30; c <= 34; c++) {
      this.placeDecor('concrete-bench-h', c, 1);
    }
    // Concrete bench seating — right edge of garden (col 42, walkable)
    for (let r = 4; r <= 8; r++) {
      this.placeDecor('concrete-bench-v', 42, r);
    }

    this.placeSolid('hammock', 40, 7);

    // Garden cats
    // Orange cat with animated tail (near BBQ)
    this.catOrange = this.add.sprite(37 * TILE + TILE / 2, 6 * TILE + TILE / 2, 'cat-orange-0');
    this.catOrange.setDepth(6 + 0.5);
    // Black cat with animated tail (near pool)
    this.catBlack = this.add.sprite(38 * TILE + TILE / 2, 11 * TILE + TILE / 2, 'cat-black-0');
    this.catBlack.setDepth(11 + 0.5);
    // White/gray cat sleeping (near bench)
    this.placeDecor('cat-white', 35, 5);
    // Tail animation for orange and black cats
    this.catTailFrame = 0;
    this.time.addEvent({
      delay: 600,
      callback: () => {
        this.catTailFrame = this.catTailFrame === 0 ? 1 : 0;
        if (this.catOrange) this.catOrange.setTexture(`cat-orange-${this.catTailFrame}`);
        if (this.catBlack) this.catBlack.setTexture(`cat-black-${this.catTailFrame}`);
      },
      loop: true,
    });

    // Garden birds
    this.placeDecor('bird-stand', 34, 4);
    // Flying bird (animated)
    this.flyingBird = this.add.sprite(37 * TILE + TILE / 2, 4 * TILE + TILE / 2, 'bird-fly-0');
    this.flyingBird.setDepth(4 + 0.5);
    this.flyingBirdDir = 1;
    this.flyingBirdFrame = 0;
    this.time.addEvent({
      delay: 250,
      callback: () => {
        if (!this.flyingBird) return;
        this.flyingBirdFrame = this.flyingBirdFrame === 0 ? 1 : 0;
        this.flyingBird.setTexture(`bird-fly-${this.flyingBirdFrame}`);
        // Move bird horizontally across garden (cols 28-42)
        this.flyingBird.x += this.flyingBirdDir * TILE * 0.4;
        // Slight vertical bobbing
        this.flyingBird.y += Math.sin(this.flyingBird.x * 0.02) * 1.5;
        if (this.flyingBird.x > 42 * TILE) {
          this.flyingBirdDir = -1;
          this.flyingBird.flipX = true;
        } else if (this.flyingBird.x < 29 * TILE) {
          this.flyingBirdDir = 1;
          this.flyingBird.flipX = false;
        }
      },
      loop: true,
    });

    // "SECRET" sign above the door
    this.placeSolid('secret-sign', 28, 4);

    // Secret garden door (teleport trigger — walkable, top-left of garden near door)
    this.add.image(28 * TILE + TILE / 2, 5 * TILE + TILE / 2, 'secret-door').setDepth(5);
    // Don't mark as solid — it's walkable

    // Store teleport definitions: { fromCol, fromRow, toCol, toRow }
    this.teleports = [
      // Garden door -> Secret room entrance (appear near exit portal at top)
      { fromCol: 28, fromRow: 5, toCol: 10, toRow: 18, room: 'secret' },
      // Secret room exit -> Garden
      { fromCol: 10, fromRow: 17, toCol: 28, toRow: 6, roomLeave: true },
      // Women's bathroom door (top wall) -> Women's bathroom (appear near return door)
      { fromCol: 14, fromRow: 0, toCol: 25, toRow: 18, room: 'bath-women' },
      { fromCol: 15, fromRow: 0, toCol: 25, toRow: 18, room: 'bath-women' },
      // Women's bathroom return -> Office
      { fromCol: 24, fromRow: 17, toCol: 14, toRow: 1, roomLeave: true },
      { fromCol: 25, fromRow: 17, toCol: 15, toRow: 1, roomLeave: true },
      // Men's bathroom door (top wall) -> Men's bathroom (appear near return door)
      { fromCol: 18, fromRow: 0, toCol: 33, toRow: 18, room: 'bath-men' },
      { fromCol: 19, fromRow: 0, toCol: 33, toRow: 18, room: 'bath-men' },
      // Men's bathroom return -> Office
      { fromCol: 32, fromRow: 17, toCol: 18, toRow: 1, roomLeave: true },
      { fromCol: 33, fromRow: 17, toCol: 19, toRow: 1, roomLeave: true },
      // Office -> Lobby (through REUNIONES door at cols 7-8, row 0)
      { fromCol: 7, fromRow: 0, toCol: 11, toRow: 32, room: 'lobby-reuniones' },
      { fromCol: 8, fromRow: 0, toCol: 12, toRow: 32, room: 'lobby-reuniones' },
      // Lobby exit (bottom wall, cols 11-12, row 38) -> back to office
      { fromCol: 11, fromRow: 38, toCol: 7, toRow: 1, roomLeave: true },
      { fromCol: 12, fromRow: 38, toCol: 8, toRow: 1, roomLeave: true },
      // Lobby -> Room 1 (left wall, col 6, rows 34-35)
      { fromCol: 6, fromRow: 34, toCol: 4, toRow: 33, meeting: 'meet-1' },
      { fromCol: 6, fromRow: 35, toCol: 4, toRow: 34, meeting: 'meet-1' },
      // Room 1 -> Lobby (right wall door, col 5, rows 33-34)
      { fromCol: 5, fromRow: 33, toCol: 7, toRow: 34, meetingLeave: 'meet-1', returnToLobby: true },
      { fromCol: 5, fromRow: 34, toCol: 7, toRow: 35, meetingLeave: 'meet-1', returnToLobby: true },
      // Lobby -> Room 2 (top wall, cols 11-12, row 31)
      { fromCol: 11, fromRow: 31, toCol: 11, toRow: 29, meeting: 'meet-2' },
      { fromCol: 12, fromRow: 31, toCol: 12, toRow: 29, meeting: 'meet-2' },
      // Room 2 -> Lobby (bottom wall door, cols 11-12, row 30)
      { fromCol: 11, fromRow: 30, toCol: 11, toRow: 32, meetingLeave: 'meet-2', returnToLobby: true },
      { fromCol: 12, fromRow: 30, toCol: 12, toRow: 32, meetingLeave: 'meet-2', returnToLobby: true },
      // Lobby -> Room 3 (right wall, col 17, rows 34-35)
      { fromCol: 17, fromRow: 34, toCol: 19, toRow: 33, meeting: 'meet-3' },
      { fromCol: 17, fromRow: 35, toCol: 19, toRow: 34, meeting: 'meet-3' },
      // Room 3 -> Lobby (left wall door, col 18, rows 33-34)
      { fromCol: 18, fromRow: 33, toCol: 16, toRow: 34, meetingLeave: 'meet-3', returnToLobby: true },
      { fromCol: 18, fromRow: 34, toCol: 16, toRow: 35, meetingLeave: 'meet-3', returnToLobby: true },
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
    // Women's bathroom: cols 22-28, rows 17-23, single door at col 25
    this.buildBathroomRoom(22, 28, 17, 23, 'door-women', 25);
    // Men's bathroom: cols 30-36, rows 17-23, single door at col 33
    this.buildBathroomRoom(30, 36, 17, 23, 'door-men', 33);
  }

  buildBathroomRoom(colStart, colEnd, rowStart, rowEnd, doorKey, doorCol) {
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
    // Single return door at top wall
    this.add.image(doorCol * TILE + TILE / 2, rowStart * TILE + TILE / 2, 'return-door').setDepth(rowStart + 0.1);
    this.collisionMap[rowStart][doorCol] = WALKABLE;
    // Adjacent col also walkable for teleport
    this.collisionMap[rowStart][doorCol - 1] = WALKABLE;
    // Toilets (along back wall)
    this.placeSolid('toilet', colStart + 1, rowEnd - 1);
    this.placeSolid('toilet', colStart + 3, rowEnd - 1);
    // Sinks (along side wall)
    this.placeSolid('sink-tile', colEnd - 1, rowStart + 1);
    this.placeSolid('sink-tile', colEnd - 1, rowStart + 3);
  }

  placeBigVerticalDesk(col, startRow) {
    if (!this.chairPositions) this.chairPositions = new Set();
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
    const chairOffsets = [startRow + 1, startRow + 3, startRow + 5];
    chairOffsets.forEach((row) => {
      this.placeDecor('office-chair', col - 1, row);
      this.placeDecor('office-chair', col + 2, row);
      this.chairPositions.add(`${col - 1},${row}`);
      this.chairPositions.add(`${col + 2},${row}`);
    });
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
    document.getElementById('modal-years').textContent = '';

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
      hintEl.textContent = 'Usa las flechas para moverte';
    } else {
      hintEl.textContent = 'Jugador en linea';
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
      const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dpadDir = { dx, dy };
        btn.classList.add('pressed');
      };
      const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dpadDir = { dx: 0, dy: 0 };
        btn.classList.remove('pressed');
      };
      btn.addEventListener('pointerdown', start, { passive: false });
      btn.addEventListener('pointerup', stop, { passive: false });
      btn.addEventListener('pointerleave', stop, { passive: false });
      btn.addEventListener('pointercancel', stop, { passive: false });
      // Touch fallback for mobile
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', stop, { passive: false });
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
    // Handle meeting room visibility (privacy)
    const inMeeting = !!this.currentMeetingRoom;
    for (const [id, sprite] of this.players) {
      if (id === this.localId) {
        this._updateSpriteLabels(sprite);
        continue;
      }
      if (inMeeting) {
        // In meeting: only show players who are also in this meeting room
        const visible = this.meetingRoomPlayers.has(id);
        sprite.setVisible(visible);
        const nameEl = sprite.getData('nameEl');
        if (nameEl) nameEl.style.display = visible ? '' : 'none';
        const speechEl = sprite.getData('speechEl');
        if (speechEl) speechEl.style.display = visible ? '' : 'none';
      } else {
        sprite.setVisible(true);
        const nameEl = sprite.getData('nameEl');
        if (nameEl) nameEl.style.display = '';
        const speechEl = sprite.getData('speechEl');
        if (speechEl) speechEl.style.display = '';
      }
      this._updateSpriteLabels(sprite);
    }
    // Hide/show NPCs and bots based on meeting room state
    if (this.gangsterSprite) {
      this.gangsterSprite.setVisible(!inMeeting);
      const gNameEl = this.gangsterSprite.getData('nameEl');
      if (gNameEl) gNameEl.style.display = inMeeting ? 'none' : '';
      this._updateSpriteLabels(this.gangsterSprite);
    }
    if (this.botSprites) {
      this.botSprites.forEach((bot) => {
        bot.setVisible(!inMeeting);
        const bNameEl = bot.getData('nameEl');
        if (bNameEl) bNameEl.style.display = inMeeting ? 'none' : '';
        const bSpeechEl = bot.getData('speechEl');
        if (bSpeechEl) bSpeechEl.style.display = inMeeting ? 'none' : '';
        this._updateSpriteLabels(bot);
      });
    }
    // Hide meeting labels when inside a meeting room
    if (this.meetingLabels) {
      this.meetingLabels.forEach((label) => label.setVisible(!inMeeting));
    }

    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;

    // Block movement while overlays are open
    if (this.arcadeOpen || this.tvOpen || this.guitarOpen || this.toiletOpen || this.bbqOpen) return;

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

    // Check teleport triggers (pass movement direction for correct bounce-back)
    this.checkTeleport(localSprite, newX, newY, dx, dy);

    // Check chair sit / "EN REU" badge
    this.checkChairStatus(localSprite, newX, newY);

    // Check BBQ proximity
    this.checkBBQProximity(newX, newY);

    // Check toilet proximity
    this.checkToiletProximity(newX, newY);

    // Check fridge proximity (disabled)
    // this.checkFridgeProximity(newX, newY);

    // Check guitar proximity
    this.checkGuitarProximity(newX, newY);

    // Check TV proximity
    this.checkTVProximity(newX, newY);

    // Check arcade machine proximity
    this.checkArcadeProximity(newX, newY);

    this.moveTimer = time;
  }

  checkChairStatus(sprite, x, y) {
    if (!this.chairPositions) return;
    const onChair = this.chairPositions.has(`${x},${y}`);
    const wasOnChair = sprite.getData('onChair');

    if (onChair && !wasOnChair) {
      // Sat down — show "EN REU" badge and turn off camera/mic
      sprite.setData('onChair', true);
      sprite.setData('camWasOn', webRTCManager.cameraOn);
      sprite.setData('micWasOn', webRTCManager.micOn);
      const nameEl = sprite.getData('nameEl');
      if (nameEl) {
        const originalName = sprite.getData('workerData')?.name || '';
        nameEl.textContent = originalName + '\nEN REU';
        nameEl.style.whiteSpace = 'pre';
      }
      // Auto turn off camera and mic
      if (webRTCManager.cameraOn) {
        const btn = document.getElementById('cam-toggle-btn');
        const panel = document.getElementById('cam-panel');
        const micBtn = document.getElementById('mic-toggle-btn');
        const localVideo = document.getElementById('cam-local');
        webRTCManager.stopCamera();
        localVideo.srcObject = null;
        btn.textContent = 'Abrir cam';
        btn.classList.remove('cam-on');
        panel.classList.add('cam-hidden');
        micBtn.classList.add('mic-btn-hidden');
        micBtn.classList.remove('mic-on');
        micBtn.textContent = 'Abrir mic';
        this._hideAllRemoteVideos();
      }
    } else if (!onChair && wasOnChair) {
      // Stood up — remove badge and restore camera/mic
      sprite.setData('onChair', false);
      const nameEl = sprite.getData('nameEl');
      if (nameEl) {
        const originalName = sprite.getData('workerData')?.name || '';
        nameEl.textContent = originalName;
        nameEl.style.whiteSpace = 'nowrap';
      }
      // Restore camera if it was on before sitting
      if (sprite.getData('camWasOn')) {
        const btn = document.getElementById('cam-toggle-btn');
        const panel = document.getElementById('cam-panel');
        const micBtn = document.getElementById('mic-toggle-btn');
        const localVideo = document.getElementById('cam-local');
        (async () => {
          try {
            const stream = await webRTCManager.startCamera();
            localVideo.srcObject = stream;
            btn.textContent = 'Cerrar cam';
            btn.classList.add('cam-on');
            panel.classList.remove('cam-hidden');
            micBtn.classList.remove('mic-btn-hidden');
            await webRTCManager.connectToExistingPeers(this.cameraPeers);
            // Restore mic if it was on
            if (sprite.getData('micWasOn') && !webRTCManager.micOn) {
              webRTCManager.toggleMic();
              micBtn.textContent = 'Cerrar mic';
              micBtn.classList.add('mic-on');
            }
          } catch (err) {
            console.error('Camera restore error:', err);
          }
        })();
      }
    }
  }

  checkTeleport(sprite, x, y, moveDx, moveDy) {
    if (!this.teleports) return;
    for (const tp of this.teleports) {
      if (x === tp.fromCol && y === tp.fromRow) {
        // Meeting room entry — requires server approval
        if (tp.meeting) {
          this.tryJoinMeeting(tp.meeting, tp.toCol, tp.toRow);
          // Bounce player back to where they came from (reverse movement direction)
          const prevX = x - (moveDx || 0);
          const prevY = y - (moveDy || 0);
          sprite.setData('gridX', prevX);
          sprite.setData('gridY', prevY);
          sprite.x = prevX * TILE + TILE / 2;
          sprite.y = prevY * TILE + TILE / 2;
          sprite.setDepth(prevY + 0.5);
          this._updateSpriteLabels(sprite);
          socketManager.sendMove(prevX, prevY);
          break;
        }
        // Meeting room exit
        if (tp.meetingLeave) {
          this.leaveMeetingRoom(tp.returnToLobby);
        }
        // Room entry — zoom camera to room bounds
        if (tp.room) {
          this.currentRoom = tp.room;
          this._setRoomCameraBounds(tp.room);
        }
        // Room exit — restore full map camera and follow
        if (tp.roomLeave) {
          this.currentRoom = null;
          this._restoreCamera();
        }
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
    const dpadControls = document.getElementById('dpad-controls');
    header.addEventListener('click', () => {
      chatPanel.classList.toggle('chat-collapsed');
      const collapsed = chatPanel.classList.contains('chat-collapsed');
      chatToggle.textContent = collapsed ? '\u25B2' : '\u25BC';
      // Hide/show D-pad when chat opens/closes
      if (dpadControls) {
        dpadControls.style.visibility = collapsed ? '' : 'hidden';
      }
    });

    const sendMessage = () => {
      let text = this.chatInput.value.trim();
      if (!text) return;
      text = text.charAt(0).toUpperCase() + text.slice(1);
      // Show in chat panel
      this.addChatToPanel({
        id: this.localId,
        name: 'Vos',
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
      if (dpadControls) dpadControls.style.visibility = '';
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
          if (dpadControls) dpadControls.style.visibility = 'hidden';
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
    nameSpan.textContent = isSelf ? 'Vos' : data.name;

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

  setupBots() {
    const botPhrases = [
      'Trabajando en la propuesta de valor...',
      'Desplegando a producción...',
      'Haciendo propuesto comercial...',
      'Crendo proyecto en v0...',
      'Modificando los assets de Figma...',
      'Haciendo fixes en ambiente Staging...',
    ];

    const chefPhrases = [
      '\u00BFQuer\u00E9s algo de comer?',
      '\u00BFTe gustar\u00EDa una picada con fernet?',
      '\u00BFQui\u00E9n quiere chipa?',
      'Hola! Quer\u00E9s algo dulce o salado?',
    ];

    const bots = [
      { name: 'NinjaBot', texture: 'bot-dani', col: 9, row: 9, phrases: botPhrases, nameColor: '#00ff88' },
      { name: 'PaisaBot', texture: 'bot-paisabot', col: 12, row: 11, phrases: botPhrases, nameColor: '#00ff88' },
      { name: 'Chef Paisano', texture: 'chef-npc', col: 21, row: 2, phrases: chefPhrases, nameColor: '#ffcc44' },
    ];

    this.botSprites = [];

    bots.forEach((bot) => {
      const sprite = this.add.sprite(
        bot.col * TILE + TILE / 2,
        bot.row * TILE + TILE / 2,
        bot.texture
      );
      sprite.setDepth(bot.row + 0.5);
      this.collisionMap[bot.row][bot.col] = SOLID;

      // Name label
      const container = this._getOverlayContainer();
      const nameEl = document.createElement('div');
      nameEl.textContent = bot.name;
      nameEl.style.cssText = `position:absolute;transform:translate(-50%,-100%);font:bold 11px Arial,sans-serif;color:${bot.nameColor};text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;pointer-events:none;`;
      container.appendChild(nameEl);
      sprite.setData('nameEl', nameEl);
      sprite.setData('gridX', bot.col);
      sprite.setData('gridY', bot.row);

      this.botSprites.push(sprite);

      // Random chat messages at random intervals
      const phrases = bot.phrases;
      const sendBotMessage = () => {
        const msg = phrases[Math.floor(Math.random() * phrases.length)];
        // Show speech bubble above bot
        this._showBotSpeechBubble(sprite, msg);
        // Add to chat panel
        this.addChatToPanel({
          id: 'bot-' + bot.name,
          name: bot.name,
          message: msg,
          timestamp: Date.now(),
        });
        // Schedule next message (8-20 seconds)
        const delay = 8000 + Math.random() * 12000;
        this.time.delayedCall(delay, sendBotMessage);
      };

      // Start first message after a random delay (3-8 seconds)
      const initialDelay = 3000 + Math.random() * 5000;
      this.time.delayedCall(initialDelay, sendBotMessage);
    });
  }

  _showBotSpeechBubble(sprite, message) {
    // Remove existing bubble
    const oldEl = sprite.getData('speechEl');
    if (oldEl) oldEl.remove();
    const oldTimer = sprite.getData('speechTimer');
    if (oldTimer) oldTimer.remove();

    const displayMsg = message.length > 50 ? message.slice(0, 50) + '...' : message;
    const container = this._getOverlayContainer();
    const el = document.createElement('div');
    el.textContent = displayMsg;
    el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(255,255,255,0.95);color:#111;font:12px Arial,sans-serif;padding:4px 8px;border-radius:6px;max-width:160px;word-wrap:break-word;text-align:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    container.appendChild(el);
    sprite.setData('speechEl', el);

    const timer = this.time.delayedCall(5000, () => {
      el.remove();
      sprite.setData('speechEl', null);
    });
    sprite.setData('speechTimer', timer);

    this._updateSpriteLabels(sprite);
  }

  buildMeetingRooms() {
    // Build lobby (cols 6-17, rows 31-38)
    this.buildLobby();
    // Room 1 (left): cols 0-5, rows 31-36, door on right wall (col 5, rows 33-34)
    this.buildMeetingRoom(0, 5, 31, 36, 'right', 5, 33, 34);
    // Room 2 (above): cols 8-15, rows 25-30, door on bottom wall (cols 11-12, row 30)
    this.buildMeetingRoom(8, 15, 25, 30, 'bottom', null, 11, 12);
    // Room 3 (right): cols 18-23, rows 31-36, door on left wall (col 18, rows 33-34)
    this.buildMeetingRoom(18, 23, 31, 36, 'left', 18, 33, 34);

    // Force all lobby door positions walkable AFTER all room builds
    // Lobby door to Room 1 (col 6, rows 34-35)
    this.collisionMap[34][6] = WALKABLE;
    this.collisionMap[35][6] = WALKABLE;
    // Lobby door to Room 2 (cols 11-12, row 31)
    this.collisionMap[31][11] = WALKABLE;
    this.collisionMap[31][12] = WALKABLE;
    // Lobby door to Room 3 (col 17, rows 34-35)
    this.collisionMap[34][17] = WALKABLE;
    this.collisionMap[35][17] = WALKABLE;
    // Lobby exit door (cols 11-12, row 38)
    this.collisionMap[38][11] = WALKABLE;
    this.collisionMap[38][12] = WALKABLE;
    // Room 1 return door (col 5, rows 33-34)
    this.collisionMap[33][5] = WALKABLE;
    this.collisionMap[34][5] = WALKABLE;
    // Room 2 return door (cols 11-12, row 30)
    this.collisionMap[30][11] = WALKABLE;
    this.collisionMap[30][12] = WALKABLE;
    // Room 3 return door (col 18, rows 33-34)
    this.collisionMap[33][18] = WALKABLE;
    this.collisionMap[34][18] = WALKABLE;

    // "REUS" sign on the wall above the door (col 6, row 0)
    this.meetingLabels = [];
    const sign = this.add.image(6 * TILE + TILE / 2, 0.5 * TILE, 'reus-sign').setDepth(9999);
    this.meetingLabels.push(sign);
  }

  buildLobby() {
    // Lobby: cols 6-17, rows 31-38 (12w x 8h)
    const cS = 6, cE = 17, rS = 31, rE = 38;

    // Door tile positions to skip in wall loops (only the single tile with the door graphic)
    const leftDoorRows = new Set([34]);
    const rightDoorRows = new Set([34]);
    const topDoorCols = new Set([11]);
    const bottomDoorCols = new Set([11]);

    // Top wall (skip door cols)
    for (let col = cS; col <= cE; col++) {
      if (topDoorCols.has(col)) continue;
      this.placeSolid('wall-dark', col, rS);
    }
    // Bottom wall (skip door cols)
    for (let col = cS; col <= cE; col++) {
      if (bottomDoorCols.has(col)) continue;
      this.placeSolid('wall-dark', col, rE);
    }
    // Left wall (skip door rows)
    for (let row = rS; row <= rE; row++) {
      if (leftDoorRows.has(row)) continue;
      this.placeSolid('wall-dark', cS, row);
    }
    // Right wall (skip door rows)
    for (let row = rS; row <= rE; row++) {
      if (rightDoorRows.has(row)) continue;
      this.placeSolid('wall-dark', cE, row);
    }

    // Floor (interior: cols 7-16, rows 32-37)
    for (let row = rS + 1; row <= rE - 1; row++) {
      for (let col = cS + 1; col <= cE - 1; col++) {
        this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, 'lobby-floor');
        this.collisionMap[row][col] = WALKABLE;
      }
    }

    // --- Doors on lobby walls (single door tile, no gaps) ---

    // Door to Room 1 (left wall, col 6, row 34) — single door tile
    this.add.image(cS * TILE + TILE / 2, 34 * TILE + TILE / 2, 'meeting-door-1').setDepth(34 + 0.1);
    this.collisionMap[34][cS] = WALKABLE;
    this.collisionMap[35][cS] = WALKABLE;

    // Door to Room 2 (top wall, col 11, row 31) — single door tile
    this.add.image(11 * TILE + TILE / 2, rS * TILE + TILE / 2, 'meeting-door-2').setDepth(rS + 0.1);
    this.collisionMap[rS][11] = WALKABLE;
    this.collisionMap[rS][12] = WALKABLE;

    // Door to Room 3 (right wall, col 17, row 34) — single door tile
    this.add.image(cE * TILE + TILE / 2, 34 * TILE + TILE / 2, 'meeting-door-3').setDepth(34 + 0.1);
    this.collisionMap[34][cE] = WALKABLE;
    this.collisionMap[35][cE] = WALKABLE;

    // Exit door at bottom wall (col 11, row 38) — single door tile
    this.add.image(11 * TILE + TILE / 2, rE * TILE + TILE / 2, 'lobby-exit-door').setDepth(rE + 0.1);
    this.collisionMap[rE][11] = WALKABLE;
    this.collisionMap[rE][12] = WALKABLE;

    // "VOLVER" text above exit door
    this.add.text(11.5 * TILE, (rE - 0.3) * TILE, 'VOLVER', {
      fontFamily: 'Arial', fontSize: '7px', color: '#f5a623', fontStyle: 'bold',
      resolution: 4,
    }).setOrigin(0.5, 1).setDepth(9999);
  }

  buildMeetingRoom(colStart, colEnd, rowStart, rowEnd, doorWall, doorFixedCoord, doorCoord1, doorCoord2) {
    // Walls
    for (let col = colStart; col <= colEnd; col++) {
      this.placeSolid('wall-dark', col, rowStart);
      this.placeSolid('wall-dark', col, rowEnd);
    }
    for (let row = rowStart; row <= rowEnd; row++) {
      this.placeSolid('wall-dark', colStart, row);
      this.placeSolid('wall-dark', colEnd, row);
    }
    // Floor
    for (let row = rowStart + 1; row <= rowEnd - 1; row++) {
      for (let col = colStart + 1; col <= colEnd - 1; col++) {
        this.add.image(col * TILE + TILE / 2, row * TILE + TILE / 2, 'meeting-floor');
        this.collisionMap[row][col] = WALKABLE;
      }
    }
    // Conference table in center (2 wide x 2 tall)
    const centerCol = Math.floor((colStart + colEnd) / 2);
    const centerRow = Math.floor((rowStart + rowEnd) / 2);
    this.placeSolid('conference-table', centerCol, centerRow - 1);
    this.placeSolid('conference-table', centerCol + 1, centerRow - 1);
    this.placeSolid('conference-table', centerCol, centerRow);
    this.placeSolid('conference-table', centerCol + 1, centerRow);

    // Return door on the specified wall
    if (doorWall === 'bottom') {
      // Door on bottom wall (2 tiles wide)
      this.add.image(doorCoord1 * TILE + TILE / 2, rowEnd * TILE + TILE / 2, 'meeting-return-door').setDepth(rowEnd);
      this.collisionMap[rowEnd][doorCoord1] = WALKABLE;
      this.add.image(doorCoord2 * TILE + TILE / 2, rowEnd * TILE + TILE / 2, 'meeting-return-door').setDepth(rowEnd);
      this.collisionMap[rowEnd][doorCoord2] = WALKABLE;
    } else if (doorWall === 'right') {
      // Door on right wall (2 tiles tall)
      this.add.image(colEnd * TILE + TILE / 2, doorCoord1 * TILE + TILE / 2, 'meeting-return-door').setDepth(doorCoord1);
      this.collisionMap[doorCoord1][colEnd] = WALKABLE;
      this.add.image(colEnd * TILE + TILE / 2, doorCoord2 * TILE + TILE / 2, 'meeting-return-door').setDepth(doorCoord2);
      this.collisionMap[doorCoord2][colEnd] = WALKABLE;
    } else if (doorWall === 'left') {
      // Door on left wall (2 tiles tall)
      this.add.image(colStart * TILE + TILE / 2, doorCoord1 * TILE + TILE / 2, 'meeting-return-door').setDepth(doorCoord1);
      this.collisionMap[doorCoord1][colStart] = WALKABLE;
      this.add.image(colStart * TILE + TILE / 2, doorCoord2 * TILE + TILE / 2, 'meeting-return-door').setDepth(doorCoord2);
      this.collisionMap[doorCoord2][colStart] = WALKABLE;
    }

    // Wall decorations
    // Whiteboard on top wall (center, 2 tiles wide)
    this.add.image(centerCol * TILE + TILE / 2, rowStart * TILE + TILE / 2, 'whiteboard').setDepth(rowStart + 0.1);
    this.add.image((centerCol + 1) * TILE + TILE / 2, rowStart * TILE + TILE / 2, 'whiteboard').setDepth(rowStart + 0.1);
    // Wall clock
    if (doorWall !== 'left') {
      this.add.image(colStart * TILE + TILE / 2, (rowStart + 2) * TILE + TILE / 2, 'wall-clock').setDepth(rowStart + 2.1);
    }
    // Wall painting
    if (doorWall !== 'right') {
      this.add.image(colEnd * TILE + TILE / 2, (rowStart + 2) * TILE + TILE / 2, 'wall-painting').setDepth(rowStart + 2.1);
    }
  }

  setupMeetingListeners() {
    // Pending teleport data while waiting for server response
    this._pendingMeetingTeleport = null;

    socketManager.on('meeting:updated', (data) => {
      const { roomId, owner, maxCapacity, playerIds } = data;
      // If we just tried to join and this is the response
      if (this._pendingMeetingTeleport && this._pendingMeetingTeleport.roomId === roomId) {
        if (playerIds.includes(this.localId)) {
          // Success — teleport the player
          const tp = this._pendingMeetingTeleport;
          const localSprite = this.players.get(this.localId);
          if (localSprite) {
            localSprite.setData('gridX', tp.toCol);
            localSprite.setData('gridY', tp.toRow);
            localSprite.x = tp.toCol * TILE + TILE / 2;
            localSprite.y = tp.toRow * TILE + TILE / 2;
            localSprite.setDepth(tp.toRow + 0.5);
            this._updateSpriteLabels(localSprite);
            socketManager.sendMove(tp.toCol, tp.toRow);
          }
          this.currentMeetingRoom = roomId;
          this.currentRoom = null; // Clear lobby/room state when entering meeting
          this._pendingMeetingTeleport = null;
          // Restrict camera to meeting room bounds
          this._setMeetingCameraBounds(roomId);
        }
      }
      // Update meeting room players if we're in this room
      if (this.currentMeetingRoom === roomId) {
        this.meetingRoomPlayers = new Set(playerIds);
        this.updateProximityVideo();
        this._updateMeetingUI(owner, maxCapacity, playerIds);
      }
    });

    socketManager.on('meeting:full', ({ roomId }) => {
      this._pendingMeetingTeleport = null;
      this._showMeetingFullMessage();
    });

    // Setup fullcam button
    const fullcamBtn = document.getElementById('fullcam-btn');
    fullcamBtn.addEventListener('click', () => {
      this.toggleFullCam();
    });

    // Setup meeting settings button
    const settingsBtn = document.getElementById('meeting-settings-btn');
    settingsBtn.addEventListener('click', () => {
      this.cycleMeetingCapacity();
    });
  }

  tryJoinMeeting(roomId, toCol, toRow) {
    this._pendingMeetingTeleport = { roomId, toCol, toRow };
    socketManager.joinMeeting(roomId);
  }

  leaveMeetingRoom(returnToLobby) {
    if (!this.currentMeetingRoom) return;
    socketManager.leaveMeeting(this.currentMeetingRoom);
    this.currentMeetingRoom = null;
    this.meetingRoomPlayers = new Set();
    if (returnToLobby) {
      // Return to lobby — zoom camera to lobby bounds instead of full office
      this.currentRoom = 'lobby-reuniones';
      this._setRoomCameraBounds('lobby-reuniones');
    } else {
      // Restore full map camera bounds, zoom, and follow
      this.currentRoom = null;
      this._restoreCamera();
    }
    // Hide meeting UI
    document.getElementById('fullcam-btn').classList.add('fullcam-hidden');
    document.getElementById('meeting-capacity-wrapper').classList.add('meeting-btn-hidden');
    // Auto-minimize if in fullcam mode
    if (this.isFullCamMode) {
      this.toggleFullCam();
    }
    this.updateProximityVideo();
  }

  _setMeetingCameraBounds(roomId) {
    const rooms = {
      'meet-1': { col: 0, row: 31, w: 6, h: 6 },
      'meet-2': { col: 8, row: 25, w: 8, h: 6 },
      'meet-3': { col: 18, row: 31, w: 6, h: 6 },
    };
    this._zoomToRoom(rooms[roomId]);
  }

  _setRoomCameraBounds(roomId) {
    const rooms = {
      'secret': { col: 8, row: 17, w: 6, h: 6 },
      'bath-women': { col: 22, row: 17, w: 7, h: 7 },
      'bath-men': { col: 30, row: 17, w: 7, h: 7 },
      'lobby-reuniones': { col: 6, row: 31, w: 12, h: 8 },
    };
    this._zoomToRoom(rooms[roomId]);
  }

  _zoomToRoom(r) {
    if (!r) return;
    const cam = this.cameras.main;
    const viewW = cam.width;
    const viewH = cam.height;
    const viewAspect = viewW / viewH;
    const roomW = r.w * TILE;
    const roomH = r.h * TILE;
    const roomAspect = roomW / roomH;

    // Expand bounds to match viewport aspect ratio (centered on room)
    let boundsW, boundsH;
    if (roomAspect < viewAspect) {
      // Room is narrower than viewport — expand width
      boundsH = roomH;
      boundsW = roomH * viewAspect;
    } else {
      // Room is wider — expand height
      boundsW = roomW;
      boundsH = roomW / viewAspect;
    }

    const centerX = (r.col + r.w / 2) * TILE;
    const centerY = (r.row + r.h / 2) * TILE;
    const zoom = viewH / boundsH;

    cam.stopFollow();
    cam.setZoom(zoom);
    cam.setBounds(
      centerX - boundsW / 2, centerY - boundsH / 2,
      boundsW, boundsH
    );
    cam.centerOn(centerX, centerY);
  }

  _restoreCamera() {
    const localSprite = this.players.get(this.localId);
    this.cameras.main.setZoom(1);
    // Restrict camera to office area (rows 0-15) so hidden rooms below aren't visible
    this.cameras.main.setBounds(0, 0, MAP_COLS * TILE, 16 * TILE);
    if (localSprite) {
      this.cameras.main.startFollow(localSprite, true, 0.15, 0.15);
    }
  }

  _updateMeetingUI(owner, maxCapacity, playerIds) {
    const fullcamBtn = document.getElementById('fullcam-btn');
    const wrapper = document.getElementById('meeting-capacity-wrapper');
    const settingsBtn = document.getElementById('meeting-settings-btn');
    fullcamBtn.classList.remove('fullcam-hidden');
    if (owner === this.localId) {
      wrapper.classList.remove('meeting-btn-hidden');
      settingsBtn.textContent = `${maxCapacity}/5`;
    } else {
      wrapper.classList.add('meeting-btn-hidden');
    }
  }

  _showMeetingFullMessage() {
    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;
    const container = this._getOverlayContainer();
    const el = document.createElement('div');
    el.textContent = 'Sala llena';
    el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:rgba(220,20,60,0.9);color:#fff;font:bold 12px Arial,sans-serif;padding:6px 12px;border-radius:6px;pointer-events:none;z-index:9999;';
    container.appendChild(el);
    const pos = this._worldToScreen(localSprite.x, localSprite.y - TILE);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    this.time.delayedCall(2000, () => el.remove());
  }

  toggleFullCam() {
    const panel = document.getElementById('cam-panel');
    const btn = document.getElementById('fullcam-btn');
    if (this.isFullCamMode) {
      panel.classList.remove('fullcam-mode');
      btn.textContent = 'Pantalla completa';
      this.isFullCamMode = false;
      // Remove hint if present
      const hint = document.getElementById('fullcam-hint');
      if (hint) hint.remove();
    } else {
      // If camera is off, show hint instead of expanding
      if (!webRTCManager.cameraOn) {
        this._showFullCamHint();
        return;
      }
      panel.classList.add('fullcam-mode');
      btn.textContent = 'Minimizar camara';
      this.isFullCamMode = true;
    }
  }

  _showFullCamHint() {
    // Remove previous hint if any
    const existing = document.getElementById('fullcam-hint');
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.id = 'fullcam-hint';
    hint.textContent = 'Clic arriba a la izquierda en "Abrir cam" asi ven tu camara';
    hint.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(245,166,35,0.95);color:#1a1a2e;font:bold 12px Arial,sans-serif;padding:10px 18px;border-radius:8px;z-index:10003;pointer-events:none;text-align:center;max-width:340px;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
    document.body.appendChild(hint);
    this.time.delayedCall(4000, () => hint.remove());
  }

  cycleMeetingCapacity() {
    if (!this.currentMeetingRoom) return;
    const settingsBtn = document.getElementById('meeting-settings-btn');
    const currentText = settingsBtn.textContent;
    const currentMax = parseInt(currentText.split('/')[0], 10) || 2;
    const nextMax = currentMax >= 5 ? 2 : currentMax + 1;
    socketManager.setMeetingCapacity(this.currentMeetingRoom, nextMax);
  }

  // --- BBQ game ---

  setupBBQ() {
    this.bbqOpen = false;
    this.bbqNearby = false;
    this._bbqAnimFrame = null;
    this._bbqClickHandler = null;
    this.bbqCols = [35, 36];
    this.bbqRow = 2;
    document.getElementById('bbq-close-btn').addEventListener('click', () => this.closeBBQ());
  }

  checkBBQProximity(px, py) {
    if (this.bbqOpen || this.arcadeOpen || this.tvOpen || this.guitarOpen || this.toiletOpen) return;
    let near = false;
    for (const c of this.bbqCols) {
      if (Math.max(Math.abs(px - c), Math.abs(py - this.bbqRow)) <= 1) { near = true; break; }
    }
    const wasNearby = this.bbqNearby;
    this.bbqNearby = near;
    if (near && !wasNearby) this.openBBQ();
  }

  openBBQ() {
    this.bbqOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();
    document.getElementById('bbq-modal').classList.remove('bbq-modal-hidden');
    this.runBBQGame();
  }

  closeBBQ() {
    this.bbqOpen = false;
    this.input.keyboard.enabled = true;
    if (this._bbqAnimFrame) { cancelAnimationFrame(this._bbqAnimFrame); this._bbqAnimFrame = null; }
    const canvas = document.getElementById('bbq-canvas');
    if (this._bbqClickHandler) { canvas.removeEventListener('click', this._bbqClickHandler); this._bbqClickHandler = null; }
    document.getElementById('bbq-modal').classList.add('bbq-modal-hidden');
  }

  runBBQGame() {
    const canvas = document.getElementById('bbq-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const scoreEl = document.getElementById('bbq-score');
    const hintEl = document.getElementById('bbq-hint');

    let score = 0;
    let frame = 0;

    // Meat pieces on the grill
    const meats = [
      { x: 60, y: 160, w: 70, h: 28, type: 'chori', cook: 0, flipped: false, burned: false, done: false },
      { x: 170, y: 155, w: 75, h: 30, type: 'asado', cook: 0, flipped: false, burned: false, done: false },
      { x: 290, y: 160, w: 65, h: 26, type: 'chori', cook: 0, flipped: false, burned: false, done: false },
      { x: 100, y: 220, w: 80, h: 35, type: 'vacio', cook: 0, flipped: false, burned: false, done: false },
      { x: 240, y: 225, w: 70, h: 30, type: 'asado', cook: 0, flipped: false, burned: false, done: false },
      { x: 350, y: 218, w: 55, h: 24, type: 'chori', cook: 0, flipped: false, burned: false, done: false },
    ];

    // Fire particles
    const fires = [];
    // Smoke particles
    const smokes = [];

    const onClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);

      for (const m of meats) {
        if (m.done || m.burned) continue;
        if (mx >= m.x - m.w / 2 && mx <= m.x + m.w / 2 &&
            my >= m.y - m.h / 2 && my <= m.y + m.h / 2) {
          if (!m.flipped && m.cook >= 80) {
            // Perfect flip!
            m.flipped = true;
            m.cook = 0;
            score += 50;
            // Sizzle sparks
            for (let i = 0; i < 8; i++) {
              fires.push({
                x: m.x + (Math.random() - 0.5) * m.w,
                y: m.y,
                dx: (Math.random() - 0.5) * 3,
                dy: -Math.random() * 4 - 2,
                life: 15,
                color: '#ffdd44',
              });
            }
          } else if (!m.flipped && m.cook >= 40) {
            // Early flip — ok but not ideal
            m.flipped = true;
            m.cook = 0;
            score += 20;
          } else if (m.flipped && m.cook >= 80) {
            // Done! Remove from grill
            m.done = true;
            score += 100;
          } else if (m.flipped && m.cook >= 40) {
            m.done = true;
            score += 40;
          }
          break;
        }
      }
    };
    canvas.addEventListener('click', onClick);
    this._bbqClickHandler = onClick;

    const gameLoop = () => {
      if (!this.bbqOpen) return;
      frame++;

      // Cook meats
      meats.forEach((m) => {
        if (m.done || m.burned) return;
        m.cook += 0.4;
        if (m.cook > 150) m.burned = true;
      });

      // Spawn fire particles from beneath the grill
      if (frame % 2 === 0) {
        const fx = 40 + Math.random() * (W - 80);
        fires.push({
          x: fx, y: 280 + Math.random() * 20,
          dx: (Math.random() - 0.5) * 1.5,
          dy: -Math.random() * 3 - 1.5,
          life: 20 + Math.random() * 15,
          color: Math.random() > 0.4 ? '#ff6622' : (Math.random() > 0.5 ? '#ffaa22' : '#ff3300'),
        });
      }

      // Spawn smoke
      if (frame % 4 === 0) {
        smokes.push({
          x: 60 + Math.random() * (W - 120),
          y: 120 + Math.random() * 30,
          dx: (Math.random() - 0.5) * 0.8,
          dy: -Math.random() * 1.2 - 0.5,
          r: 8 + Math.random() * 12,
          life: 60 + Math.random() * 40,
          maxLife: 100,
        });
      }

      // Update particles
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.x += f.dx; f.y += f.dy; f.life--;
        if (f.life <= 0) fires.splice(i, 1);
      }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.x += s.dx; s.y += s.dy; s.r += 0.3; s.life--;
        if (s.life <= 0) smokes.splice(i, 1);
      }

      // --- Draw ---
      // Background (dark, outdoor night)
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, W, H);

      // Grill body (brick base)
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(20, 270, W - 40, 90);
      ctx.fillStyle = '#4a2a1a';
      ctx.fillRect(25, 275, W - 50, 80);
      // Brick lines
      ctx.strokeStyle = '#3a1a0a';
      ctx.lineWidth = 1;
      for (let y = 280; y < 355; y += 15) {
        ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(W - 25, y); ctx.stroke();
      }

      // Fire glow under grill
      const glowGrad = ctx.createRadialGradient(W / 2, 300, 20, W / 2, 300, 180);
      glowGrad.addColorStop(0, 'rgba(255, 100, 0, 0.3)');
      glowGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 200, W, 180);

      // Fire particles (behind grill grate)
      fires.forEach((f) => {
        ctx.globalAlpha = f.life / 35;
        ctx.fillStyle = f.color;
        const sz = 3 + (f.life / 35) * 5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, sz, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Grill grate
      ctx.fillStyle = '#333';
      ctx.fillRect(30, 268, W - 60, 5);
      // Grate bars
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      for (let x = 40; x < W - 40; x += 12) {
        ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, 268); ctx.stroke();
      }
      // Cross bars
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 2;
      [155, 185, 215, 245].forEach((y) => {
        ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(W - 35, y); ctx.stroke();
      });

      // Meats
      meats.forEach((m) => {
        if (m.done) return;
        const cookPct = Math.min(m.cook / 150, 1);

        // Color based on cooking state
        let color;
        if (m.burned) {
          color = '#1a1a1a';
        } else if (m.cook < 40) {
          // Raw — pink/red
          color = m.type === 'chori' ? '#d4826a' : '#cc6666';
        } else if (m.cook < 80) {
          // Cooking — browning
          color = m.type === 'chori' ? '#b86040' : '#aa5533';
        } else if (m.cook < 120) {
          // Well done — dark brown
          color = m.type === 'chori' ? '#8a4422' : '#884422';
        } else {
          // About to burn
          color = '#553318';
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(m.x + 2, m.y + m.h / 2 + 3, m.w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Meat body
        ctx.fillStyle = color;
        ctx.beginPath();
        if (m.type === 'chori') {
          // Chorizo — rounded rectangle
          ctx.roundRect(m.x - m.w / 2, m.y - m.h / 2, m.w, m.h, m.h / 2);
        } else {
          // Asado/vacio — irregular shape
          ctx.roundRect(m.x - m.w / 2, m.y - m.h / 2, m.w, m.h, 5);
        }
        ctx.fill();

        // Grill marks
        if (m.cook > 30) {
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 2;
          const marks = m.type === 'chori' ? 3 : 4;
          for (let i = 0; i < marks; i++) {
            const mx = m.x - m.w / 3 + (i * m.w) / (marks + 0.5);
            ctx.beginPath();
            ctx.moveTo(mx, m.y - m.h / 2 + 3);
            ctx.lineTo(mx, m.y + m.h / 2 - 3);
            ctx.stroke();
          }
        }

        // Fat sizzle sparks on hot meats
        if (m.cook > 60 && m.cook < 130 && !m.burned && frame % 8 === 0) {
          fires.push({
            x: m.x + (Math.random() - 0.5) * m.w * 0.6,
            y: m.y + m.h / 2,
            dx: (Math.random() - 0.5) * 2,
            dy: -Math.random() * 2 - 1,
            life: 10,
            color: '#ffee88',
          });
        }

        // "Flip!" indicator when ready
        if (!m.burned && !m.done) {
          if ((!m.flipped && m.cook >= 80 && m.cook < 120) ||
              (m.flipped && m.cook >= 80 && m.cook < 120)) {
            ctx.fillStyle = '#00ff66';
            ctx.font = 'bold 10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            const label = m.flipped ? 'Listo!' : 'Dar vuelta!';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frame * 0.15);
            ctx.fillText(label, m.x, m.y - m.h / 2 - 8);
            ctx.globalAlpha = 1;
          }
          if (m.cook > 120 && !m.burned) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 9px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frame * 0.2);
            ctx.fillText('Se quema!', m.x, m.y - m.h / 2 - 8);
            ctx.globalAlpha = 1;
          }
        }

        // Burned X
        if (m.burned) {
          ctx.strokeStyle = '#ff2222';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(m.x - 12, m.y - 12); ctx.lineTo(m.x + 12, m.y + 12);
          ctx.moveTo(m.x + 12, m.y - 12); ctx.lineTo(m.x - 12, m.y + 12);
          ctx.stroke();
        }
      });

      // Smoke (on top of everything)
      smokes.forEach((s) => {
        ctx.globalAlpha = (s.life / s.maxLife) * 0.35;
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Score
      const doneCount = meats.filter((m) => m.done).length;
      const burnedCount = meats.filter((m) => m.burned).length;
      scoreEl.textContent = `Puntaje: ${score}  |  Listas: ${doneCount}/${meats.length}  |  Quemadas: ${burnedCount}`;

      // All done or burned
      if (meats.every((m) => m.done || m.burned)) {
        hintEl.textContent = burnedCount === 0 ? 'Asado perfecto!' : `${burnedCount} se quemaron...`;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = burnedCount === 0 ? '#00ff66' : '#f5a623';
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(burnedCount === 0 ? 'ASADO PERFECTO!' : 'FIN DEL ASADO', W / 2, H / 2 - 10);
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText(`Puntaje: ${score}`, W / 2, H / 2 + 20);
        return;
      }

      hintEl.textContent = 'Click en la carne para darla vuelta!';
      this._bbqAnimFrame = requestAnimationFrame(gameLoop);
    };

    this._bbqAnimFrame = requestAnimationFrame(gameLoop);
  }

  // --- Toilet game ---

  setupToiletGame() {
    this.toiletOpen = false;
    this.toiletNearby = false;
    this._toiletAnimFrame = null;
    this._toiletMouseMove = null;
    document.getElementById('toilet-close-btn').addEventListener('click', () => this.closeToiletGame());
    // Toilet positions: women's (23,22)(25,22), men's (31,22)(33,22)
    this.toiletPositions = [
      { col: 23, row: 22 }, { col: 25, row: 22 },
      { col: 31, row: 22 }, { col: 33, row: 22 },
    ];
  }

  checkToiletProximity(px, py) {
    if (this.toiletOpen || this.arcadeOpen || this.tvOpen || this.guitarOpen) return;
    let near = false;
    for (const t of this.toiletPositions) {
      if (Math.max(Math.abs(px - t.col), Math.abs(py - t.row)) <= 1) {
        near = true;
        break;
      }
    }
    const wasNearby = this.toiletNearby;
    this.toiletNearby = near;
    if (near && !wasNearby) this.openToiletGame();
  }

  openToiletGame() {
    this.toiletOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();
    document.getElementById('toilet-modal').classList.remove('toilet-modal-hidden');
    this.runToiletGame();
  }

  closeToiletGame() {
    this.toiletOpen = false;
    this.input.keyboard.enabled = true;
    if (this._toiletAnimFrame) {
      cancelAnimationFrame(this._toiletAnimFrame);
      this._toiletAnimFrame = null;
    }
    if (this._toiletMouseMove) {
      document.getElementById('toilet-canvas').removeEventListener('mousemove', this._toiletMouseMove);
      this._toiletMouseMove = null;
    }
    document.getElementById('toilet-modal').classList.add('toilet-modal-hidden');
  }

  runToiletGame() {
    const canvas = document.getElementById('toilet-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const scoreEl = document.getElementById('toilet-score');

    // Toilet bowl target area
    const bowl = { x: W / 2, y: H / 2 + 40, rx: 50, ry: 35 };

    // Stream state
    const stream = { x: W / 2, y: 60 };
    let mouseX = W / 2;
    let mouseY = 60;
    let score = 0;
    let hits = 0;
    let misses = 0;
    let timer = 15 * 60; // 15 seconds at 60fps
    let drops = [];
    let splashes = [];

    // Wobble (makes aiming harder over time)
    let wobblePhase = 0;

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * (W / rect.width);
      mouseY = (e.clientY - rect.top) * (H / rect.height);
    };
    canvas.addEventListener('mousemove', onMouseMove);
    this._toiletMouseMove = onMouseMove;

    const isInBowl = (dx, dy) => {
      return (dx * dx) / (bowl.rx * bowl.rx) + (dy * dy) / (bowl.ry * bowl.ry) <= 1;
    };

    const gameLoop = () => {
      if (!this.toiletOpen) return;
      timer--;

      // Wobble increases over time
      wobblePhase += 0.08;
      const wobbleAmt = 8 + (1 - timer / (15 * 60)) * 20;
      const wobX = Math.sin(wobblePhase * 2.3) * wobbleAmt;
      const wobY = Math.cos(wobblePhase * 1.7) * wobbleAmt * 0.5;

      // Stream follows mouse with wobble
      stream.x = mouseX + wobX;
      stream.y = Math.max(60, mouseY) + wobY;

      // Spawn drops from stream tip
      if (timer > 0) {
        for (let i = 0; i < 3; i++) {
          drops.push({
            x: stream.x + (Math.random() - 0.5) * 6,
            y: stream.y,
            dy: 4 + Math.random() * 3,
            dx: (Math.random() - 0.5) * 2 + wobX * 0.05,
            life: 80,
          });
        }
      }

      // Update drops
      drops = drops.filter((d) => {
        d.x += d.dx;
        d.y += d.dy;
        d.dy += 0.15; // gravity
        d.life--;

        // Check if hit bowl area
        if (d.y >= bowl.y - 10 && d.y <= bowl.y + 20) {
          const dx = d.x - bowl.x;
          const dy = d.y - bowl.y;
          if (isInBowl(dx, dy)) {
            hits++;
            score += 1;
            // Tiny splash
            splashes.push({ x: d.x, y: d.y, r: 3, life: 10 });
            return false;
          }
        }

        // Hit floor
        if (d.y > H - 20) {
          misses++;
          splashes.push({ x: d.x, y: H - 20, r: 4, life: 12 });
          return false;
        }

        return d.life > 0;
      });

      // Update splashes
      splashes = splashes.filter((s) => {
        s.r += 0.3;
        s.life--;
        return s.life > 0;
      });

      // --- Draw ---
      // Bathroom wall
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(0, 0, W, H);
      // Tile grid
      ctx.strokeStyle = '#d0c8b8';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Floor
      ctx.fillStyle = '#c0b8a8';
      ctx.fillRect(0, H - 20, W, 20);

      // --- Realistic toilet (top-down view) ---
      const bx = bowl.x, by = bowl.y;

      // Shadow under toilet
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.ellipse(bx + 3, by + 50, 58, 30, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tank (back)
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.roundRect(bx - 38, by - 70, 76, 35, 6);
      ctx.fill();
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Tank lid line
      ctx.strokeStyle = '#d5d5d5';
      ctx.beginPath();
      ctx.moveTo(bx - 32, by - 53);
      ctx.lineTo(bx + 32, by - 53);
      ctx.stroke();
      // Flush handle
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx + 28, by - 63, 12, 5);
      ctx.fillStyle = '#b0b0b0';
      ctx.beginPath();
      ctx.arc(bx + 40, by - 60, 4, 0, Math.PI * 2);
      ctx.fill();

      // Toilet body (outer shape — rounded trapezoid)
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.moveTo(bx - 40, by - 38);
      ctx.lineTo(bx + 40, by - 38);
      ctx.quadraticCurveTo(bx + 55, by + 10, bx + 45, by + 55);
      ctx.quadraticCurveTo(bx, by + 72, bx - 45, by + 55);
      ctx.quadraticCurveTo(bx - 55, by + 10, bx - 40, by - 38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Seat (outer rim)
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.ellipse(bx, by + 8, bowl.rx + 2, bowl.ry + 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Seat (inner opening — the target)
      ctx.fillStyle = '#d8e4ee';
      ctx.beginPath();
      ctx.ellipse(bx, by + 8, bowl.rx - 4, bowl.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#bcc8d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Water in bowl
      const waterGrad = ctx.createRadialGradient(bx, by + 10, 5, bx, by + 10, bowl.rx - 10);
      waterGrad.addColorStop(0, 'rgba(140, 200, 255, 0.5)');
      waterGrad.addColorStop(1, 'rgba(100, 170, 240, 0.2)');
      ctx.fillStyle = waterGrad;
      ctx.beginPath();
      ctx.ellipse(bx, by + 10, bowl.rx - 12, bowl.ry - 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Water highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(bx - 10, by + 4, 12, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Seat hinge bolts
      ctx.fillStyle = '#b0b0b0';
      ctx.beginPath(); ctx.arc(bx - 30, by - 28, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + 30, by - 28, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#999';
      ctx.beginPath(); ctx.arc(bx - 30, by - 28, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + 30, by - 28, 2, 0, Math.PI * 2); ctx.fill();

      // Drops (yellow stream)
      ctx.fillStyle = '#f5c842';
      drops.forEach((d) => {
        const sz = 2 + Math.random();
        ctx.globalAlpha = d.life / 80;
        ctx.fillRect(d.x - sz / 2, d.y - sz / 2, sz, sz * 1.5);
      });
      ctx.globalAlpha = 1;

      // Splashes
      splashes.forEach((s) => {
        const inBowl = isInBowl(s.x - bowl.x, s.y - bowl.y);
        ctx.strokeStyle = inBowl ? 'rgba(100,180,255,0.4)' : 'rgba(245,200,66,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshair at stream position
      if (timer > 0) {
        ctx.strokeStyle = '#f5a623';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(stream.x, stream.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(stream.x - 14, stream.y);
        ctx.lineTo(stream.x + 14, stream.y);
        ctx.moveTo(stream.x, stream.y - 14);
        ctx.lineTo(stream.x, stream.y + 14);
        ctx.stroke();
      }

      // Timer bar
      const pct = Math.max(0, timer / (15 * 60));
      ctx.fillStyle = '#333';
      ctx.fillRect(20, 14, W - 40, 12);
      ctx.fillStyle = pct > 0.3 ? '#4caf50' : '#f44336';
      ctx.fillRect(20, 14, (W - 40) * pct, 12);

      // Accuracy
      const total = hits + misses;
      const accuracy = total > 0 ? Math.round((hits / total) * 100) : 100;
      scoreEl.textContent = `Puntaje: ${score}  |  Punteria: ${accuracy}%`;

      // Game over
      if (timer <= 0 && drops.length === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = accuracy >= 80 ? '#4caf50' : accuracy >= 50 ? '#f5a623' : '#f44336';
        ctx.font = '22px "Press Start 2P", monospace';
        ctx.fillText(accuracy >= 80 ? 'EXCELENTE!' : accuracy >= 50 ? 'BIEN...' : 'DESASTRE!', W / 2, H / 2 - 30);

        ctx.fillStyle = '#fff';
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText(`Punteria: ${accuracy}%`, W / 2, H / 2 + 10);
        ctx.fillText(`Puntaje: ${score}`, W / 2, H / 2 + 35);

        // Auto close after 3 seconds
        setTimeout(() => this.closeToiletGame(), 3000);
        return;
      }

      this._toiletAnimFrame = requestAnimationFrame(gameLoop);
    };

    this._toiletAnimFrame = requestAnimationFrame(gameLoop);
  }

  // --- Fridge modal ---

  setupFridge() {
    this.fridgeOpen = false;
    this.fridgeNearby = false;
    this.fridgeCol = 23;
    this.fridgeRow = 1;
    document.getElementById('fridge-close-btn').addEventListener('click', () => this.closeFridge());
  }

  checkFridgeProximity(px, py) {
    if (this.fridgeOpen || this.arcadeOpen || this.tvOpen || this.guitarOpen) return;
    const dist = Math.max(Math.abs(px - this.fridgeCol), Math.abs(py - this.fridgeRow));
    const wasNearby = this.fridgeNearby;
    this.fridgeNearby = dist <= 1;
    if (this.fridgeNearby && !wasNearby) this.openFridge();
  }

  openFridge() {
    this.fridgeOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();
    document.getElementById('fridge-modal').classList.remove('fridge-modal-hidden');
  }

  closeFridge() {
    this.fridgeOpen = false;
    this.input.keyboard.enabled = true;
    document.getElementById('fridge-modal').classList.add('fridge-modal-hidden');
  }

  // --- Guitar modal ---

  setupGuitar() {
    this.guitarOpen = false;
    this.guitarNearby = false;
    this.guitarCol = 25;
    this.guitarRow = 13;
    this._guitarNoteInterval = null;

    document.getElementById('guitar-close-btn').addEventListener('click', () => this.closeGuitar());
  }

  checkGuitarProximity(px, py) {
    if (this.guitarOpen || this.arcadeOpen || this.tvOpen) return;
    const dist = Math.max(Math.abs(px - this.guitarCol), Math.abs(py - this.guitarRow));
    const wasNearby = this.guitarNearby;
    this.guitarNearby = dist <= 1;
    if (this.guitarNearby && !wasNearby) this.openGuitar();
  }

  openGuitar() {
    this.guitarOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();

    // Draw big avatar
    const avatarCanvas = document.getElementById('guitar-avatar');
    const actx = avatarCanvas.getContext('2d');
    actx.imageSmoothingEnabled = false;
    actx.clearRect(0, 0, 256, 256);
    try {
      const tex = this.textures.get(`worker-${this.localId}-0`);
      if (tex && tex.getSourceImage()) {
        actx.drawImage(tex.getSourceImage(), 0, 0, 16, 16, 0, 0, 256, 256);
      }
    } catch {}

    // Draw the guitar texture without the floor background
    const guitarCanvas = document.getElementById('guitar-instrument');
    const gctx = guitarCanvas.getContext('2d');
    gctx.imageSmoothingEnabled = false;
    gctx.clearRect(0, 0, 128, 128);
    try {
      const gTex = this.textures.get('guitar');
      if (gTex && gTex.getSourceImage()) {
        // Draw to a temp canvas first to remove floor pixels
        const tmp = document.createElement('canvas');
        tmp.width = 16; tmp.height = 16;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(gTex.getSourceImage(), 0, 0);
        const imgData = tctx.getImageData(0, 0, 16, 16);
        const d = imgData.data;
        // Remove gray floor colors (make transparent)
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          // Floor grays: ~0x8a8078 (138,128,120), ~0x7d756d (125,117,109), ~0x918980 (145,137,128)
          if (r > 100 && r < 160 && g > 90 && g < 150 && b > 85 && b < 140 &&
              Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
            d[i + 3] = 0; // make transparent
          }
        }
        tctx.putImageData(imgData, 0, 0);
        gctx.drawImage(tmp, 0, 0, 16, 16, 0, 0, 128, 128);
      }
    } catch {}

    document.getElementById('guitar-modal').classList.remove('guitar-modal-hidden');

    // Spawn floating music notes
    const notes = ['🎵', '🎶', '🎸', '♪', '♫'];
    const container = document.getElementById('guitar-notes-container');
    container.innerHTML = '';

    this._guitarNoteInterval = setInterval(() => {
      const note = document.createElement('div');
      note.className = 'guitar-note';
      note.textContent = notes[Math.floor(Math.random() * notes.length)];
      const startX = 50 + Math.random() * 300;
      note.style.left = startX + 'px';
      note.style.bottom = '20px';
      note.style.setProperty('--nx', (Math.random() - 0.5) * 120 + 'px');
      container.appendChild(note);
      setTimeout(() => note.remove(), 2500);
    }, 350);
  }

  closeGuitar() {
    this.guitarOpen = false;
    this.input.keyboard.enabled = true;
    document.getElementById('guitar-modal').classList.add('guitar-modal-hidden');
    if (this._guitarNoteInterval) {
      clearInterval(this._guitarNoteInterval);
      this._guitarNoteInterval = null;
    }
    document.getElementById('guitar-notes-container').innerHTML = '';
  }

  // --- TV modal ---

  setupTV() {
    this.tvOpen = false;
    this.tvNearby = false;
    // TV occupies cols 1-2, rows 7-10
    this.tvCols = [1, 2];
    this.tvRows = [7, 8, 9, 10];

    document.getElementById('tv-modal-close').addEventListener('click', () => this.closeTV());
  }

  checkTVProximity(px, py) {
    if (this.tvOpen || this.arcadeOpen) return;
    // Check if adjacent to any TV tile
    let near = false;
    for (const tc of this.tvCols) {
      for (const tr of this.tvRows) {
        const dist = Math.max(Math.abs(px - tc), Math.abs(py - tr));
        if (dist <= 1) { near = true; break; }
      }
      if (near) break;
    }
    const wasNearby = this.tvNearby;
    this.tvNearby = near;
    if (near && !wasNearby) this.openTV();
  }

  openTV() {
    this.tvOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();
    const modal = document.getElementById('tv-modal');
    const iframe = document.getElementById('tv-iframe');
    iframe.src = 'https://www.paisanos.io';
    modal.classList.remove('tv-modal-hidden');
  }

  closeTV() {
    this.tvOpen = false;
    this.input.keyboard.enabled = true;
    const modal = document.getElementById('tv-modal');
    const iframe = document.getElementById('tv-iframe');
    modal.classList.add('tv-modal-hidden');
    iframe.src = '';
  }

  // --- Arcade machine ---

  _arcadeGames() {
    return {
      invaders: { name: 'Invaders', start: startInvaders, thumb: drawInvadersThumb },
      snake: { name: 'Snake', start: startSnake, thumb: drawSnakeThumb },
      pong: { name: 'Pong', start: startPong, thumb: drawPongThumb },
      breakout: { name: 'Breakout', start: startBreakout, thumb: drawBreakoutThumb },
    };
  }

  _loadHighScores() {
    try {
      return JSON.parse(localStorage.getItem('paisanos_arcade_scores')) || {};
    } catch { return {}; }
  }

  _saveHighScore(gameId, score) {
    const scores = this._loadHighScores();
    if (!scores[gameId] || score > scores[gameId]) {
      scores[gameId] = score;
      try { localStorage.setItem('paisanos_arcade_scores', JSON.stringify(scores)); } catch {}
    }
  }

  setupArcade() {
    this.arcadeOpen = false;
    this.arcadeGameRunning = false;
    this.arcadeNearby = false;
    this._activeGame = null;
    this._selectedGameId = null;

    document.getElementById('arcade-cancel-btn').addEventListener('click', () => this.closeArcade());
    document.getElementById('arcade-exit-btn').addEventListener('click', () => this.closeArcade());

    // Game card click handlers
    document.querySelectorAll('.arcade-game-card').forEach((card) => {
      card.addEventListener('click', () => {
        this._selectedGameId = card.dataset.game;
        this.startArcadeGame(card.dataset.game);
      });
    });
  }

  checkArcadeProximity(px, py) {
    if (this.arcadeOpen) return;
    const dist = Math.max(
      Math.abs(px - this.arcadeMachineCol),
      Math.abs(py - this.arcadeMachineRow)
    );
    const wasNearby = this.arcadeNearby;
    this.arcadeNearby = dist <= 1;
    if (this.arcadeNearby && !wasNearby) this.openArcade();
  }

  openArcade() {
    this.arcadeOpen = true;
    this.input.keyboard.enabled = false;
    this.input.keyboard.resetKeys();

    const overlay = document.getElementById('arcade-overlay');
    const selector = document.getElementById('arcade-selector');
    const gameScreen = document.getElementById('arcade-game-screen');
    const buttonsDiv = document.getElementById('arcade-buttons');
    const exitBtn = document.getElementById('arcade-exit-btn');

    overlay.classList.remove('arcade-hidden');
    selector.style.display = 'grid';
    gameScreen.classList.add('arcade-screen-hidden');
    buttonsDiv.style.display = 'flex';
    exitBtn.classList.add('arcade-exit-hidden');

    // Draw thumbnails and load high scores
    const games = this._arcadeGames();
    const scores = this._loadHighScores();
    document.querySelectorAll('.arcade-game-card').forEach((card) => {
      const id = card.dataset.game;
      const game = games[id];
      if (!game) return;
      const thumbCanvas = card.querySelector('.arcade-thumb');
      game.thumb(thumbCanvas);
      const recordEl = card.querySelector('.arcade-game-record');
      recordEl.textContent = `Record: ${scores[id] || 0}`;
    });
  }

  closeArcade() {
    this.stopArcadeGame();
    this.arcadeOpen = false;
    this.input.keyboard.enabled = true;
    document.getElementById('arcade-overlay').classList.add('arcade-hidden');
  }

  startArcadeGame(gameId) {
    // Clean up previous game if any
    if (this._activeGame) {
      this._activeGame.cleanup();
      this._activeGame = null;
    }
    if (this._arcadeKeyDown) {
      window.removeEventListener('keydown', this._arcadeKeyDown, true);
      window.removeEventListener('keyup', this._arcadeKeyUp, true);
    }

    this.arcadeGameRunning = true;
    this._selectedGameId = gameId;

    // Switch from selector to game screen
    document.getElementById('arcade-selector').style.display = 'none';
    document.getElementById('arcade-game-screen').classList.remove('arcade-screen-hidden');
    document.getElementById('arcade-buttons').style.display = 'none';
    document.getElementById('arcade-exit-btn').classList.remove('arcade-exit-hidden');

    const canvas = document.getElementById('arcade-canvas');
    const scoreEl = document.getElementById('arcade-score');
    scoreEl.textContent = 'Puntaje: 0';

    const games = this._arcadeGames();
    const gameDef = games[gameId];
    if (!gameDef) return;

    const onScore = (score) => {
      scoreEl.textContent = `Puntaje: ${score}`;
    };

    const onGameOver = (finalScore) => {
      this.arcadeGameRunning = false;
      this._saveHighScore(gameId, finalScore);
      // Show exit button + back to menu option
      document.getElementById('arcade-exit-btn').classList.remove('arcade-exit-hidden');
      // Clean up key listeners
      if (this._arcadeKeyDown) {
        window.removeEventListener('keydown', this._arcadeKeyDown, true);
        window.removeEventListener('keyup', this._arcadeKeyUp, true);
        this._arcadeKeyDown = null;
        this._arcadeKeyUp = null;
      }
    };

    this._activeGame = gameDef.start(canvas, onScore, onGameOver);

    // Key handlers — capture phase to intercept before Phaser
    const keyDown = (e) => {
      if (!this.arcadeGameRunning || !this._activeGame) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._activeGame.keyDown(e);
      }
    };
    const keyUp = (e) => {
      if (!this._activeGame) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.stopImmediatePropagation();
        this._activeGame.keyUp(e);
      }
    };
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    this._arcadeKeyDown = keyDown;
    this._arcadeKeyUp = keyUp;
  }

  stopArcadeGame() {
    if (this._activeGame) {
      this._activeGame.cleanup();
      this._activeGame = null;
    }
    this.arcadeGameRunning = false;
    if (this._arcadeKeyDown) {
      window.removeEventListener('keydown', this._arcadeKeyDown, true);
      window.removeEventListener('keyup', this._arcadeKeyUp, true);
      this._arcadeKeyDown = null;
      this._arcadeKeyUp = null;
    }
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
