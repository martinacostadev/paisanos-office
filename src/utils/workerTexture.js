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
    // Boquita: wide yellow horizontal band across the entire shirt
    g.fillStyle(0xf5a623);
    g.fillRect(3, 9 + bounce, 10, 3); // thick band covering body + arms
  } else if (color.shirtStyle === 'white-v') {
    // Velez: huge V from top corners to bottom center
    g.fillStyle(0x4488cc);
    // Row 0 (top): outer edges
    g.fillRect(5, 7 + bounce, 2, 1);
    g.fillRect(9, 7 + bounce, 2, 1);
    // Row 1
    g.fillRect(5, 8 + bounce, 2, 1);
    g.fillRect(9, 8 + bounce, 2, 1);
    // Row 2: converging
    g.fillRect(6, 9 + bounce, 2, 1);
    g.fillRect(8, 9 + bounce, 2, 1);
    // Row 3: meeting
    g.fillRect(7, 10 + bounce, 2, 1);
    // Row 4: point
    g.fillRect(7, 11 + bounce, 2, 1);
  } else if (color.shirtStyle === 'black-logo') {
    // Dark: white cross/star design on chest
    g.fillStyle(0xffffff);
    g.fillRect(7, 8 + bounce, 2, 3);
    g.fillRect(6, 9 + bounce, 4, 1);
    g.fillStyle(0xcccccc);
    g.fillRect(6, 8 + bounce, 1, 1);
    g.fillRect(9, 8 + bounce, 1, 1);
    g.fillRect(6, 10 + bounce, 1, 1);
    g.fillRect(9, 10 + bounce, 1, 1);
  }

  // Arms
  const armColor = color.shirt;
  g.fillStyle(armColor);
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
  if (color.hairStyle === 'bald') {
    // No hair drawn — just a tiny stubble line
    g.fillRect(5, 2 + bounce, 6, 1);
  } else if (color.hairStyle === 'mohawk') {
    // Tall mohawk strip on top
    g.fillRect(7, 0 + bounce, 2, 3);
    g.fillRect(6, 1 + bounce, 4, 2);
  } else if (color.hairStyle === 'long') {
    // Long hair — covers sides down to shoulders
    g.fillRect(5, 1 + bounce, 6, 2);
    g.fillRect(4, 2 + bounce, 1, 6);
    g.fillRect(11, 2 + bounce, 1, 6);
    g.fillRect(4, 1 + bounce, 1, 2);
    g.fillRect(11, 1 + bounce, 1, 2);
  } else {
    // Short (default)
    g.fillRect(5, 1 + bounce, 6, 2);
    g.fillRect(4, 2 + bounce, 1, 3);
    g.fillRect(11, 2 + bounce, 1, 3);
  }

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
