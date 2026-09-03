/* Utilidades compartilhadas pelas paginas de mapa (mapa.html, ondas-calor.html):
   normalizacao de nomes, rampa de cor continua, mapa base tematizado (claro/
   escuro) e o contorno do Para + seus 144 municipios. */

function normMuni(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* interpola um valor continuo t (0..1) ao longo de uma lista de cores - mesma
   logica da rampColors() de data.js, mas para uma metrica continua (PIB,
   ondas de calor) em vez de N itens discretos ordenados por posicao. */
function continuousRamp(hexStops, t) {
  const pos = Math.max(0, Math.min(1, t)) * (hexStops.length - 1);
  const i0 = Math.floor(pos), i1 = Math.min(hexStops.length - 1, i0 + 1);
  return lerpColor(hexStops[i0], hexStops[i1], pos - i0);
}

/* agrega os indicadores da pesquisa de campo por municipio (usado pra marcar
   quais dos 144 municipios do Para fazem parte da amostra dos 7 estudados). */
function aggregateByMunicipio(respondents) {
  const groups = {};
  respondents.forEach(r => {
    if (!r.municipio) return;
    (groups[r.municipio] = groups[r.municipio] || []).push(r);
  });
  return Object.entries(groups).map(([municipio, rows]) => {
    const n = rows.length;
    return {
      municipio,
      n,
      assentamentos: uniqueValues(rows, 'assentamento'),
      assentCounts: countBy(rows, 'assentamento'),
      chefiaFemPct: pct(rows.filter(r => r.chefe_mulher === 'Sim').length, n),
      climaPct: pct(rows.filter(r => r.mudanca_climaticas === 'Sim').length, n),
      bioPct: pct(rows.filter(r => r.bioeconomia === 'Sim').length, n),
      ampliarPct: pct(rows.filter(r => r.ampliar_producao_bio === 'Sim').length, n),
      tempoMedio: meanBy(rows, 'tempo_assent'),
    };
  });
}

async function loadParaGeo() {
  const [estadoGeo, municipiosGeo] = await Promise.all([
    fetch('data/pa_estado.geojson').then(r => r.json()),
    fetch('data/pa_municipios.geojson').then(r => r.json()),
  ]);
  return { estadoGeo, municipiosGeo };
}

/* cria o mapa Leaflet com tiles claros/escuros (Esri Gray Canvas, sem chave
   de API) que acompanham o tema do sistema automaticamente. */
function createThemedMap(mapEl, opts = {}) {
  const map = L.map(mapEl, Object.assign({ scrollWheelZoom: false, minZoom: 5 }, opts));

  function tileUrl(dark) {
    const layer = dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base';
    return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${layer}/MapServer/tile/{z}/{y}/{x}`;
  }
  const tileOptions = {
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, FAO, NOAA, USGS',
    maxZoom: 16,
  };

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let tileLayer = L.tileLayer(tileUrl(mq.matches), tileOptions).addTo(map);
  mq.addEventListener('change', (e) => {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(tileUrl(e.matches), tileOptions).addTo(map);
    tileLayer.bringToBack();
  });

  return map;
}

/* contorno do estado - sem preenchimento, so' pra dar contexto geografico */
function addStateOutline(map, estadoGeo) {
  return L.geoJSON(estadoGeo, {
    interactive: false,
    style: { fillOpacity: 0, color: resolveColor('var(--brand-deep)'), weight: 2.5 },
  }).addTo(map);
}
