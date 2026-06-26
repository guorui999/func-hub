const REGISTRY_URL = 'https://raw.githubusercontent.com/funchub-registry/registry/main/registry.json';
const GITHUB_API = 'https://api.github.com';

let tools = [];
let currentFilter = 'all';

async function loadRegistry() {
  const grid = document.getElementById('toolsGrid');
  try {
    const resp = await fetch(REGISTRY_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    tools = Object.values(data.tools || {});
    await fetchRepoStars(tools);
    render();
  } catch (e) {
    grid.innerHTML = `<div class="empty">Failed to load registry: ${e.message}</div>`;
  }
}

async function fetchRepoStars(tools) {
  const repos = new Set();
  tools.forEach(t => {
    const repo = repoFromUrl(t.versions?.[0]?.source_repo);
    if (repo) repos.add(repo);
  });
  for (const repo of repos) {
    try {
      const resp = await fetch(`${GITHUB_API}/repos/${repo}`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json();
        tools.forEach(t => {
          if (repoFromUrl(t.versions?.[0]?.source_repo) === repo) {
            t._stars = data.stargazers_count || 0;
            t._forks = data.forks_count || 0;
          }
        });
      }
    } catch (_) {}
  }
}

function repoFromUrl(url) {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

function detectLang(tool) {
  const ep = tool.entry_point || '';
  if (ep.endsWith('.py') || ep.includes('.py:')) return 'py';
  if (ep.endsWith('.ts') || ep.includes('.ts:')) return 'ts';
  return 'unknown';
}

function render() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const sort = document.getElementById('sortSelect').value;

  let filtered = tools.filter(t => {
    if (currentFilter !== 'all' && detectLang(t) !== currentFilter) return false;
    if (!query) return true;
    return (t.name || '').toLowerCase().includes(query)
        || (t.description || '').toLowerCase().includes(query)
        || (t.author || '').toLowerCase().includes(query)
        || ((t.name || '') + ' ' + (t.author || '')).toLowerCase().includes(query);
  });

  filtered.sort((a, b) => {
    if (sort === 'stars') return (b._stars || 0) - (a._stars || 0);
    if (sort === 'newest') return new Date(b.versions?.[0]?.released_at || 0) - new Date(a.versions?.[0]?.released_at || 0);
    if (sort === 'oldest') return new Date(a.versions?.[0]?.released_at || 0) - new Date(b.versions?.[0]?.released_at || 0);
    return (a.name || '').localeCompare(b.name || '');
  });

  document.getElementById('toolCount').textContent = tools.length;
  const grid = document.getElementById('toolsGrid');

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty">No tools found</div>`;
    return;
  }

  grid.innerHTML = filtered.map(t => {
    const v = t.versions?.[0] || {};
    const lang = detectLang(t);
    const langLabel = lang === 'py' ? 'Python' : lang === 'ts' ? 'TypeScript' : '';
    const date = v.released_at ? new Date(v.released_at).toLocaleDateString() : '';
    const stars = t._stars > 0 ? t._stars : null;
    return `
      <div class="tool-card" data-name="${escAttr(t.name || '')}">
        <div class="tool-card-header">
          <div>
            <div class="tool-card-name">${escHtml(t.name || '')}${stars !== null ? ` <span class="star-count">&#9733; ${stars}</span>` : ''}</div>
            <div class="tool-card-author">${escHtml(t.author || '')}</div>
          </div>
          ${langLabel ? `<span class="tool-card-lang lang-${lang}">${langLabel}</span>` : ''}
        </div>
        <div class="tool-card-desc">${escHtml(t.description || '')}</div>
        <div class="tool-card-footer">
          <span class="tool-card-version">${v.version || ''}</span>
          <span class="tool-card-date">${date}</span>
        </div>
      </div>`;
  }).join('');
}

function showDetail(name) {
  const tool = tools.find(t => t.name === name);
  if (!tool) return;
  const params = tool.parameters;
  const lang = detectLang(tool);
  const langLabel = lang === 'py' ? 'Python' : lang === 'ts' ? 'TypeScript' : 'Unknown';

  const content = document.getElementById('modalContent');

  let paramsHtml = '';
  if (params?.properties) {
    const required = new Set(params.required || []);
    paramsHtml = Object.entries(params.properties).map(([key, p]) => `
      <li class="param-item">
        <div class="param-name">${escHtml(key)}${required.has(key) ? ' <span class="required">*</span>' : ''}</div>
        <div class="param-desc">${escHtml(p.description || '')}</div>
        <div class="param-type">${p.type || ''}${p.enum ? ` (${p.enum.join(', ')})` : ''}${p.default !== undefined ? ` default: ${p.default}` : ''}</div>
      </li>`).join('');
  }

  const versionsHtml = tool.versions?.map(v => `
    <div class="version-item">
      <div class="version-row">
        <span class="version-num">${v.version || ''}</span>
        <span class="version-date">${v.released_at ? new Date(v.released_at).toLocaleDateString() : ''}</span>
      </div>
      ${v.source_repo ? `<div class="version-repo"><a href="${escHtml(v.source_repo)}" target="_blank">${escHtml(v.source_repo)}</a></div>` : ''}
    </div>`).join('') || '';

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-name">
        ${escHtml(tool.name || '')}
        <span class="tool-card-lang lang-${lang}">${langLabel}</span>
        ${tool._stars > 0 ? `<span class="star-count">&#9733; ${tool._stars}</span>` : ''}
      </div>
      <div class="modal-author">${escHtml(tool.author || '')}</div>
    </div>
    <div class="modal-desc">${escHtml(tool.description || '')}</div>
    ${tool.entry_point ? `<div class="modal-section"><h3>Entry Point</h3><div class="modal-entry">${escHtml(tool.entry_point)}</div></div>` : ''}
    ${paramsHtml ? `<div class="modal-section"><h3>Parameters</h3><ul class="param-list">${paramsHtml}</ul></div>` : ''}
    ${versionsHtml ? `<div class="modal-section"><h3>Versions (${tool.versions.length})</h3>${versionsHtml}</div>` : ''}`;

  document.getElementById('modalOverlay').classList.add('open');
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function escAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Event delegation for tool cards
document.getElementById('toolsGrid').addEventListener('click', e => {
  const card = e.target.closest('.tool-card');
  if (card) showDetail(card.dataset.name);
});

document.getElementById('searchInput').addEventListener('input', render);
document.getElementById('sortSelect').addEventListener('change', render);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.getElementById('modalClose').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

loadRegistry();
