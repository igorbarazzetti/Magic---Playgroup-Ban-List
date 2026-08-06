# Códice do Formatinho

Web app mobile-first para consultar a banlist do Playgroup da Amizade com dados e imagens reais do Scryfall.

## Experiência

- Busca instantânea por nome, texto, artista ou coleção, com normalização de acentos e sugestões em caso de erro de digitação.
- Filtros por formato, identidade de cor com seleção múltipla por símbolos de mana, tipo, valor de mana, raridade e coleção.
- Validador de deck por formato, incluindo o `Formatinho` do playgroup — união das banlists oficiais —, com leitura de listas do Arena, Moxfield ou texto simples e identificação das cartas banidas, fora do formato ou não reconhecidas.
- Grade responsiva com imagens progressivas, dimensões reservadas, lazy loading e carregamento incremental.
- Detalhe em tela cheia no mobile, com navegação entre cartas e retorno à posição exata da lista.
- Informações completas devolvidas pelo Scryfall, organizadas por revelação progressiva.
- Estados de carregamento, erro, cache, falta de conexão e busca vazia.
- Suporte a teclado, leitores de tela, safe areas, zoom e `prefers-reduced-motion`.

## Executar localmente

Sirva a pasta por HTTP:

```powershell
python -m http.server 4173 --directory .
```

Abra `http://localhost:4173`.

## Dados e desempenho

A aplicação consulta as páginas de busca do Scryfall uma vez, filtra localmente e mantém um cache no dispositivo por seis horas. Se uma atualização falhar, o último arquivo disponível continua acessível; sem API e sem cache, a interface apresenta um erro real e oferece nova tentativa.

A aba **Lista de cartas** usa um índice compacto da consulta `(game:paper) usd<20.00 prefer:best`. Ela preserva filtros e rolagem separadamente da banlist, oculta cartas banidas por padrão e carrega imagens e detalhes do Scryfall apenas para as cartas visíveis. Pesquisas entre aspas consultam o texto Oracle exato no Scryfall.

As coleções `Unfinity` (`UNF`) e `Unfinity Sticker Sheets` (`SUNF`) são excluídas da banlist por decisão do playgroup.

## Menor preço na LigaMagic

O detalhe de cada carta mostra apenas o menor preço de uma cópia Normal/NM encontrado entre todas as impressões, com link e menção à LigaMagic. Até a primeira consulta, o catálogo mostra uma estimativa calculada com o preço USD do Scryfall e a PTAX diária do Banco Central.

O workflow `update-ligamagic-prices.yml` processa 100 cartas por vez, sem paralelismo e com intervalo mínimo de dez segundos. Durante a cobertura inicial ele roda a cada duas horas e prioriza cartas nunca consultadas. Depois de completar o catálogo, o coletor passa automaticamente à manutenção e ignora execuções até completar uma janela de seis horas. Falhas preservam o último valor como desatualizado; cartas sem oferta ficam marcadas como indisponíveis. Os índices de preço e os detalhes particionados por `oracle_id` são atualizados diretamente no GitHub, sem republicar o site.

Como a LigaMagic bloqueia os endereços dos runners hospedados do GitHub, esse workflow usa o runner Windows exclusivo `magic-banlist`, registrado nesta máquina e iniciado por uma tarefa agendada no login. A máquina precisa permanecer ligada, conectada e com a sessão do usuário ativa durante os lotes; quando estiver offline, o GitHub mantém o job na fila até o runner voltar.

O validador consulta o endpoint de coleções do Scryfall em lotes de até 75 nomes e combina a legalidade oficial de cada carta com a banlist já carregada. Se essa consulta falhar, a interface informa que o resultado é parcial. O recurso não avalia tamanho do deck, limite geral de cópias nem identidade de cor do comandante.

As imagens da grade usam `srcset`, dimensões reservadas, decodificação assíncrona e `loading="lazy"`. Apenas 48 cartas são reveladas inicialmente; as seguintes entram sob demanda. O detalhe técnico completo de cada carta só é montado quando o usuário abre essa seção.

## Configuração

Os valores principais ficam no objeto `site` no início de `banlist.js`:

- `playgroupName` e `playgroupInitials`: identidade do grupo.
- `pageTitle` e `pageSubtitle`: título e explicação principal.
- `scryfallQuery`: consulta que define a banlist.
- `backgroundCards`: artes oficiais usadas atmosfericamente no hero.

Não altere `scryfallQuery` sem validar as regras da banlist com o playgroup.

## Fanmade e uso privado

Este é um projeto de fã gratuito, sem afiliação, patrocínio ou endosso da Wizards of the Coast, feito para uso pessoal e entre amigos. Magic: The Gathering, nomes e artes das cartas pertencem a seus respectivos proprietários. Os dados e as imagens são carregados do Scryfall e não são redistribuídos pelo repositório.
