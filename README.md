# Atlanta Connect

Calls privadas, tela compartilhada e modo cinema com amigos — um clone funcional do app que você me mostrou.

## O que tem pronto

- **Landing page** com nome, código de sala (gerar ou colar um), e link direto tipo `?room=W75RF4`.
- **Call de voz e câmera** em tempo real via WebRTC (conexão direta entre os participantes, sem passar vídeo pelo servidor).
- **Compartilhar tela** (aba, janela ou tela inteira).
- **Modo cinema**: a tela compartilhada (ou o primeiro vídeo) vira o foco em tamanho grande, e o resto vira uma tira de miniaturas embaixo.
- Indicador de microfone mudo, contador de participantes, copiar link da sala, toasts de "fulano entrou".

O servidor (Node + Socket.IO) só faz a parte de **sinalização** — combinar quem está em qual sala e trocar as mensagens que o WebRTC precisa para os navegadores se conectarem direto um no outro. O áudio/vídeo em si nunca passa pelo seu servidor.

## Rodar localmente

Requisitos: Node.js 18+.

```bash
npm install
npm start
```

Abra `http://localhost:3000` em duas abas (ou dois dispositivos na mesma rede) para testar uma call entre "duas pessoas".

> Câmera/microfone só funcionam em `localhost` ou em HTTPS — é regra do navegador, não do app.

## Estrutura

```
server.js            servidor Express + Socket.IO (sinalização WebRTC)
public/
  index.html          landing page
  room.html            página da sala (call)
  css/styles.css       estilo (tema "Atlanta" com contornos topográficos)
  js/landing.js         lógica da landing (gerar código, entrar na sala)
  js/room.js            WebRTC: peers, mic/câmera, tela, modo cinema
```

## Deploy

Como o app precisa de uma conexão persistente (WebSocket) para a sinalização, ele roda melhor em uma plataforma com processo Node "always-on":

- **Render** ou **Railway**: conecte o repositório, comando de start `npm start`, porta vem de `process.env.PORT` (já configurado).
- **Fly.io**: `fly launch` detecta o Node automaticamente.
- **Vercel**: funciona para servir os arquivos estáticos, mas as *Serverless/Edge Functions* da Vercel não mantêm WebSocket aberto — para usar Vercel você precisaria trocar Socket.IO por uma solução de sinalização sem estado persistente (ex.: Pusher, Ably, ou Vercel + um serviço externo só para sinalização). Por isso recomendo Render/Railway/Fly para esse projeto como está.

## Próximos passos possíveis

- Chat de texto na sala (dá pra reaproveitar o canal do Socket.IO que já existe).
- Grid adaptativo para salas com muita gente (hoje é malha P2P, funciona bem até uns 6–8 participantes).
- Persistir preferência de câmera/mic entre sessões.
- TURN server (ex. Twilio, Metered, coturn) para quando alguém está atrás de um NAT/firewall mais restritivo e o STUN público não é suficiente.
