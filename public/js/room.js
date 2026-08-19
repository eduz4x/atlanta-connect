<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sala • Atlanta Connect</title>
<link rel="stylesheet" href="/css/styles.css" />
</head>
<body class="room-body">
  <div class="room-shell" id="room-shell">
    <header class="room-topbar">
      <div class="brand">
        <img class="brand-mark" src="/assets/logo.png" alt="Atlanta Network" />
      </div>
      <div class="room-code-badge" id="copy-link" title="Copiar link da sala">
        <span id="room-code-label">------</span>
        <div class="copy-icon">⧉</div>
      </div>
      <div class="participant-count" id="participant-count">1 na sala</div>
    </header>

    <div class="stage" id="stage">
      <!-- video tiles injected here -->
    </div>

    <div class="filmstrip" id="filmstrip"></div>

    <footer class="controls">
      <button class="ctrl-btn" id="mic-btn" title="Ativar/desativar microfone">🎤</button>
      <button class="ctrl-btn off" id="cam-btn" title="Ativar/desativar câmera">📷</button>
      <button class="ctrl-btn" id="share-btn" title="Compartilhar tela">🖥️</button>
      <button class="ctrl-btn" id="cinema-btn" title="Modo cinema">🎬</button>
      <button class="ctrl-btn" id="volume-btn" title="Volume">🔊</button>
      <button class="ctrl-btn leave" id="leave-btn" title="Sair da sala">Sair</button>
    </footer>

    <div class="volume-panel" id="volume-panel" hidden>
      <div class="volume-row">
        <label for="mic-volume">Microfone</label>
        <input type="range" id="mic-volume" min="0" max="200" value="100" />
        <span class="volume-value" id="mic-volume-value">100%</span>
      </div>
      <div class="volume-row">
        <label for="playback-volume">Transmissão</label>
        <input type="range" id="playback-volume" min="0" max="100" value="100" />
        <span class="volume-value" id="playback-volume-value">100%</span>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/room.js"></script>
</body>
</html>
