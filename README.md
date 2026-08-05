# Códice das Cartas Banidas

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

A coleção `Unfinity Sticker Sheets` (`SUNF`) é excluída da banlist por decisão do playgroup.

O validador consulta o endpoint de coleções do Scryfall em lotes de até 75 nomes e combina a legalidade oficial de cada carta com a banlist já carregada. Se essa consulta falhar, a interface informa que o resultado é parcial. O recurso não avalia tamanho do deck, limite geral de cópias nem identidade de cor do comandante.

As imagens da grade usam `srcset`, dimensões reservadas, decodificação assíncrona e `loading="lazy"`. Apenas 48 cartas são reveladas inicialmente; as seguintes entram sob demanda. O detalhe técnico completo de cada carta só é montado quando o usuário abre essa seção.

Os valores em BRL são estimativas calculadas a partir do preço em USD fornecido pelo Scryfall e do câmbio de referência ECB consultado via Frankfurter. A área de mercado também oferece uma consulta direta da carta na LigaMagic; o site não faz scraping nem apresenta o valor convertido como se fosse uma cotação da LigaMagic.

## Configuração

Os valores principais ficam no objeto `site` no início de `banlist.js`:

- `playgroupName` e `playgroupInitials`: identidade do grupo.
- `pageTitle` e `pageSubtitle`: título e explicação principal.
- `scryfallQuery`: consulta que define a banlist.
- `backgroundCards`: artes oficiais usadas atmosfericamente no hero.

Não altere `scryfallQuery` sem validar as regras da banlist com o playgroup.

## Fanmade e uso privado

Este é um projeto de fã gratuito, sem afiliação, patrocínio ou endosso da Wizards of the Coast, feito para uso pessoal e entre amigos. Magic: The Gathering, nomes e artes das cartas pertencem a seus respectivos proprietários. Os dados e as imagens são carregados do Scryfall e não são redistribuídos pelo repositório.
