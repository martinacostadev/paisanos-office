import './style.css';
import Phaser from 'phaser';
import JoinScene from './scenes/JoinScene.js';
import BootScene from './scenes/BootScene.js';
import OfficeScene from './scenes/OfficeScene.js';

const TILE = 16;
const SCALE = 3;
// Viewport shows a portion of the map; camera follows the player
const VIEW_COLS = 22;
const VIEW_ROWS = 14;

const config = {
  type: Phaser.AUTO,
  width: VIEW_COLS * TILE,
  height: VIEW_ROWS * TILE,
  parent: 'game-container',
  pixelArt: true,
  zoom: SCALE,
  backgroundColor: '#0a0a1a',
  scene: [JoinScene, BootScene, OfficeScene],
  input: {
    keyboard: true,
  },
};

new Phaser.Game(config);
