(async function () {
  const { respondents, catalog } = await AppData.load();
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const n = respondents.length;
  const nMunicipios = uniqueValues(respondents, 'municipio').length;
  const nAssentamentos = uniqueValues(respondents, 'assentamento').length;
  const chefiaFem = pct(respondents.filter(r => r.chefe_mulher === 'Sim').length, n);
  const ouviuClima = countBy(respondents, 'mudanca_climaticas');
  const ouviuClimaSim = pct((ouviuClima['Sim'] || 0), n);
  const ouviuBio = countBy(respondents, 'bioeconomia');
  const ouviuBioSim = pct((ouviuBio['Sim'] || 0), n);
  const interesseAmpliar = pct(countBy(respondents, 'ampliar_producao_bio')['Sim'] || 0, n);
  const importanciaAlta = pct(countBy(respondents, 'importancia_produto_bio')['5'] || 0, n);
  const semApoioBio = pct(countBy(respondents, 'recebeu_apoio_bio')['Não'] || 0, n);

  const kpis = el('div', { class: 'grid cols-4', style: 'margin-bottom:32px' }, [
    kpiCard(fmtNum(n), 'Domicílios entrevistados', 'var(--accent-perfil)'),
    kpiCard(nMunicipios, 'Municípios', 'var(--accent-perfil)'),
    kpiCard(nAssentamentos, 'Assentamentos', 'var(--accent-perfil)'),
    kpiCard(chefiaFem + '%', 'Chefia familiar feminina', 'var(--accent-perfil)'),
  ]);
  root.appendChild(kpis);

  root.appendChild(sectionHeading('Perfil e localização',
    'Onde as famílias entrevistadas vivem e como são compostas.', 'var(--accent-perfil)'));
  root.appendChild(el('div', { class: 'grid cols-1' }, [
    chartCard('geoTreemap', 'Entrevistas por município e assentamento', 420,
      'Área proporcional ao número de domicílios entrevistados. Passe o mouse para ver o nome e a contagem de cada assentamento.'),
  ]));
  root.appendChild(el('div', { class: 'grid cols-3', style: 'margin-top:16px' }, [
    chartCard('sexoChart', 'Sexo do(a) entrevistado(a)', 250),
    chartCard('faixaChart', 'Faixa etária', 250),
    chartCard('rendaChart', 'Renda familiar mensal', 250),
  ]));
  root.appendChild(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    chartCard('faixaSexoChart', 'Faixa etária por sexo', 280),
    chartCard('tempoBoxplot', 'Tempo de residência no assentamento (anos), por município', 280,
      'A linha central é a mediana, a caixa cobre 50% das famílias e os traços marcam o intervalo típico.'),
  ]));

  root.appendChild(sectionHeading('Percepção sobre mudanças climáticas',
    'O que as famílias observam, temem e já ouviram falar sobre o clima.', 'var(--accent-clima)'));
  root.appendChild(el('div', { class: 'grid cols-3' }, [
    kpiCardBox(ouviuClimaSim + '%', 'Já ouviram falar sobre "mudanças climáticas"', 'var(--accent-clima)'),
    chartCard('preocupacaoChart', 'Nível de preocupação (1 = nenhuma, 5 = muito alta)', 250),
    chartCard('ameacaChart', 'Mudanças climáticas ameaçam a produção?', 250),
  ]));

  root.appendChild(sectionHeading('Bioeconomia',
    'Conhecimento, interesse e obstáculos das famílias com produtos e cadeias da sociobiodiversidade.', 'var(--accent-bio)'));
  root.appendChild(el('div', { class: 'grid cols-4' }, [
    kpiCard(ouviuBioSim + '%', 'Já ouviram falar sobre "Bioeconomia"', 'var(--accent-bio)'),
    kpiCard(interesseAmpliar + '%', 'Têm interesse em ampliar produção e renda', 'var(--accent-bio)'),
    kpiCard(importanciaAlta + '%', 'Consideram os produtos muito importantes p/ renda', 'var(--accent-bio)'),
    kpiCard(semApoioBio + '%', 'Nunca receberam apoio público ou privado', 'var(--accent-bio)'),
  ]));
  root.appendChild(el('div', { class: 'grid cols-1', style: 'margin-top:16px' }, [
    chartCard('produtosBioChart', 'Produtos da bioeconomia mais citados pelas famílias', 460,
      'Cada família podia citar múltiplos produtos que cultiva, coleta ou extrai da floresta.'),
  ]));
  root.appendChild(el('div', { class: 'grid cols-3', style: 'margin-top:16px' }, [
    chartCard('bioChart', 'Conhece o termo Bioeconomia?', 250),
    chartCard('ampliarBioChart', 'Interesse em ampliar produção e renda com esses produtos', 250),
    chartCard('cadeiaBioChart', 'Participa de cadeia de valor estruturada?', 250),
  ]));
  root.appendChild(el('div', { class: 'grid cols-1', style: 'margin-top:16px' }, [
    chartCard('bioMunicipioChart', 'Conhece o termo Bioeconomia, por município', 300,
      'Cada barra é um município: quantas famílias já ouviram falar do termo, contra quantas nunca ouviram.'),
  ]));
  root.appendChild(el('div', { class: 'grid cols-1', style: 'margin-top:16px' }, [
    chartCard('dificuldadeBioChart', 'Maiores dificuldades para ampliar a produção', 320),
  ]));
  root.appendChild(el('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [
    chartCard('comercioBioChart', 'Como comercializa os produtos', 270),
    chartCard('climaCadeiaBioChart', 'Como as mudanças climáticas afetam essas cadeias', 270),
  ]));
  root.appendChild(el('div', { class: 'grid cols-3', style: 'margin-top:16px' }, [
    chartCard('jovemBioChart', 'Jovens interessados em dar continuidade', 260),
    chartCard('novosBioChart', 'Interesse em novos produtos da floresta', 250),
    chartCard('importanciaBioChart', 'Importância p/ renda familiar (1 baixa – 5 alta)', 250),
  ]));

  const dv = chartDefaults();
  Chart.defaults.font.family = dv.font;
  Chart.defaults.color = dv.secondary;
  Chart.defaults.borderColor = dv.grid;

  geoTreemapChart('geoTreemap', respondents, dv);
  donutChart('sexoChart', respondents, 'sexo_entrevistado', dv);
  barChart('faixaChart', respondents, 'faixa_etaria', dv, { sortNumeric: true, order: ['14–25','26–35','36–45','46–55','56–65','66+'] });
  barChart('rendaChart', respondents, 'renda_familiar_mensal', dv, {});
  stackedFaixaSexo('faixaSexoChart', respondents, dv);
  boxplotByGroup('tempoBoxplot', respondents, 'municipio', 'tempo_assent', dv, { yTitle: 'anos no assentamento' });
  barChart('preocupacaoChart', respondents, 'nivel_preocupacao_mudanca_climatica', dv, { sortNumeric: true, hue: 'var(--accent-clima)' });
  donutChart('ameacaChart', respondents, 'nivel_ameaca_producao', dv);

  donutChart('bioChart', respondents, 'bioeconomia', dv);
  donutChart('ampliarBioChart', respondents, 'ampliar_producao_bio', dv, { maxLen: 34 });
  donutChart('cadeiaBioChart', respondents, 'participa_cadeia_bio', dv, { maxLen: 34 });
  donutChart('jovemBioChart', respondents, 'jovem_participa_bio', dv, { maxLen: 34 });
  donutChart('novosBioChart', respondents, 'interesse_novos_bio', dv);
  barChart('importanciaBioChart', respondents, 'importancia_produto_bio', dv, { sortNumeric: true, hue: 'var(--accent-bio)' });
  lollipopChart('produtosBioChart', productCounts(respondents), dv, { total: n, hue: 'var(--accent-bio)' });
  lollipopChart('dificuldadeBioChart', binaryGroupCounts(catalog, respondents, 'dificuldade_bio'), dv, { total: n, hue: 'var(--accent-bio)' });
  lollipopChart('comercioBioChart', binaryGroupCounts(catalog, respondents, 'comercio_bio'), dv, { total: n, hue: 'var(--accent-bio)' });
  lollipopChart('climaCadeiaBioChart', binaryGroupCounts(catalog, respondents, 'mudanca_climaticas_cadeia_bio'), dv, { total: n, hue: 'var(--accent-bio)' });
  stackedBioMunicipio('bioMunicipioChart', respondents, dv);

  // ---- builders --------------------------------------------------------

  function kpiCard(value, label, color) {
    return el('div', { class: 'card kpi', style: `border-top:3px solid ${color}` }, [
      el('div', { class: 'value' }, value),
      el('div', { class: 'label' }, label),
    ]);
  }
  function kpiCardBox(value, label, color) {
    return el('div', { class: 'card kpi', style: `justify-content:center; border-top:3px solid ${color}` }, [
      el('div', { class: 'value', style: 'font-size:36px' }, value),
      el('div', { class: 'label' }, label),
    ]);
  }
  function sectionHeading(title, subtitle, color) {
    return el('div', { class: 'section-heading', style: `--section-color:${color}` }, [
      el('h2', {}, [el('span', { class: 'section-dot' }), title]),
      subtitle ? el('p', { class: 'section-subtitle' }, subtitle) : null,
    ]);
  }
  function chartCard(id, title, height, note) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'chart-title-row' }, [el('h3', {}, title), chartToolbar(id)]),
      el('div', { class: 'chart-box', style: `height:${height}px` }, [el('canvas', { id })]),
      note ? el('p', { class: 'chart-note' }, note) : null,
    ]);
  }
})();

function geoTreemapChart(canvasId, rows, dv) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const key = r => r.municipio + '||' + r.assentamento;
  const counts = {};
  rows.forEach(r => {
    if (!r.municipio || !r.assentamento) return;
    const k = key(r);
    counts[k] = counts[k] || { municipio: r.municipio, assentamento: r.assentamento, count: 0 };
    counts[k].count++;
  });
  const tree = Object.values(counts);

  const municipioTotals = {};
  const municipioMaxLeaf = {};
  tree.forEach(t => {
    municipioTotals[t.municipio] = (municipioTotals[t.municipio] || 0) + t.count;
    municipioMaxLeaf[t.municipio] = Math.max(municipioMaxLeaf[t.municipio] || 0, t.count);
  });
  const totalCount = tree.reduce((a, t) => a + t.count, 0);
  const municipiosOrdered = Object.keys(municipioTotals).sort((a, b) => municipioTotals[b] - municipioTotals[a]);
  const colorOf = m => seriesColor(municipiosOrdered.indexOf(m));

  // dentro de cada municipio, gradua a cor do assentamento pelo seu peso
  // relativo (o maior assentamento fica na cor "cheia", os menores mais
  // claros) - reforca visualmente o tamanho junto com a area do retangulo.
  function leafColor(item, lighten) {
    const base = colorOf(item.municipio);
    const t = municipioMaxLeaf[item.municipio] ? item.count / municipioMaxLeaf[item.municipio] : 1;
    const shade = 0.42 + 0.58 * t; // 0.42..1 -> quanto mais perto de 1, mais "cheia" a cor
    return lerpColor('#ffffff', base, Math.min(1, shade + (lighten || 0)));
  }

  const chart = new Chart(canvas, {
    type: 'treemap',
    data: {
      datasets: [{
        tree,
        key: 'count',
        groups: ['municipio', 'assentamento'],
        spacing: 2,
        borderWidth: 2,
        borderColor: dv.surface,
        borderRadius: 4,
        backgroundColor(ctx) {
          if (ctx.type !== 'data') return 'transparent';
          const item = ctx.raw._data;
          return ctx.raw.l === 0 ? colorOf(item.municipio) : leafColor(item);
        },
        hoverBackgroundColor(ctx) {
          if (ctx.type !== 'data') return 'transparent';
          const item = ctx.raw._data;
          return ctx.raw.l === 0 ? colorOf(item.municipio) : leafColor(item, 0.16);
        },
        labels: {
          display: true,
          align: 'left', position: 'top',
          color(ctx) {
            if (!ctx.raw || ctx.raw.l === 0) return '#fff';
            const item = ctx.raw._data;
            const t = municipioMaxLeaf[item.municipio] ? item.count / municipioMaxLeaf[item.municipio] : 1;
            return (0.42 + 0.58 * t) < 0.62 ? dv.text : '#fff';
          },
          font: (ctx) => ({ size: ctx.raw && ctx.raw.l === 0 ? 13 : 11, weight: ctx.raw && ctx.raw.l === 0 ? '700' : '400' }),
          formatter(ctx) {
            // este formatter so' e' chamado para as celulas-folha (assentamento) -
            // o cabecalho do grupo (municipio) e' desenhado pela lib via `captions`,
            // que nao expoe a identidade do dado ao formatter (so' geometria),
            // entao o nome do municipio permanece como rotulo simples do cabecalho.
            if (ctx.type !== 'data') return '';
            const item = ctx.raw._data;
            // celulas muito pequenas nao tem espaco para rotulo legivel - a
            // informacao continua acessivel via tooltip ao passar o mouse
            const w = ctx.raw.w || 0, h = ctx.raw.h || 0;
            const chars = item.assentamento.length;
            if (w < 46 || h < 30 || w < chars * 5.6) return '';
            return h < 46 ? item.assentamento : [item.assentamento, String(ctx.raw.v)];
          }
        }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.raw.l !== 0,
          callbacks: {
            title() { return ''; },
            label(ctx) {
              const item = ctx.raw._data;
              return ` ${item.assentamento} (${item.municipio}): ${ctx.raw.v} entrevistas (${pct(ctx.raw.v, totalCount)}% do total)`;
            }
          }
        }
      }
    }
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: ['Município', 'Assentamento', 'Domicílios'],
    rows: tree.map(t => [t.municipio, t.assentamento, t.count]),
  });
}

/* Agrega um grupo de colunas indicadoras binarias (0/1) de uma pergunta de
   multipla escolha em pares {label, count}, ordenados do mais citado ao
   menos citado. Usado para as perguntas 8.4/8.5/8.6 da bioeconomia. */
function binaryGroupCounts(catalog, rows, parentId, opts = {}) {
  const exclude = opts.exclude || ['Sem resposta'];
  const items = catalog.filter(c => c.parent === parentId);
  return items
    .map(it => ({
      label: it.label.includes('=') ? it.label.split('=').pop().trim() : it.label,
      count: rows.filter(r => r[it.id] === 1).length,
    }))
    .filter(x => !exclude.some(s => x.label.includes(s)))
    .sort((a, b) => b.count - a.count);
}

/* Conta quantas familias citaram cada produto da bioeconomia, somando as
   ate 19 repeticoes do bloco "Produção de Produtos da bioeconomia" (8.2). */
function productCounts(rows) {
  const counts = {};
  rows.forEach(r => {
    for (let i = 1; i <= 19; i++) {
      const v = r[`produto_producao_${i}`];
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
  });
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

const FAIXA_ORDER = ['14–25', '26–35', '36–45', '46–55', '56–65', '66+'];

function stackedFaixaSexo(canvasId, rows, dv) {
  const valid = rows.filter(r => r.faixa_etaria && r.sexo_entrevistado);
  const groups = FAIXA_ORDER.filter(f => valid.some(r => r.faixa_etaria === f));
  const series = uniqueValues(valid, 'sexo_entrevistado');
  const matrix = series.map(s => groups.map(g => valid.filter(r => r.faixa_etaria === g && r.sexo_entrevistado === s).length));
  const colors = series.map((_, i) => seriesColor(i));
  stackedBarChart(canvasId, groups, series, matrix, colors, dv, { groupLabel: 'Faixa etária' });
}

function stackedBioMunicipio(canvasId, rows, dv) {
  const valid = rows.filter(r => r.municipio && r.bioeconomia);
  const totals = {};
  valid.forEach(r => { totals[r.municipio] = (totals[r.municipio] || 0) + 1; });
  const groups = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const series = ['Sim', 'Não'];
  const matrix = series.map(s => groups.map(g => valid.filter(r => r.municipio === g && r.bioeconomia === s).length));
  // "Sim" na cor plena do agrupamento bioeconomia, "Não" em um tom neutro -
  // o contraste reforca a leitura de conhecimento vs desconhecimento
  const colors = [resolveColor('var(--accent-bio)'), dv.muted + '55'];
  stackedBarChart(canvasId, groups, series, matrix, colors, dv, { horizontal: true, groupLabel: 'Município' });
}
