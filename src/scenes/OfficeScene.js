import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';
import webRTCManager from '../network/WebRTCManager.js';
import { generateWorkerTextures, destroyWorkerTextures } from '../utils/workerTexture.js';

const TILE = 16;
const MAP_COLS = 44;
const MAP_ROWS = 16;

const WALKABLE = 0;
const SOLID = 1;

const PROXIMITY_TILES = 3; // How close (in tiles) to trigger video

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
      this.showChatBubble(data);
    });

    // Bug fix: request full sync after listeners are set up
    socketManager.on('game:sync', ({ players: syncPlayers }) => {
      console.log(`[OfficeScene] game:sync received, ${syncPlayers.length} players`);
      syncPlayers.forEach((p) => {
        if (!this.players.has(p.id)) {
          console.log(`[OfficeScene] Sync adding missing player: ${p.name} (${p.id})`);
          this.addPlayer(p);
          if (p.cameraOn) this.cameraPeers.add(p.id);
          if (p.micOn) this.micPeers.add(p.id);
        }
      });
    });
    if (socketManager.socket) {
      socketManager.socket.emit('game:sync');
    }

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
        micBtn.textContent = 'Mic';
        this._hideRemoteVideo();
      }
    });

    micBtn.addEventListener('click', () => {
      if (!webRTCManager.cameraOn) return;
      const isOn = webRTCManager.toggleMic();
      if (isOn) {
        micBtn.textContent = 'Mic off';
        micBtn.classList.add('mic-on');
      } else {
        micBtn.textContent = 'Mic';
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
      const dist = Math.abs(lx - px) + Math.abs(ly - py); // Manhattan distance

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

    sprite.setData('gridX', x);
    sprite.setData('gridY', y);
    sprite.x = x * TILE + TILE / 2;
    sprite.y = y * TILE + TILE / 2;
    sprite.setDepth(y + 0.5);

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

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        let tileKey = null;
        let isSolid = false;

        if (row === 0) {
          tileKey = col >= 28 ? 'hedge' : 'wall-dark-top';
          isSolid = true;
        } else if (row === MAP_ROWS - 1) {
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

    [1, 5, 10, 14].forEach((row) => {
      this.placeSolid('pillar', 8, row);
    });

    [4, 12, 17, 22].forEach((col) => {
      this.add.image(col * TILE + TILE / 2, TILE / 2, 'ceiling-light').setDepth(0);
    });

    this.placeSolid('smart-tv', 1, 4);
    this.placeSolid('smart-tv', 1, 5);
    this.placeSolid('smart-tv', 1, 6);
    this.placeSolid('smart-tv', 2, 4);
    this.placeSolid('smart-tv', 2, 5);
    this.placeSolid('smart-tv', 2, 6);

    this.placeSolid('couch-top', 5, 3);
    this.placeSolid('couch-mid', 5, 4);
    this.placeSolid('couch-mid', 5, 5);
    this.placeSolid('couch-bottom', 5, 6);

    this.placeSolid('couch-top', 5, 8);
    this.placeSolid('couch-mid', 5, 9);
    this.placeSolid('couch-mid', 5, 10);
    this.placeSolid('couch-bottom', 5, 11);

    this.placeSolid('coffee-table', 3, 5);
    this.placeSolid('coffee-table', 3, 9);

    this.placeSolid('plant', 7, 1);
    this.placeSolid('plant', 1, 13);
    this.placeSolid('wall-shelf', 1, 1);
    this.placeSolid('wall-shelf', 1, 2);
    this.placeSolid('wall-shelf', 6, 14);
    this.placeDecor('backpack', 7, 12);

    this.placeBigVerticalDesk(10, 6);
    this.placeBigVerticalDesk(15, 6);
    this.placeBigVerticalDesk(20, 6);

    this.placeSolid('wall-shelf', 12, 1);
    this.placeSolid('wall-shelf', 13, 1);
    this.placeSolid('wall-shelf', 17, 1);
    this.placeSolid('wall-shelf', 18, 1);
    this.placeSolid('wall-shelf', 12, 14);
    this.placeSolid('wall-shelf', 17, 14);
    this.placeSolid('plant', 9, 1);
    this.placeSolid('plant', 9, 14);
    this.placeDecor('backpack', 13, 4);
    this.placeDecor('backpack', 18, 3);

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

    this.placeSolid('plant', 25, 14);

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
      this.placeSolid('pool-edge-h', c, 10);
    }
    for (let r = 11; r <= 13; r++) {
      for (let c = 32; c <= 35; c++) {
        this.placeSolid('pool-water', c, r);
      }
    }
    for (let c = 32; c <= 35; c++) {
      this.placeSolid('pool-edge-h', c, 14);
    }
    for (let r = 11; r <= 13; r++) {
      this.placeSolid('pool-edge-v', 31, r);
    }
    for (let r = 11; r <= 13; r++) {
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
    const localSprite = this.players.get(this.localId);
    if (!localSprite) return;

    if (time - this.moveTimer < 150) return;

    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;
    else if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;

    if (dx === 0 && dy === 0) return;

    const gridX = localSprite.getData('gridX');
    const gridY = localSprite.getData('gridY');
    const newX = gridX + dx;
    const newY = gridY + dy;

    if (newX < 0 || newX >= MAP_COLS || newY < 0 || newY >= MAP_ROWS) return;
    if (this.collisionMap[newY][newX] === SOLID) return;

    for (const [id, sprite] of this.players) {
      if (id === this.localId) continue;
      if (sprite.getData('gridX') === newX && sprite.getData('gridY') === newY) return;
    }

    localSprite.setData('gridX', newX);
    localSprite.setData('gridY', newY);
    localSprite.x = newX * TILE + TILE / 2;
    localSprite.y = newY * TILE + TILE / 2;
    localSprite.setDepth(newY + 0.5);

    const frame = localSprite.getData('animFrame');
    const nextFrame = frame === 0 ? 2 : frame === 2 ? 1 : frame === 1 ? 3 : 0;
    localSprite.setData('animFrame', nextFrame);
    localSprite.setTexture(`worker-${this.localId}-${nextFrame}`);

    if (this.selectedWorker === localSprite) {
      this.updateHighlight(localSprite);
    }

    socketManager.sendMove(newX, newY);

    this.moveTimer = time;
  }

  // --- Chat ---

  setupChat() {
    this.chatInput = document.getElementById('chat-input');
    this.chatSendBtn = document.getElementById('chat-send-btn');
    this.chatMessages = document.getElementById('chat-messages');
    const chatPanel = document.getElementById('chat-panel');
    const chatToggle = document.getElementById('chat-toggle-btn');

    // Show chat panel now that we're in the game
    chatPanel.classList.remove('chat-hidden');

    // Collapse / expand toggle
    const header = document.getElementById('chat-header');
    header.addEventListener('click', () => {
      chatPanel.classList.toggle('chat-collapsed');
      chatToggle.textContent = chatPanel.classList.contains('chat-collapsed') ? '+' : '—';
    });

    const sendMessage = () => {
      const text = this.chatInput.value.trim();
      if (!text) return;
      // Show own message immediately
      this.showChatBubble({
        id: this.localId,
        name: 'You',
        message: text,
        timestamp: Date.now(),
      });
      socketManager.sendChat(text);
      this.chatInput.value = '';
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
  }

  showChatBubble(data) {
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
