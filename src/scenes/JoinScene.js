import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';

const STORAGE_KEY = 'paisanos_user';

// Mini avatar drawing function (mirrors workerTexture.js drawWorker logic)
function drawAvatarPreview(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const scale = 8; // 16x16 → 128x128
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  function hexToCSS(hex) {
    const n = typeof hex === 'string' ? parseInt(hex.replace(/^0x/i, ''), 16) : hex;
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgb(${r},${g},${b})`;
  }

  function fill(color, x, y, w, h) {
    ctx.fillStyle = hexToCSS(color);
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  }

  function fillAlpha(color, alpha, x, y, w, h) {
    ctx.globalAlpha = alpha;
    fill(color, x, y, w, h);
    ctx.globalAlpha = 1;
  }

  const skin = typeof opts.skin === 'string' ? parseInt(opts.skin.replace(/^0x/i, ''), 16) : opts.skin;
  const hair = typeof opts.hair === 'string' ? parseInt(opts.hair.replace(/^0x/i, ''), 16) : opts.hair;
  const shirt = opts.shirt;
  const shirtStyle = opts.shirtStyle;
  const hairStyle = opts.hairStyle;

  // Shadow
  fillAlpha(0x000000, 0.2, 4, 14, 8, 2);

  // Body
  fill(shirt, 5, 7, 6, 5);

  // Shirt design overlay
  if (shirtStyle === 'blue-lines') {
    fill(0xf5a623, 3, 9, 10, 3);
  } else if (shirtStyle === 'river') {
    fill(0xcc0000, 5, 7, 2, 1);
    fill(0xcc0000, 5, 8, 3, 1);
    fill(0xcc0000, 6, 9, 3, 1);
    fill(0xcc0000, 7, 10, 3, 1);
    fill(0xcc0000, 8, 11, 3, 1);
  } else if (shirtStyle === 'white-v') {
    fill(0x4488cc, 5, 7, 2, 1);
    fill(0x4488cc, 9, 7, 2, 1);
    fill(0x4488cc, 5, 8, 2, 1);
    fill(0x4488cc, 9, 8, 2, 1);
    fill(0x4488cc, 6, 9, 2, 1);
    fill(0x4488cc, 8, 9, 2, 1);
    fill(0x4488cc, 7, 10, 2, 1);
    fill(0x4488cc, 7, 11, 2, 1);
  } else if (shirtStyle === 'black-logo') {
    fill(0xffffff, 7, 8, 2, 3);
    fill(0xffffff, 6, 9, 4, 1);
    fill(0xcccccc, 6, 8, 1, 1);
    fill(0xcccccc, 9, 8, 1, 1);
    fill(0xcccccc, 6, 10, 1, 1);
    fill(0xcccccc, 9, 10, 1, 1);
  }

  // Arms
  fill(shirt, 3, 8, 2, 4);
  fill(shirt, 11, 8, 2, 4);

  // Legs
  fill(0x3a3a5c, 5, 12, 3, 3);
  fill(0x3a3a5c, 8, 12, 3, 3);

  // Shoes
  fill(0x2a2a2a, 5, 14, 2, 1);
  fill(0x2a2a2a, 9, 14, 2, 1);

  // Head
  fill(skin, 5, 2, 6, 5);

  // Hair
  if (hairStyle === 'bald') {
    fill(hair, 5, 2, 6, 1);
  } else if (hairStyle === 'mohawk') {
    fill(hair, 7, 0, 2, 3);
    fill(hair, 6, 1, 4, 2);
  } else if (hairStyle === 'long') {
    fill(hair, 5, 1, 6, 2);
    fill(hair, 4, 2, 1, 6);
    fill(hair, 11, 2, 1, 6);
    fill(hair, 4, 1, 1, 2);
    fill(hair, 11, 1, 1, 2);
  } else {
    // short
    fill(hair, 5, 1, 6, 2);
    fill(hair, 4, 2, 1, 3);
    fill(hair, 11, 2, 1, 3);
  }

  // Eyes
  fill(0x000000, 6, 4, 2, 1);
  fill(0x000000, 9, 4, 2, 1);

  // Mouth
  fill(0xcc6666, 7, 6, 2, 1);
}

const SHIRT_STYLES_MAP = {
  'blue-lines': 0x4488cc,
  'river': 0xffffff,
  'white-v': 0xffffff,
  'pink': 0xff69b4,
  'black-logo': 0x1a1a1a,
};

export default class JoinScene extends Phaser.Scene {
  constructor() {
    super('JoinScene');
  }

  create() {
    const form = document.getElementById('join-form-overlay');
    const btn = document.getElementById('join-btn');
    const nameInput = document.getElementById('join-name');
    const posInput = document.getElementById('join-position');
    const previewCanvas = document.getElementById('avatar-preview');

    // Pre-fill from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        if (saved.name) nameInput.value = saved.name;
        if (saved.position) posInput.value = saved.position;
      }
    } catch (e) {
      // ignore parse errors
    }

    // Current selections
    let selectedShirt = 'blue-lines';
    let selectedHairStyle = 'short';
    let selectedHairColor = '0x3b2417';
    let selectedSkinColor = '0xf5d0b0';

    const updatePreview = () => {
      drawAvatarPreview(previewCanvas, {
        skin: selectedSkinColor,
        hair: selectedHairColor,
        shirt: SHIRT_STYLES_MAP[selectedShirt] || 0x4488cc,
        shirtStyle: selectedShirt,
        hairStyle: selectedHairStyle,
      });
    };

    // Shirt picker
    const shirtOptions = document.querySelectorAll('.shirt-option');
    const shirtLabel = document.getElementById('shirt-label');
    shirtOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        shirtOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedShirt = opt.dataset.shirt;
        if (shirtLabel) shirtLabel.textContent = opt.dataset.title || '';
        updatePreview();
      });
    });

    // Hair style picker
    const hairStyleOptions = document.querySelectorAll('.hair-option');
    const hairStyleLabel = document.getElementById('hair-style-label');
    hairStyleOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        hairStyleOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedHairStyle = opt.dataset.hair;
        if (hairStyleLabel) hairStyleLabel.textContent = opt.dataset.title || '';
        updatePreview();
      });
    });

    // Hair color picker
    const hairColorOptions = document.querySelectorAll('.hair-color-option');
    const hairColorLabel = document.getElementById('hair-color-label');
    hairColorOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        hairColorOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedHairColor = opt.dataset.haircolor;
        if (hairColorLabel) hairColorLabel.textContent = opt.dataset.title || '';
        updatePreview();
      });
    });

    // Skin color picker
    const skinColorOptions = document.querySelectorAll('.skin-color-option');
    const skinColorLabel = document.getElementById('skin-color-label');
    skinColorOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        skinColorOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedSkinColor = opt.dataset.skincolor;
        if (skinColorLabel) skinColorLabel.textContent = opt.dataset.title || '';
        updatePreview();
      });
    });

    // Pre-fill from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        if (saved.shirtStyle) {
          selectedShirt = saved.shirtStyle;
          shirtOptions.forEach((o) => {
            const match = o.dataset.shirt === selectedShirt;
            o.classList.toggle('selected', match);
            if (match && shirtLabel) shirtLabel.textContent = o.dataset.title || '';
          });
        }
        if (saved.hairStyle) {
          selectedHairStyle = saved.hairStyle;
          hairStyleOptions.forEach((o) => {
            const match = o.dataset.hair === selectedHairStyle;
            o.classList.toggle('selected', match);
            if (match && hairStyleLabel) hairStyleLabel.textContent = o.dataset.title || '';
          });
        }
        if (saved.hairColor) {
          selectedHairColor = saved.hairColor;
          hairColorOptions.forEach((o) => {
            const match = o.dataset.haircolor === selectedHairColor;
            o.classList.toggle('selected', match);
            if (match && hairColorLabel) hairColorLabel.textContent = o.dataset.title || '';
          });
        }
        if (saved.skinColor) {
          selectedSkinColor = saved.skinColor;
          skinColorOptions.forEach((o) => {
            const match = o.dataset.skincolor === selectedSkinColor;
            o.classList.toggle('selected', match);
            if (match && skinColorLabel) skinColorLabel.textContent = o.dataset.title || '';
          });
        }
      }
    } catch (e) { /* ignore */ }

    // Initial preview
    updatePreview();

    // Show the form
    form.classList.remove('form-hidden');

    const onJoin = () => {
      const name = nameInput.value.trim();
      const position = posInput.value.trim();

      if (!name || !position) return;

      // Save to localStorage for next time
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, position, shirtStyle: selectedShirt, hairStyle: selectedHairStyle, hairColor: selectedHairColor, skinColor: selectedSkinColor }));
      } catch (e) {
        // ignore storage errors
      }

      btn.disabled = true;
      btn.textContent = 'CONECTANDO...';

      socketManager.connect();

      socketManager.on('game:state', (state) => {
        // Store state in registry for BootScene / OfficeScene
        this.registry.set('myId', state.you.id);
        this.registry.set('players', state.players);

        // Hide form
        form.classList.add('form-hidden');

        // Clean up URL
        history.replaceState(null, '', '/');

        // Start game
        this.scene.start('BootScene');
      });

      socketManager.join({ name, position, shirtStyle: selectedShirt, hairStyle: selectedHairStyle, hairColor: selectedHairColor, skinColor: selectedSkinColor });
    };

    btn.addEventListener('click', onJoin);

    // Allow Enter to submit
    [nameInput, posInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onJoin();
      });
    });
  }
}
