import socketManager from './SocketManager.js';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

class WebRTCManager {
  constructor() {
    this.localStream = null;
    this.peers = new Map(); // peerId -> { pc, remoteStream }
    this.cameraOn = false;
    this.micOn = false;
    this.audioElements = new Map(); // peerId -> HTMLAudioElement
    this._signalListenersSet = false;
  }

  async startCamera() {
    if (this.localStream) return this.localStream;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 160, height: 120 },
      audio: true,
    });
    // Start audio track disabled — user must click mic button to enable
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
    this.cameraOn = true;
    this._setupSignaling();
    socketManager.sendCameraOn();
    return this.localStream;
  }

  toggleMic() {
    if (!this.localStream) return false;
    this.micOn = !this.micOn;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = this.micOn; });
    if (this.micOn) {
      socketManager.sendMicOn();
    } else {
      socketManager.sendMicOff();
    }
    return this.micOn;
  }

  setRemoteAudioMuted(peerId, muted) {
    const el = this.audioElements.get(peerId);
    if (el) el.muted = muted;
  }

  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.cameraOn = false;
    this.micOn = false;
    socketManager.sendCameraOff();
    socketManager.sendMicOff();

    // Clean up audio elements
    for (const [, el] of this.audioElements) {
      el.srcObject = null;
      el.remove();
    }
    this.audioElements.clear();

    // Close all peer connections
    for (const [id, peer] of this.peers) {
      peer.pc.close();
    }
    this.peers.clear();
  }

  _setupSignaling() {
    if (this._signalListenersSet) return;
    this._signalListenersSet = true;

    socketManager.on('camera:on', ({ id }) => {
      // Another player turned on camera — if we have ours on, initiate connection
      // The player with the "lower" ID creates the offer to avoid duplicates
      if (!this.cameraOn) return;
      if (socketManager.id < id) {
        this._createOffer(id);
      }
    });

    socketManager.on('camera:off', ({ id }) => {
      this._closePeer(id);
    });

    socketManager.on('player:left', ({ id }) => {
      this._closePeer(id);
    });

    socketManager.on('rtc:offer', async ({ fromId, offer }) => {
      if (!this.cameraOn) return;
      await this._handleOffer(fromId, offer);
    });

    socketManager.on('rtc:answer', async ({ fromId, answer }) => {
      const peer = this.peers.get(fromId);
      if (!peer) return;
      await peer.pc.setRemoteDescription(answer);
    });

    socketManager.on('rtc:ice', async ({ fromId, candidate }) => {
      const peer = this.peers.get(fromId);
      if (!peer || !candidate) return;
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (e) {
        // ICE candidate error, ignore
      }
    });
  }

  async connectToExistingPeers(cameraPeerIds) {
    // Called when we turn camera on and there are already peers with cameras
    for (const peerId of cameraPeerIds) {
      if (peerId === socketManager.id) continue;
      if (this.peers.has(peerId)) continue;
      if (socketManager.id < peerId) {
        await this._createOffer(peerId);
      }
      // If our ID is higher, we wait for their offer
    }
  }

  async _createOffer(targetId) {
    const pc = this._createPeerConnection(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketManager.sendOffer(targetId, pc.localDescription);
  }

  async _handleOffer(fromId, offer) {
    const pc = this._createPeerConnection(fromId);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketManager.sendAnswer(fromId, pc.localDescription);
  }

  _createPeerConnection(peerId) {
    // Close existing connection if any
    if (this.peers.has(peerId)) {
      this.peers.get(peerId).pc.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerData = { pc, remoteStream: null };
    this.peers.set(peerId, peerData);

    // Add our local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      peerData.remoteStream = event.streams[0];
      // If this is an audio track, create an <audio> element for it
      if (event.track.kind === 'audio') {
        let audioEl = this.audioElements.get(peerId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.muted = true; // muted until proximity check unmutes
          audioEl.setAttribute('data-peer', peerId);
          document.body.appendChild(audioEl);
          this.audioElements.set(peerId, audioEl);
        }
        audioEl.srcObject = event.streams[0];
      }
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketManager.sendIceCandidate(peerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this._closePeer(peerId);
      }
    };

    return pc;
  }

  _closePeer(id) {
    const peer = this.peers.get(id);
    if (peer) {
      peer.pc.close();
      this.peers.delete(id);
    }
    const audioEl = this.audioElements.get(id);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      this.audioElements.delete(id);
    }
  }

  getRemoteStream(peerId) {
    const peer = this.peers.get(peerId);
    return peer?.remoteStream ?? null;
  }
}

export default new WebRTCManager();
