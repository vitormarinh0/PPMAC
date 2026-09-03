const MAP_ICONS = {
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M9.5 19.5V14h5v5.5"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.3 7-12a7 7 0 1 0-14 0c0 4.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.6"/></svg>',
  land: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 9 4l6 3.5 6-3.5v13l-6 3.5-6-3.5-6 3.5v-13z"/><path d="M9 4v13"/><path d="M15 7.5v13"/></svg>',
};

function fmtBRL(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1e9) return 'R$ ' + (n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi';
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  return 'R$ ' + fmtNum(n);
}

(async function () {
  const { respondents } = await AppData.load();
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const [{ estadoGeo, municipiosGeo }, pibRows] = await Promise.all([
    loadParaGeo(),
    fetch('data/pib_municipios_pa.json').then(r => r.json()),
  ]);

  const pibByCode = {};
  pibRows.forEach(p => { pibByCode[p.codigo_ibge] = p; });

  const stats = aggregateByMunicipio(respondents);
  const statsByNorm = {};
  stats.forEach(s => { statsByNorm[normMuni(s.municipio)] = s; });

  // junta os indicadores da pesquisa e o PIB a cada municipio do estado -
  // os 7 pesquisados carregam `stats`, os demais ficam so' com contexto (PIB).
  municipiosGeo.features.forEach(f => {
    f.properties.stats = statsByNorm[normMuni(f.properties.municipio)] || null;
    f.properties.pib = pibByCode[f.properties.codigo_ibge] || null;
  });

  const studied = municipiosGeo.features.filter(f => f.properties.stats);
  studied.sort((a, b) => b.properties.stats.n - a.properties.stats.n);

  // rampa discreta (verde, clara->escura) para os 7 municipios pesquisados,
  // pela mesma convencao de "ordenado por magnitude" usada no resto do painel
  const ascending = studied.slice().sort((a, b) => a.properties.stats.n - b.properties.stats.n);
  const entrevistasRampColors = rampColors(ascending.length);
  ascending.forEach((f, i) => { f.properties.entrevistasColor = entrevistasRampColors[i]; });

  // rampa continua (mesmos tons, em escala log) para o PIB de todos os 144
  // municipios do estado - a distribuicao e' muito assimetrica (Parauapebas
  // e Canaa dos Carajas concentram boa parte do PIB por causa da mineracao),
  // entao log preserva a leitura visual dos municipios menores.
  const pibValues = municipiosGeo.features.map(f => f.properties.pib && f.properties.pib.pib).filter(v => v != null && v > 0);
  const pibLogMin = Math.log(Math.min(...pibValues));
  const pibLogMax = Math.log(Math.max(...pibValues));
  const rankHexes = RANK_STOPS.map(resolveColor);
  function pibColorOf(feature) {
    const p = feature.properties.pib;
    if (!p || p.pib == null) return resolveColor('--gridline');
    const t = (Math.log(p.pib) - pibLogMin) / (pibLogMax - pibLogMin);
    return continuousRamp(rankHexes, t);
  }

  const totalN = respondents.length;
  const totalAssent = uniqueValues(respondents, 'assentamento').length;

  root.appendChild(el('div', { class: 'grid cols-3', style: 'margin-bottom:24px' }, [
    kpiCard(studied.length, 'Municípios pesquisados', 'var(--accent-perfil)', MAP_ICONS.mapPin),
    kpiCard(fmtNum(totalN), 'Domicílios entrevistados', 'var(--accent-perfil)', MAP_ICONS.house),
    kpiCard(totalAssent, 'Assentamentos', 'var(--accent-perfil)', MAP_ICONS.land),
  ]));

  const listBox = el('div', { class: 'muni-list' });
  const detailBox = el('div', { class: 'muni-detail' });
  const sidebar = el('div', { class: 'card' }, [
    el('h3', {}, 'Municípios pesquisados'),
    listBox,
    detailBox,
  ]);

  const metricRow = el('div', { class: 'chart-type-row', style: 'margin-bottom:12px' });
  const mapEl = el('div', { id: 'muniMap' });
  const legend = el('div', { class: 'map-legend' });
  const mapBox = el('div', { class: 'card' }, [
    metricRow,
    el('div', { class: 'map-box' }, [mapEl, legend]),
    el('p', { class: 'chart-note', style: 'margin-top:10px; margin-bottom:0' },
      'Contorno de todos os 144 municípios do Pará. Os 7 destacados com borda verde fazem parte da amostra da pesquisa de campo.'),
  ]);

  root.appendChild(el('div', { class: 'map-grid' }, [sidebar, mapBox]));

  let metric = 'entrevistas';
  const metricBtns = {};
  ['entrevistas', 'pib'].forEach(key => {
    const btn = el('button', {
      class: 'chart-type-btn' + (key === metric ? ' active' : ''),
      onclick: () => setMetric(key),
    }, key === 'entrevistas' ? 'Domicílios entrevistados' : 'PIB municipal (2023)');
    metricBtns[key] = btn;
    metricRow.appendChild(btn);
  });

  const map = createThemedMap(mapEl);
  const estadoLayer = addStateOutline(map, estadoGeo);

  let selected = null;
  const layerByCode = {};

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

  function fillColorFor(feature) {
    const isStudied = !!feature.properties.stats;
    return metric === 'entrevistas'
      ? (isStudied ? feature.properties.entrevistasColor : resolveColor('--gridline'))
      : pibColorOf(feature);
  }
  function baseStyle(feature, hover) {
    const isStudied = !!feature.properties.stats;
    return {
      fillColor: fillColorFor(feature),
      fillOpacity: hover ? 0.85 : (isStudied ? 0.72 : 0.55),
      color: isStudied ? resolveColor('var(--brand-dark)') : resolveColor('var(--surface-1)'),
      weight: isStudied ? 2 : 0.6,
    };
  }
  function selectedStyle(feature) {
    return { fillColor: fillColorFor(feature), fillOpacity: 0.92, color: resolveColor('var(--brand-deep)'), weight: 3.5 };
  }

  function tooltipHtml(feature) {
    const p = feature.properties;
    const lines = [`<strong>${escapeHtml(p.municipio)}</strong>`];
    if (metric === 'entrevistas') {
      lines.push(p.stats ? `${fmtNum(p.stats.n)} domicílios entrevistados` : 'Não incluído na amostra da pesquisa');
      if (p.stats) lines.push(`${p.stats.assentamentos.length} assentamento(s)`);
    } else {
      lines.push(`PIB 2023: ${fmtBRL(p.pib && p.pib.pib)}`);
      if (p.stats) lines.push(`${fmtNum(p.stats.n)} domicílios entrevistados`);
    }
    return lines.join('<br>');
  }

  function refreshAllStyles() {
    Object.values(layerByCode).forEach(({ feature, layer }) => {
      layer.setStyle(selected?.feature === feature ? selectedStyle(feature) : baseStyle(feature, false));
    });
  }

  function setMetric(key) {
    metric = key;
    Object.entries(metricBtns).forEach(([k, btn]) => btn.classList.toggle('active', k === key));
    refreshAllStyles();
    updateLegend();
  }

  function renderList() {
    listBox.innerHTML = '';
    studied.forEach(feature => {
      const s = feature.properties.stats;
      const item = el('button', {
        class: 'muni-item' + (selected?.feature === feature ? ' active' : ''),
        onclick: () => selectFeature(feature, { fly: true }),
      }, [
        el('span', { class: 'swatch', style: `background:${feature.properties.entrevistasColor}` }),
        el('span', { class: 'name' }, s.municipio),
        el('span', { class: 'count' }, fmtNum(s.n)),
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
    if (feature.properties.stats) renderDetail(feature);
    else renderContextDetail(feature);
  }

  function renderDetail(feature) {
    const s = feature.properties.stats;
    const p = feature.properties.pib;
    detailBox.innerHTML = '';
    detailBox.appendChild(el('h2', { style: 'margin-top:16px' }, s.municipio));
    detailBox.appendChild(statRow('Domicílios entrevistados', fmtNum(s.n)));
    detailBox.appendChild(statRow('Assentamentos', String(s.assentamentos.length)));
    detailBox.appendChild(statRow('PIB municipal (2023)', fmtBRL(p && p.pib)));
    detailBox.appendChild(statRow('Chefia familiar feminina', s.chefiaFemPct + '%'));
    detailBox.appendChild(statRow('Tempo médio no assentamento', s.tempoMedio != null ? `${fmtNum(s.tempoMedio)} anos` : '—'));
    detailBox.appendChild(statRow('Já ouviu falar em mudanças climáticas', s.climaPct + '%'));
    detailBox.appendChild(statRow('Já ouviu falar em bioeconomia', s.bioPct + '%'));
    detailBox.appendChild(statRow('Interesse em ampliar produção da bioeconomia', s.ampliarPct + '%'));

    detailBox.appendChild(el('p', { class: 'chart-note', style: 'margin-top:12px; margin-bottom:2px' }, 'Assentamentos pesquisados'));
    detailBox.appendChild(el('div', { class: 'assent-pill-row' },
      s.assentamentos.map(a => el('span', { class: 'pill' }, `${a} (${s.assentCounts[a]})`))));

    detailBox.appendChild(el('a', {
      class: 'btn', style: 'margin-top:16px; width:100%; justify-content:center',
      href: `explorar.html?municipio=${encodeURIComponent(s.municipio)}`,
    }, 'Ver domicílios deste município →'));
  }

  function renderContextDetail(feature) {
    const p = feature.properties.pib;
    detailBox.innerHTML = '';
    detailBox.appendChild(el('h2', { style: 'margin-top:16px' }, feature.properties.municipio));
    detailBox.appendChild(statRow('PIB municipal (2023)', fmtBRL(p && p.pib)));
    detailBox.appendChild(el('p', { class: 'chart-note', style: 'margin-top:10px' },
      'Este município não faz parte da amostra da pesquisa de campo do PPMAC — exibido apenas como referência geográfica e econômica dentro do Pará.'));
  }

  function statRow(k, v) {
    return el('div', { class: 'muni-stat-row' }, [el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)]);
  }

  function updateLegend() {
    legend.innerHTML = '';
    if (metric === 'entrevistas') {
      const lo = ascending[0].properties.stats.n, hi = ascending[ascending.length - 1].properties.stats.n;
      legend.appendChild(el('div', {}, 'Domicílios entrevistados'));
      legend.appendChild(el('div', { class: 'ramp' }, entrevistasRampColors.map(c => el('span', { style: `background:${c}` }))));
      legend.appendChild(el('div', { class: 'scale' }, [el('span', {}, String(lo)), el('span', {}, String(hi))]));
    } else {
      const stops = Array.from({ length: 8 }, (_, i) => continuousRamp(rankHexes, i / 7));
      legend.appendChild(el('div', {}, 'PIB municipal (2023)'));
      legend.appendChild(el('div', { class: 'ramp', style: `background:linear-gradient(to right, ${stops.join(',')})` }));
      legend.appendChild(el('div', { class: 'scale' }, [
        el('span', {}, fmtBRL(Math.exp(pibLogMin))),
        el('span', {}, fmtBRL(Math.exp(pibLogMax))),
      ]));
    }
  }

  renderList();
  updateLegend();
  detailBox.appendChild(el('p', { class: 'muni-detail-empty' }, 'Passe o mouse ou clique em qualquer município do mapa (ou na lista acima) para ver os detalhes.'));

  function kpiCard(value, label, color, icon) {
    return el('div', { class: 'card kpi', style: `--kpi-color:${color}` }, [
      el('div', { class: 'kpi-icon', html: icon }),
      el('div', { class: 'value' }, String(value)),
      el('div', { class: 'label' }, label),
    ]);
  }
})();
