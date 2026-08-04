# Códice dos Banidos

Experiência estática e não oficial para consultar a banlist do playgroup com dados reais do Scryfall.

## Executar localmente

Como a integração usa `fetch`, sirva esta pasta por HTTP:

```powershell
python -m http.server 4173 -d codex-banlist
```

Abra `http://localhost:4173`.

## Configuração

Os valores editáveis ficam no objeto `site` no começo de `banlist.js`:

- `playgroupName` e `playgroupInitials`: identidade do playgroup.
- `pageTitle` e `pageSubtitle`: textos do hero.
- `scryfallQuery`: pesquisa da banlist.
- `backgroundCards`: nomes das cartas usadas no fundo.
- `backgroundInterval`: intervalo do crossfade em milissegundos.

Para trocar o brasão, adicione um SVG/PNG e ajuste a marcação de `index.html` ou `logoPath`.

## Dados, cache e limitações

O navegador consulta todas as páginas de `https://api.scryfall.com/cards/search` uma única vez ao carregar a página; os filtros são locais e não disparam novas consultas. O fundo usa uma chamada agrupada a `/cards/collection` e pré-carrega apenas a próxima arte. Não há cache persistente implementado, então um novo carregamento consulta novamente o Scryfall.

Se a API estiver indisponível, a interface mantém o visual, informa o erro e usa um pequeno conjunto local apenas para que os estados e filtros continuem demonstráveis.

Este é um projeto gratuito de fã. Magic: The Gathering e os materiais das cartas pertencem a seus respectivos proprietários. Dados e imagens são fornecidos pelo [Scryfall](https://scryfall.com). Consulte também a [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).

## Fanmade e uso privado

O projeto é uma página de fã gratuita, sem afiliação, patrocínio ou endosso da Wizards of the Coast, feita para uso pessoal e entre amigos. As artes das cartas e as cenas de fundo são carregadas remotamente do Scryfall; elas não são redistribuídas neste repositório. A marcação fanmade aparece na interface para deixar esse contexto visível.
