# Códice dos Banidos

Web app mobile-first para consultar a banlist do Playgroup da Amizade com dados e imagens reais do Scryfall.

## Experiência

- Busca instantânea por nome, texto, artista ou coleção, com normalização de acentos e sugestões em caso de erro de digitação.
- Filtros por formato, identidade de cor, tipo, valor de mana, raridade e coleção.
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
