const HEAT_ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1.5-1-2.2-1-3.5 2 1 3.5 3.3 3.5 5.8a5.5 5.5 0 1 1-11 0c0-4.2 3-6.6 5.5-10.3z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.3 7-12a7 7 0 1 0-14 0c0 4.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.6"/></svg>',
};

const HEAT_METRICS = {
  N: { label: 'Número de ondas', short: 'Ondas', unit: '', decimals: 0, desc: 'Total de eventos de onda de calor registrados no ano.' },
  F: { label: 'Frequência (dias)', short: 'Dias em onda', unit: ' dias', decimals: 0, desc: 'Total de dias que compuseram ondas de calor ao longo do ano.' },
  D: { label: 'Duração máxima (dias)', short: 'Duração máx.', unit: ' dias', decimals: 0, desc: 'Duração, em dias, do evento de onda de calor mais longo do ano.' },
  A: { label: 'Amplitude (°C)', short: 'Amplitude', unit: ' °C', decimals: 1, desc: 'Maior valor de temperatura média diária observado durante uma onda de calor no ano.' },
  M: { label: 'Magnitude (°C)', short: 'Magnitude', unit: ' °C', decimals: 1, desc: 'Temperatura média de todos os dias em onda de calor no ano.' },
};
const HEAT_DEFINITIONS = ['90_2d', '90_3d', '90_4d', '95_2d', '95_3d', '95_4d', '975_2d', '975_3d', '975_4d'];

function defLabel(defId) {
  const [p, d] = defId.split('_');
  const pLabel = p === '975' ? '97,5' : p;
  return `Percentil ${pLabel} · ≥ ${d.replace('d', '')} dias consecutivos`;
}
function fmtHeat(v, metricKey) {
  if (v === null || v === undefined) return '—';
  const m = HEAT_METRICS[metricKey];
  return v.toLocaleString('pt-BR', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals }) + m.unit;
}

(async function () {
  const { respondents } = await AppData.load();
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const [{ estadoGeo, municipiosGeo }, initialMetricData] = await Promise.all([
    loadParaGeo(),
    fetch('data/ondas_calor/N.json').then(r => r.json()),
  ]);

  const metricCache = { N: initialMetricData };
  async function loadMetric(key) {
    if (!metricCache[key]) metricCache[key] = await fetch(`data/ondas_calor/${key}.json`).then(r => r.json());
    return metricCache[key];
  }

  const stats = aggregateByMunicipio(respondents);
  const statsByNorm = {};
  stats.forEach(s => { statsByNorm[normMuni(s.municipio)] = s; });
  municipiosGeo.features.forEach(f => {
    f.properties.stats = statsByNorm[normMuni(f.properties.municipio)] || null;
  });
  const studied = municipiosGeo.features.filter(f => f.properties.stats);
  studied.sort((a, b) => a.properties.municipio.localeCompare(b.properties.municipio, 'pt-BR'));

  const YEARS = initialMetricData.years;
  const state = { metric: 'N', defIndex: 0, yearIndex: YEARS.length - 1 };

  root.appendChild(el('div', { class: 'grid cols-3', style: 'margin-bottom:24px' }, [
    kpiCard('1991–2024', 'Período analisado', 'var(--accent-clima)', HEAT_ICONS.calendar),
    kpiCard(municipiosGeo.features.length, 'Municípios do Pará', 'var(--accent-clima)', HEAT_ICONS.mapPin),
    kpiCard(studied.length, 'Municípios pesquisados pelo PPMAC', 'var(--accent-clima)', HEAT_ICONS.flame),
  ]));

  const listBox = el('div', { class: 'muni-list' });
  const detailBox = el('div', { class: 'muni-detail' });
  const sidebar = el('div', { class: 'card' }, [
    el('h3', {}, 'Municípios pesquisados pelo PPMAC'),
    listBox,
    detailBox,
  ]);

  const metricRow = el('div', { class: 'chart-type-row', style: 'margin-bottom:12px' });
  const defSelect = el('select', {}, HEAT_DEFINITIONS.map((d, i) => el('option', { value: i }, defLabel(d))));
  const yearSlider = el('input', { type: 'range', min: 0, max: YEARS.length - 1, value: state.yearIndex, step: 1 });
  const yearValue = el('span', { class: 'year-value' }, String(YEARS[state.yearIndex]));
  const yearPrev = el('button', { class: 'btn secondary small' }, '←');
  const yearNext = el('button', { class: 'btn secondary small' }, '→');

  const mapEl = el('div', { id: 'heatMap' });
  const legend = el('div', { class: 'map-legend' });
  const metricNote = el('p', { class: 'chart-note', style: 'margin:0 0 12px' }, HEAT_METRICS.N.desc);
  const mapBox = el('div', { class: 'card' }, [
    metricRow,
    metricNote,
    el('div', { class: 'control-row' }, [
      el('label', {}, 'Critério'),
      defSelect,
      el('div', { class: 'year-control' }, [
        el('label', { style: 'margin:0' }, 'Ano'),
        yearPrev, yearSlider, yearNext, yearValue,
      ]),
    ]),
    el('div', { class: 'map-box' }, [mapEl, legend]),
    el('p', { class: 'chart-note', style: 'margin-top:10px; margin-bottom:0' },
      'A cor é comparável entre os anos: a escala usa o mínimo e o máximo histórico (1991–2024) da métrica e do critério escolhidos. ' +
      'Municípios com borda verde fazem parte da amostra da pesquisa de campo do PPMAC.'),
  ]);

  root.appendChild(el('div', { class: 'map-grid' }, [sidebar, mapBox]));

  const metricBtns = {};
  Object.entries(HEAT_METRICS).forEach(([key, info]) => {
    const btn = el('button', {
      class: 'chart-type-btn' + (key === state.metric ? ' active' : ''),
      onclick: () => setMetric(key),
    }, info.short);
    metricBtns[key] = btn;
    metricRow.appendChild(btn);
  });

  const map = createThemedMap(mapEl);
  const estadoLayer = addStateOutline(map, estadoGeo);

  // rampa de calor (paleta fornecida): amarelo -> laranja -> vermelho -> roxo
  // escuro, do evento mais brando ao mais extremo.
  const heatHexes = ['#FFD450', '#FFB340', '#F08634', '#E04D2F', '#BC2428', '#9E2951', '#601B5D', '#301145'];

  let selected = null;
  const layerByCode = {};
  let currentChart = null;
  let scale = { min: 0, max: 1 };

  municipiosGeo.features.forEach(feature => {
    const layer = L.geoJSON(feature, { style: () => baseStyle(feature, false) }).addTo(map);
    layerByCode[feature.properties.codigo_ibge] = { feature, layer };

    layer.bindTooltip('', { className: 'muni-tooltip', sticky: true });
    layer.on('mouseover', () => {
      layer.setTooltipContent(tooltipHtml(feature));
      if (selected?.feature !== feature) layer.setStyle(baseStyle(feature, true));
    });
    layer.on('mouseout', () => { if (selected?.feature !== feature) layer.setStyle(baseStyle(feature, false)); });
    layer.on('click', () => selectFeature(feature, { fly: false }));
  });

  map.fitBounds(estadoLayer.getBounds(), { padding: [10, 10] });

  function currentSeries(feature) {
    const data = metricCache[state.metric];
    const arr = data.municipios[feature.properties.codigo_ibge];
    return arr ? arr[state.defIndex] : null;
  }
  function currentValue(feature) {
    const series = currentSeries(feature);
    return series ? series[state.yearIndex] : null;
  }

  function recomputeScale() {
    const data = metricCache[state.metric];
    let min = Infinity, max = -Infinity;
    Object.values(data.municipios).forEach(arrs => {
      arrs[state.defIndex].forEach(v => {
        if (v === null) return;
        if (v < min) min = v;
        if (v > max) max = v;
      });
    });
    if (!isFinite(min)) { min = 0; max = 1; }
    if (min === max) max = min + 1;
    scale = { min, max };
  }

  function colorFor(feature) {
    const v = currentValue(feature);
    if (v === null) return resolveColor('--gridline');
    const t = (v - scale.min) / (scale.max - scale.min);
    return continuousRamp(heatHexes, t);
  }

  function baseStyle(feature, hover) {
    const isStudied = !!feature.properties.stats;
    const hasData = currentSeries(feature) !== null;
    return {
      fillColor: colorFor(feature),
      fillOpacity: hover ? 0.88 : (hasData ? (isStudied ? 0.78 : 0.62) : 0.35),
      color: isStudied ? resolveColor('var(--brand-dark)') : resolveColor('var(--surface-1)'),
      weight: isStudied ? 2 : 0.6,
    };
  }
  function selectedStyle(feature) {
    return { fillColor: colorFor(feature), fillOpacity: 0.94, color: resolveColor('var(--brand-deep)'), weight: 3.5 };
  }

  function tooltipHtml(feature) {
    const p = feature.properties;
    const lines = [`<strong>${escapeHtml(p.municipio)}</strong>`];
    const series = currentSeries(feature);
    if (!series) {
      lines.push('Sem dados nesta base (incluído em Santarém na malha de 2010)');
    } else {
      const v = series[state.yearIndex];
      lines.push(`${HEAT_METRICS[state.metric].label}: ${fmtHeat(v, state.metric)}`);
      lines.push(`Ano: ${YEARS[state.yearIndex]}`);
    }
    return lines.join('<br>');
  }

  function refreshAllStyles() {
    Object.values(layerByCode).forEach(({ feature, layer }) => {
      layer.setStyle(selected?.feature === feature ? selectedStyle(feature) : baseStyle(feature, false));
    });
  }

  async function setMetric(key) {
    state.metric = key;
    await loadMetric(key);
    Object.entries(metricBtns).forEach(([k, btn]) => btn.classList.toggle('active', k === key));
    metricNote.textContent = HEAT_METRICS[key].desc;
    recomputeScale();
    refreshAllStyles();
    updateLegend();
    if (selected) renderDetail(selected.feature);
  }

  defSelect.addEventListener('change', () => {
    state.defIndex = Number(defSelect.value);
    recomputeScale();
    refreshAllStyles();
    updateLegend();
    if (selected) renderDetail(selected.feature);
  });

  function setYearIndex(i) {
    state.yearIndex = Math.max(0, Math.min(YEARS.length - 1, i));
    yearSlider.value = state.yearIndex;
    yearValue.textContent = String(YEARS[state.yearIndex]);
    refreshAllStyles();
    if (selected) renderDetail(selected.feature);
  }
  yearSlider.addEventListener('input', () => setYearIndex(Number(yearSlider.value)));
  yearPrev.addEventListener('click', () => setYearIndex(state.yearIndex - 1));
  yearNext.addEventListener('click', () => setYearIndex(state.yearIndex + 1));

  function renderList() {
    listBox.innerHTML = '';
    studied.forEach(feature => {
      const v = currentValue(feature);
      const item = el('button', {
        class: 'muni-item' + (selected?.feature === feature ? ' active' : ''),
        onclick: () => selectFeature(feature, { fly: true }),
      }, [
        el('span', { class: 'swatch', style: `background:${colorFor(feature)}` }),
        el('span', { class: 'name' }, feature.properties.municipio),
        el('span', { class: 'count' }, fmtHeat(v, state.metric)),
      ]);
      listBox.appendChild(item);
    });
  }

  function selectFeature(feature, opts = {}) {
    selected = { feature };
    refreshAllStyles();
    const { layer } = layerByCode[feature.properties.codigo_ibge];
    layer.bringToFront();
    if (opts.fly) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 10 });
    renderList();
    renderDetail(feature);
  }

  function renderDetail(feature) {
    const p = feature.properties;
    const series = currentSeries(feature);
    detailBox.innerHTML = '';
    detailBox.appendChild(el('h2', { style: 'margin-top:16px' }, p.municipio));

    if (!series) {
      detailBox.appendChild(el('p', { class: 'chart-note' },
        'Este município não tem série própria nesta base (a malha municipal usada no cálculo é de 2010; a área hoje ' +
        'correspondente ao município estava incluída em outro município na época).'));
      if (p.stats) detailBox.appendChild(el('a', {
        class: 'btn', style: 'margin-top:12px; width:100%; justify-content:center',
        href: `explorar.html?municipio=${encodeURIComponent(p.stats.municipio)}`,
      }, 'Ver domicílios deste município →'));
      return;
    }

    detailBox.appendChild(statRow(`${HEAT_METRICS[state.metric].label} em ${YEARS[state.yearIndex]}`, fmtHeat(series[state.yearIndex], state.metric)));
    if (p.stats) detailBox.appendChild(statRow('Domicílios entrevistados (PPMAC)', fmtNum(p.stats.n)));

    detailBox.appendChild(el('p', { class: 'chart-note', style: 'margin-top:14px; margin-bottom:4px' },
      `${HEAT_METRICS[state.metric].label} por ano — ${defLabel(HEAT_DEFINITIONS[state.defIndex])}`));
    const canvas = el('canvas', {});
    detailBox.appendChild(el('div', { class: 'chart-box', style: 'height:200px' }, [canvas]));

    if (currentChart) currentChart.destroy();
    const dv = chartDefaults();
    currentChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: YEARS,
        datasets: [{
          data: series,
          backgroundColor: YEARS.map((_, i) => i === state.yearIndex ? heatHexes[7] : heatHexes[0] + '99'),
          borderRadius: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx) => fmtHeat(ctx.raw, state.metric) },
        } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: dv.muted }, grid: { display: false } },
          y: { ticks: { color: dv.muted }, grid: { color: dv.grid }, beginAtZero: true },
        },
        onClick: (evt, elements) => { if (elements.length) setYearIndex(elements[0].index); },
      },
    });

    if (p.stats) detailBox.appendChild(el('a', {
      class: 'btn', style: 'margin-top:16px; width:100%; justify-content:center',
      href: `explorar.html?municipio=${encodeURIComponent(p.stats.municipio)}`,
    }, 'Ver domicílios deste município →'));
  }

  function statRow(k, v) {
    return el('div', { class: 'muni-stat-row' }, [el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)]);
  }

  function updateLegend() {
    legend.innerHTML = '';
    const stops = Array.from({ length: 8 }, (_, i) => continuousRamp(heatHexes, i / 7));
    legend.appendChild(el('div', {}, HEAT_METRICS[state.metric].label));
    legend.appendChild(el('div', { class: 'ramp', style: `background:linear-gradient(to right, ${stops.join(',')})` }));
    legend.appendChild(el('div', { class: 'scale' }, [
      el('span', {}, fmtHeat(scale.min, state.metric)),
      el('span', {}, fmtHeat(scale.max, state.metric)),
    ]));
  }

  recomputeScale();
  renderList();
  updateLegend();
  refreshAllStyles();
  detailBox.appendChild(el('p', { class: 'muni-detail-empty' }, 'Passe o mouse ou clique em qualquer município do mapa (ou na lista acima) para ver a série histórica.'));

  function kpiCard(value, label, color, icon) {
    return el('div', { class: 'card kpi', style: `--kpi-color:${color}` }, [
      el('div', { class: 'kpi-icon', html: icon }),
      el('div', { class: 'value' }, String(value)),
      el('div', { class: 'label' }, label),
    ]);
  }
})();
