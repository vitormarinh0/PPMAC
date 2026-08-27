(async function () {
  const { catalog, byId, sections, respondents } = await AppData.load();
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const GROUP_OPTIONS = [
    { id: '', label: 'Nenhum (base completa)' },
    { id: 'municipio', label: 'Município' },
    { id: 'assentamento', label: 'Assentamento' },
    { id: 'sexo_entrevistado', label: 'Sexo do(a) entrevistado(a)' },
    { id: 'faixa_etaria', label: 'Faixa etária' },
    { id: 'chefe_mulher', label: 'Chefia feminina' },
    { id: 'tempo_grupo', label: 'Tempo no assentamento (grupo)' },
    { id: 'renda_familiar_mensal', label: 'Renda familiar mensal' },
  ];

  const TYPE_LABEL = { numeric: 'numérico', categorical: 'categórico', binary: 'binário' };

  const state = { section: sections[0], variable: null, group: '', chartType: null };
  let currentChart = null;

  // veio de um link "Abrir no construtor de indicadores" do dicionario de
  // dados - abre direto na variavel escolhida, em vez da primeira da lista
  const deepLinkVar = sessionStorage.getItem('ppmac_ind_var');
  if (deepLinkVar) {
    sessionStorage.removeItem('ppmac_ind_var');
    if (byId[deepLinkVar]) { state.section = byId[deepLinkVar].section; state.variable = deepLinkVar; }
  }

  const layout = el('div', { class: 'explorer-grid' });
  const panel = el('div', { class: 'card filters-panel' });
  const results = el('div', {});
  layout.appendChild(panel); layout.appendChild(results);
  root.appendChild(layout);

  buildPanel();

  function varsForSection(sec) {
    return catalog.filter(c => c.section === sec).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  function buildPanel() {
    panel.innerHTML = '';
    panel.appendChild(el('h3', {}, 'Variável'));

    const secSelect = el('select', {}, sections.map(s => el('option', { value: s, selected: s === state.section ? 'selected' : null }, s)));
    secSelect.addEventListener('change', () => {
      state.section = secSelect.value;
      const vars = varsForSection(state.section);
      state.variable = vars.length ? vars[0].id : null;
      state.chartType = null;
      buildPanel(); render();
    });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Seção do questionário'), secSelect]));

    const vars = varsForSection(state.section);
    if (!state.variable || !vars.find(v => v.id === state.variable)) state.variable = vars.length ? vars[0].id : null;
    const varSelect = el('select', {}, vars.map(v => el('option', { value: v.id, selected: v.id === state.variable ? 'selected' : null }, v.label.slice(0, 60))));
    varSelect.addEventListener('change', () => { state.variable = varSelect.value; state.chartType = null; render(); });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Pergunta / indicador'), varSelect]));

    const groupSelect = el('select', {}, GROUP_OPTIONS.map(g => el('option', { value: g.id, selected: g.id === state.group ? 'selected' : null }, g.label)));
    groupSelect.addEventListener('change', () => { state.group = groupSelect.value; state.chartType = null; render(); });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Cruzar com'), groupSelect]));

    panel.appendChild(el('p', { class: 'chart-note' }, 'Variáveis do tipo "indicador binário" mostram o percentual de domicílios que marcaram aquela opção em perguntas de múltipla escolha.'));

    render();
  }

  /* Cada combinacao de tipo de dado + com/sem cruzamento tem um conjunto
     proprio de graficos que fazem sentido - a ideia e' nunca oferecer um
     grafico inadequado ao tipo de variavel escolhida. */
  function chartTypeOptions(meta, hasGroup) {
    if (meta.type === 'numeric') {
      if (!hasGroup) return [];
      return [
        { id: 'bar', label: 'Barras (médias)', hint: 'Compara a média do indicador entre os grupos.' },
        { id: 'boxplot', label: 'Distribuição (boxplot)', hint: 'Mostra a distribuição completa em cada grupo, não só a média.' },
        { id: 'lollipop', label: 'Ranking (lollipop)', hint: 'Ordena os grupos da maior para a menor média.' },
      ];
    }
    if (!hasGroup) {
      return [
        { id: 'donut', label: 'Rosca', hint: 'Boa para poucas categorias — mostra a proporção do total.' },
        { id: 'polar', label: 'Setores (polar)', hint: 'Estilo mais ilustrativo: cada categoria "cresce" do centro pra fora. Funciona melhor com 3–6 categorias de tamanho parecido — categorias muito pequenas ficam sem rótulo escrito.' },
        { id: 'ranking', label: 'Ranking (barras)', hint: 'Melhor quando há muitas categorias para comparar.' },
      ];
    }
    return [
      { id: 'stacked', label: 'Empilhada (%)', hint: 'Composição percentual de cada grupo, uma barra por grupo.' },
      { id: 'grouped', label: 'Agrupada (%)', hint: 'As mesmas categorias lado a lado, mais fácil de comparar uma categoria específica entre grupos.' },
    ];
  }

  function chartTypeSelector(options) {
    if (!options.length) return null;
    if (!options.find(o => o.id === state.chartType)) state.chartType = options[0].id;
    const current = options.find(o => o.id === state.chartType) || options[0];
    const row = el('div', { class: 'chart-type-row' }, options.map(opt =>
      el('button', {
        class: 'chart-type-btn' + (opt.id === state.chartType ? ' active' : ''),
        type: 'button',
        onclick: () => { state.chartType = opt.id; render(); },
      }, opt.label)
    ));
    return el('div', {}, [row, el('p', { class: 'chart-note', style: 'margin-top:8px' }, current.hint)]);
  }

  function render() {
    results.innerHTML = '';
    if (currentChart) { currentChart.destroy(); currentChart = null; }
    const meta = byId[state.variable];
    if (!meta) { results.appendChild(el('p', {}, 'Selecione uma variável.')); return; }

    const card = el('div', { class: 'card' });
    const titleActions = el('div', { style: 'display:flex; align-items:center; gap:10px' }, [
      el('a', {
        href: `dicionario.html#${meta.id}`, target: '_blank',
        class: 'chart-tool-btn', title: 'Ver esta variável no dicionário de dados',
      }, 'Dicionário'),
      el('span', { class: 'badge' }, TYPE_LABEL[meta.type] || meta.type),
    ]);
    card.appendChild(el('div', { class: 'chart-title-row' }, [
      el('h2', { style: 'margin:0' }, meta.label),
      titleActions,
    ]));

    if (meta.type === 'numeric') {
      renderNumeric(card, meta, titleActions);
    } else {
      renderCategorical(card, meta, titleActions);
    }

    results.appendChild(card);
  }

  function renderNumeric(card, meta, titleActions) {
    const rows = respondents.filter(r => r[meta.id] !== null && r[meta.id] !== undefined && r[meta.id] !== '' && !isNaN(Number(r[meta.id])));
    const vals = rows.map(r => Number(r[meta.id]));
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sorted = vals.slice().sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    card.appendChild(el('div', { class: 'grid cols-4', style: 'margin:14px 0' }, [
      statTile(fmtNum(mean), 'Média'),
      statTile(fmtNum(med), 'Mediana'),
      statTile(fmtNum(Math.min(...vals)), 'Mínimo'),
      statTile(fmtNum(Math.max(...vals)), 'Máximo'),
    ]));

    if (!state.group) {
      // sem recorte, o proprio formato da distribuicao (simetria, caudas,
      // concentracao) e' a informacao mais rica que da' pra mostrar
      titleActions.prepend(chartToolbar('indChart'));
      card.appendChild(el('div', { class: 'chart-box tall', style: 'margin-top:12px' }, [el('canvas', { id: 'indChart' })]));
      card.appendChild(el('p', { class: 'chart-note' }, `Distribuição dos valores. Base: ${fmtNum(vals.length)} domicílios com resposta válida.`));
      setTimeout(() => { currentChart = histogramChart('indChart', vals, chartDefaults(), { yTitle: 'domicílios' }); }, 0);
      return;
    }

    const groups = uniqueValues(rows, state.group);
    const means = groups.map(g => meanBy(rows.filter(r => r[state.group] === g), meta.id));
    const groupLabel = byId[state.group] ? byId[state.group].label : state.group;
    const options = chartTypeOptions(meta, true);
    const selector = chartTypeSelector(options);
    if (selector) card.appendChild(el('div', { style: 'margin-top:14px' }, [selector]));
    titleActions.prepend(chartToolbar('indChart'));
    card.appendChild(el('div', { class: 'chart-box tall', style: 'margin-top:12px' }, [el('canvas', { id: 'indChart' })]));
    card.appendChild(dataTable(groups, means.map(fmtNum), groupLabel, 'Média'));

    setTimeout(() => {
      const dv = chartDefaults();
      if (state.chartType === 'boxplot') {
        currentChart = boxplotByGroup('indChart', rows, state.group, meta.id, dv, { yTitle: meta.label, groupLabel });
      } else if (state.chartType === 'lollipop') {
        const items = groups.map((g, i) => ({ label: g, count: means[i] })).sort((a, b) => b.count - a.count);
        currentChart = lollipopChart('indChart', items, dv, { showPercent: false, valueLabel: 'Média' });
      } else {
        currentChart = barChartFromValues('indChart', groups, means, dv, { groupLabel, valueLabel: 'Média', yTitle: 'média' });
      }
    }, 0);
  }

  function binaryLabel(v) { return String(v) === '1' ? 'Sim' : 'Não'; }

  function renderCategorical(card, meta, titleActions) {
    const rows = respondents.filter(r => r[meta.id] !== null && r[meta.id] !== undefined && r[meta.id] !== '');
    // linhas com o valor binario (0/1) ja' traduzido pra Sim/Não, pra
    // reaproveitar as funcoes de grafico compartilhadas (que contam
    // ocorrencias cruas do campo) sem duplicar logica de contagem aqui
    const displayRows = meta.type === 'binary' ? rows.map(r => ({ ...r, [meta.id]: binaryLabel(r[meta.id]) })) : rows;
    titleActions.prepend(chartToolbar('indChart'));

    if (!state.group) {
      const counts = countBy(displayRows, meta.id);
      const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      const total = rows.length;
      const options = chartTypeOptions(meta, false);
      const selector = chartTypeSelector(options);
      if (selector) card.appendChild(el('div', { style: 'margin-top:14px' }, [selector]));
      card.appendChild(el('div', { class: 'chart-box tall', style: 'margin-top:12px' }, [el('canvas', { id: 'indChart' })]));
      card.appendChild(dataTable(labels, labels.map(l => `${fmtNum(counts[l])} (${pct(counts[l], total)}%)`), 'Categoria', 'Domicílios'));
      card.appendChild(el('p', { class: 'chart-note' }, `Base: ${fmtNum(total)} domicílios com resposta válida.`));
      setTimeout(() => {
        const dv = chartDefaults();
        if (state.chartType === 'ranking') {
          const items = labels.map(l => ({ label: l, count: counts[l] }));
          currentChart = lollipopChart('indChart', items, dv, { total });
        } else if (state.chartType === 'polar') {
          currentChart = polarAreaChart('indChart', displayRows, meta.id, dv, { fieldLabel: 'Categoria' });
        } else {
          currentChart = donutChart('indChart', displayRows, meta.id, dv, { fieldLabel: 'Categoria' });
        }
      }, 0);
    } else {
      const groups = uniqueValues(rows, state.group);
      const categories = uniqueValues(displayRows, meta.id);
      const matrix = categories.map(cat => groups.map(g => {
        const groupRows = displayRows.filter(r => r[state.group] === g);
        return pct(groupRows.filter(r => r[meta.id] === cat).length, groupRows.length);
      }));
      const groupLabel = byId[state.group] ? byId[state.group].label : state.group;
      const options = chartTypeOptions(meta, true);
      const selector = chartTypeSelector(options);
      if (selector) card.appendChild(el('div', { style: 'margin-top:14px' }, [selector]));
      card.appendChild(el('div', { class: 'chart-box tall', style: 'margin-top:12px' }, [el('canvas', { id: 'indChart' })]));
      card.appendChild(el('p', { class: 'chart-note' }, `Percentual dentro de cada categoria de "${groupLabel}". Base: ${fmtNum(rows.length)} domicílios.`));
      card.appendChild(matrixTable(groups, categories, matrix, groupLabel));
      setTimeout(() => {
        const dv = chartDefaults();
        const colors = categories.map((_, i) => seriesColor(i));
        currentChart = stackedBarChart('indChart', groups, categories, matrix, colors, dv, {
          groupLabel, percent: true, grouped: state.chartType === 'grouped',
        });
      }, 0);
    }
  }

  function statTile(value, label) {
    return el('div', { class: 'card kpi' }, [el('div', { class: 'value' }, value), el('div', { class: 'label' }, label)]);
  }

  function dataTable(labels, values, colA, colB) {
    const table = el('table');
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, colA), el('th', {}, colB)])]));
    const tbody = el('tbody');
    labels.forEach((l, i) => tbody.appendChild(el('tr', {}, [el('td', {}, String(l)), el('td', {}, String(values[i]))])));
    table.appendChild(tbody);
    return el('div', { class: 'table-scroll', style: 'margin-top:14px; max-width:520px' }, [table]);
  }

  function matrixTable(groups, categories, matrix, groupLabel) {
    const table = el('table');
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, groupLabel), ...categories.map(c => el('th', {}, String(c).slice(0, 24)))])]));
    const tbody = el('tbody');
    groups.forEach((g, gi) => {
      tbody.appendChild(el('tr', {}, [el('td', {}, String(g)), ...categories.map((c, ci) => el('td', {}, matrix[ci][gi] + '%'))]));
    });
    table.appendChild(tbody);
    return el('div', { class: 'table-scroll', style: 'margin-top:14px' }, [table]);
  }
})();
