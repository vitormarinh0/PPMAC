(async function () {
  const { catalog, byId, sections, respondents } = await AppData.load();
  const root = document.getElementById('content');
  root.className = '';
  root.innerHTML = '';

  const DEFAULT_COLUMNS = ['id_pesquisa', 'municipio', 'assentamento', 'sexo_entrevistado', 'idade', 'faixa_etaria', 'renda_familiar_mensal'];
  const ALL_COLUMN_IDS = ['id_pesquisa', ...catalog.map(c => c.id)];
  const PAGE_SIZES = [25, 50, 100];

  const urlMunicipio = new URLSearchParams(location.search).get('municipio') || '';

  const state = {
    quick: { municipio: urlMunicipio, assentamento: '', sexo_entrevistado: '', faixa_etaria: '' },
    search: '',
    advanced: [],   // {field, kind:'categorical', values:[...]}  |  {field, kind:'numeric', min, max}
    columns: DEFAULT_COLUMNS.slice(),
    sort: { field: 'id_pesquisa', dir: 'asc' },
    page: 1,
    pageSize: 25,
  };
  const menuOpen = { columns: false, export: false };

  const layout = el('div', { class: 'explorer-grid' });
  const filtersPanel = el('div', { class: 'card filters-panel' });
  const resultsPanel = el('div', {});
  layout.appendChild(filtersPanel);
  layout.appendChild(resultsPanel);
  root.appendChild(layout);

  buildFiltersPanel();
  renderResults();

  // -----------------------------------------------------------------
  // utilidades
  // -----------------------------------------------------------------
  function normalize(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function labelOf(field) {
    if (field === 'id_pesquisa') return 'Código do domicílio';
    return byId[field] ? byId[field].label : field;
  }
  function fieldOptions(rows, field) {
    return uniqueValues(rows, field).map(String);
  }

  // -----------------------------------------------------------------
  // painel de filtros
  // -----------------------------------------------------------------
  function buildFiltersPanel() {
    filtersPanel.innerHTML = '';
    filtersPanel.appendChild(el('h3', {}, 'Filtros rápidos'));

    filtersPanel.appendChild(selectField('Município', state.quick.municipio, ['', ...uniqueValues(respondents, 'municipio')], v => {
      state.quick.municipio = v; state.quick.assentamento = ''; state.page = 1;
      buildFiltersPanel(); renderResults();
    }));

    const assentOptions = state.quick.municipio
      ? uniqueValues(respondents.filter(r => r.municipio === state.quick.municipio), 'assentamento')
      : uniqueValues(respondents, 'assentamento');
    filtersPanel.appendChild(selectField('Assentamento', state.quick.assentamento, ['', ...assentOptions], v => {
      state.quick.assentamento = v; state.page = 1; renderResults();
    }));

    filtersPanel.appendChild(selectField('Sexo do(a) entrevistado(a)', state.quick.sexo_entrevistado, ['', ...uniqueValues(respondents, 'sexo_entrevistado')], v => {
      state.quick.sexo_entrevistado = v; state.page = 1; renderResults();
    }));

    filtersPanel.appendChild(selectField('Faixa etária', state.quick.faixa_etaria, ['', ...uniqueValues(respondents, 'faixa_etaria')], v => {
      state.quick.faixa_etaria = v; state.page = 1; renderResults();
    }));

    filtersPanel.appendChild(el('h3', { style: 'margin-top:22px' }, 'Filtro por pergunta do questionário'));
    filtersPanel.appendChild(el('p', { class: 'chart-note', style: 'margin:-6px 0 10px' },
      'Busque qualquer uma das perguntas da pesquisa e escolha um ou mais valores (ou uma faixa, para números).'));
    filtersPanel.appendChild(buildAdvancedFilterBuilder());

    if (state.advanced.length) {
      const pillRow = el('div', { style: 'margin-top:12px; display:flex; flex-wrap:wrap; gap:6px' });
      state.advanced.forEach((f, i) => {
        const text = f.kind === 'numeric'
          ? `${labelOf(f.field).slice(0, 26)}: ${fmtNum(f.min)}–${fmtNum(f.max)}`
          : `${labelOf(f.field).slice(0, 26)}: ${f.values.length > 2 ? f.values.length + ' valores' : f.values.join(', ').slice(0, 30)}`;
        pillRow.appendChild(el('span', { class: 'pill' }, [
          text,
          el('button', { onclick: () => { state.advanced.splice(i, 1); state.page = 1; buildFiltersPanel(); renderResults(); } }, '×')
        ]));
      });
      filtersPanel.appendChild(pillRow);
    }

    const activeCount = Object.values(state.quick).filter(Boolean).length + state.advanced.length + (state.search ? 1 : 0);
    if (activeCount > 0) {
      filtersPanel.appendChild(el('button', {
        class: 'btn secondary small', style: 'margin-top:14px; width:100%',
        onclick: () => {
          state.quick = { municipio: '', assentamento: '', sexo_entrevistado: '', faixa_etaria: '' };
          state.advanced = []; state.search = ''; state.page = 1;
          buildFiltersPanel(); renderResults();
        }
      }, `Limpar todos os filtros (${activeCount})`));
    }
  }

  function buildAdvancedFilterBuilder() {
    const wrap = el('div', {});
    const searchInput = el('input', { type: 'search', placeholder: 'Buscar pergunta... (ex: renda, animais, clima)' });
    const secSelect = el('select', { style: 'margin-top:8px' }, sections.map(s => el('option', { value: s }, s)));
    const varSelect = el('select', { style: 'margin-top:8px' });
    const valueLabel = el('label', { style: 'margin-top:10px' }, 'Valor(es)');
    const valueContainer = el('div', {});
    const addBtn = el('button', { class: 'btn small', style: 'margin-top:10px; width:100%' }, '+ Adicionar filtro');

    function currentVars() {
      const term = normalize(searchInput.value.trim());
      const base = catalog.filter(c => c.type !== 'multiple');
      if (term) return base.filter(c => normalize(c.label).includes(term)).slice(0, 150);
      return base.filter(c => c.section === secSelect.value);
    }

    function refreshVars() {
      const vars = currentVars();
      varSelect.innerHTML = '';
      if (!vars.length) {
        varSelect.appendChild(el('option', { value: '' }, '(nenhuma pergunta encontrada)'));
      } else {
        vars.forEach(v => varSelect.appendChild(el('option', { value: v.id }, v.label.slice(0, 58))));
      }
      refreshValueControl();
    }

    function refreshValueControl() {
      valueContainer.innerHTML = '';
      const field = varSelect.value;
      if (!field) { addBtn.onclick = null; return; }
      const meta = byId[field] || { type: 'categorical' };
      const contextRows = applyFilters(respondents);

      if (meta.type === 'numeric') {
        const vals = contextRows.map(r => Number(r[field])).filter(v => !isNaN(v));
        const lo = vals.length ? Math.min(...vals) : 0;
        const hi = vals.length ? Math.max(...vals) : 0;
        const minInput = el('input', { type: 'number', value: lo, style: 'width:calc(50% - 5px); display:inline-block' });
        const maxInput = el('input', { type: 'number', value: hi, style: 'width:calc(50% - 5px); display:inline-block; margin-left:10px' });
        valueContainer.appendChild(el('div', {}, [minInput, maxInput]));
        valueContainer.appendChild(el('p', { class: 'chart-note', style: 'margin-top:4px' }, `Intervalo disponível: ${fmtNum(lo)} – ${fmtNum(hi)}`));
        addBtn.onclick = () => {
          const min = Number(minInput.value), max = Number(maxInput.value);
          if (isNaN(min) || isNaN(max)) return;
          state.advanced.push({ field, kind: 'numeric', min, max });
          state.page = 1; buildFiltersPanel(); renderResults();
        };
      } else {
        const options = fieldOptions(contextRows, field);
        const list = el('div', { class: 'checkbox-list' });
        const checkboxes = [];
        if (!options.length) {
          list.appendChild(el('p', { class: 'chart-note', style: 'margin:2px 0' }, 'Nenhum valor disponível com os filtros atuais.'));
        }
        options.forEach(opt => {
          const cb = el('input', { type: 'checkbox', value: opt });
          checkboxes.push(cb);
          list.appendChild(el('label', {}, [cb, opt.slice(0, 44)]));
        });
        valueContainer.appendChild(list);
        addBtn.onclick = () => {
          const selected = checkboxes.filter(c => c.checked).map(c => c.value);
          if (!selected.length) return;
          state.advanced.push({ field, kind: 'categorical', values: selected });
          state.page = 1; buildFiltersPanel(); renderResults();
        };
      }
    }

    const secLabel = el('label', { style: 'margin-top:8px' }, 'Seção');
    searchInput.addEventListener('input', () => {
      const searching = !!searchInput.value.trim();
      secSelect.style.display = searching ? 'none' : 'block';
      secLabel.style.display = searching ? 'none' : 'block';
      refreshVars();
    });
    secSelect.addEventListener('change', refreshVars);
    varSelect.addEventListener('change', refreshValueControl);
    refreshVars();

    wrap.appendChild(el('label', {}, 'Buscar'));
    wrap.appendChild(searchInput);
    wrap.appendChild(secLabel);
    wrap.appendChild(secSelect);
    wrap.appendChild(el('label', { style: 'margin-top:8px' }, 'Pergunta'));
    wrap.appendChild(varSelect);
    wrap.appendChild(valueLabel);
    wrap.appendChild(valueContainer);
    wrap.appendChild(addBtn);
    return wrap;
  }

  function applyFilters(rows) {
    return rows.filter(r => {
      if (state.quick.municipio && r.municipio !== state.quick.municipio) return false;
      if (state.quick.assentamento && r.assentamento !== state.quick.assentamento) return false;
      if (state.quick.sexo_entrevistado && r.sexo_entrevistado !== state.quick.sexo_entrevistado) return false;
      if (state.quick.faixa_etaria && r.faixa_etaria !== state.quick.faixa_etaria) return false;
      for (const f of state.advanced) {
        if (f.kind === 'numeric') {
          const v = Number(r[f.field]);
          if (isNaN(v) || v < f.min || v > f.max) return false;
        } else {
          if (!f.values.includes(String(r[f.field]))) return false;
        }
      }
      if (state.search) {
        const term = normalize(state.search);
        const hay = normalize(state.columns.map(c => r[c]).join(' | '));
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }

  // -----------------------------------------------------------------
  // resultados
  // -----------------------------------------------------------------
  function renderResults() {
    resultsPanel.innerHTML = '';
    let rows = applyFilters(respondents);

    const searchBox = el('input', {
      type: 'search',
      placeholder: `Buscar nas colunas exibidas (${state.columns.length})...`,
    });
    searchBox.value = state.search;
    let searchTimer = null;
    searchBox.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = searchBox.value; state.page = 1; renderResults(); }, 200);
    });
    resultsPanel.appendChild(el('div', { class: 'search-row' }, [el('span', { class: 'icon' }, '⌕'), searchBox]));

    // sort (calculada antes do botao de exportar / estado vazio, pois ambos dependem dela)
    const sorted = rows.slice().sort((a, b) => {
      const { field, dir } = state.sort;
      let av = a[field], bv = b[field];
      const an = Number(av), bn = Number(bv);
      let cmp;
      if (!isNaN(an) && !isNaN(bn) && av !== null && bv !== null && av !== '' && bv !== '') cmp = an - bn;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR');
      return dir === 'asc' ? cmp : -cmp;
    });

    resultsPanel.appendChild(el('div', { style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px' }, [
      el('p', { class: 'result-count', style: 'margin:0' }, `${fmtNum(rows.length)} de ${fmtNum(respondents.length)} domicílios`),
      el('div', { style: 'display:flex; gap:8px' }, [
        columnPickerButton(),
        exportButton(() => sorted),
      ])
    ]));

    if (!rows.length) {
      resultsPanel.appendChild(el('div', { class: 'card empty-state' }, [
        el('p', { style: 'margin:0 0 6px; font-weight:600; color:var(--text-primary)' }, 'Nenhum domicílio encontrado'),
        el('p', { style: 'margin:0' }, 'Tente remover algum filtro ou ajustar o termo de busca.'),
      ]));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const pageRows = sorted.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    const tableScroll = el('div', { class: 'table-scroll' });
    const table = el('table');
    const thead = el('thead');
    const trh = el('tr');
    state.columns.forEach(colId => {
      const label = labelOf(colId);
      const arrow = state.sort.field === colId ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      trh.appendChild(el('th', {
        onclick: () => {
          if (state.sort.field === colId) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
          else state.sort = { field: colId, dir: 'asc' };
          renderResults();
        }
      }, [label.slice(0, 34), el('span', { class: 'sort-arrow' }, arrow)]));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el('tbody');
    pageRows.forEach(r => {
      const tr = el('tr', { onclick: () => openDetailModal(r), title: 'Clique para ver todas as respostas deste domicílio' });
      state.columns.forEach(colId => {
        let v = r[colId];
        if (v === null || v === undefined || v === '') v = '—';
        tr.appendChild(el('td', {}, String(v)));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableScroll.appendChild(table);
    resultsPanel.appendChild(tableScroll);

    const pageSizeSelect = el('select', { style: 'width:auto; padding:4px 8px' },
      PAGE_SIZES.map(s => el('option', { value: s, selected: s === state.pageSize ? 'selected' : null }, `${s} por página`)));
    pageSizeSelect.value = state.pageSize;
    pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderResults(); });

    resultsPanel.appendChild(el('div', { class: 'pagination' }, [
      el('button', { class: 'btn secondary small', onclick: () => { if (state.page > 1) { state.page--; renderResults(); } } }, '← Anterior'),
      el('span', {}, `Página ${state.page} de ${totalPages}`),
      el('button', { class: 'btn secondary small', onclick: () => { if (state.page < totalPages) { state.page++; renderResults(); } } }, 'Próxima →'),
      el('span', { style: 'flex:1' }, ''),
      pageSizeSelect,
    ]));
  }

  // -----------------------------------------------------------------
  // detalhe de um domicilio (modal)
  // -----------------------------------------------------------------
  function openDetailModal(row) {
    const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } });
    const panel = el('div', { class: 'modal-panel' });
    function close() { backdrop.remove(); }

    panel.appendChild(el('button', { class: 'modal-close', onclick: close, 'aria-label': 'Fechar' }, '×'));
    panel.appendChild(el('h2', { style: 'margin:0 0 2px' }, `Domicílio ${row.id_pesquisa}`));
    panel.appendChild(el('p', { class: 'chart-note', style: 'margin:0' }, `${row.assentamento || '—'} · ${row.municipio || '—'}`));

    sections.forEach(sec => {
      const fields = catalog.filter(c => c.section === sec && c.type !== 'multiple');
      const withValue = fields.filter(f => {
        const v = row[f.id];
        return v !== null && v !== undefined && v !== '';
      });
      if (!withValue.length) return;
      const section = el('div', { class: 'detail-section' }, [el('h4', {}, sec)]);
      withValue.forEach(f => {
        section.appendChild(el('div', { class: 'detail-row' }, [
          el('span', { class: 'k' }, [
            f.label,
            el('a', { class: 'dict-link', href: `dicionario.html#${f.id}`, target: '_blank', title: 'Ver no dicionário de dados' }, 'i'),
          ]),
          el('span', { class: 'v' }, String(row[f.id])),
        ]));
      });
      panel.appendChild(section);
    });

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
    document.addEventListener('keydown', onEsc);
  }

  // -----------------------------------------------------------------
  // menus (colunas / baixar)
  // -----------------------------------------------------------------
  function dropdownContainer(key, buttonLabel, buttonClass, buildMenu) {
    const btn = el('button', { class: buttonClass }, buttonLabel);
    const menu = el('div', { class: 'dropdown-menu' + (menuOpen[key] ? ' open' : '') });
    buildMenu(menu, () => { menuOpen[key] = false; menu.classList.remove('open'); });
    const container = el('div', { style: 'position:relative; display:inline-block' }, [btn, menu]);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.keys(menuOpen).forEach(k => { if (k !== key) menuOpen[k] = false; });
      menuOpen[key] = !menuOpen[key];
      menu.classList.toggle('open', menuOpen[key]);
    });
    document.addEventListener('click', () => { menuOpen[key] = false; menu.classList.remove('open'); });
    menu.addEventListener('click', (e) => e.stopPropagation());
    return container;
  }

  function columnPickerButton() {
    return dropdownContainer('columns', 'Colunas ▾', 'btn secondary small', (menu) => {
      menu.style.width = '320px'; menu.style.maxHeight = '440px'; menu.style.overflow = 'auto';

      const searchInput = el('input', { type: 'search', placeholder: 'Buscar coluna...', style: 'margin-bottom:8px' });
      menu.appendChild(searchInput);

      const countLabel = el('p', { class: 'chart-note', style: 'margin:0 0 8px' }, `${state.columns.length} coluna(s) selecionada(s)`);
      menu.appendChild(countLabel);

      const listWrap = el('div', {});
      menu.appendChild(listWrap);

      function renderList() {
        listWrap.innerHTML = '';
        const term = normalize(searchInput.value.trim());
        sections.forEach(sec => {
          const vars = catalog.filter(c => c.section === sec && (!term || normalize(c.label).includes(term)));
          if (!vars.length) return;
          const header = el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin:10px 0 4px' }, [
            el('span', { style: 'font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase' }, sec),
            el('button', {
              class: 'btn secondary small', style: 'padding:1px 7px; font-size:11px',
              onclick: () => {
                const ids = vars.map(v => v.id);
                const allSelected = ids.every(id => state.columns.includes(id));
                state.columns = allSelected ? state.columns.filter(c => !ids.includes(c)) : Array.from(new Set([...state.columns, ...ids]));
                countLabel.textContent = `${state.columns.length} coluna(s) selecionada(s)`;
                renderList(); renderResults();
              }
            }, 'alternar todas')
          ]);
          listWrap.appendChild(header);
          vars.forEach(v => {
            const id = 'col_' + v.id;
            const cb = el('input', { type: 'checkbox', id });
            cb.checked = state.columns.includes(v.id);
            cb.addEventListener('change', () => {
              if (cb.checked) { if (!state.columns.includes(v.id)) state.columns.push(v.id); }
              else state.columns = state.columns.filter(c => c !== v.id);
              countLabel.textContent = `${state.columns.length} coluna(s) selecionada(s)`;
              renderResults();
            });
            listWrap.appendChild(el('label', { for: id }, [cb, v.label.slice(0, 42)]));
          });
        });
        if (!listWrap.children.length) listWrap.appendChild(el('p', { class: 'chart-note' }, 'Nenhuma coluna encontrada.'));
      }
      searchInput.addEventListener('input', renderList);
      renderList();

      menu.appendChild(el('button', {
        class: 'btn secondary small', style: 'width:100%; margin-top:10px',
        onclick: () => { state.columns = DEFAULT_COLUMNS.slice(); menuOpen.columns = false; renderResults(); }
      }, 'Restaurar colunas padrão'));
    });
  }

  function exportButton(getSorted) {
    if (!DATA_DOWNLOAD_ENABLED) {
      return el('button', { class: 'btn', disabled: true, title: 'Exportação de dados temporariamente indisponível' }, 'Baixar dados');
    }
    return dropdownContainer('export', 'Baixar dados ▾', 'btn', (menu) => {
      menu.style.width = '300px'; menu.style.right = '0';

      function doExport(mode) {
        const sorted = getSorted();
        if (mode === 'visible') {
          downloadCSV('ppmac_dados_filtrados.csv', state.columns.map(labelOf), sorted.map(r => state.columns.map(c => r[c])));
        } else if (mode === 'all-filtered') {
          downloadCSV('ppmac_dados_filtrados_completo.csv', ALL_COLUMN_IDS.map(labelOf), sorted.map(r => ALL_COLUMN_IDS.map(c => r[c])));
        } else {
          downloadCSV('ppmac_base_completa.csv', ALL_COLUMN_IDS.map(labelOf), respondents.map(r => ALL_COLUMN_IDS.map(c => r[c])));
        }
      }

      const opt = (title, desc, onclick) => el('button', {
        class: 'btn secondary small',
        style: 'width:100%; justify-content:flex-start; text-align:left; height:auto; padding:8px 10px; margin-bottom:6px; display:flex; flex-direction:column; align-items:flex-start; gap:2px',
        onclick
      }, [
        el('span', { style: 'font-weight:600' }, title),
        el('span', { style: 'font-weight:400; color:var(--text-muted); font-size:11.5px' }, desc),
      ]);

      menu.appendChild(opt(
        'Colunas exibidas na tabela',
        `${state.columns.length} colunas · linhas filtradas atualmente`,
        () => doExport('visible')));
      menu.appendChild(opt(
        'Todas as colunas',
        `${ALL_COLUMN_IDS.length} colunas · linhas filtradas atualmente`,
        () => doExport('all-filtered')));
      menu.appendChild(el('div', { style: 'margin-bottom:6px' }, opt(
        'Base completa',
        `${ALL_COLUMN_IDS.length} colunas · todos os ${fmtNum(respondents.length)} domicílios (ignora filtros)`,
        () => doExport('all-raw'))));
    });
  }

  function selectField(label, value, options, onChange) {
    const sel = el('select', {}, options.map(o => el('option', { value: o, selected: o === value ? 'selected' : null }, o === '' ? 'Todos' : o)));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return el('div', { class: 'field' }, [el('label', {}, label), sel]);
  }
})();
