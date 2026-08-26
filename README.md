# Painel PPMAC — Pesquisa em Assentamentos

Site estático (HTML/CSS/JS puro, sem build) para explorar os dados da pesquisa de campo
em assentamentos rurais (renda, mudanças climáticas e bioeconomia).

## Estrutura

```
data/                        base bruta (NÃO publicar — contém identificadores diretos)
  questionarios_clean.rds
  dicionario.xlsx
  derived/crosswalk_localidades.csv   correspondência de nomes de município/assentamento (revisar!)

scripts/
  01_process_anonymize.R     processa, anonimiza e decodifica a base -> site/data/*.json

site/                        <-- é isto que vai para o ar (hospedagem estática)
  index.html                 painel geral (KPIs + gráficos)
  explorar.html               explorador de dados (tabela + filtros)
  indicadores.html             construtor de indicadores (qualquer variável x recorte)
  sobre.html                   metodologia
  css/style.css
  js/                          data.js (carregador), dashboard.js, explorer.js, indicators.js
  js/vendor/chart.umd.min.js   Chart.js, hospedado localmente (sem dependência de CDN)
  img/                          logo PPMAC (ícone colorido, lockup completo, versão branca) + favicon
  data/catalog.json            catálogo de variáveis (gerado pelo script R)
  data/respondents.json        base anonimizada, decodificada (gerado pelo script R)

IDENTIDADE VISUAL - SITE/    arquivos-fonte da identidade visual (alta resolução, não usados
                              diretamente pelo site — as versões otimizadas ficam em site/img/)
```

## Identidade visual e paleta de cores

O ícone/logo (`site/img/`) vem da pasta `IDENTIDADE VISUAL - SITE/`. A paleta de cores dos
gráficos (`site/css/style.css`, variáveis `--series-1` a `--series-8` e `--seq-*`) foi
construída a partir do verde da marca PPMAC, com hues adicionais temáticos (azul-água,
laranja-calor, ciano-gelo, terracota-solo, dourado-energia, violeta-política, vermelho-risco).
Todas as cores foram validadas para daltonismo, contraste e legibilidade com o script
`validate_palette.js` da skill `dataviz`. Se a marca for atualizada, regenere os ícones em
`site/img/` a partir da nova identidade e revalide qualquer nova cor antes de usá-la em gráfico.

## Reprocessar os dados

Sempre que `questionarios_clean.rds` ou `dicionario.xlsx` forem atualizados, rode:

```bash
Rscript scripts/01_process_anonymize.R
```

Isso regenera `site/data/catalog.json` e `site/data/respondents.json`, e reexporta
`data/derived/crosswalk_localidades.csv` para conferência da equipe.

Pacotes R usados: `readxl`, `dplyr`, `tidyr`, `stringr`, `purrr`, `jsonlite`.

## Rodar localmente

O navegador bloqueia `fetch()` de arquivos locais (`file://`), então é preciso servir a
pasta `site/` por HTTP:

```bash
cd site
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Publicar

`site/` é 100% estático — pode subir como está para GitHub Pages, Netlify, Vercel ou
qualquer hospedagem de arquivos estáticos. Não é necessário processo de build.

**Importante:** publique apenas a pasta `site/`. A pasta `data/` (na raiz do projeto)
contém a base bruta com identificadores diretos e não deve ir para um servidor público.

## Privacidade

A base publicada em `site/data/respondents.json` já passou por anonimização (nomes,
coordenadas GPS exatas, identificadores de dispositivo/entrevistador e campos de texto
livre foram removidos — ver `sobre.html` para a lista completa). Antes de qualquer nova
publicação, revise `scripts/01_process_anonymize.R` se novas colunas sensíveis forem
adicionadas ao questionário.
