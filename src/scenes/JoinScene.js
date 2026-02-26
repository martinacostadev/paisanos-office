import Phaser from 'phaser';
import socketManager from '../network/SocketManager.js';

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

    // Show the form
    form.classList.remove('form-hidden');

    const onJoin = () => {
      const name = nameInput.value.trim();
      const position = posInput.value.trim();
      const years = yearsInput.value.trim();

      if (!name || !position || !years) return;

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

      socketManager.join({ name, position, years });
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
