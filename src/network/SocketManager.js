import { io } from 'socket.io-client';

// In production use the env var set at build time, otherwise connect to LAN server
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

class SocketManager {
  constructor() {
    this.socket = null;
  }

  connect() {
    if (this.socket) return this.socket;
    this.socket = io(SERVER_URL);
    return this.socket;
  }

  join(data) {
    if (!this.socket) return;
    this.socket.emit('player:join', data);
  }

  sendMove(x, y) {
    if (!this.socket) return;
    this.socket.emit('player:move', { x, y });
  }

  // Camera
  sendCameraOn() {
    if (!this.socket) return;
    this.socket.emit('camera:on');
  }

  sendCameraOff() {
    if (!this.socket) return;
    this.socket.emit('camera:off');
  }

  // Mic
  sendMicOn() {
    if (!this.socket) return;
    this.socket.emit('mic:on');
  }

  sendMicOff() {
    if (!this.socket) return;
    this.socket.emit('mic:off');
  }

  // WebRTC signaling
  sendOffer(targetId, offer) {
    if (!this.socket) return;
    this.socket.emit('rtc:offer', { targetId, offer });
  }

  sendAnswer(targetId, answer) {
    if (!this.socket) return;
    this.socket.emit('rtc:answer', { targetId, answer });
  }

  sendIceCandidate(targetId, candidate) {
    if (!this.socket) return;
    this.socket.emit('rtc:ice', { targetId, candidate });
  }

  sendChat(message) {
    if (!this.socket) return;
    this.socket.emit('chat:send', { message });
  }

  on(event, callback) {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  get id() {
    return this.socket?.id ?? null;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SocketManager();
