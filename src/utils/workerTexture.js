const TILE = 16;

export function drawWorker(g, color, frame) {
  const bounce = frame % 2 === 1 ? -1 : 0;

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRect(4, 14, 8, 2);

  // Body
  g.fillStyle(color.shirt);
  g.fillRect(5, 7 + bounce, 6, 5);

  // Shirt design overlay
  if (color.shirtStyle === 'blue-lines') {
    // Boquita: one big yellow horizontal line across the middle
    g.fillStyle(0xf5a623);
    g.fillRect(5, 9 + bounce, 6, 2);
  } else if (color.shirtStyle === 'white-v') {
    // Velez: BIG V crossing almost the entire shirt
    g.fillStyle(0x4488cc);
    // Left arm of V
    g.fillRect(5, 7 + bounce, 2, 1);
    g.fillRect(5, 8 + bounce, 2, 1);
    g.fillRect(6, 9 + bounce, 2, 1);
    g.fillRect(7, 10 + bounce, 2, 1);
    // Right arm of V
    g.fillRect(9, 7 + bounce, 2, 1);
    g.fillRect(9, 8 + bounce, 2, 1);
    g.fillRect(8, 9 + bounce, 2, 1);
    // Bottom point merges at center
    g.fillRect(7, 11 + bounce, 2, 1);
  } else if (color.shirtStyle === 'black-logo') {
    // Dark: white cross/star design on chest
    g.fillStyle(0xffffff);
    g.fillRect(7, 8 + bounce, 2, 3);
    g.fillRect(6, 9 + bounce, 4, 1);
    // Extra details
    g.fillStyle(0xcccccc);
    g.fillRect(6, 8 + bounce, 1, 1);
    g.fillRect(9, 8 + bounce, 1, 1);
    g.fillRect(6, 10 + bounce, 1, 1);
    g.fillRect(9, 10 + bounce, 1, 1);
  }

  // Arms
  g.fillStyle(color.shirt);
  if (frame % 2 === 0) {
    g.fillRect(3, 8 + bounce, 2, 4);
    g.fillRect(11, 8 + bounce, 2, 4);
  } else {
    g.fillRect(3, 7 + bounce, 2, 4);
    g.fillRect(11, 9 + bounce, 2, 4);
  }

  // Legs
  g.fillStyle(0x3a3a5c);
  if (frame < 2) {
    g.fillRect(5, 12 + bounce, 3, 3);
    g.fillRect(8, 12 + bounce, 3, 3);
  } else {
    g.fillRect(4, 12 + bounce, 3, 3);
    g.fillRect(9, 12 + bounce, 3, 3);
  }

  // Shoes
  g.fillStyle(0x2a2a2a);
  g.fillRect(5, 14 + bounce, 2, 1);
  g.fillRect(9, 14 + bounce, 2, 1);

  // Head
  g.fillStyle(color.skin);
  g.fillRect(5, 2 + bounce, 6, 5);

  // Hair
  g.fillStyle(color.hair);
  g.fillRect(5, 1 + bounce, 6, 2);
  g.fillRect(4, 2 + bounce, 1, 3);
  g.fillRect(11, 2 + bounce, 1, 3);

  // Eyes
  g.fillStyle(0x000000);
  g.fillRect(6, 4 + bounce, 2, 1);
  g.fillRect(9, 4 + bounce, 2, 1);

  // Mouth
  g.fillStyle(0xcc6666);
  g.fillRect(7, 6 + bounce, 2, 1);
}

export function generateWorkerTextures(scene, id, color) {
  for (let frame = 0; frame < 4; frame++) {
    const key = `worker-${id}-${frame}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    drawWorker(g, color, frame);
    g.generateTexture(key, TILE, TILE);
    g.destroy();
  }
}

export function destroyWorkerTextures(scene, id) {
  for (let frame = 0; frame < 4; frame++) {
    const key = `worker-${id}-${frame}`;
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
  }
}
