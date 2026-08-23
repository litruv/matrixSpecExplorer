const STATUS_LABELS = {
  merged: 'Merged / Approved',
  'spec-pr-review': 'Spec PR in review',
  'spec-pr-missing': 'Spec PR missing',
  'fcp-complete': 'FCP complete',
  fcp: 'Final comment period',
  'proposed-fcp': 'Proposed FCP',
  'in-review': 'In review',
  draft: 'Draft',
  placeholder: 'Placeholder',
  postponed: 'Postponed',
  abandoned: 'Abandoned',
  obsolete: 'Obsolete',
  closed: 'Closed / Rejected',
  unknown: 'Unknown',
};

const state = {
  search: '',
  statuses: new Set(),
  kinds: new Set(),
  areas: new Set(),
  sort: 'number-desc',
  selected: null,
  suggestionIndex: 0,
  suggestions: [],
  favoritesOnly: false,
};

const FAVORITES_KEY = 'matrixSpecExplorer.favorites';

const SORT_OPTIONS = [
  { value: 'number-desc', label: 'Newest first' },
  { value: 'number-asc', label: 'Oldest first' },
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'comments-desc', label: 'Most discussed' },
  { value: 'title-asc', label: 'Title A–Z' },
];

const SEARCH_OPERATORS = [
  { key: 'depends', prefixes: ['depends', 'depends-on'], insert: 'depends:', label: 'depends:' },
  { key: 'depended-by', prefixes: ['depended-by', 'depended', 'used-by'], insert: 'depended-by:', label: 'depended-by:' },
  { key: 'status', prefixes: ['status'], insert: 'status:', label: 'status:' },
  { key: 'kind', prefixes: ['kind'], insert: 'kind:', label: 'kind:' },
  { key: 'area', prefixes: ['area'], insert: 'area:', label: 'area:' },
  { key: 'author', prefixes: ['author'], insert: 'author:', label: 'author:' },
  { key: 'msc', prefixes: ['msc'], insert: 'msc:', label: 'msc:' },
];

const OPERATOR_ALIASES = Object.fromEntries(
  SEARCH_OPERATORS.flatMap((op) => op.prefixes.map((p) => [p, op.key]))
);

const byNumber = new Map();
for (const msc of MSC_INDEX.mscs) {
  byNumber.set(msc.number, msc);
}

const favorites = loadFavorites();

function getCommentCount(msc) {
  if (typeof MSC_COMMENTS === 'undefined') return 0;
  return MSC_COMMENTS[String(msc.pr)]?.length ?? 0;
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const nums = JSON.parse(raw);
    if (!Array.isArray(nums)) return new Set();
    return new Set(nums.filter((n) => typeof n === 'number' && byNumber.has(n)));
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites].sort((a, b) => b - a)));
}

function isFavorite(num) {
  return favorites.has(num);
}

function toggleFavorite(num) {
  if (!byNumber.has(num)) return;
  if (favorites.has(num)) favorites.delete(num);
  else favorites.add(num);
  saveFavorites();
  updateFavoritesFilterUI();
  syncFavoriteButtons(num);
  render();
}

function favoriteButtonHtml(num, className = 'copy-btn favorite-btn') {
  const active = isFavorite(num);
  return `<button type="button" class="${className}${active ? ' is-favourite' : ''}" data-favorite="${num}" aria-label="${active ? 'Remove from favourites' : 'Add to favourites'}">${icon('star', 'icon')}</button>`;
}

function updateFavoritesFilterUI() {
  const countEl = document.getElementById('favorites-count');
  if (countEl) countEl.textContent = String(favorites.size);
  const filterBtn = document.getElementById('favorites-filter');
  if (filterBtn) filterBtn.classList.toggle('active', state.favoritesOnly);
}

function syncFavoriteButtons(num) {
  const active = isFavorite(num);
  document.querySelectorAll(`[data-favorite="${num}"]`).forEach((btn) => {
    btn.classList.toggle('is-favourite', active);
    btn.setAttribute('aria-label', active ? 'Remove from favourites' : 'Add to favourites');
  });
}

function bindFavoriteButtons(root) {
  root.querySelectorAll('[data-favorite]').forEach((btn) => {
    if (btn.dataset.favoriteBound) return;
    btn.dataset.favoriteBound = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleFavorite(parseInt(btn.dataset.favorite, 10));
    });
  });
}

function init() {
  document.getElementById('meta').textContent = `${MSC_INDEX.count} MSCs`;

  buildStatusFilterList();
  buildFilterChips('kind-filters', collectUnique('kind'), state.kinds, 'kind');
  buildFilterChips('area-filters', collectUnique('area'), state.areas, 'area');

  document.getElementById('search').addEventListener('input', onSearchInput);
  document.getElementById('search').addEventListener('keydown', onSearchKeydown);
  document.getElementById('search').addEventListener('focus', renderSearchOverlay);
  document.getElementById('search').addEventListener('blur', () => {
    setTimeout(hideSearchOverlay, 150);
  });
  document.getElementById('search-overlay').addEventListener('mousedown', (e) => e.preventDefault());
  document.getElementById('search-overlay').addEventListener('click', onSearchOverlayClick);

  initSortDropdown();

  document.getElementById('clear-filters').addEventListener('click', clearFilters);

  document.getElementById('favorites-filter').addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    updateFavoritesFilterUI();
    render();
  });
  updateFavoritesFilterUI();

  window.addEventListener('popstate', syncFromLocation);
  window.addEventListener('hashchange', syncFromLocation);

  const initial = mscFromLocation();
  if (initial !== null) {
    openDetail(initial);
    history.replaceState({ msc: initial }, '', mscAppUrl(initial));
  } else {
    render();
  }

  setupColumnResize();
  refreshIcons();

  window.addEventListener('scroll', () => hideMscPreview(0), true);
  window.addEventListener('resize', () => hideMscPreview(0));
}

function icon(name, className = 'icon') {
  return `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
}

function githubIcon(className = 'icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;
}

function sectionHeading(name, title) {
  return `<h3>${icon(name)} ${esc(title)}</h3>`;
}

function refreshIcons(root = document) {
  if (typeof lucide === 'undefined') return;
  lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

let previewEl = null;
let previewHideTimer = null;

function ensurePreviewEl() {
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.id = 'msc-preview';
    previewEl.hidden = true;
    document.body.appendChild(previewEl);
  }
  return previewEl;
}

function renderMscPreview(msc) {
  const areas = msc.area.slice(0, 2).map((a) => secondaryTag(a, 'area')).join('');
  const deps = msc.dependencies.length
    ? secondaryTag(`${icon('git-branch', 'icon icon-inline')} ${msc.dependencies.length}`, 'deps', true)
    : '';

  return `
    <div class="msc-preview-num">MSC${msc.number}</div>
    <div class="msc-preview-title">${esc(msc.wip ? '[WIP] ' : '')}${esc(msc.title)}</div>
    <div class="msc-preview-meta">
      ${statusTagHtml(msc.status)}
      ${areas}
      ${deps}
    </div>`;
}

function positionMscPreview(el, anchor) {
  const padding = 8;
  const rect = anchor.getBoundingClientRect();

  el.style.visibility = 'hidden';
  el.hidden = false;

  const elRect = el.getBoundingClientRect();
  let top = rect.bottom + padding;
  let left = rect.left;

  if (top + elRect.height > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - elRect.height - padding);
  }
  if (left + elRect.width > window.innerWidth - padding) {
    left = window.innerWidth - elRect.width - padding;
  }
  if (left < padding) left = padding;

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  el.style.visibility = 'visible';
}

function showMscPreview(num, anchor) {
  const msc = byNumber.get(num);
  if (!msc) return;

  clearTimeout(previewHideTimer);

  const el = ensurePreviewEl();
  el.innerHTML = renderMscPreview(msc);
  positionMscPreview(el, anchor);
  refreshIcons(el);
}

function hideMscPreview(delay = 60) {
  clearTimeout(previewHideTimer);
  previewHideTimer = setTimeout(() => {
    if (previewEl) previewEl.hidden = true;
  }, delay);
}

function collectUnique(field) {
  const set = new Set();
  for (const msc of MSC_INDEX.mscs) {
    for (const v of msc[field] ?? []) set.add(v);
  }
  return Object.fromEntries([...set].sort().map((k) => [k, k]));
}

function statusTagHtml(status, large = false) {
  const label = STATUS_LABELS[status] ?? status;
  const sizeClass = large ? ' tag-status-lg' : '';
  return `<span class="tag tag-status status-${esc(status)}${sizeClass}"><span class="tag-status-dot" aria-hidden="true"></span>${esc(label)}</span>`;
}

function secondaryTag(text, type = 'meta', asHtml = false) {
  const content = asHtml ? text : esc(text);
  return `<span class="tag tag-${esc(type)}">${content}</span>`;
}

function parseSearchQuery(query) {
  const filters = [];
  const regex = /([\w-]+):("([^"]*)"|(\S+))/gi;
  let match;

  while ((match = regex.exec(query)) !== null) {
    const rawOp = match[1].toLowerCase();
    const op = OPERATOR_ALIASES[rawOp];
    if (!op) continue;
    filters.push({ op, rawOp, value: (match[3] ?? match[4]).trim() });
  }

  const freeText = query.replace(regex, ' ').replace(/\s+/g, ' ').trim();
  return { filters, freeText };
}

function findStatusKey(value) {
  const needle = value.toLowerCase().replace(/\s+/g, '-');
  if (STATUS_LABELS[needle]) return needle;
  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    if (label.toLowerCase().includes(value.toLowerCase())) return key;
  }
  return null;
}

function matchesSearchFilters(msc, filters) {
  for (const { op, value } of filters) {
    switch (op) {
      case 'depends': {
        const num = parseInt(value, 10);
        if (!num) return false;
        if (msc.number !== num && !msc.dependencies.includes(num)) return false;
        break;
      }
      case 'depended-by': {
        const num = parseInt(value, 10);
        if (!num) return false;
        const isTarget = msc.number === num;
        const isDependent = getDependents(num).some((d) => d.number === msc.number);
        if (!isTarget && !isDependent) return false;
        break;
      }
      case 'status': {
        const statusKey = findStatusKey(value);
        if (!statusKey || msc.status !== statusKey) return false;
        break;
      }
      case 'kind':
        if (!msc.kind.some((k) => k.toLowerCase() === value.toLowerCase())) return false;
        break;
      case 'area':
        if (!msc.area.some((a) => a.toLowerCase().includes(value.toLowerCase()))) return false;
        break;
      case 'author':
        if (!msc.author?.toLowerCase().includes(value.toLowerCase())) return false;
        break;
      case 'msc': {
        const num = parseInt(value.replace(/^msc\s*/i, ''), 10);
        if (!num || msc.number !== num) return false;
        break;
      }
      default:
        break;
    }
  }
  return true;
}

function getTokenAtCursor(input) {
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, pos);
  const after = input.value.slice(pos);
  const match = before.match(/(?:^|\s)([^\s]*)$/);
  const token = match?.[1] ?? '';
  const tokenStart = pos - token.length;
  const tokenEnd = pos + (after.match(/^[^\s]*/)?.[0]?.length ?? 0);
  return { token, tokenStart, tokenEnd };
}

function getValueSuggestions(opKey, partial) {
  const needle = partial.toLowerCase();
  let values = [];

  switch (opKey) {
    case 'status':
      values = Object.entries(STATUS_LABELS).map(([key, label]) => ({ insert: key, label }));
      break;
    case 'kind':
      values = [...collectUnique('kind').keys()].map((k) => ({ insert: k, label: k }));
      break;
    case 'area':
      values = [...collectUnique('area').keys()].map((a) => ({
        insert: a.includes(' ') ? `"${a}"` : a,
        label: a,
      }));
      break;
    case 'author': {
      const authors = new Set(MSC_INDEX.mscs.map((m) => m.author).filter(Boolean));
      values = [...authors].map((a) => ({ insert: a, label: a }));
      break;
    }
    case 'depends':
    case 'depended-by':
    case 'msc':
      values = MSC_INDEX.mscs
        .filter((m) => String(m.number).startsWith(partial) || `msc${m.number}`.includes(needle))
        .slice(0, 8)
        .map((m) => ({ insert: String(m.number), label: `MSC${m.number}` }));
      break;
    default:
      return [];
  }

  if (!partial) {
    if (opKey === 'author') return values.slice(0, 16);
    if (opKey === 'depends' || opKey === 'depended-by' || opKey === 'msc') return values.slice(0, 16);
    return values;
  }
  return values.filter((v) => v.insert.toLowerCase().includes(needle) || v.label.toLowerCase().includes(needle));
}

function buildSearchSuggestions(input) {
  const { token } = getTokenAtCursor(input);
  if (!token) return [];

  const opMatch = token.match(/^([\w-]+):(.*)$/i);
  if (opMatch) {
    const rawOp = opMatch[1].toLowerCase();
    const opKey = OPERATOR_ALIASES[rawOp];
    if (!opKey) return [];
    const partial = opMatch[2] ?? '';
    const prefix = `${rawOp}:`;
    return getValueSuggestions(opKey, partial).map((s) => ({
      insert: `${prefix}${s.insert}`,
      label: `${rawOp}:${s.insert}`,
      display: s.label,
      chipClass: opKey === 'status' ? `status-${s.insert}` : '',
    }));
  }

  if (token.includes(':')) return [];

  const needle = token.toLowerCase();
  return SEARCH_OPERATORS
    .filter((op) => op.prefixes.some((p) => p.startsWith(needle)) || op.insert.startsWith(needle))
    .map((op) => ({ insert: op.insert, label: op.label, display: op.label }));
}

function hideSearchOverlay() {
  document.getElementById('search-overlay').hidden = true;
}

function renderSearchOverlay() {
  const input = document.getElementById('search');
  const overlay = document.getElementById('search-overlay');
  const activeEl = document.getElementById('search-active-filters');
  const optionsEl = document.getElementById('search-options');

  if (document.activeElement !== input) {
    overlay.hidden = true;
    return;
  }

  const { filters, freeText } = parseSearchQuery(state.search);
  const activeParts = [];

  for (const filter of filters) {
    activeParts.push(`<span class="search-pill" data-op="${esc(filter.rawOp)}" data-value="${esc(filter.value)}">
      <span class="search-pill-key">${esc(filter.rawOp)}</span><span class="search-pill-val">${esc(filter.value)}</span>
      <button type="button" class="search-pill-remove" aria-label="Remove">${icon('x', 'icon')}</button>
    </span>`);
  }

  if (freeText) {
    activeParts.push(`<span class="search-pill search-pill-text">
      <span class="search-pill-val">${esc(freeText)}</span>
    </span>`);
  }

  activeEl.innerHTML = activeParts.join('');

  state.suggestions = buildSearchSuggestions(input);
  if (state.suggestionIndex >= state.suggestions.length) state.suggestionIndex = 0;

  const optionParts = [];

  if (state.suggestions.length) {
    for (let i = 0; i < state.suggestions.length; i++) {
      const s = state.suggestions[i];
      const chipClass = s.chipClass ? ` ${s.chipClass}` : '';
      optionParts.push(`<button type="button" class="search-option chip${chipClass}${i === state.suggestionIndex ? ' active' : ''}" data-index="${i}">${esc(s.display ?? s.label)}</button>`);
    }
  } else if (!filters.length && !freeText) {
    for (const op of SEARCH_OPERATORS) {
      optionParts.push(`<button type="button" class="search-option chip search-option-hint" data-insert="${esc(op.insert)}">${esc(op.label)}</button>`);
    }
  }

  optionsEl.innerHTML = optionParts.join('');

  overlay.hidden = !activeParts.length && !optionParts.length;
  refreshIcons();
}

function applyOperatorPill(insert) {
  const input = document.getElementById('search');
  const { tokenStart, tokenEnd } = getTokenAtCursor(input);
  const before = input.value.slice(0, tokenStart);
  const after = input.value.slice(tokenEnd);
  const spacer = before && !before.endsWith(' ') ? ' ' : '';

  input.value = `${before}${spacer}${insert}${after}`.replace(/\s+/g, ' ').trim();
  const cursor = (before + spacer + insert).length;
  input.setSelectionRange(cursor, cursor);
  state.search = input.value;
  input.focus();
  state.suggestionIndex = 0;
  renderSearchOverlay();
  render();
}

function applySearchSuggestion(index) {
  const suggestion = state.suggestions[index];
  if (!suggestion) return;

  const input = document.getElementById('search');
  const { tokenStart, tokenEnd } = getTokenAtCursor(input);
  const before = input.value.slice(0, tokenStart);
  const after = input.value.slice(tokenEnd);
  const spacer = after.startsWith(' ') || !after ? '' : ' ';

  input.value = `${before}${suggestion.insert}${spacer}${after}`.replace(/\s+/g, ' ').trim();
  const cursor = (before + suggestion.insert + (suggestion.insert.endsWith(':') ? '' : ' ')).length;
  input.setSelectionRange(cursor, cursor);

  state.search = input.value;
  renderSearchOverlay();
  render();
  input.focus();
}

function onSearchInput(e) {
  state.search = e.target.value;
  state.suggestionIndex = 0;
  renderSearchOverlay();
  render();
}

function onSearchKeydown(e) {
  const overlay = document.getElementById('search-overlay');
  if (!overlay.hidden && state.suggestions.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.suggestionIndex = (state.suggestionIndex + 1) % state.suggestions.length;
      renderSearchOverlay();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.suggestionIndex = (state.suggestionIndex - 1 + state.suggestions.length) % state.suggestions.length;
      renderSearchOverlay();
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (state.suggestions.length) {
        e.preventDefault();
        applySearchSuggestion(state.suggestionIndex);
        return;
      }
    }
    if (e.key === 'Escape') {
      hideSearchOverlay();
      e.target.blur();
      return;
    }
  }
}

function removeFilterFromQuery(query, rawOp, value) {
  const escOp = rawOp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escVal = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escOp}:(?:${escVal}|"${escVal}")\\s*`, 'i');
  return query.replace(pattern, '').replace(/\s+/g, ' ').trim();
}

function onSearchOverlayClick(e) {
  const optionBtn = e.target.closest('.search-option[data-index]');
  if (optionBtn) {
    applySearchSuggestion(parseInt(optionBtn.dataset.index, 10));
    return;
  }

  const hintBtn = e.target.closest('.search-option-hint');
  if (hintBtn) {
    applyOperatorPill(hintBtn.dataset.insert);
    return;
  }

  const removeBtn = e.target.closest('.search-pill-remove');
  if (!removeBtn) return;

  const pill = removeBtn.closest('.search-pill');
  const op = pill.dataset.op;
  const value = pill.dataset.value;
  if (!op) return;

  state.search = removeFilterFromQuery(state.search, op, value);
  document.getElementById('search').value = state.search;
  renderSearchOverlay();
  render();
}

function normalizeSearchText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMscQuery(query) {
  const trimmed = query.trim();
  const mscMatch = trimmed.match(/^msc\s*#?\s*(\d+)$/i);
  if (mscMatch) return { mode: 'exact', value: parseInt(mscMatch[1], 10) };
  if (/^\d+$/.test(trimmed)) return { mode: 'prefix', value: trimmed };
  return null;
}

function matchesMscNumberQuery(msc, mscQuery) {
  if (mscQuery.mode === 'exact') return msc.number === mscQuery.value;
  return String(msc.number).startsWith(mscQuery.value);
}

function mscSearchHaystack(msc) {
  return normalizeSearchText([
    msc.number,
    `MSC${msc.number}`,
    msc.title,
    msc.author,
    msc.shepherd,
    ...msc.labels,
    ...msc.area,
    ...msc.kind,
    ...msc.dependencies.map((d) => `MSC${d}`),
  ].filter(Boolean).join(' '));
}

function matchesSearch(msc, query) {
  const raw = query.trim();
  if (!raw) return true;

  const mscQuery = parseMscQuery(raw);
  if (mscQuery !== null) return matchesMscNumberQuery(msc, mscQuery);

  const normalizedQuery = normalizeSearchText(raw.replace(/^msc\s*/i, ''));
  const haystack = mscSearchHaystack(msc);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const compactQuery = normalizedQuery.replace(/\s+/g, '');

  if (haystack.includes(normalizedQuery) || compactHaystack.includes(compactQuery)) {
    return true;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.every((token) => {
    const compactToken = token.replace(/\s+/g, '');
    return haystack.includes(token) || compactHaystack.includes(compactToken);
  });
}

function buildStatusFilterList() {
  const container = document.getElementById('status-filters');
  const counts = new Map();

  for (const msc of MSC_INDEX.mscs) {
    counts.set(msc.status, (counts.get(msc.status) || 0) + 1);
  }

  container.innerHTML = '';

  const entries = Object.entries(STATUS_LABELS)
    .map(([value, label]) => ({ value, label, count: counts.get(value) || 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  for (const { value, label, count } of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-row status-${value}` + (state.statuses.has(value) ? ' active' : '');
    btn.innerHTML = `<span class="filter-row-label">${esc(label)}</span><span class="filter-row-count">${count}</span>`;
    btn.dataset.value = value;
    btn.addEventListener('click', () => {
      if (state.statuses.has(value)) state.statuses.delete(value);
      else state.statuses.add(value);
      btn.classList.toggle('active');
      render();
    });
    container.appendChild(btn);
  }
}

function initSortDropdown() {
  const btn = document.getElementById('sort-btn');
  const menu = document.getElementById('sort-menu');
  const label = document.getElementById('sort-label');

  function renderSortMenu() {
    menu.innerHTML = SORT_OPTIONS.map((opt) =>
      `<button type="button" class="sort-option${state.sort === opt.value ? ' active' : ''}" data-value="${opt.value}" role="option">${esc(opt.label)}</button>`
    ).join('');
  }

  function setSort(value) {
    state.sort = value;
    label.textContent = SORT_OPTIONS.find((o) => o.value === value).label;
    btn.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    renderSortMenu();
    render();
  }

  renderSortMenu();
  label.textContent = SORT_OPTIONS.find((o) => o.value === state.sort).label;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('.sort-option');
    if (!opt) return;
    setSort(opt.dataset.value);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sort-dropdown')) {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function buildFilterChips(containerId, options, activeSet, group) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (const [value, label] of Object.entries(options)) {
    const btn = document.createElement('button');
    const statusClass = group === 'status' ? ` status-${value}` : '';
    btn.type = 'button';
    btn.className = `chip${statusClass}` + (activeSet.has(value) ? ' active' : '');
    btn.textContent = label;
    btn.dataset.value = value;
    btn.addEventListener('click', () => {
      if (activeSet.has(value)) activeSet.delete(value);
      else activeSet.add(value);
      btn.classList.toggle('active');
      render();
    });
    container.appendChild(btn);
  }
}

function clearFilters() {
  state.search = '';
  state.statuses.clear();
  state.kinds.clear();
  state.areas.clear();
  state.favoritesOnly = false;
  document.getElementById('search').value = '';
  document.querySelectorAll('.chip.active, .filter-row.active').forEach((el) => el.classList.remove('active'));
  updateFavoritesFilterUI();
  hideSearchOverlay();
  renderSearchOverlay();
  render();
}

function filterMscs() {
  const { filters, freeText } = parseSearchQuery(state.search);

  return MSC_INDEX.mscs.filter((msc) => {
    if (state.favoritesOnly && !favorites.has(msc.number)) return false;
    if (state.statuses.size && !state.statuses.has(msc.status)) return false;
    if (state.kinds.size && !msc.kind.some((k) => state.kinds.has(k))) return false;
    if (state.areas.size && !msc.area.some((a) => state.areas.has(a))) return false;
    if (filters.length && !matchesSearchFilters(msc, filters)) return false;
    if (freeText && !matchesSearch(msc, freeText)) return false;
    return true;
  });
}

function getDependents(num) {
  return MSC_INDEX.mscs.filter((m) => m.dependencies.includes(num));
}

function sortMscs(list) {
  const sorted = [...list];
  switch (state.sort) {
    case 'number-asc':
      sorted.sort((a, b) => a.number - b.number);
      break;
    case 'updated-desc':
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'comments-desc':
      sorted.sort((a, b) => getCommentCount(b) - getCommentCount(a) || b.number - a.number);
      break;
    case 'title-asc':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default:
      sorted.sort((a, b) => b.number - a.number);
  }
  return sorted;
}

function render() {
  const filtered = sortMscs(filterMscs());
  document.getElementById('result-count').innerHTML =
    `${icon('list', 'icon icon-inline')} ${filtered.length} / ${MSC_INDEX.count}`;

  const list = document.getElementById('msc-list');
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = `<li class="empty">${icon('search-x', 'icon icon-empty')} No results</li>`;
    refreshIcons();
    return;
  }

  for (const msc of filtered) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msc-item' + (state.selected === msc.number ? ' selected' : '');
    btn.innerHTML = `
      <div class="msc-row-top">
        <span class="msc-num">MSC${msc.number}</span>
        <span class="msc-title">${esc(msc.wip ? '[WIP] ' : '')}${esc(msc.title)}</span>
        ${favoriteButtonHtml(msc.number, 'msc-favourite-btn')}
      </div>
      <div class="msc-meta">
        ${statusTagHtml(msc.status)}
        ${msc.kind.map((k) => secondaryTag(k, 'kind')).join('')}
        ${msc.area.slice(0, 2).map((a) => secondaryTag(a, 'area')).join('')}
        ${msc.dependencies.length ? secondaryTag(`${icon('git-branch', 'icon icon-inline')} ${msc.dependencies.length}`, 'deps', true) : ''}
      </div>`;
    btn.addEventListener('click', () => selectMsc(msc.number));
    li.appendChild(btn);
    list.appendChild(li);
  }

  bindFavoriteButtons(list);
  refreshIcons();
}

function mscBasePath() {
  let path = location.pathname.replace(/\/index\.html$/i, '');
  path = path.replace(/\/msc\/\d+\/?$/, '');
  return path.replace(/\/?$/, '') || '';
}

function mscAppUrl(num) {
  const base = mscBasePath();
  return base ? `${base}/msc/${num}/` : `/msc/${num}/`;
}

function mscShareUrl(num) {
  return `${location.origin}${mscAppUrl(num)}`;
}

function appHomeUrl() {
  const base = mscBasePath();
  return base ? `${base}/` : '/';
}

function mscFromLocation() {
  const pathMatch = location.pathname.match(/\/msc\/(\d+)\/?$/i);
  if (pathMatch) {
    const num = parseInt(pathMatch[1], 10);
    return byNumber.has(num) ? num : null;
  }

  const q = new URLSearchParams(location.search).get('msc');
  if (q && /^\d+$/.test(q)) {
    const num = parseInt(q, 10);
    return byNumber.has(num) ? num : null;
  }

  const hashMatch = location.hash.match(/^#msc(\d+)$/i);
  if (hashMatch) {
    const num = parseInt(hashMatch[1], 10);
    return byNumber.has(num) ? num : null;
  }

  return null;
}

function updatePageMeta(msc) {
  if (!msc) {
    document.title = 'Matrix Spec Explorer';
    return;
  }
  document.title = `MSC${msc.number}: ${msc.title}`;
}

function openDetail(num) {
  state.selected = num;
  document.querySelector('.layout').classList.add('detail-open');
  document.getElementById('detail').hidden = false;
  document.getElementById('detail-resizer').hidden = false;
  renderDetail(byNumber.get(num));
  updatePageMeta(byNumber.get(num));
  render();
}

function closeDetailUI() {
  state.selected = null;
  document.querySelector('.layout').classList.remove('detail-open');
  document.getElementById('detail').hidden = true;
  document.getElementById('detail-resizer').hidden = true;
  document.getElementById('detail-actions').innerHTML = '';
  updatePageMeta(null);
  render();
}

function setupColumnResize() {
  const layout = document.querySelector('.layout');
  const sidebarResizer = document.getElementById('sidebar-resizer');
  const detailResizer = document.getElementById('detail-resizer');

  const storedSidebar = localStorage.getItem('msc-explorer-sidebar-width');
  const storedDetail = localStorage.getItem('msc-explorer-detail-width');
  if (storedSidebar) layout.style.setProperty('--sidebar-width', `${storedSidebar}px`);
  if (storedDetail) layout.style.setProperty('--detail-width', `${storedDetail}px`);

  let activeResizer = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function onPointerMove(e) {
    if (!activeResizer) return;
    const rect = layout.getBoundingClientRect();
    const clientX = e.clientX;

    if (activeResizer === 'sidebar') {
      const detailWidth = layout.classList.contains('detail-open')
        ? parseInt(getComputedStyle(layout).getPropertyValue('--detail-width'), 10) || 420
        : 0;
      const max = rect.width - detailWidth - 10 - 280;
      const width = clamp(clientX - rect.left, 200, max);
      layout.style.setProperty('--sidebar-width', `${width}px`);
      return;
    }

    if (activeResizer === 'detail') {
      const sidebarWidth = parseInt(getComputedStyle(layout).getPropertyValue('--sidebar-width'), 10) || 260;
      const max = rect.width - sidebarWidth - 10 - 280;
      const width = clamp(rect.right - clientX, 280, max);
      layout.style.setProperty('--detail-width', `${width}px`);
    }
  }

  function stopResize() {
    if (!activeResizer) return;
    sidebarResizer.classList.remove('dragging');
    detailResizer.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    activeResizer = null;

    const sidebar = layout.style.getPropertyValue('--sidebar-width');
    const detail = layout.style.getPropertyValue('--detail-width');
    if (sidebar) localStorage.setItem('msc-explorer-sidebar-width', parseInt(sidebar, 10));
    if (detail) localStorage.setItem('msc-explorer-detail-width', parseInt(detail, 10));
  }

  function startResize(type, resizerEl, e) {
    activeResizer = type;
    resizerEl.classList.add('dragging');
    document.body.classList.add('col-resizing');
    e.preventDefault();
  }

  sidebarResizer.addEventListener('mousedown', (e) => startResize('sidebar', sidebarResizer, e));
  detailResizer.addEventListener('mousedown', (e) => startResize('detail', detailResizer, e));
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', stopResize);
}

function syncFromLocation() {
  const num = mscFromLocation();
  if (num !== null) {
    if (state.selected !== num) openDetail(num);
    return;
  }
  if (state.selected !== null) closeDetailUI();
}

function selectMsc(num) {
  if (state.selected === num) return;
  openDetail(num);
  history.pushState({ msc: num }, '', mscAppUrl(num));
}

function closeDetail() {
  if (state.selected === null) return;
  closeDetailUI();
  history.pushState(null, '', appHomeUrl());
}

function renderDetail(msc) {
  const el = document.getElementById('detail-content');
  const dependents = getDependents(msc.number);
  const displayTitle = `${msc.wip ? '[WIP] ' : ''}${msc.title}`;
  const docUrl = getExternalDocUrl(msc);

  document.getElementById('detail-actions').innerHTML = `
    ${favoriteButtonHtml(msc.number)}
    <button type="button" class="copy-btn share-btn" data-share-url="${esc(mscShareUrl(msc.number))}" aria-label="Copy share link">${icon('share-2', 'icon')}</button>
    <a href="${esc(msc.url)}" class="detail-ext-link" target="_blank" rel="noopener noreferrer" aria-label="GitHub PR #${msc.pr}">${githubIcon('icon')}</a>
    ${docUrl ? `<a href="${esc(docUrl)}" class="detail-ext-link" target="_blank" rel="noopener noreferrer" aria-label="Proposal on GitHub">${icon('external-link', 'icon')}</a>` : ''}`;

  el.innerHTML = `
    <div class="detail-num-row">
      <div class="detail-num">MSC${msc.number}</div>
      <button type="button" class="copy-btn" data-copy="MSC${msc.number}" aria-label="Copy MSC number">${icon('copy', 'icon')}</button>
    </div>
    <h2 class="detail-title">${esc(displayTitle)}</h2>
    <div class="detail-status-row">
      ${statusTagHtml(msc.status, true)}
    </div>
    <div class="msc-meta detail-tags">
      ${msc.kind.map((k) => secondaryTag(k, 'kind')).join('')}
      ${msc.area.map((a) => secondaryTag(a, 'area')).join('')}
    </div>

    <div class="detail-meta-row">
      <p class="detail-info">
        <a href="https://github.com/${esc(msc.author)}" target="_blank" rel="noopener">@${esc(msc.author)}</a>
        ${msc.shepherd ? ` · <a href="https://github.com/${esc(msc.shepherd)}" target="_blank" rel="noopener">@${esc(msc.shepherd)}</a>` : ''}
        <br>${esc(msc.createdAt)} · ${esc(msc.updatedAt)}
        ${msc.mergedAt ? `<br>${esc(msc.mergedAt.slice(0, 10))}` : ''}
      </p>
    </div>

    ${msc.dependencies.length || dependents.length ? `
    <div class="detail-deps-row">
      <div class="detail-deps-col">
        ${msc.dependencies.length ? `
          ${sectionHeading('git-branch', 'Depends on')}
          <div class="dep-list">${msc.dependencies.map((d) =>
            `<button type="button" class="dep-link" data-msc="${d}">MSC${d}</button>`
          ).join('')}</div>
        ` : ''}
      </div>
      <div class="detail-deps-col">
        ${dependents.length ? `
          ${sectionHeading('git-branch', `Depended on by (${dependents.length})`)}
          <div class="dep-list">${dependents.slice(0, 20).map((d) =>
            `<button type="button" class="dep-link" data-msc="${d.number}">MSC${d.number}</button>`
          ).join('')}${dependents.length > 20 ? `<span class="tag">+${dependents.length - 20}</span>` : ''}</div>
        ` : ''}
      </div>
    </div>` : ''}

    <div class="detail-section">
      <div class="msc-meta detail-labels">${msc.labels.map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</div>
    </div>

    <div class="detail-section detail-proposal">
      <div id="markdown-container" class="loading">${icon('loader', 'icon icon-spin')}</div>
    </div>

    <div class="detail-section" id="comments-section" hidden></div>`;

  bindMscLinks(el);
  bindCopyButtons(el);
  bindFavoriteButtons(document.getElementById('detail-actions'));
  loadMarkdown(msc);
  renderComments(msc);
  refreshIcons();
}

function renderComments(msc) {
  const section = document.getElementById('comments-section');
  const comments = (typeof MSC_COMMENTS !== 'undefined' && MSC_COMMENTS[msc.pr]) || [];

  if (!comments.length) {
    section.hidden = true;
    section.innerHTML = '';
    return;
  }

  section.hidden = false;
  section.innerHTML = `
    ${sectionHeading('message-square', `Discussion (${comments.length})`)}
    <ul class="comment-list">
      ${comments.map((c) => `
        <li class="comment">
          <div class="comment-meta">
            <a href="https://github.com/${esc(c.author)}" target="_blank" rel="noopener">@${esc(c.author)}</a>
            <span>· ${esc(c.date)}</span>
            <a href="${esc(c.url)}" target="_blank" rel="noopener">${icon('external-link', 'icon icon-inline')}</a>
          </div>
          <div class="comment-body markdown-body">${renderMarkdown(c.body)}</div>
        </li>
      `).join('')}
    </ul>`;

  bindMscLinks(section);
  highlightCodeBlocks(section);
  refreshIcons();
}

function proposalPathFromRenderedUrl(url) {
  if (!url) return null;
  const match = url.match(/proposals\/[^\s?)#]+\.md/i);
  return match ? match[0] : null;
}

function getExternalDocUrl(msc) {
  const proposalPath = proposalPathFromRenderedUrl(msc.renderedUrl);

  if (msc.pr && proposalPath) {
    return `https://github.com/matrix-org/matrix-spec-proposals/pull/${msc.pr}/files`;
  }

  if (msc.renderedUrl && /github\.com\/matrix-org\/matrix-(?:spec-proposals|doc)\//i.test(msc.renderedUrl)) {
    return msc.renderedUrl;
  }

  return null;
}

function getMarkdownUrls(msc) {
  const urls = [];
  const proposalPath = proposalPathFromRenderedUrl(msc.renderedUrl);

  if (msc.renderedUrl) {
    urls.push(
      msc.renderedUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
    );
  }

  if (proposalPath) {
    urls.push(`https://raw.githubusercontent.com/matrix-org/matrix-spec-proposals/pull/${msc.pr}/head/${proposalPath}`);
    urls.push(`https://raw.githubusercontent.com/matrix-org/matrix-spec-proposals/main/${proposalPath}`);
  }

  return [...new Set(urls)];
}

async function fetchMarkdownText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<!doctype')) return null;
  return text;
}

function bindMscLinks(root) {
  upgradeMscAnchors(root);

  root.querySelectorAll('.msc-inline-link, .dep-link').forEach((btn) => {
    if (btn.dataset.mscBound) return;
    btn.dataset.mscBound = '1';

    const num = parseInt(btn.dataset.msc, 10);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      hideMscPreview(0);
      selectMsc(num);
    });

    btn.addEventListener('mouseenter', () => showMscPreview(num, btn));
    btn.addEventListener('mouseleave', () => hideMscPreview());
    btn.addEventListener('focus', () => showMscPreview(num, btn));
    btn.addEventListener('blur', () => hideMscPreview(0));
  });
}

function upgradeMscAnchors(root) {
  root.querySelectorAll('a[href]').forEach((a) => {
    if (a.closest('.comment-meta') || a.closest('.detail-actions') || a.classList.contains('detail-ext-link')) {
      return;
    }

    const num = parseMscFromUrl(a.getAttribute('href'));
    if (num === null || !byNumber.has(num)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msc-inline-link';
    btn.dataset.msc = String(num);
    btn.innerHTML = a.innerHTML;
    a.replaceWith(btn);
  });
}

function bindCopyButtons(root) {
  root.querySelectorAll('.copy-btn').forEach((btn) => {
    if (btn.dataset.copyBound) return;
    btn.dataset.copyBound = '1';

    btn.addEventListener('click', async () => {
      const text = btn.dataset.shareUrl || btn.dataset.copy;
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }

      const iconName = btn.querySelector('[data-lucide]');
      if (!iconName) return;

      const defaultIcon = btn.dataset.shareUrl ? 'share-2' : 'copy';
      iconName.setAttribute('data-lucide', 'check');
      refreshIcons();
      setTimeout(() => {
        iconName.setAttribute('data-lucide', defaultIcon);
        refreshIcons();
      }, 1500);
    });
  });
}

function parseMscFromUrl(url) {
  const str = String(url);
  if (/\/pull\/\d+\/(?:files|commits|checks|tab)/i.test(str)) return null;

  const pullMatch = str.match(/matrix-(?:spec-proposals|doc)\/pull\/(\d+)/i);
  if (pullMatch) return parseInt(pullMatch[1], 10);
  const issueMatch = str.match(/matrix-(?:spec-proposals|doc)\/issues\/(\d+)/i);
  if (issueMatch) return parseInt(issueMatch[1], 10);
  return null;
}

function mscInlineLink(num, label) {
  if (!byNumber.has(num)) return label;
  return `<button type="button" class="msc-inline-link" data-msc="${num}">${label}</button>`;
}

function parseReferenceDefinitions(text) {
  const refs = new Map();
  const footnotes = new Map();
  let body = text;

  body = body.replace(/^[ \t]*\[([^\]]+)\]:\s*(\S+)(?:[ \t]+"[^"]*")?[ \t]*$/gm, (_, label, url) => {
    refs.set(label.trim(), url.trim());
    return '';
  });

  body = body.replace(/^[ \t]*\[\^([^\]]+)\]:\s*(.+)$/gm, (_, id, content) => {
    footnotes.set(id.trim(), content.trim());
    return '';
  });

  return { body, refs, footnotes };
}

function renderFootnoteContent(content, refs, pushSnippet) {
  let html = content;

  if (refs.size > 0) {
    html = html.replace(/\[([^\]]+)\](?!\(|:)/g, (match, label) => {
      const url = refs.get(label);
      if (!url) return match;
      return linkForLabel(label, url, pushSnippet);
    });
  }

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => linkForLabel(label, url, pushSnippet));

  html = html.replace(/\[\^([^\]]+)\]/g, (match, id) => {
    return pushSnippet(`<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">${id}</a></sup>`);
  });

  html = html.replace(/\[MSC(\d{3,})\]/gi, (_, numStr) => {
    const num = parseInt(numStr, 10);
    return byNumber.has(num) ? pushSnippet(mscInlineLink(num, `MSC${numStr}`)) : `[MSC${numStr}]`;
  });

  html = html.replace(/\bMSC(\d{3,})\b/g, (match, numStr) => {
    const num = parseInt(numStr, 10);
    return byNumber.has(num) ? pushSnippet(mscInlineLink(num, match)) : match;
  });

  html = linkifyHashReferences(html, pushSnippet);

  return html;
}

function linkForLabel(label, url, pushSnippet) {
  const num = parseMscFromUrl(url) ?? parseMscNumber(label);
  if (num !== null && byNumber.has(num)) {
    return pushSnippet(mscInlineLink(num, label));
  }
  return pushSnippet(`<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`);
}

function trimUrlPunctuation(url) {
  let clean = url;
  let suffix = '';
  while (/[.,;:!?)]+$/.test(clean)) {
    suffix = clean.slice(-1) + suffix;
    clean = clean.slice(0, -1);
  }
  return { url: clean, suffix };
}

function linkifyAutolinks(html, pushSnippet) {
  html = html.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, url) => {
    const num = parseMscFromUrl(url);
    if (num !== null && byNumber.has(num)) {
      return pushSnippet(mscInlineLink(num, `MSC${num}`));
    }
    return pushSnippet(`<a href="${esc(url)}" target="_blank" rel="noopener">${url}</a>`);
  });

  return html.replace(/(^|[\s(])((https?:\/\/)[^\s<>"')\]]+)/g, (match, prefix, url) => {
    const { url: cleanUrl, suffix } = trimUrlPunctuation(url);
    const num = parseMscFromUrl(cleanUrl);
    if (num !== null && byNumber.has(num)) {
      return prefix + pushSnippet(mscInlineLink(num, `MSC${num}`)) + suffix;
    }
    return prefix + pushSnippet(`<a href="${esc(cleanUrl)}" target="_blank" rel="noopener">${cleanUrl}</a>`) + suffix;
  });
}

function linkifyMscReferences(text) {
  const { body, refs, footnotes } = parseReferenceDefinitions(text);
  const codeBlocks = [];
  let html = body.replace(/```[\s\S]*?```/g, (block) => {
    const key = `@@CODE${codeBlocks.length}@@`;
    codeBlocks.push(block);
    return key;
  });

  html = html.replace(/`[^`]+`/g, (inline) => {
    const key = `@@CODE${codeBlocks.length}@@`;
    codeBlocks.push(inline);
    return key;
  });

  const headings = [];
  html = html.replace(/^(#{1,6}\s+.+)$/gm, (line) => {
    const key = `@@HEAD${headings.length}@@`;
    headings.push(line);
    return key;
  });

  const htmlSnippets = [];
  function pushSnippet(snippet) {
    const key = `@@HTML${htmlSnippets.length}@@`;
    htmlSnippets.push(snippet);
    return key;
  }

  if (refs.size > 0) {
    html = html.replace(/\[([^\]]+)\](?!\(|:)/g, (match, label) => {
      const url = refs.get(label);
      if (!url) return match;
      return linkForLabel(label, url, pushSnippet);
    });
  }

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return linkForLabel(label, url, pushSnippet);
  });

  html = html.replace(/\[MSC(\d{3,})\]/gi, (_, numStr) => {
    const num = parseInt(numStr, 10);
    return byNumber.has(num) ? pushSnippet(mscInlineLink(num, `MSC${numStr}`)) : `[MSC${numStr}]`;
  });

  html = html.replace(/\bMSC(\d{3,})\b/g, (match, numStr) => {
    const num = parseInt(numStr, 10);
    return byNumber.has(num) ? pushSnippet(mscInlineLink(num, match)) : match;
  });

  html = linkifyHashReferences(html, pushSnippet);
  html = linkifyAutolinks(html, pushSnippet);

  html = html.replace(/\[\^([^\]]+)\]/g, (match, id) => {
    if (!footnotes.has(id)) return match;
    return pushSnippet(`<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}">${id}</a></sup>`);
  });

  for (let i = 0; i < htmlSnippets.length; i++) {
    html = html.replace(`@@HTML${i}@@`, htmlSnippets[i]);
  }

  for (let i = 0; i < headings.length; i++) {
    html = html.replace(`@@HEAD${i}@@`, headings[i]);
  }

  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`@@CODE${i}@@`, codeBlocks[i]);
  }

  if (footnotes.size > 0) {
    const items = [...footnotes.entries()].map(([id, content]) => {
      const footnoteSnippets = [];
      function pushFootnoteSnippet(snippet) {
        const key = `@@FN${footnoteSnippets.length}@@`;
        footnoteSnippets.push(snippet);
        return key;
      }

      let resolved = renderFootnoteContent(content, refs, pushFootnoteSnippet);
      for (let i = 0; i < footnoteSnippets.length; i++) {
        resolved = resolved.replace(`@@FN${i}@@`, footnoteSnippets[i]);
      }

      return `<li id="fn-${id}"><span class="footnote-label">${id}.</span> ${resolved} <a class="footnote-back" href="#fnref-${id}">↩</a></li>`;
    }).join('');

    html += `<hr class="footnotes-sep"><ol class="footnotes">${items}</ol>`;
  }

  return html;
}

function parseMscNumber(text) {
  const mscMatch = String(text).match(/^MSC\s*#?\s*(\d+)$/i);
  if (mscMatch) return parseInt(mscMatch[1], 10);
  const hashMatch = String(text).match(/^#(\d+)$/);
  if (hashMatch) return parseInt(hashMatch[1], 10);
  return null;
}

function linkifyHashRef(full, numStr, pushSnippet) {
  const num = parseInt(numStr, 10);
  if (byNumber.has(num)) return pushSnippet(mscInlineLink(num, full));
  return pushSnippet(`<a href="https://github.com/matrix-org/matrix-spec-proposals/pull/${num}" target="_blank" rel="noopener">${full}</a>`);
}

function linkifyHashReferences(html, pushSnippet) {
  return html.replace(/(^|[\s(,])#(\d{3,})\b/g, (match, prefix, numStr) => {
    return prefix + linkifyHashRef(`#${numStr}`, numStr, pushSnippet);
  });
}

async function loadMarkdown(msc) {
  const container = document.getElementById('markdown-container');
  const urls = getMarkdownUrls(msc);

  if (!urls.length) {
    container.className = '';
    container.innerHTML = `<a href="${esc(msc.url)}" target="_blank" rel="noopener">${githubIcon('icon icon-inline')} GitHub</a>`;
    refreshIcons();
    return;
  }

  for (const url of urls) {
    try {
      const md = await fetchMarkdownText(url);
      if (!md) continue;
      container.className = 'markdown-body';
      container.innerHTML = renderMarkdown(md);
      bindMscLinks(container);
      highlightCodeBlocks(container);
      return;
    } catch {
      // try next source
    }
  }

  container.className = '';
  container.innerHTML = `<a href="${esc(msc.url)}" target="_blank" rel="noopener">${githubIcon('icon icon-inline')} GitHub</a>`;
  refreshIcons();
}

function normalizeGitHubImageUrls(text) {
  return text
    .replace(
      /https:\/\/private-user-images\.githubusercontent\.com\/\d+\/\d+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.png[^"\s)>]*/gi,
      'https://github.com/user-attachments/assets/$1',
    )
    .replace(
      /https:\/\/user-images\.githubusercontent\.com\/\d+\/[0-9a-f]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.png[^"\s)>]*/gi,
      'https://github.com/user-attachments/assets/$1',
    );
}

const VOID_HTML_TAGS = new Set(['img', 'br', 'hr', 'input', 'source', 'meta']);
const PRE_MARKDOWN_HTML_TAGS = ['img', 'video', 'source', 'del', 'ins', 'details', 'summary'];
const POST_LINKIFY_HTML_TAGS = ['sup', 'button', 'a'];

function stashHtmlBlock(match, blocks) {
  const key = `@@HTMLBLOCK${blocks.length}@@`;
  blocks.push(match);
  return key;
}

function protectHtmlTags(text, blocks, tagNames) {
  for (const tag of tagNames) {
    if (VOID_HTML_TAGS.has(tag)) {
      const re = new RegExp(`<${tag}\\b[^>]*?\\/?>`, 'gi');
      text = text.replace(re, (match) => stashHtmlBlock(match, blocks));
      continue;
    }

    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    text = text.replace(re, (match) => stashHtmlBlock(match, blocks));
  }

  return text;
}

function restoreHtmlBlocks(html, blocks) {
  for (let i = 0; i < blocks.length; i++) {
    html = html.split(`@@HTMLBLOCK${i}@@`).join(blocks[i]);
  }
  return html;
}

function sanitizeMarkdownHtml(html) {
  if (typeof DOMPurify === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'loading', 'data-msc', 'type', 'checked', 'disabled', 'align'],
  });
}

function renderMarkdownFallback(mdPart) {
  let html = esc(mdPart);

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/```([a-zA-Z0-9_+-]*)?\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><h([123])>/g, '<h$1>').replace(/<\/h([123])><\/p>/g, '</h$1>');
  html = html.replace(/<p><pre>/g, '<pre>').replace(/<\/pre><\/p>/g, '</pre>');

  return html;
}

function renderMarkdown(src) {
  const htmlBlocks = [];
  let text = normalizeGitHubImageUrls(String(src).replace(/\r\n/g, '\n'));
  text = protectHtmlTags(text, htmlBlocks, PRE_MARKDOWN_HTML_TAGS);

  const processed = linkifyMscReferences(text);

  const footnoteSep = '<hr class="footnotes-sep">';
  const footIdx = processed.indexOf(footnoteSep);
  let mdPart = footIdx === -1 ? processed : processed.slice(0, footIdx);
  const footnotesPart = footIdx === -1 ? '' : processed.slice(footIdx);

  mdPart = protectHtmlTags(mdPart, htmlBlocks, POST_LINKIFY_HTML_TAGS);

  let html;
  if (typeof marked !== 'undefined') {
    html = marked.parse(mdPart, { gfm: true, breaks: true });
    html = restoreHtmlBlocks(html, htmlBlocks);
    html = sanitizeMarkdownHtml(html);
  } else {
    html = restoreHtmlBlocks(renderMarkdownFallback(mdPart), htmlBlocks);
  }

  html = html.replace(/<a\s+(?![^>]*\btarget=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
  html = html.replace(/<img\s/gi, '<img loading="lazy" ');

  if (footnotesPart) {
    html += sanitizeMarkdownHtml(footnotesPart);
  }

  return html;
}

function highlightCodeBlocks(root) {
  if (typeof hljs === 'undefined') return;
  root.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
