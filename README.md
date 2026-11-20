# LIVE WORLD 3D — versão mobile

## O que esta versão inclui
- Interface responsiva para navegador de celular.
- Campo de @ do TikTok e botão que tenta conectar a uma LIVE pública.
- Backend Node.js com Socket.IO para receber eventos e encaminhá-los ao navegador.
- Palco Three.js com avatares procedurais articulados, quatro ciclos básicos de dança e câmera com transições suaves.
- Botões funcionais para câmera automática, visão geral e troca de estilo de dança.

## Executar
Requer Node.js 20+:
1. Extraia o ZIP.
2. Na pasta do projeto, execute `npm install`.
3. Execute `npm start`.
4. Abra o endereço indicado pelo terminal.

## Publicar para acessar pelo celular
É necessário hospedar o backend em um serviço que mantenha Node.js ativo e suporte WebSocket, como uma VPS ou serviço de aplicação Node. Uma hospedagem apenas de arquivos estáticos não serve. Configure HTTPS no domínio.

## TikTok: limites importantes
A biblioteca `tiktok-live-connector` é comunitária e não oficial. A conexão só pode ser confirmada quando o backend conseguir conectar a uma LIVE pública ativa. O TikTok pode alterar ou limitar o protocolo, e alguns cenários podem exigir soluções externas de assinatura. O projeto não solicita senha, cookie ou código de acesso da conta.

Esta integração recebe eventos da LIVE; ela não transmite o palco de volta ao TikTok. Para transmitir o palco, é necessário usar TikTok LIVE Studio ou OBS com uma fonte de navegador/overlay e ter acesso aos recursos de transmissão da conta.

## Sobre a qualidade das danças
Os movimentos foram melhorados com articulações e transições suaves, mas os avatares ainda são modelos procedurais simples. Para dança realmente natural, com coreografias humanas de alta qualidade, adicione modelos GLB/VRM rigados e clipes de animação licenciados. Não há como transformar automaticamente um boneco procedural em um personagem realista sem esses assets.

## Testes
Não declare a conexão TikTok como validada antes de testar com uma LIVE real. Teste com uma conta que esteja efetivamente ao vivo e confira o estado exibido no painel.
