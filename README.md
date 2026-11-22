# LIVE WORLD 3D v2

Palco 3D vertical (9:16) que reage a uma LIVE do TikTok: espectadores entram como personagens com o nome acima da
cabeça, presentes disparam danças e efeitos, e sua música toca no palco. O painel funciona no celular; o vídeo do palco
sai por uma página limpa para o **OBS / TikTok LIVE Studio**.

> **Leia a seção "Estado real do projeto" antes de publicar.** Esta versão foi construída num ambiente **sem internet**:
> a lógica foi testada, mas o visual 3D, o `npm install`, a conexão real com o TikTok e o Render **não** puderam ser testados.

---

## Publicar no Render (passo a passo)
1. Crie um repositório no GitHub e envie **o conteúdo desta pasta** (não envie `node_modules`).
2. No Render: **New + → Blueprint** → escolha o repositório (usa o `render.yaml`). *Ou* **New + → Web Service** com:
   - Build Command: `npm install` · Start Command: `npm start` · Health Check Path: `/health`
3. Em **Environment**, confira as variáveis (tabela abaixo). **`ADMIN_TOKEN`**: o Blueprint gera uma; veja o valor em
   *Environment* e guarde — é a senha do painel.
4. Aguarde o deploy e abra `https://SEU-APP.onrender.com/health`. Deve aparecer `"ok": true`, `"connectorInstalled": true`
   e `"threeInstalled": true`. Se algum for `false`, o `npm install` falhou: veja os logs de build.
5. Abra `https://SEU-APP.onrender.com/` (painel).

Plano gratuito: o serviço pode hibernar sem uso e o disco é temporário (músicas enviadas somem ao reiniciar).

## Abrir pelo celular (Android e iPhone)
- Abra o endereço do Render no Chrome/Safari. Aba **Conectar**: digite o @ da LIVE, informe a senha do painel
  (`ADMIN_TOKEN`) quando pedida e toque **CONECTAR**.
- Aba **Palco**: prévia do palco. No iPhone o Safari não põe um iframe em tela cheia: o botão cai para "nova aba".
- O som só começa depois de um toque na tela (regra dos navegadores): use o botão "TOQUE PARA ATIVAR O ÁUDIO".

## Conectar o TikTok
- Digite `@usuario`, `usuario` ou o link da LIVE. A LIVE precisa estar **ao vivo** nesse momento.
- O painel só mostra **CONECTADO** depois que o servidor confirma a conexão. Há dois indicadores: *Servidor* (painel ↔
  seu servidor) e *TikTok* (servidor ↔ LIVE).
- Se cair, o servidor tenta reconectar sozinho (5 tentativas com espera crescente) e mostra o andamento; depois disso, erro.
- Nenhuma senha, cookie ou login do TikTok é pedido.
- **Aviso:** a conexão usa a biblioteca comunitária `tiktok-live-connector`, **não a API oficial do TikTok**. Ela pode
  quebrar quando o TikTok muda, pode exigir um serviço de assinatura (`TIKTOK_SIGN_API_KEY`) e IPs de provedores de
  nuvem às vezes são limitados. Só dá para saber testando com uma LIVE real.

## Colocar o palco na transmissão (OBS / LIVE Studio)
Receber comentários **não** transmite vídeo. Quem envia o vídeo é o OBS/LIVE Studio.
1. Aba **Transmitir** → copie o endereço (`https://SEU-APP.onrender.com/stage.html?clean=1`).
2. OBS: Fontes → **Navegador** → cole o endereço, **1080 × 1920**, marque "Controlar áudio pelo OBS".
3. Para aliviar a placa de vídeo: `...?clean=1&q=med` ou `&q=low`. Diagnóstico na tela: `&debug=1`.
4. Não existe transmissão direta pelo navegador do celular. O TikTok pode exigir requisitos de conta para transmitir
   por programa de computador; confirme no seu app.

## Músicas
Aba **Música** → enviar MP3/M4A/AAC/OGG/WAV (até `MAX_UPLOAD_MB`). Play/pausa/volume/próxima valem para o palco
inteiro (inclusive o OBS), via servidor. As danças reagem à energia dos graves da música tocando (detecção de batida
simples — não é BPM exato). Envie apenas músicas que você pode usar; nenhuma música acompanha o projeto.

## Personagens: humanoide de reserva ou seus modelos GLB
Nenhum modelo 3D acompanha o projeto (sem licença verificada/sem internet). Sem modelos, o palco usa um **humanoide
procedural** (rosto, olhos, cabelo, roupas, mãos, sapatos; 6 danças) — **não é ultra-realista**.
Para modelos realistas, siga `public/models/LEIAME.md` (GLB com esqueleto + `manifest.json`).

## Presentes → dança/efeito
Edite `config/gifts.json` (por nome do presente, por faixa de diamantes ou padrão). Sequências de presentes contam
**uma vez**, no fim da sequência; repetições com o mesmo `msgId` são ignoradas.

## Variáveis de ambiente
| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 3000 | Porta (Render define) |
| `ADMIN_TOKEN` | vazio | Senha do painel. **Defina em produção.** |
| `TIKTOK_SIGN_API_KEY` | vazio | Chave do serviço de assinatura do conector, se necessário |
| `MUSIC_DIR` / `MAX_UPLOAD_MB` | `./data/music` / 30 | Pasta e limite das músicas |
| `RECONNECT_BACKOFF_MS` | `2000,4000,8000,16000,30000` | Esperas da reconexão |
| `ENABLE_TEST_EVENTS` | 0 | 1 = botões de evento de teste local (não é TikTok) |
| `LOG_LEVEL` | info | debug/info/warn/error |

## Rotas
`GET /health` (diagnóstico) · `GET /api/status` · `GET /api/config` · `POST /api/connect` · `POST /api/disconnect` ·
`POST /api/cmd` · `GET|POST|DELETE /api/music…` · WebSocket em `/ws` · `/stage.html` (palco) · `/` (painel).
Rotas que alteram algo exigem o cabeçalho `x-admin-token` quando `ADMIN_TOKEN` está definido.

## Rodar no computador
```
npm install
npm start            # http://localhost:3000
npm test             # testes de lógica, servidor, WebSocket, upload
npm run test:smoke   # roda o engine do palco com THREE simulado (lógica, não visual)
```
Node 20 ou superior. `test/serve-fake.mjs` sobe um servidor com conector **simulado**, só para testar o painel.

## Estado real do projeto
**Testado de verdade (executado no ambiente de criação, Node 22):**
- 32 testes automatizados: limpeza do @, normalização de eventos, presentes sem contagem dupla (sequência, fim perdido,
  msgId repetido), espectadores sem duplicar, reconexão automática, desconexão manual, status só "conectado" após confirmação.
- `npm start` real: porta dinâmica, `/health`, arquivos estáticos, proteção contra path traversal, 404/503/401/400, token,
  limite de tentativas, WebSocket (hello, eventos, reconexão), upload/Range/limite/remoção de música.
- Painel em Chromium com viewport de celular: 15 verificações (senha, erro de perfil offline, CONECTADO, feed, XSS, upload, play, OBS URL).
- Teste de fumaça do `engine.js` com Three.js **simulado**: entrada/andar/dançar, slots sem duplicar, presente → dança/efeito/câmera, limite do palco, reset, limites da câmera, números finitos.

**NÃO testado (depende de internet, dispositivo ou serviço externo):**
- `npm install` (sem rede no ambiente) — versões em `package.json` ainda não foram resolvidas por este projeto.
- **Conexão real com uma LIVE** e o formato exato dos eventos do `tiktok-live-connector` (campos `giftType`, `repeatEnd`, `giftDetails`…).
- **Visual 3D**: aparência, iluminação, enquadramento da câmera, desempenho em celulares, qualidade do humanoide.
- Carregamento de modelos GLB e seleção de clipes por nome.
- Áudio real (autoplay, volume, detecção de batida) em Chrome/Safari/OBS; iPhone/Safari; captura no OBS/LIVE Studio.
- Deploy no Render.

**Não implementado:** modelos humanos realistas incluídos, VRM, transmissão direta do celular para o TikTok,
persistência das músicas em disco temporário.

Substituição em relação à v1.1: Express e Socket.IO foram trocados por HTTP + WebSocket nativos do Node (menos
dependências, testável offline). A biblioteca de TikTok e a versão `^2.1.0` foram mantidas.
