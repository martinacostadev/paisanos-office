import './style.css';
import Phaser from 'phaser';
import JoinScene from './scenes/JoinScene.js';
import BootScene from './scenes/BootScene.js';
import OfficeScene from './scenes/OfficeScene.js';

const TILE = 16;
const SCALE = 3;
const MAP_COLS = 44;
const MAP_ROWS = 16;

const config = {
  type: Phaser.AUTO,
  width: MAP_COLS * TILE,
  height: MAP_ROWS * TILE,
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
