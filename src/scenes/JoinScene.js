import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';

const STORAGE_KEY = 'paisanos_user';

export default class JoinScene extends Phaser.Scene {
  constructor() {
    super('JoinScene');
  }

  create() {
    const form = document.getElementById('join-form-overlay');
    const btn = document.getElementById('join-btn');
    const nameInput = document.getElementById('join-name');
    const posInput = document.getElementById('join-position');
    const yearsInput = document.getElementById('join-years');

    // Pre-fill from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        if (saved.name) nameInput.value = saved.name;
        if (saved.position) posInput.value = saved.position;
        if (saved.years) yearsInput.value = saved.years;
      }
    } catch (e) {
      // ignore parse errors
    }

    // Shirt picker
    let selectedShirt = 'blue-lines';
    const shirtOptions = document.querySelectorAll('.shirt-option');
    const shirtLabel = document.getElementById('shirt-label');
    shirtOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        shirtOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedShirt = opt.dataset.shirt;
        if (shirtLabel) shirtLabel.textContent = opt.dataset.title || '';
      });
    });

    // Pre-fill shirt from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.shirtStyle) {
        selectedShirt = saved.shirtStyle;
        shirtOptions.forEach((o) => {
          const match = o.dataset.shirt === selectedShirt;
          o.classList.toggle('selected', match);
          if (match && shirtLabel) shirtLabel.textContent = o.dataset.title || '';
        });
      }
    } catch (e) { /* ignore */ }

    // Hair style picker
    let selectedHairStyle = 'short';
    const hairStyleOptions = document.querySelectorAll('.hair-option');
    const hairStyleLabel = document.getElementById('hair-style-label');
    hairStyleOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        hairStyleOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedHairStyle = opt.dataset.hair;
        if (hairStyleLabel) hairStyleLabel.textContent = opt.dataset.title || '';
      });
    });

    // Hair color picker
    let selectedHairColor = '0x3b2417';
    const hairColorOptions = document.querySelectorAll('.hair-color-option');
    const hairColorLabel = document.getElementById('hair-color-label');
    hairColorOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        hairColorOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedHairColor = opt.dataset.haircolor;
        if (hairColorLabel) hairColorLabel.textContent = opt.dataset.title || '';
      });
    });

    // Pre-fill hair from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
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
      }
    } catch (e) { /* ignore */ }

    // Show the form
    form.classList.remove('form-hidden');

    const onJoin = () => {
      const name = nameInput.value.trim();
      const position = posInput.value.trim();
      const years = yearsInput.value.trim();

      if (!name || !position || !years) return;

      // Save to localStorage for next time
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, position, years, shirtStyle: selectedShirt, hairStyle: selectedHairStyle, hairColor: selectedHairColor }));
      } catch (e) {
        // ignore storage errors
      }

      btn.disabled = true;
      btn.textContent = 'CONNECTING...';

      socketManager.connect();

      socketManager.on('game:state', (state) => {
        // Store state in registry for BootScene / OfficeScene
        this.registry.set('myId', state.you.id);
        this.registry.set('players', state.players);

        // Hide form
        form.classList.add('form-hidden');

        // Start game
        this.scene.start('BootScene');
      });

      socketManager.join({ name, position, years, shirtStyle: selectedShirt, hairStyle: selectedHairStyle, hairColor: selectedHairColor });
    };

    btn.addEventListener('click', onJoin);

    // Allow Enter to submit
    [nameInput, posInput, yearsInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onJoin();
      });
    });
  }
}
