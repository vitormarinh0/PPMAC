(async function () {
  const [catalog, dictionary] = await Promise.all([
    fetch('data/catalog.json').then(r => r.json()),
    fetch('data/dictionary.json').then(r => r.json()),
  ]);
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const byId = {};
  catalog.forEach(c => { byId[c.id] = c; });

  const sections = [];
  catalog.forEach(c => { if (!sections.includes(c.section)) sections.push(c.section); });
  const outrosIdx = sections.indexOf('Outros');
  if (outrosIdx !== -1) sections.push(sections.splice(outrosIdx, 1)[0]);

  const TYPE_LABEL = { numeric: 'Numérico', categorical: 'Categórico', binary: 'Binário', multiple: 'Múltipla escolha', date: 'Data' };
  const PAGE_SIZES = [25, 50, 100];

  const state = { q: '', section: '', type: '', page: 1, pageSize: 25 };
  let expanded = null;
  let pendingHighlight = null;

  const hashId = decodeURIComponent(location.hash.slice(1));
  if (hashId && byId[hashId]) {
    expanded = hashId;
    pendingHighlight = hashId;
    const idx = catalog.findIndex(c => c.id === hashId);
    if (idx >= 0) state.page = Math.floor(idx / state.pageSize) + 1;
  }

  const layout = el('div', { class: 'explorer-grid' });
  const panel = el('div', { class: 'card filters-panel' });
  const results = el('div', {});
  layout.appendChild(panel); layout.appendChild(results);
  root.appendChild(layout);

  buildPanel();
  render();

  function buildPanel() {
    panel.appendChild(el('h3', {}, 'Filtros'));

    const searchInput = el('input', { type: 'search', placeholder: 'Buscar por pergunta ou código...', value: state.q });
    searchInput.addEventListener('input', () => { state.q = searchInput.value; state.page = 1; render(); });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Buscar'), searchInput]));

    const sectionSelect = el('select', {}, [el('option', { value: '' }, 'Todas'), ...sections.map(s => el('option', { value: s }, s))]);
    sectionSelect.addEventListener('change', () => { state.section = sectionSelect.value; state.page = 1; render(); });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Seção do questionário'), sectionSelect]));

    const typeSelect = el('select', {}, [el('option', { value: '' }, 'Todos'), ...Object.entries(TYPE_LABEL).map(([k, v]) => el('option', { value: k }, v))]);
    typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.page = 1; render(); });
    panel.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Tipo de variável'), typeSelect]));

    panel.appendChild(el('p', { class: 'chart-note' },
      'Variáveis "binário" são uma opção específica de uma pergunta de múltipla escolha (ex.: cada produto da bioeconomia citado vira uma coluna Sim/Não própria).'));
  }

  function normalize(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function matches(c) {
    if (state.section && c.section !== state.section) return false;
    if (state.type && c.type !== state.type) return false;
    if (state.q) {
      const q = normalize(state.q);
      return normalize(c.label).includes(q) || normalize(c.id).includes(q);
    }
    return true;
  }

  function downloadDictionaryCSV(rows, filename) {
    downloadCSV(filename, ['Código', 'Pergunta', 'Seção', 'Tipo', 'Tipo no formulário', 'Opções de resposta'], rows.map(c => {
      const dict = dictionary[c.id] || {};
      const choices = (dict.choices || []).map(ch => `${ch.value}=${ch.label}`).join('; ');
      return [c.id, c.label, c.section, TYPE_LABEL[c.type] || c.type, dict.type_raw || '', choices];
    }));
  }

  function render() {
    results.innerHTML = '';
    const filtered = catalog.filter(matches);
    const countRow = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px' }, [
      el('p', { class: 'result-count', style: 'margin:0' }, `${fmtNum(filtered.length)} de ${fmtNum(catalog.length)} variáveis`),
      DATA_DOWNLOAD_ENABLED
        ? el('button', {
            class: 'btn secondary small', type: 'button',
            onclick: () => downloadDictionaryCSV(filtered, state.q || state.section || state.type ? 'dicionario-filtrado.csv' : 'dicionario-ppmac.csv'),
          }, `Baixar ${filtered.length === catalog.length ? 'dicionário completo' : 'esta seleção'} (CSV)`)
        : el('button', {
            class: 'btn secondary small', type: 'button', disabled: true, title: 'Exportação de dados temporariamente indisponível',
          }, 'Baixar dicionário (CSV)'),
    ]);
    results.appendChild(countRow);

    if (!filtered.length) {
      results.appendChild(el('div', { class: 'empty-state' }, 'Nenhuma variável encontrada com esses filtros.'));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const pageRows = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    const table = el('table');
    table.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', {}, 'Pergunta'), el('th', {}, 'Código'), el('th', {}, 'Seção'), el('th', {}, 'Tipo'),
    ])]));
    const tbody = el('tbody');
    pageRows.forEach(c => {
      const dict = dictionary[c.id] || {};
      const isOpen = expanded === c.id;
      const row = el('tr', { class: 'dict-row' + (isOpen ? ' open' : ''), id: c.id }, [
        el('td', {}, [el('span', { class: 'chev' }, '▸'), c.label]),
        el('td', {}, [el('code', {}, c.id)]),
        el('td', {}, c.section),
        el('td', {}, [el('span', { class: 'badge' }, TYPE_LABEL[c.type] || c.type)]),
      ]);
      row.addEventListener('click', () => {
        expanded = isOpen ? null : c.id;
        render();
        if (!isOpen) document.getElementById(c.id).scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      tbody.appendChild(row);
      if (isOpen) {
        tbody.appendChild(el('tr', { class: 'dict-detail-row' }, [
          el('td', { colspan: 4 }, [detailContent(c, dict)]),
        ]));
      }
    });
    table.appendChild(tbody);
    results.appendChild(el('div', { class: 'table-scroll' }, [table]));

    const pageSizeSelect = el('select', { style: 'width:auto; padding:4px 8px' },
      PAGE_SIZES.map(s => el('option', { value: s, selected: s === state.pageSize ? 'selected' : null }, `${s} por página`)));
    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; render(); });
    results.appendChild(el('div', { class: 'pagination' }, [
      el('button', { class: 'btn secondary small', onclick: () => { if (state.page > 1) { state.page--; render(); } } }, '← Anterior'),
      el('span', {}, `Página ${state.page} de ${totalPages}`),
      el('button', { class: 'btn secondary small', onclick: () => { if (state.page < totalPages) { state.page++; render(); } } }, 'Próxima →'),
      pageSizeSelect,
    ]));

    if (pendingHighlight) {
      const target = pendingHighlight;
      pendingHighlight = null;
      setTimeout(() => {
        const rowEl = document.getElementById(target);
        if (!rowEl) return;
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowEl.classList.add('highlight');
        setTimeout(() => rowEl.classList.remove('highlight'), 1700);
      }, 50);
    }
  }

  function detailContent(c, dict) {
    const wrap = el('div', { class: 'dict-detail' });
    const meta = [];
    if (dict.type_raw) meta.push(`Tipo no formulário: ${dict.type_raw}`);
    if (c.parent) meta.push(`Parte da pergunta de múltipla escolha "${byId[c.parent] ? byId[c.parent].label : c.parent}"`);
    if (meta.length) wrap.appendChild(el('p', { class: 'chart-note', style: 'margin-top:0' }, meta.join(' · ')));

    if (dict.choices && dict.choices.length) {
      wrap.appendChild(el('p', { style: 'font-weight:600; margin:10px 0 6px; font-size:13px' }, `Opções de resposta válidas (${dict.choices.length}):`));
      wrap.appendChild(el('div', { class: 'legend-row' }, dict.choices.map(ch => el('span', { class: 'pill' }, ch.label))));
    } else if (c.type === 'numeric') {
      wrap.appendChild(el('p', { class: 'chart-note' }, 'Campo numérico — sem lista fixa de opções.'));
    } else {
      wrap.appendChild(el('p', { class: 'chart-note' }, 'Sem lista de opções pré-definida.'));
    }

    wrap.appendChild(el('div', { style: 'margin-top:12px' }, [
      el('a', {
        class: 'btn small', href: 'indicadores.html',
        onclick: () => sessionStorage.setItem('ppmac_ind_var', c.id),
      }, 'Abrir no construtor de indicadores'),
    ]));
    return wrap;
  }
})();
