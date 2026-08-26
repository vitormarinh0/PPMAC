/* Carrega catalog.json + respondents.json uma unica vez e expõe utilitarios
   compartilhados entre as paginas do site. */

const AppData = (() => {
  let _ready = null;

  async function load() {
    if (_ready) return _ready;
    _ready = Promise.all([
      fetch('data/catalog.json').then(r => r.json()),
      fetch('data/respondents.json').then(r => r.json())
    ]).then(([catalog, respondents]) => {
      const byId = {};
      catalog.forEach(c => { byId[c.id] = c; });
      const sections = [];
      catalog.forEach(c => { if (!sections.includes(c.section)) sections.push(c.section); });
      // "Outros" e' o balde residual (campos sem secao clara no dicionario) - joga por ultimo
      const outrosIdx = sections.indexOf('Outros');
      if (outrosIdx !== -1) sections.push(sections.splice(outrosIdx, 1)[0]);
      return { catalog, byId, sections, respondents };
    });
    return _ready;
  }

  return { load };
})();

/* ---------------------------------------------------------------------
   Utilitarios
--------------------------------------------------------------------- */

function uniqueValues(rows, field) {
  const set = new Set();
  rows.forEach(r => { if (r[field] !== null && r[field] !== undefined && r[field] !== '') set.add(r[field]); });
  return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}

function countBy(rows, field) {
  const counts = {};
  rows.forEach(r => {
    const v = r[field];
    if (v === null || v === undefined || v === '') return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

function meanBy(rows, field) {
  const vals = rows.map(r => Number(r[field])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

const SERIES_COLORS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'
];

function resolveColor(varToken) {
  return getComputedStyle(document.documentElement).getPropertyValue(varToken.match(/--[\w-]+/)[0]).trim() || varToken;
}

function seriesColor(i) {
  return resolveColor(SERIES_COLORS[i % SERIES_COLORS.length]);
}

/* Rampa ordinal/sequencial (verde) para barras ordenadas por posicao ou
   magnitude - reforca visualmente a ordem/ranking com a intensidade da cor. */
const RANK_STOPS = ['--rank-1', '--rank-2', '--rank-3', '--rank-4', '--rank-5', '--rank-6'];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

/* Retorna n cores interpoladas ao longo da rampa --rank-1..6 (clara -> escura).
   Uso: colorir barras na mesma ordem em que sao desenhadas (posicao/ranking),
   nao por identidade de categoria. */
function rampColors(n) {
  const stops = RANK_STOPS.map(resolveColor);
  if (n <= 1) return [stops[Math.floor(stops.length / 2)]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (stops.length - 1);
    const i0 = Math.floor(pos), i1 = Math.min(stops.length - 1, i0 + 1);
    out.push(lerpColor(stops[i0], stops[i1], pos - i0));
  }
  return out;
}

/* Rampa sequencial (clara -> plena) de UMA cor arbitraria - usada para dar a
   cada agrupamento do painel (perfil/clima/bioeconomia) sua propria familia
   de cor nos graficos ordenados por magnitude, mantendo a regra de
   "sequencial = uma unica cor" mesmo fora da rampa verde padrao. */
function hueRamp(n, hex) {
  if (n <= 1) return [hex];
  const light = lerpColor('#ffffff', hex, 0.24);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(lerpColor(light, hex, i / (n - 1)));
  }
  return out;
}

/* Plugin Chart.js que desenha um numero + rotulo no centro de um donut,
   aproveitando o vazio central para mostrar a base (N) do grafico. */
function centerTextPlugin(mainText, subText) {
  return {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      const dv = chartDefaults();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = dv.text;
      ctx.font = `700 21px ${dv.font}`;
      ctx.fillText(mainText, cx, subText ? cy - 10 : cy);
      if (subText) {
        ctx.fillStyle = dv.muted;
        ctx.font = `400 11px ${dv.font}`;
        ctx.fillText(subText, cx, cy + 11);
      }
      ctx.restore();
    }
  };
}

function chartDefaults() {
  const root = getComputedStyle(document.documentElement);
  return {
    text: root.getPropertyValue('--text-primary').trim(),
    secondary: root.getPropertyValue('--text-secondary').trim(),
    muted: root.getPropertyValue('--text-muted').trim(),
    grid: root.getPropertyValue('--gridline').trim(),
    baseline: root.getPropertyValue('--baseline').trim(),
    surface: root.getPropertyValue('--surface-1').trim(),
    font: root.getPropertyValue('--font').trim(),
    accentRef: root.getPropertyValue('--accent-ref').trim()
  };
}

function downloadCSV(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(';')];
  rows.forEach(r => lines.push(r.map(esc).join(';')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------
   Exportacao de graficos - imagem em alta resolucao (com marca d'agua) e
   os dados brutos que geraram o grafico (CSV). Cada funcao de desenho
   registra seu Chart.js instance + tabela de dados aqui; os botoes da
   toolbar de cada card so' precisam saber o id do canvas.
--------------------------------------------------------------------- */
const ChartExports = {};

/* Chave unica pra ligar/desligar a exportacao de dados (CSV) no site
   inteiro - grafico por grafico, o explorador de dados e o dicionario.
   O download de imagem (PNG) dos graficos nao e' afetado. */
const DATA_DOWNLOAD_ENABLED = false;

function registerChartExport(canvasId, chart, csv) {
  ChartExports[canvasId] = { chart, csv };
}

function slugify(canvasId) {
  return canvasId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

let _ppmacLogo = null;
function loadPpmacLogo() {
  if (_ppmacLogo) return Promise.resolve(_ppmacLogo);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { _ppmacLogo = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = 'img/icon-192.png';
  });
}

async function drawChartWatermark(ctx, w, h, scale) {
  const dv = chartDefaults();
  const pad = 14 * scale;
  const label = 'PPMAC';
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = `600 ${11 * scale}px ${dv.font}`;
  ctx.fillStyle = dv.muted;
  ctx.fillText(label, w - pad, h - pad);
  const textWidth = ctx.measureText(label).width;
  const logo = await loadPpmacLogo();
  if (logo) {
    const logoSize = 20 * scale;
    ctx.drawImage(logo, w - pad - textWidth - logoSize - 6 * scale, h - pad - logoSize + 3 * scale, logoSize, logoSize);
  }
  ctx.restore();
}

/* Renderiza o Chart.js existente numa densidade de pixel maior (sem alterar
   o tamanho visual em tela), copia o resultado para um canvas separado,
   carimba a marca d'agua e baixa como PNG - depois devolve o grafico
   original ao estado normal. */
async function downloadChartImage(canvasId) {
  const entry = ChartExports[canvasId];
  if (!entry || !entry.chart) return;
  const chart = entry.chart;
  const canvas = chart.canvas;
  const dv = chartDefaults();
  const scale = 3;
  const originalDpr = chart.options.devicePixelRatio;

  // resize() so' aplica na hora se o grafico nao estiver com uma animacao em
  // andamento - caso contrario ele so' agenda a mudanca pro proximo draw, e o
  // toDataURL() abaixo pegaria o canvas ainda no tamanho antigo. stop()
  // encerra qualquer animacao (entrada, hover) antes de redimensionar.
  chart.stop();
  chart.options.devicePixelRatio = scale;
  chart.resize();
  chart.update('none');

  const w = canvas.width, h = canvas.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.fillStyle = dv.surface;
  octx.fillRect(0, 0, w, h);
  octx.drawImage(canvas, 0, 0);
  await drawChartWatermark(octx, w, h, scale);

  chart.options.devicePixelRatio = originalDpr;
  chart.resize();
  chart.update('none');

  const url = out.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `${entry.csv && entry.csv.filename || slugify(canvasId)}.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function downloadChartCSV(canvasId) {
  const entry = ChartExports[canvasId];
  if (!entry || !entry.csv) return;
  const { filename, headers, rows } = entry.csv;
  downloadCSV(`${filename}.csv`, headers, rows);
}

const DOWNLOAD_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8"/><path d="M4.5 7.5 8 11l3.5-3.5"/><path d="M2.5 13.5h11"/></svg>';

/* Par de botoes (imagem em alta resolucao / dados em CSV) reaproveitado em
   todo card de grafico do painel e do construtor de indicadores. */
function chartToolbar(canvasId) {
  return el('div', { class: 'chart-toolbar' }, [
    el('button', {
      class: 'chart-tool-btn', type: 'button', title: 'Baixar imagem em alta resolução (com marca PPMAC)',
      onclick: () => downloadChartImage(canvasId),
    }, [el('span', { html: DOWNLOAD_ICON }), 'Imagem']),
    DATA_DOWNLOAD_ENABLED
      ? el('button', {
          class: 'chart-tool-btn', type: 'button', title: 'Baixar os dados que geraram este gráfico (CSV)',
          onclick: () => downloadChartCSV(canvasId),
        }, [el('span', { html: DOWNLOAD_ICON }), 'Dados'])
      : el('button', {
          class: 'chart-tool-btn', type: 'button', disabled: true, title: 'Exportação de dados temporariamente indisponível',
        }, [el('span', { html: DOWNLOAD_ICON }), 'Dados']),
  ]);
}

/* ---------------------------------------------------------------------
   Biblioteca de graficos compartilhada - usada pelo painel geral e pelo
   construtor de indicadores, para que os dois tenham acesso ao mesmo
   catalogo de tipos de grafico (barra, donut, boxplot, lollipop, empilhada).
--------------------------------------------------------------------- */

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* Linha tracejada de referencia (media) desenhada sobre o grafico. */
function referenceLinePlugin(value, label, dv, orientation) {
  return {
    id: 'referenceLine',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.strokeStyle = dv.accentRef;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (orientation === 'horizontal') {
        const y = scales.y.getPixelForValue(value);
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = dv.accentRef;
        ctx.font = `600 11px ${dv.font}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, chartArea.right, y - 4);
      } else {
        const x = scales.x.getPixelForValue(value);
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = dv.accentRef;
        ctx.font = `600 11px ${dv.font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + 4, chartArea.top + 2);
      }
      ctx.restore();
    }
  };
}

function barChart(canvasId, rows, field, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  let counts = countBy(rows, field);
  let labels = Object.keys(counts);
  let ordinal = true; // legenda de cor: clara->escura acompanha a ordem das categorias
  if (opts.order) {
    labels = opts.order.filter(l => l in counts).concat(labels.filter(l => !opts.order.includes(l)));
  } else if (opts.sortNumeric) {
    labels.sort((a, b) => Number(a) - Number(b));
  } else {
    labels.sort((a, b) => counts[b] - counts[a]);
    ordinal = false; // ordenado por magnitude: a barra maior deve ficar mais escura (mais "pesada")
  }
  if (opts.topN) labels = labels.slice(0, opts.topN);
  const data = labels.map(l => counts[l]);
  const colors = opts.hue ? hueRamp(labels.length, resolveColor(opts.hue)) : rampColors(labels.length);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ordinal ? colors : colors.slice().reverse(),
        borderRadius: 4,
        maxBarThickness: 36,
      }]
    },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed[opts.horizontal ? 'x' : 'y'])} domicílios` } } },
      scales: {
        x: { grid: { color: dv.grid, display: !opts.horizontal }, ticks: { color: dv.muted } },
        y: { grid: { color: dv.grid, display: opts.horizontal }, ticks: { color: dv.muted }, beginAtZero: true }
      }
    }
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: [opts.fieldLabel || field, 'Domicílios'],
    rows: labels.map((l, i) => [l, data[i]]),
  });
  return chart;
}

/* Barra simples a partir de pares (rotulo, valor) ja' calculados - ao
   contrario de barChart (que conta ocorrencias de um campo categorico), esta
   aceita qualquer valor numerico pronto, como a media de um indicador por
   grupo. Rampa por magnitude: a barra maior fica na cor mais "cheia". */
function barChartFromValues(canvasId, labels, values, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const order = labels.map((_, i) => i).sort((a, b) => values[b] - values[a]);
  const sortedLabels = order.map(i => labels[i]);
  const sortedValues = order.map(i => values[i]);
  const colors = (opts.hue ? hueRamp(labels.length, resolveColor(opts.hue)) : rampColors(labels.length)).slice().reverse();
  const unit = opts.unit ? ` ${opts.unit}` : '';

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: sortedLabels, datasets: [{ data: sortedValues, backgroundColor: colors, borderRadius: 4, maxBarThickness: 40 }] },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed[opts.horizontal ? 'x' : 'y'])}${unit}` } } },
      scales: {
        x: { grid: { color: dv.grid, display: !opts.horizontal }, ticks: { color: dv.muted } },
        y: { grid: { color: dv.grid, display: opts.horizontal }, ticks: { color: dv.muted }, beginAtZero: true,
             title: { display: !!opts.yTitle, text: opts.yTitle, color: dv.secondary } }
      }
    }
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: [opts.groupLabel || 'Categoria', opts.valueLabel || 'Valor'],
    rows: sortedLabels.map((l, i) => [l, fmtNum(sortedValues[i])]),
  });
  return chart;
}

function donutChart(canvasId, rows, field, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const counts = countBy(rows, field);
  const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const data = sortedKeys.map(l => counts[l]);
  const labels = opts.maxLen
    ? sortedKeys.map(l => l.length > opts.maxLen ? l.slice(0, opts.maxLen - 1) + '…' : l)
    : sortedKeys;
  const colors = labels.map((_, i) => seriesColor(i));
  const total = data.reduce((a, b) => a + b, 0);

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data, backgroundColor: colors,
        borderColor: dv.surface, borderWidth: 2, borderRadius: 6, spacing: 3, hoverOffset: 10,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      animation: { animateRotate: true, animateScale: true },
      plugins: {
        legend: { position: 'bottom', labels: { color: dv.secondary, boxWidth: 10, padding: 12, font: { size: 11.5 } } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtNum(c.parsed)} (${pct(c.parsed, total)}%)` } }
      }
    },
    plugins: [centerTextPlugin(fmtNum(total), opts.centerLabel || 'domicílios')]
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: [opts.fieldLabel || field, 'Domicílios', '%'],
    rows: labels.map((l, i) => [l, data[i], pct(data[i], total)]),
  });
  return chart;
}

function boxplotByGroup(canvasId, rows, groupField, valueField, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const groups = uniqueValues(rows, groupField);
  const byGroup = groups.map(g => rows
    .filter(r => r[groupField] === g && r[valueField] !== null && r[valueField] !== undefined && !isNaN(Number(r[valueField])))
    .map(r => Number(r[valueField])));
  const order = groups.map((g, i) => i).sort((a, b) => {
    const ma = median(byGroup[a]), mb = median(byGroup[b]);
    return mb - ma;
  });
  const labels = order.map(i => groups[i]);
  const data = order.map(i => byGroup[i]);
  // cor por identidade do grupo (indice alfabetico estavel em `groups`), nao
  // pela posicao de exibicao - assim cada categoria mantem sempre a mesma cor
  const colors = order.map(i => seriesColor(i));
  const means = order.map(i => byGroup[i].reduce((a, b) => a + b, 0) / (byGroup[i].length || 1));
  const allValues = groups.flatMap((_, i) => byGroup[i]);
  const grandMean = allValues.reduce((a, b) => a + b, 0) / (allValues.length || 1);

  const chart = new Chart(canvas, {
    type: 'boxplot',
    data: {
      labels,
      datasets: [
        {
          label: 'Distribuição',
          data,
          backgroundColor: colors.map(c => c + '2e'),
          borderColor: colors,
          borderWidth: 1.5,
          outlierColor: dv.muted,
          itemRadius: 2,
          itemStyle: 'circle',
          itemBackgroundColor: colors.map(c => c + '80'),
          medianColor: colors,
        },
        {
          type: 'line',
          label: 'Média do grupo',
          data: means,
          showLine: false,
          pointStyle: 'rectRot',
          pointRadius: 6,
          pointBorderWidth: 1.5,
          pointBackgroundColor: dv.accentRef,
          pointBorderColor: dv.surface,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color: dv.secondary, boxWidth: 10, font: { size: 11 }, filter: item => item.text === 'Média do grupo' }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.type === 'line') return ` Média: ${fmtNum(ctx.parsed.y)}`;
              const s = ctx.raw;
              return ` mediana ${fmtNum(s.median)} · p25–p75: ${fmtNum(s.q1)}–${fmtNum(s.q3)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: dv.muted } },
        y: { grid: { color: dv.grid }, ticks: { color: dv.muted }, beginAtZero: true,
             title: { display: !!opts.yTitle, text: opts.yTitle, color: dv.secondary } }
      }
    },
    plugins: [referenceLinePlugin(grandMean, `Média geral: ${fmtNum(grandMean)}`, dv, 'horizontal')]
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: [opts.groupLabel || groupField, 'N', 'Média', 'Mediana', 'Mínimo', 'Máximo'],
    rows: labels.map((l, i) => {
      const vals = data[i];
      return [l, vals.length, fmtNum(means[i]), fmtNum(median(vals)), fmtNum(Math.min(...vals)), fmtNum(Math.max(...vals))];
    }),
  });
  return chart;
}

/* Grafico "lollipop" (haste fina + marcador circular): uma rampa sequencial
   (clara -> escura) reforca o ranking, com rotulo direto de valor/% e uma
   linha tracejada marcando a media do conjunto. */
function lollipopChart(canvasId, items, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const labels = items.map(i => i.label);
  const data = items.map(i => i.count);
  const total = opts.total || data.reduce((a, b) => Math.max(a, b), 1);
  const showPct = opts.showPercent !== false;
  const unit = opts.unit ? ` ${opts.unit}` : (showPct ? ' domicílios' : '');
  const fmtValue = v => `${fmtNum(v)}${unit}${showPct ? ` (${pct(v, total)}%)` : ''}`;
  // itens vem pre-ordenados do maior para o menor: a haste maior fica mais "cheia"
  const colors = (opts.hue ? hueRamp(labels.length, resolveColor(opts.hue)) : rampColors(labels.length)).reverse();
  const mean = data.reduce((a, b) => a + b, 0) / (data.length || 1);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 2, barThickness: 3 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 100 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmtValue(c.parsed.x)}` } }
      },
      scales: {
        x: { grid: { color: dv.grid }, ticks: { color: dv.muted }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: dv.muted, autoSkip: false } }
      }
    },
    plugins: [
      lollipopDotsPlugin(colors, dv, fmtValue),
      referenceLinePlugin(mean, `Média: ${fmtNum(mean)}${unit}`, dv, 'vertical')
    ]
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: ['Item', opts.valueLabel || 'Domicílios', ...(showPct ? ['%'] : [])],
    rows: items.map(it => showPct ? [it.label, it.count, pct(it.count, total)] : [it.label, fmtNum(it.count)]),
  });
  return chart;
}

function lollipopDotsPlugin(colors, dv, fmtValue) {
  return {
    id: 'lollipopDots',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0].data;
      meta.data.forEach((bar, i) => {
        const { x, y } = bar.getProps(['x', 'y']);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = dv.surface;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = dv.text;
        ctx.font = `600 11px ${dv.font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtValue(data[i]), x + 11, y);
        ctx.restore();
      });
    }
  };
}

/* Barra empilhada (ou agrupada, com opts.grouped) generica para cruzamentos
   (2+ series por categoria do eixo). */
function stackedBarChart(canvasId, groups, series, matrix, colors, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const datasets = series.map((s, i) => ({
    label: String(s),
    data: matrix[i],
    backgroundColor: colors[i],
    borderColor: dv.surface,
    borderWidth: 1,
    borderRadius: 3,
  }));
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: groups, datasets },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: dv.secondary, boxWidth: 10, font: { size: 11.5 } } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed[opts.horizontal ? 'x' : 'y'])}${opts.percent ? '%' : ''}` } }
      },
      scales: {
        x: { stacked: !opts.grouped, grid: { display: !opts.horizontal, color: dv.grid }, ticks: { color: dv.muted } },
        y: { stacked: !opts.grouped, grid: { display: opts.horizontal, color: dv.grid }, ticks: { color: dv.muted }, beginAtZero: true }
      }
    }
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: [opts.groupLabel || 'Categoria', ...series.map(String)],
    rows: groups.map((g, gi) => [g, ...series.map((s, si) => matrix[si][gi])]),
  });
  return chart;
}

/* Histograma - distribui valores numericos em faixas (bins) de largura
   igual. E' a forma natural pra ver o formato de uma distribuicao (simetria,
   concentracao, caudas) quando nao ha' nenhum recorte/grupo selecionado. */
function histogramChart(canvasId, values, dv, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const nums = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (!nums.length) return;
  const min = Math.min(...nums), max = Math.max(...nums);
  const binCount = opts.bins || Math.min(12, Math.max(5, Math.round(Math.sqrt(nums.length))));
  const width = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: min + i * width,
    to: i === binCount - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  nums.forEach(v => {
    let idx = width ? Math.floor((v - min) / width) : 0;
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  });
  const labels = bins.map(b => `${fmtNum(b.from)}–${fmtNum(b.to)}`);
  const data = bins.map(b => b.count);
  const colors = opts.hue ? hueRamp(labels.length, resolveColor(opts.hue)) : rampColors(labels.length);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3, categoryPercentage: 1, barPercentage: 0.96 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.y)} domicílios` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: dv.muted, maxRotation: 0, autoSkip: true, font: { size: 10.5 } } },
        y: { grid: { color: dv.grid }, ticks: { color: dv.muted }, beginAtZero: true }
      }
    }
  });
  registerChartExport(canvasId, chart, {
    filename: slugify(canvasId),
    headers: ['Intervalo', 'Domicílios'],
    rows: bins.map(b => [`${fmtNum(b.from)}–${fmtNum(b.to)}`, b.count]),
  });
  return chart;
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'selected' || k === 'checked' || k === 'disabled') e[k] = true;
    else e.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return e;
}
