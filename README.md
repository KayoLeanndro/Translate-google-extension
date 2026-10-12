# ViraLíngua

**Português ↔ Inglês.** Extensão para Chrome no computador. Selecione uma palavra ou frase curta numa página e veja a tradução ao lado.

## Instalar

1. Abra `chrome://extensions` no Chrome.
2. Ative **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação**.
4. Escolha esta pasta, que contém `manifest.json`.
5. No menu de extensões (ícone de quebra-cabeça), fixe **ViraLíngua** se desejar.
6. Recarregue as páginas que já estavam abertas antes da instalação.

## Usar

Clique no ícone da extensão e escolha **Português → Inglês** ou **Inglês → Português**. A direção inicial é Português → Inglês. As preferências são salvas neste navegador.

Marque um texto com o mouse ou com Shift + setas. A caixa mostra o original, a direção e a tradução. Feche com **×**, **Escape** ou clique fora. A caixa também fecha ao rolar ou redimensionar a página. Para pausar, desmarque **Traduzir ao selecionar** no painel.

## Privacidade e limites

- O texto selecionado é enviado por HTTPS à API pública MyMemory, sem chave ou cadastro. A extensão não envia o restante da página, não mantém histórico e não adiciona rastreamento.
- As preferências são armazenadas localmente. Não há tradução offline.
- O serviço gratuito tem limites e pode ficar indisponível; a extensão mostra uma mensagem nesses casos. Traduções automáticas podem conter erros.
- Cada seleção aceita até **500 bytes UTF-8**: letras com acento podem ocupar mais de um byte. Textos maiores não são enviados.
- Funciona em páginas HTTP/HTTPS, incluindo frames compatíveis. Páginas internas do Chrome, Chrome Web Store, PDFs e arquivos locais não são suportados. Campos de formulário e áreas editáveis são ignorados.
- A permissão de acesso às páginas permite detectar a seleção e mostrar a caixa. A permissão de armazenamento salva a direção e a ativação; o acesso de rede é restrito à API MyMemory.

## Marca e imagens

A identidade da **ViraLíngua** usa azul `#245BD6` e dois balões de conversa com setas em sentidos opostos. O nome usa a grafia **ViraLíngua**, com acento no **í**. A descrição complementar é **Português ↔ Inglês**.

- Logo horizontal com fundo transparente: `assets/brand/viralingua-logo.png` (1200 × 420).
- Símbolo com fundo transparente: `assets/brand/viralingua-symbol.png` (1024 × 1024).
- Ícones sem texto, com fundo transparente: `assets/icons/icon-16.png`, `icon-32.png`, `icon-48.png` e `icon-128.png`.
- Os arquivos SVG editáveis estão em `assets/brand`. O logo usa Segoe UI Bold no nome e Segoe UI na descrição.

O nome foi escolhido para este projeto; a disponibilidade comercial ainda não foi verificada. Estes materiais não representam publicação ou aprovação na Chrome Web Store.

## Desenvolvimento e verificação

JavaScript, HTML e CSS puros, com Manifest V3; não exige compilação. Depois de editar, clique em **Recarregar** na extensão e recarregue a página de teste.

Com Node.js instalado, execute `node --test tests/background.test.cjs`. Os testes simulam o serviço para conferir validação, falhas, limites e codificação. A integração real depende de internet e deve ser conferida nos dois sentidos.

Há também uma suíte de navegador em `tests/browser.test.cjs`, que carrega a extensão de verdade em um perfil temporário do Chromium e simula apenas as respostas da API. Ela exige Playwright disponível. `PLAYWRIGHT_PATH` pode apontar para o pacote Playwright; `BROWSER_EXECUTABLE` pode apontar para um navegador Chromium compatível com carregamento de extensões por linha de comando. Execute `node --test tests/browser.test.cjs`. Essas dependências são apenas para testes, não para instalar ou usar a extensão.

Checklist no Chrome: selecionar palavras com acentos e frases; trocar direção e reabrir o painel; desativar; selecionar rapidamente textos diferentes; fechar de todas as formas; selecionar perto das bordas; testar sem internet e com texto acima do limite. Confira **Erros** em `chrome://extensions` e o console do service worker.
