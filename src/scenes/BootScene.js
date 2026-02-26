import Phaser from 'phaser';
import { generateWorkerTextures } from '../utils/workerTexture.js';

const TILE = 16;

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {}

  create() {
    this.generateTileTextures();

    // Generate textures for all initial players from registry
    const players = this.registry.get('players') || [];
    players.forEach((p) => {
      generateWorkerTextures(this, p.id, p.color);
    });

    this.scene.start('OfficeScene');
  }

  generateTileTextures() {
    // Gray wood plank floor (like the photo)
    this.createTile('floor-wood', (g) => {
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      // Wood plank lines
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      g.fillRect(0, 5, TILE, 1);
      g.fillRect(0, 10, TILE, 1);
      g.fillRect(0, 15, TILE, 1);
      // Slight variation
      g.fillStyle(0x918980);
      g.fillRect(2, 1, 5, 4);
      g.fillRect(9, 6, 4, 4);
      g.fillRect(1, 11, 6, 4);
    });

    // Dark green/charcoal wall (like the photo's dark walls)
    this.createTile('wall-dark', (g) => {
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0x2a3330);
      g.fillRect(0, 7, TILE, 2);
    });

    // Dark wall top
    this.createTile('wall-dark-top', (g) => {
      g.fillStyle(0x222a28);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x2a3330);
      g.fillRect(0, TILE - 4, TILE, 4);
      // Exposed concrete ceiling hint
      g.fillStyle(0x3a4240);
      g.fillRect(1, 2, TILE - 2, TILE - 6);
    });

    // Industrial column/pillar (instead of full wall divider)
    this.createTile('pillar', (g) => {
      // Floor underneath
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      g.fillRect(0, 5, TILE, 1);
      g.fillRect(0, 10, TILE, 1);
      // Dark steel pillar
      g.fillStyle(0x2a2a2a);
      g.fillRect(5, 0, 6, TILE);
      g.fillStyle(0x3a3a3a);
      g.fillRect(6, 0, 4, TILE);
      g.fillStyle(0x444444);
      g.fillRect(7, 0, 2, TILE);
    });

    // Long shared wooden table (warm brown, like the photo)
    this.createTile('shared-table', (g) => {
      // Table surface
      g.fillStyle(0x9c7a52);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0xb08c60);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Wood grain
      g.fillStyle(0xa08458);
      g.fillRect(0, 3, TILE, 1);
      g.fillRect(0, 8, TILE, 1);
      g.fillRect(0, 13, TILE, 1);
    });

    // Table with laptop (dark laptop on warm wood)
    this.createTile('table-laptop', (g) => {
      // Table surface
      g.fillStyle(0x9c7a52);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0xb08c60);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0xa08458);
      g.fillRect(0, 3, TILE, 1);
      g.fillRect(0, 13, TILE, 1);
      // Laptop (dark/silver MacBook)
      g.fillStyle(0xc0c0c0);
      g.fillRect(2, 9, 10, 5);
      g.fillStyle(0xaaaaaa);
      g.fillRect(3, 10, 8, 3);
      // Screen
      g.fillStyle(0x333333);
      g.fillRect(3, 2, 10, 7);
      g.fillStyle(0x2244aa);
      g.fillRect(4, 3, 8, 5);
      // Code/content on screen
      g.fillStyle(0x66dd66);
      g.fillRect(5, 4, 4, 1);
      g.fillStyle(0xdddd66);
      g.fillRect(5, 6, 3, 1);
    });

    // Table with laptop variant 2 (different screen)
    this.createTile('table-laptop2', (g) => {
      // Table surface
      g.fillStyle(0x9c7a52);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0xb08c60);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0xa08458);
      g.fillRect(0, 3, TILE, 1);
      g.fillRect(0, 13, TILE, 1);
      // Laptop
      g.fillStyle(0xc0c0c0);
      g.fillRect(3, 9, 10, 5);
      g.fillStyle(0xaaaaaa);
      g.fillRect(4, 10, 8, 3);
      // Screen
      g.fillStyle(0x333333);
      g.fillRect(3, 2, 10, 7);
      g.fillStyle(0x1a1a3a);
      g.fillRect(4, 3, 8, 5);
      // Design content
      g.fillStyle(0xff6688);
      g.fillRect(5, 4, 3, 3);
      g.fillStyle(0x44bbdd);
      g.fillRect(8, 4, 3, 3);
    });

    // Table edge (end of shared table, no laptop)
    this.createTile('table-edge', (g) => {
      g.fillStyle(0x9c7a52);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0xb08c60);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0xa08458);
      g.fillRect(0, 3, TILE, 1);
      g.fillRect(0, 8, TILE, 1);
      // Coffee cup
      g.fillStyle(0xeeeeee);
      g.fillRect(5, 5, 4, 4);
      g.fillStyle(0xdddddd);
      g.fillRect(6, 6, 2, 2);
      g.fillStyle(0x8b6b4a);
      g.fillRect(6, 6, 2, 1);
      // Handle
      g.fillStyle(0xeeeeee);
      g.fillRect(9, 6, 2, 2);
    });

    // Table with mouse + items (water bottle, etc)
    this.createTile('table-items', (g) => {
      g.fillStyle(0x9c7a52);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0xb08c60);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0xa08458);
      g.fillRect(0, 3, TILE, 1);
      g.fillRect(0, 13, TILE, 1);
      // Mouse
      g.fillStyle(0x222222);
      g.fillRect(3, 6, 3, 5);
      g.fillStyle(0x333333);
      g.fillRect(3, 6, 3, 2);
      // Water bottle
      g.fillStyle(0x88bbdd);
      g.fillRect(9, 3, 3, 8);
      g.fillStyle(0x6699bb);
      g.fillRect(10, 2, 1, 1);
      g.fillStyle(0xaaddff);
      g.fillRect(10, 5, 1, 3);
    });

    // Ergonomic office chair (dark gray like the photo)
    this.createTile('office-chair', (g) => {
      // Floor shows through
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      g.fillRect(0, 10, TILE, 1);
      // Chair base/wheels
      g.fillStyle(0x333333);
      g.fillRect(4, 13, 2, 2);
      g.fillRect(10, 13, 2, 2);
      g.fillRect(6, 14, 4, 1);
      // Seat
      g.fillStyle(0x444444);
      g.fillRect(3, 9, 10, 4);
      g.fillStyle(0x555555);
      g.fillRect(4, 10, 8, 2);
      // Back rest
      g.fillStyle(0x3a3a3a);
      g.fillRect(4, 3, 8, 6);
      g.fillStyle(0x484848);
      g.fillRect(5, 4, 6, 4);
      // Mesh pattern on back
      g.fillStyle(0x404040);
      g.fillRect(5, 5, 6, 1);
      g.fillRect(5, 7, 6, 1);
    });

    // Wall shelf with objects (like the shelves in the photo)
    this.createTile('wall-shelf', (g) => {
      // Dark wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Shelf bracket
      g.fillStyle(0x555555);
      g.fillRect(0, 7, TILE, 2);
      // Items on shelf
      g.fillStyle(0xcc8844);
      g.fillRect(2, 3, 3, 4);
      g.fillStyle(0x4488cc);
      g.fillRect(6, 4, 2, 3);
      g.fillStyle(0x228b22);
      g.fillRect(10, 2, 3, 5);
      g.fillStyle(0x32cd32);
      g.fillRect(11, 3, 1, 3);
      // Lower shelf
      g.fillStyle(0x555555);
      g.fillRect(0, 13, TILE, 2);
      g.fillStyle(0xddaa00);
      g.fillRect(3, 10, 2, 3);
      g.fillStyle(0x8833cc);
      g.fillRect(8, 9, 4, 4);
    });

    // Backpack on floor (detail from photo)
    this.createTile('backpack', (g) => {
      // Floor
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      g.fillRect(0, 10, TILE, 1);
      // Backpack
      g.fillStyle(0x444444);
      g.fillRect(4, 5, 8, 9);
      g.fillStyle(0x555555);
      g.fillRect(5, 6, 6, 7);
      g.fillStyle(0x333333);
      g.fillRect(6, 4, 4, 2);
      // Zipper
      g.fillStyle(0x888888);
      g.fillRect(7, 8, 2, 1);
    });

    // Ceiling light/lamp (industrial pendant)
    this.createTile('ceiling-light', (g) => {
      // Dark ceiling
      g.fillStyle(0x222a28);
      g.fillRect(0, 0, TILE, TILE);
      // Wire
      g.fillStyle(0x444444);
      g.fillRect(7, 0, 2, 5);
      // Lamp shade
      g.fillStyle(0x666666);
      g.fillRect(3, 5, 10, 3);
      g.fillStyle(0x777777);
      g.fillRect(4, 5, 8, 2);
      // Light glow
      g.fillStyle(0xffdd88, 0.6);
      g.fillRect(5, 8, 6, 3);
      g.fillStyle(0xffcc66, 0.4);
      g.fillRect(4, 11, 8, 4);
    });

    // Plant (indoor pot)
    this.createTile('plant', (g) => {
      // Floor
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      // Pot
      g.fillStyle(0x8b4513);
      g.fillRect(5, 10, 6, 6);
      g.fillStyle(0xa0522d);
      g.fillRect(6, 11, 4, 4);
      // Leaves
      g.fillStyle(0x228b22);
      g.fillRect(4, 3, 3, 4);
      g.fillRect(7, 2, 3, 5);
      g.fillRect(10, 4, 3, 3);
      g.fillStyle(0x32cd32);
      g.fillRect(5, 4, 2, 3);
      g.fillRect(8, 3, 2, 3);
    });

    // Coffee machine
    this.createTile('coffee', (g) => {
      // Dark wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Machine
      g.fillStyle(0x444444);
      g.fillRect(3, 2, 10, 12);
      g.fillStyle(0x555555);
      g.fillRect(4, 3, 8, 10);
      g.fillStyle(0x222222);
      g.fillRect(5, 5, 6, 4);
      g.fillStyle(0x8b4513);
      g.fillRect(6, 6, 4, 2);
      g.fillStyle(0xff0000);
      g.fillRect(10, 10, 2, 2);
    });

    // Garden floor (grass)
    this.createTile('floor-garden', (g) => {
      g.fillStyle(0x4a8c3f);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x3f7a35);
      g.fillRect(0, 0, 1, TILE);
      g.fillRect(0, 0, TILE, 1);
      g.fillStyle(0x55a048);
      g.fillRect(3, 5, 1, 2);
      g.fillRect(10, 2, 1, 2);
      g.fillRect(7, 11, 1, 2);
      g.fillStyle(0x5cb84e);
      g.fillRect(13, 8, 1, 2);
      g.fillRect(1, 12, 1, 1);
    });

    // Garden stone path
    this.createTile('garden-path', (g) => {
      g.fillStyle(0x9c9080);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x8a8070);
      g.fillRect(0, 0, 1, TILE);
      g.fillRect(0, 0, TILE, 1);
      g.fillStyle(0xa8a090);
      g.fillRect(3, 3, 5, 5);
      g.fillRect(9, 8, 5, 5);
    });

    // Hedge wall
    this.createTile('hedge', (g) => {
      g.fillStyle(0x2a6b2a);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x347a34);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      g.fillStyle(0x3a8a3a);
      g.fillRect(3, 3, 4, 4);
      g.fillRect(8, 7, 5, 4);
      g.fillStyle(0x2a6b2a);
      g.fillRect(6, 5, 3, 3);
    });

    // Tree
    this.createTile('tree', (g) => {
      g.fillStyle(0x6b4226);
      g.fillRect(6, 9, 4, 7);
      g.fillStyle(0x7a5030);
      g.fillRect(7, 10, 2, 5);
      g.fillStyle(0x2d7a2d);
      g.fillRect(2, 1, 12, 9);
      g.fillRect(1, 3, 14, 5);
      g.fillStyle(0x3a9a3a);
      g.fillRect(3, 2, 10, 7);
      g.fillStyle(0x4ab84a);
      g.fillRect(5, 3, 4, 3);
      g.fillRect(8, 4, 3, 2);
    });

    // Bench
    this.createTile('bench', (g) => {
      g.fillStyle(0x555555);
      g.fillRect(2, 11, 2, 4);
      g.fillRect(12, 11, 2, 4);
      g.fillStyle(0x8b6b4a);
      g.fillRect(1, 9, 14, 3);
      g.fillStyle(0xa07850);
      g.fillRect(2, 9, 12, 2);
      g.fillStyle(0x8b6b4a);
      g.fillRect(1, 5, 14, 2);
      g.fillRect(2, 7, 1, 2);
      g.fillRect(13, 7, 1, 2);
      g.fillStyle(0xa07850);
      g.fillRect(2, 5, 12, 1);
    });

    // Flower
    this.createTile('flower', (g) => {
      g.fillStyle(0x2d8b2d);
      g.fillRect(7, 6, 2, 9);
      g.fillStyle(0x3aa53a);
      g.fillRect(5, 9, 2, 2);
      g.fillRect(9, 8, 2, 2);
      g.fillStyle(0xff6688);
      g.fillRect(5, 2, 2, 2);
      g.fillRect(9, 2, 2, 2);
      g.fillRect(5, 5, 2, 2);
      g.fillRect(9, 5, 2, 2);
      g.fillStyle(0xffdd44);
      g.fillRect(7, 3, 2, 3);
    });

    this.createTile('flower2', (g) => {
      g.fillStyle(0x2d8b2d);
      g.fillRect(7, 6, 2, 9);
      g.fillStyle(0x3aa53a);
      g.fillRect(5, 10, 2, 2);
      g.fillRect(9, 7, 2, 2);
      g.fillStyle(0x6688ff);
      g.fillRect(5, 2, 2, 2);
      g.fillRect(9, 2, 2, 2);
      g.fillRect(5, 5, 2, 2);
      g.fillRect(9, 5, 2, 2);
      g.fillStyle(0xffffff);
      g.fillRect(7, 3, 2, 3);
    });

    // Fountain
    this.createTile('fountain', (g) => {
      g.fillStyle(0x888888);
      g.fillRect(2, 10, 12, 4);
      g.fillStyle(0x999999);
      g.fillRect(3, 11, 10, 2);
      g.fillStyle(0x777777);
      g.fillRect(4, 6, 8, 4);
      g.fillStyle(0x4488cc);
      g.fillRect(5, 7, 6, 2);
      g.fillStyle(0x888888);
      g.fillRect(7, 3, 2, 4);
      g.fillStyle(0x88ccff);
      g.fillRect(6, 2, 1, 2);
      g.fillRect(9, 2, 1, 2);
      g.fillRect(7, 1, 2, 1);
    });

    // Couch (dark leather, facing right)
    this.createTile('couch-top', (g) => {
      // Floor
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      // Couch armrest top
      g.fillStyle(0x3a3a3a);
      g.fillRect(1, 2, 14, 12);
      g.fillStyle(0x4a4a4a);
      g.fillRect(2, 3, 12, 10);
      // Armrest
      g.fillStyle(0x333333);
      g.fillRect(1, 2, 14, 3);
      g.fillStyle(0x3d3d3d);
      g.fillRect(2, 2, 12, 2);
    });

    this.createTile('couch-mid', (g) => {
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      // Seat cushion
      g.fillStyle(0x3a3a3a);
      g.fillRect(1, 0, 14, TILE);
      g.fillStyle(0x4a4a4a);
      g.fillRect(2, 1, 12, TILE - 2);
      // Cushion line
      g.fillStyle(0x3a3a3a);
      g.fillRect(2, 7, 12, 2);
      // Back cushion
      g.fillStyle(0x444444);
      g.fillRect(2, 1, 3, TILE - 2);
    });

    this.createTile('couch-bottom', (g) => {
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      // Couch armrest bottom
      g.fillStyle(0x3a3a3a);
      g.fillRect(1, 2, 14, 12);
      g.fillStyle(0x4a4a4a);
      g.fillRect(2, 3, 12, 10);
      // Armrest
      g.fillStyle(0x333333);
      g.fillRect(1, 11, 14, 3);
      g.fillStyle(0x3d3d3d);
      g.fillRect(2, 12, 12, 2);
    });

    // Smart TV (wall mounted, bright screen)
    this.createTile('smart-tv', (g) => {
      // Dark wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      // TV frame (thin black bezel)
      g.fillStyle(0x0a0a0a);
      g.fillRect(0, 1, TILE, 13);
      // Bright screen
      g.fillStyle(0x3366dd);
      g.fillRect(1, 2, 14, 11);
      // Screen content (bright presentation)
      g.fillStyle(0x5599ff);
      g.fillRect(2, 3, 6, 4);
      g.fillStyle(0xffffff);
      g.fillRect(9, 3, 5, 1);
      g.fillRect(9, 5, 4, 1);
      g.fillStyle(0xccddff);
      g.fillRect(9, 7, 3, 1);
      g.fillStyle(0xffcc44);
      g.fillRect(2, 8, 8, 1);
      g.fillStyle(0x44dd66);
      g.fillRect(2, 10, 5, 1);
      g.fillStyle(0xff6666);
      g.fillRect(8, 10, 4, 1);
      // Screen glow edge
      g.fillStyle(0x4477cc, 0.3);
      g.fillRect(0, 0, TILE, 1);
      g.fillRect(0, 14, TILE, 1);
    });

    // Coffee table (small, between couches and TV)
    this.createTile('coffee-table', (g) => {
      g.fillStyle(0x8a8078);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x7d756d);
      g.fillRect(0, 0, TILE, 1);
      // Table
      g.fillStyle(0x5c4433);
      g.fillRect(2, 3, 12, 10);
      g.fillStyle(0x7a5a42);
      g.fillRect(3, 4, 10, 8);
      // Legs
      g.fillStyle(0x444444);
      g.fillRect(3, 12, 1, 2);
      g.fillRect(12, 12, 1, 2);
      // Magazine on table
      g.fillStyle(0xcc4444);
      g.fillRect(5, 5, 4, 3);
      g.fillStyle(0xdd5555);
      g.fillRect(5, 5, 4, 1);
    });

    // Hammock
    this.createTile('hammock', (g) => {
      g.fillStyle(0x8b6b4a);
      g.fillRect(1, 2, 2, 13);
      g.fillRect(13, 2, 2, 13);
      g.fillStyle(0xe8c870);
      g.fillRect(3, 6, 10, 1);
      g.fillRect(2, 7, 12, 2);
      g.fillRect(3, 9, 10, 1);
      g.fillStyle(0xccaa55);
      g.fillRect(2, 4, 1, 2);
      g.fillRect(13, 4, 1, 2);
    });

    // Pool water tile
    this.createTile('pool-water', (g) => {
      g.fillStyle(0x2288cc);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x33aadd);
      g.fillRect(2, 2, 4, 3);
      g.fillRect(8, 7, 5, 3);
      g.fillStyle(0x44bbee);
      g.fillRect(3, 3, 2, 1);
      g.fillRect(10, 9, 2, 1);
      // Ripples
      g.fillStyle(0x55ccff, 0.5);
      g.fillRect(1, 6, 6, 1);
      g.fillRect(7, 12, 5, 1);
    });

    // Pool edge (border tile)
    this.createTile('pool-edge-h', (g) => {
      // Grass underneath
      g.fillStyle(0x4a8c3f);
      g.fillRect(0, 0, TILE, TILE);
      // Stone edge horizontal
      g.fillStyle(0xaaa89a);
      g.fillRect(0, 4, TILE, 8);
      g.fillStyle(0xbbb8a8);
      g.fillRect(1, 5, TILE - 2, 6);
      g.fillStyle(0x9a988a);
      g.fillRect(0, 7, TILE, 2);
    });

    this.createTile('pool-edge-v', (g) => {
      g.fillStyle(0x4a8c3f);
      g.fillRect(0, 0, TILE, TILE);
      // Stone edge vertical
      g.fillStyle(0xaaa89a);
      g.fillRect(4, 0, 8, TILE);
      g.fillStyle(0xbbb8a8);
      g.fillRect(5, 1, 6, TILE - 2);
      g.fillStyle(0x9a988a);
      g.fillRect(7, 0, 2, TILE);
    });

    // BBQ Grill (bright and visible)
    this.createTile('bbq-grill', (g) => {
      // Legs
      g.fillStyle(0x444444);
      g.fillRect(3, 12, 2, 4);
      g.fillRect(11, 12, 2, 4);
      // Body (charcoal black)
      g.fillStyle(0x222222);
      g.fillRect(1, 5, 14, 8);
      g.fillStyle(0x333333);
      g.fillRect(2, 6, 12, 6);
      // Grill grates (silver)
      g.fillStyle(0x888888);
      g.fillRect(3, 6, 1, 6);
      g.fillRect(5, 6, 1, 6);
      g.fillRect(7, 6, 1, 6);
      g.fillRect(9, 6, 1, 6);
      g.fillRect(11, 6, 1, 6);
      // Fire glow (bright orange/red)
      g.fillStyle(0xff4411);
      g.fillRect(4, 7, 2, 2);
      g.fillRect(8, 8, 2, 2);
      g.fillStyle(0xff8833);
      g.fillRect(6, 7, 2, 3);
      g.fillRect(10, 7, 1, 2);
      g.fillStyle(0xffcc00);
      g.fillRect(5, 8, 1, 1);
      g.fillRect(9, 7, 1, 1);
      // Big smoke clouds
      g.fillStyle(0xcccccc, 0.6);
      g.fillRect(5, 1, 3, 4);
      g.fillRect(8, 0, 3, 3);
      g.fillStyle(0xaaaaaa, 0.4);
      g.fillRect(4, 0, 2, 2);
      g.fillRect(10, 1, 2, 2);
      // Handle
      g.fillStyle(0x666666);
      g.fillRect(14, 7, 2, 2);
    });

    // Big window (looking into garden)
    this.createTile('window-big', (g) => {
      // Wall frame
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      // Window frame (dark metal)
      g.fillStyle(0x444444);
      g.fillRect(1, 1, 14, 14);
      // Glass pane (garden view: green tint)
      g.fillStyle(0x5a9a5a);
      g.fillRect(2, 2, 12, 12);
      // Garden through window
      g.fillStyle(0x4a8c3f);
      g.fillRect(3, 8, 5, 5);
      g.fillRect(8, 6, 5, 7);
      // Sky/light through window
      g.fillStyle(0x88bbdd);
      g.fillRect(3, 3, 10, 4);
      // Tree silhouette
      g.fillStyle(0x3a7a3a);
      g.fillRect(4, 4, 4, 6);
      g.fillRect(9, 5, 3, 5);
      // Window cross frame
      g.fillStyle(0x555555);
      g.fillRect(7, 2, 2, 12);
      g.fillRect(2, 7, 12, 2);
      // Highlight/reflection
      g.fillStyle(0xaaddcc, 0.3);
      g.fillRect(3, 3, 3, 3);
    });

    // Kitchen wall (partition wall)
    this.createTile('kitchen-wall', (g) => {
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Subtle tile pattern
      g.fillStyle(0x3a4340);
      g.fillRect(0, 7, TILE, 2);
      g.fillRect(7, 0, 2, TILE);
    });

    // Kitchen stove/oven
    this.createTile('kitchen-stove', (g) => {
      // Wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Stove body
      g.fillStyle(0x555555);
      g.fillRect(1, 5, 14, 10);
      g.fillStyle(0x666666);
      g.fillRect(2, 6, 12, 8);
      // Burners (4 circles)
      g.fillStyle(0x333333);
      g.fillRect(3, 6, 4, 4);
      g.fillRect(9, 6, 4, 4);
      // Burner rings
      g.fillStyle(0x444444);
      g.fillRect(4, 7, 2, 2);
      g.fillRect(10, 7, 2, 2);
      // Oven door
      g.fillStyle(0x444444);
      g.fillRect(3, 11, 10, 3);
      g.fillStyle(0x4a4a4a);
      g.fillRect(4, 11, 8, 2);
      // Handle
      g.fillStyle(0x888888);
      g.fillRect(5, 11, 6, 1);
    });

    // Kitchen counter
    this.createTile('kitchen-counter', (g) => {
      // Wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Counter top (marble-ish)
      g.fillStyle(0xccccbb);
      g.fillRect(0, 5, TILE, 3);
      g.fillStyle(0xddddcc);
      g.fillRect(1, 5, TILE - 2, 2);
      // Cabinet below
      g.fillStyle(0x5a5a5a);
      g.fillRect(0, 8, TILE, 7);
      g.fillStyle(0x666666);
      g.fillRect(1, 9, 6, 5);
      g.fillRect(9, 9, 6, 5);
      // Cabinet handles
      g.fillStyle(0x999999);
      g.fillRect(6, 11, 1, 2);
      g.fillRect(9, 11, 1, 2);
    });

    // Kitchen sink
    this.createTile('kitchen-sink', (g) => {
      // Wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x323b38);
      g.fillRect(1, 1, TILE - 2, TILE - 2);
      // Counter top
      g.fillStyle(0xccccbb);
      g.fillRect(0, 5, TILE, 3);
      g.fillStyle(0xddddcc);
      g.fillRect(1, 5, TILE - 2, 2);
      // Sink basin
      g.fillStyle(0xaaaaaa);
      g.fillRect(3, 5, 10, 3);
      g.fillStyle(0x888888);
      g.fillRect(4, 6, 8, 2);
      // Water
      g.fillStyle(0x4488cc);
      g.fillRect(5, 6, 6, 1);
      // Faucet
      g.fillStyle(0x999999);
      g.fillRect(7, 2, 2, 4);
      g.fillRect(6, 2, 4, 1);
      // Cabinet below
      g.fillStyle(0x5a5a5a);
      g.fillRect(0, 8, TILE, 7);
      g.fillStyle(0x666666);
      g.fillRect(1, 9, 6, 5);
      g.fillRect(9, 9, 6, 5);
    });

    // Kitchen fridge
    this.createTile('kitchen-fridge', (g) => {
      // Wall behind
      g.fillStyle(0x2a3330);
      g.fillRect(0, 0, TILE, TILE);
      // Fridge body (tall, silver)
      g.fillStyle(0x999999);
      g.fillRect(2, 1, 12, 14);
      g.fillStyle(0xaaaaaa);
      g.fillRect(3, 2, 10, 12);
      // Freezer door (top)
      g.fillStyle(0x888888);
      g.fillRect(3, 2, 10, 4);
      g.fillStyle(0x999999);
      g.fillRect(4, 3, 8, 2);
      // Handle
      g.fillStyle(0xcccccc);
      g.fillRect(11, 3, 1, 3);
      g.fillRect(11, 8, 1, 4);
      // Line between doors
      g.fillStyle(0x777777);
      g.fillRect(3, 6, 10, 1);
    });

    // Big garden plant (large tropical)
    this.createTile('big-plant', (g) => {
      // Pot
      g.fillStyle(0x7a4020);
      g.fillRect(3, 10, 10, 6);
      g.fillStyle(0x8b5030);
      g.fillRect(4, 11, 8, 4);
      g.fillStyle(0x6a3018);
      g.fillRect(2, 10, 12, 2);
      // Large leaves
      g.fillStyle(0x1a7a1a);
      g.fillRect(1, 0, 4, 7);
      g.fillRect(5, 1, 3, 8);
      g.fillRect(8, 0, 4, 6);
      g.fillRect(11, 2, 3, 5);
      g.fillRect(0, 3, 3, 4);
      g.fillStyle(0x2a9a2a);
      g.fillRect(2, 1, 3, 5);
      g.fillRect(6, 2, 3, 6);
      g.fillRect(9, 1, 3, 4);
      g.fillStyle(0x3aba3a);
      g.fillRect(4, 3, 2, 3);
      g.fillRect(8, 2, 2, 3);
      g.fillRect(7, 5, 2, 2);
    });
  }

  createTile(key, drawFn) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    drawFn(g);
    g.generateTexture(key, TILE, TILE);
    g.destroy();
  }
}
