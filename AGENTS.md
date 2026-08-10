# Guia de manutenção do Formatinho

Este projeto é a aplicação de produção publicada em `https://formatinho.igorb.com.br`. Preserve a experiência existente e faça alterações pequenas e localizadas.

## Caminho crítico: Lista de cartas

A Lista de cartas é uma funcionalidade crítica. Uma otimização nunca pode impedir o primeiro conteúdo útil de aparecer.

- Use `getPersistentCatalogData()` como única origem de carregamento do índice e dos preços. Não crie outro `fetch` paralelo para esses mesmos arquivos.
- O primeiro render deve depender apenas do índice compacto já baixado. Não aguarde Scryfall, hidratação de imagens/detalhes, shards de preço ou Web Worker antes de mostrar cartas.
- `view.loaded = true` significa que o índice foi validado, os cards foram montados e um primeiro `render()` já ocorreu. Não marque o estado como carregado antes disso.
- Preços são enriquecimento: falha no índice de preços deve manter as cartas visíveis com a estimativa disponível, nunca derrubar o catálogo.
- Toda operação assíncrona que pode bloquear a interface precisa ter prazo finito: rede, IndexedDB e mensagens do Worker.
- O Worker é apenas uma otimização. Se ele falhar, travar, for suspenso pelo navegador ou exceder o timeout, encerre-o, limpe pedidos pendentes e execute `applyFiltersSync()` automaticamente.
- Busca por sintaxe/texto Oracle é refinamento remoto. Mantenha os resultados locais já renderizados enquanto a consulta ocorre e preserve uma saída utilizável em falhas ou timeout.
- Um botão “Tentar novamente” deve reiniciar promessa, Worker e buscas pendentes; repetir a mesma promessa travada não é recuperação.
- Valide a estrutura do cache antes de usá-lo. Um objeto com `cards` não basta: as tuplas precisam conter id, nome e campos mínimos esperados.
- Ao alterar `banlist.js`, `catalog-worker.js`, CSS ou service worker, atualize o cache-buster correspondente em `index.html` ou no construtor do Worker.

## Checklist obrigatório para mudanças no catálogo

Antes de publicar, execute e registre evidências para todos os cenários:

1. `node --check banlist.js`
2. `node --test tests/*.test.mjs`
3. `powershell -ExecutionPolicy Bypass -File .\build.ps1`
4. Acesso frio direto a `/?tab=catalog` sem cache: devem aparecer cards e contagem real.
5. Alternância Banlist → Lista de cartas → Banlist → Lista de cartas: a lista deve reaparecer sem recarregar a página.
6. Recarregamento com cache persistente e com filtros na URL.
7. Busca entre aspas e sintaxe Scryfall com rede lenta/falha: o catálogo não pode ficar eternamente ocupado.
8. Worker indisponível ou sem resposta: o filtro local deve assumir em até 5 segundos.
9. Teste mobile em 390 × 844 e desktop, sem overflow e sem loader permanente.
10. Na produção, confirme `#cardGrid .card-tile > 0`, `aria-busy="false"`, loader oculto, estado de erro oculto e ausência de erros no console.

Não declare o problema corrigido apenas porque o build compilou ou uma sessão limpa funcionou. A entrega exige prova no domínio oficial após o deploy.

## Dados e coleta de preços

- A automação de preços pode atualizar arquivos de dados sem mudar o caminho de carregamento do app.
- Preserve compatibilidade de esquema dos índices; qualquer mudança exige validação e fallback para versões antigas ou migração explícita.
- Nunca exponha tokens, secrets ou valores de `.env` em logs, commits ou respostas.
- A coleta LigaMagic permanece sequencial e respeita os limites definidos no workflow; mudanças no coletor não autorizam paralelismo agressivo.

## Publicação

- Confirme o branch e o SHA antes de publicar.
- Publique pelo processo oficial já configurado no repositório e no projeto Sites existente.
- Valide sempre `https://formatinho.igorb.com.br`; o endereço antigo de sites ChatGPT não é a referência de aceite.
