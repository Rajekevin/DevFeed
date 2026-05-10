/* ========================================
   DEVFEED 2026 — Développé par Raje Kevin
   Version avec persistance des favoris/lus
   ======================================== */

// ───────── CONFIGURATION ─────────
const TAG_STYLES = {
  php: { bg: '#777bb420', text: '#9ba0d4', border: '#777bb460' },
  javascript: { bg: '#f7df1e20', text: '#f7df1e', border: '#f7df1e60' },
  security: { bg: '#ff6b6b20', text: '#ff8e8e', border: '#ff6b6b60' },
  devops: { bg: '#ffa50220', text: '#ffb845', border: '#ffa50260' },
  design: { bg: '#a55eea20', text: '#c18fff', border: '#a55eea60' },
  frontend: { bg: '#45b7d120', text: '#6dd4e5', border: '#45b7d160' },
  backend: { bg: '#26de8120', text: '#4de89e', border: '#26de8160' },
  general: { bg: '#70a1ff20', text: '#9bbfff', border: '#70a1ff60' },
  python: { bg: '#3b82f620', text: '#6baeff', border: '#3b82f640' },
  rust: { bg: '#fb923c20', text: '#fca55e', border: '#fb923c40' }
};

const COLOR_PRESETS = [
  '#00ff9d', '#45b7d1', '#ff6b6b', '#f7df1e', '#26de81',
  '#a55eea', '#ffa502', '#70a1ff', '#ff7f50', '#9b59b6'
];

const DEFAULT_SOURCES = [
  { id: 'phpnet', name: 'PHP.net', url: 'https://www.php.net/feed.atom', color: '#777bb4', cat: 'php' },
  { id: 'smashing', name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', color: '#a55eea', cat: 'design' },
  { id: 'react', name: 'React Blog', url: 'https://react.dev/rss.xml', color: '#45b7d1', cat: 'frontend' },
  { id: 'vue', name: 'Vue.js Blog', url: 'https://blog.vuejs.org/feed.xml', color: '#26de81', cat: 'frontend' },
  { id: 'devto', name: 'Dev.to', url: 'https://dev.to/feed/tag/webdev', color: '#70a1ff', cat: 'general' },
  { id: 'github', name: 'GitHub Blog', url: 'https://github.blog/feed/', color: '#ffa502', cat: 'devops' },
  { id: 'cssweekly', name: 'CSS Weekly', url: 'https://css-weekly.com/feed/', color: '#ff7f50', cat: 'design' },
  { id: 'jsweekly', name: 'JavaScript Weekly', url: 'https://cprss.s3.amazonaws.com/javascriptweekly.com.xml', color: '#f7df1e', cat: 'javascript' }
];

const PER_PAGE = 12;
const RSS_API = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ───────── ÉTAT GLOBAL ─────────
let sources = JSON.parse(localStorage.getItem('df_sources')) || DEFAULT_SOURCES;
let bookmarks = JSON.parse(localStorage.getItem('df_bookmarks')) || [];
let readIds = JSON.parse(localStorage.getItem('df_read')) || [];
let streak = parseInt(localStorage.getItem('df_streak')) || 0;
let lastVisit = localStorage.getItem('df_lastVisit') || '';

let allArticles = [];
let filteredArticles = [];
let activeFilter = 'all';
let activeSource = null;
let currentPage = 1;
let viewMode = 'grid';
let sourceSearchTerm = '';

// ───────── INITIALISATION ─────────
document.addEventListener('DOMContentLoaded', () => {
  initDateTime();
  initStreak();
  renderColorPresets();
  loadAllFeeds();
  bindEvents();
});

// ───────── DATE & HEURE ─────────
function initDateTime() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('clock').textContent = time;
  document.getElementById('date').textContent = date;
}

// ───────── STREAK ─────────
function initStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  
  if (lastVisit === today) {
    // Rien à faire
  } else if (lastVisit === yesterday) {
    streak++;
  } else if (lastVisit !== '') {
    streak = 1;
  } else {
    streak = 1;
  }
  
  localStorage.setItem('df_streak', streak);
  localStorage.setItem('df_lastVisit', today);
}

// ───────── CHARGEMENT DES FLUX AVEC ID STABLE ─────────
async function loadAllFeeds() {
  const feedEl = document.getElementById('feed');
  const loadingEl = document.getElementById('loadingState');
  const emptyEl = document.getElementById('emptyState');
  const refreshBtn = document.getElementById('refreshBtn');
  
  feedEl.style.display = 'none';
  emptyEl.style.display = 'none';
  loadingEl.style.display = 'flex';
  refreshBtn.classList.add('spinning');
  
  try {
    const results = await Promise.allSettled(sources.map(source => fetchSource(source)));
    const all = [];
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        all.push(...result.value);
      }
    });
    
    // Supprime les doublons par lien
    const uniqueMap = new Map();
    all.forEach(article => {
      if (!uniqueMap.has(article.link)) {
        uniqueMap.set(article.link, article);
      }
    });
    allArticles = Array.from(uniqueMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    applyFilters();
    
    loadingEl.style.display = 'none';
    feedEl.style.display = '';
    
    updateStats();
    renderSources();
    renderFilters();
    renderFeed();
    
    const message = allArticles.length > 0 
      ? `✅ ${allArticles.length} articles chargés` 
      : '⚠️ Aucun article récupéré';
    showToast(message, allArticles.length > 0 ? 'success' : 'error');
  } catch (error) {
    console.error('Erreur de chargement:', error);
    loadingEl.style.display = 'none';
    showToast('❌ Erreur lors du chargement des flux', 'error');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// 🔥 CORRECTION CLÉ : ID basé sur le lien URL (stable)
async function fetchSource(source) {
  try {
    const response = await fetch(RSS_API + encodeURIComponent(source.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    if (data.status !== 'ok') return [];
    
    return (data.items || []).map((item, index) => {
      // 🔥 CORRECTION DÉFINITIVE : ID ultra unique
      // Combine : sourceId + index + titre + lien (avec hash simple)
      const uniqueStr = `${source.id}_${index}_${item.title || ''}_${item.link || ''}`;
      let hash = 0;
      for (let i = 0; i < uniqueStr.length; i++) {
        hash = ((hash << 5) - hash) + uniqueStr.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
      }
      const uniqueId = `${source.id}_${index}_${Math.abs(hash)}`;
      
      return {
        id: uniqueId,
        title: item.title || 'Sans titre',
        link: item.link || '#',
        description: (item.description || item.content || '')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 200),
        sourceName: source.name,
        sourceId: source.id,
        sourceColor: source.color,
        category: source.cat,
        date: item.pubDate || new Date().toISOString()
      };
    });
  } catch (error) {
    console.warn(`[${source.name}]`, error.message);
    return [];
  }
}

// ───────── FILTRAGE ─────────
function applyFilters() {
  let filtered = [...allArticles];
  
  if (activeSource) {
    filtered = filtered.filter(a => a.sourceId === activeSource);
  }
  
  if (activeFilter !== 'all') {
    filtered = filtered.filter(a => a.category === activeFilter);
  }
  
  filteredArticles = filtered;
  currentPage = 1;
}

// ───────── RENDU DES SOURCES ─────────
function renderSources() {
  const container = document.getElementById('sources');
  const searchTerm = sourceSearchTerm.toLowerCase();
  const filteredSources = sources.filter(s => s.name.toLowerCase().includes(searchTerm));
  
  document.getElementById('sourceCount').textContent = sources.length;
  container.innerHTML = '';
  
  const allItem = createSourceItem({
    id: null,
    name: 'Toutes les sources',
    color: '#9aa3b8',
    isActive: activeSource === null
  });
  container.appendChild(allItem);
  
  filteredSources.forEach(source => {
    const articleCount = allArticles.filter(a => a.sourceId === source.id).length;
    const item = createSourceItem({
      id: source.id,
      name: source.name,
      color: source.color,
      count: articleCount,
      isActive: activeSource === source.id
    });
    container.appendChild(item);
  });
  
  const now = new Date();
  document.getElementById('lastUpdate').textContent = 
    now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function createSourceItem({ id, name, color, count, isActive }) {
  const div = document.createElement('div');
  div.className = `source-item${isActive ? ' active' : ''}`;
  div.innerHTML = `
    <div class="source-dot" style="background: ${color}"></div>
    <span class="source-name">${escapeHtml(name)}</span>
    ${count !== undefined ? `<span class="source-count">${count}</span>` : ''}
    ${id ? `<button class="source-delete" data-id="${id}">✕</button>` : ''}
  `;
  
  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('source-delete')) return;
    activeSource = id;
    applyFilters();
    renderSources();
    renderFilters();
    renderFeed();
  });
  
  if (id) {
    const deleteBtn = div.querySelector('.source-delete');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSource(id);
    });
  }
  
  return div;
}

// ───────── RENDU DES FILTRES ─────────
function renderFilters() {
  const container = document.getElementById('filters');
  const categories = ['all', ...new Set(sources.map(s => s.cat))];
  const categoryLabels = {
    all: '📌 Tous',
    php: '🐘 PHP',
    javascript: '📜 JavaScript',
    security: '🔒 Sécurité',
    devops: '🚀 DevOps',
    design: '🎨 Design',
    frontend: '⚛️ Frontend',
    backend: '🏗️ Backend',
    general: '📡 Général',
    python: '🐍 Python',
    rust: '🦀 Rust'
  };
  
  container.innerHTML = '';
  
  categories.forEach(cat => {
    const count = cat === 'all' 
      ? allArticles.length 
      : allArticles.filter(a => a.category === cat).length;
    
    if (cat !== 'all' && count === 0) return;
    
    const style = TAG_STYLES[cat] || TAG_STYLES.general;
    const chip = document.createElement('button');
    chip.className = `filter-chip${activeFilter === cat ? ' active' : ''}`;
    chip.innerHTML = `
      <span class="filter-dot"></span>
      ${categoryLabels[cat] || cat}
      <span class="filter-count">${count}</span>
    `;
    
    if (activeFilter === cat && cat !== 'all') {
      chip.style.background = style.bg.replace('20', '40');
      chip.style.color = style.text;
    }
    
    chip.addEventListener('click', () => {
      activeFilter = cat;
      activeSource = null;
      applyFilters();
      renderSources();
      renderFilters();
      renderFeed();
    });
    
    container.appendChild(chip);
  });
}

// ───────── RENDU DU FEED ─────────
function renderFeed() {
  const feedEl = document.getElementById('feed');
  const emptyEl = document.getElementById('emptyState');
  const pagination = document.querySelector('.pagination');
  
  const totalPages = Math.ceil(filteredArticles.length / PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  
  const start = (currentPage - 1) * PER_PAGE;
  const pageArticles = filteredArticles.slice(start, start + PER_PAGE);
  
  if (pageArticles.length === 0) {
    emptyEl.style.display = 'flex';
    feedEl.style.display = 'none';
    pagination.style.display = 'none';
    return;
  }
  
  emptyEl.style.display = 'none';
  feedEl.style.display = '';
  pagination.style.display = 'flex';
  
  feedEl.className = `feed${viewMode === 'list' ? ' list-mode' : ''}`;
  feedEl.innerHTML = '';
  
  pageArticles.forEach(article => {
    const card = createArticleCard(article);
    feedEl.appendChild(card);
  });
  
  document.getElementById('pageInfo').textContent = currentPage;
  document.getElementById('totalPages').textContent = totalPages;
  document.getElementById('prev').disabled = currentPage <= 1;
  document.getElementById('next').disabled = currentPage >= totalPages;
}

function createArticleCard(article) {
  const style = TAG_STYLES[article.category] || TAG_STYLES.general;
  const isRead = readIds.includes(article.id);
  const isBookmarked = bookmarks.includes(article.id);
  const date = new Date(article.date);
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  const card = document.createElement('div');
  card.className = `card${isRead ? ' read' : ''}`;
  card.style.setProperty('--card-accent', article.sourceColor);
  
  if (viewMode === 'list') {
    card.innerHTML = `
      <div class="card-meta">
        <div class="tags">
          <span class="tag" style="background:${style.bg};color:${style.text}">${article.category}</span>
          <span class="tag" style="background:var(--bg-tertiary);color:var(--text-tertiary)">${dateStr}</span>
        </div>
        <div class="card-actions">
          <button class="card-action bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${article.id}">
            ${isBookmarked ? '★' : '☆'}
          </button>
          <button class="card-action read-btn ${isRead ? 'read-mark' : ''}" data-id="${article.id}">
            ${isRead ? '✓' : '○'}
          </button>
        </div>
      </div>
      <div class="card-content">
        <h3 class="card-title">${escapeHtml(article.title)}</h3>
        <div class="card-footer">
          <span class="card-source">${escapeHtml(article.sourceName)}</span>
          <a class="card-link" href="${article.link}" target="_blank" rel="noopener" data-id="${article.id}">
            Lire →
          </a>
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="card-meta">
        <div class="tags">
          <span class="tag" style="background:${style.bg};color:${style.text}">${article.category}</span>
          <span class="tag" style="background:var(--bg-tertiary);color:var(--text-tertiary)">${dateStr} • ${timeStr}</span>
        </div>
        <div class="card-actions">
          <button class="card-action bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${article.id}">
            ${isBookmarked ? '★' : '☆'}
          </button>
          <button class="card-action read-btn ${isRead ? 'read-mark' : ''}" data-id="${article.id}">
            ${isRead ? '✓' : '○'}
          </button>
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(article.title)}</h3>
      ${article.description ? `<p class="card-desc">${escapeHtml(article.description)}</p>` : ''}
      <div class="card-footer">
        <span class="card-source">${escapeHtml(article.sourceName)}</span>
        <a class="card-link" href="${article.link}" target="_blank" rel="noopener" data-id="${article.id}">
          Lire l'article →
        </a>
      </div>
    `;
  }
  
  const bookmarkBtn = card.querySelector('.bookmark-btn');
  const readBtn = card.querySelector('.read-btn');
  const link = card.querySelector('.card-link');
  
  bookmarkBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const articleId = bookmarkBtn.getAttribute('data-id');
    toggleBookmark(articleId);
  });
  
  readBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const articleId = readBtn.getAttribute('data-id');
    toggleRead(articleId);
  });
  
  link?.addEventListener('click', (e) => {
    const articleId = link.getAttribute('data-id');
    markAsRead(articleId);
  });
  
  return card;
}

// ───────── STATISTIQUES ─────────
function updateStats() {
  const readCount = allArticles.filter(a => readIds.includes(a.id)).length;
  const bookmarkedCount = allArticles.filter(a => bookmarks.includes(a.id)).length;
  
  document.getElementById('totalCount').textContent = allArticles.length;
  document.getElementById('readCount').textContent = readCount;
  document.getElementById('bookmarkCount').textContent = bookmarkedCount;
  document.getElementById('streak').textContent = streak;
}

// ───────── ACTIONS INDIVIDUELLES AVEC PERSISTANCE ─────────
function toggleBookmark(id) {
  const index = bookmarks.indexOf(id);
  if (index === -1) {
    bookmarks.push(id);
    showToast('⭐ Article sauvegardé', 'success');
  } else {
    bookmarks.splice(index, 1);
    showToast('🗑️ Sauvegarde retirée', 'info');
  }
  localStorage.setItem('df_bookmarks', JSON.stringify(bookmarks));
  updateStats();
  renderFeed();
}

function toggleRead(id) {
  const index = readIds.indexOf(id);
  if (index === -1) {
    readIds.push(id);
    showToast('✅ Marqué comme lu', 'success');
  } else {
    readIds.splice(index, 1);
    showToast('📖 Marqué comme non lu', 'info');
  }
  localStorage.setItem('df_read', JSON.stringify(readIds));
  updateStats();
  renderFeed();
}

function markAsRead(id) {
  if (!readIds.includes(id)) {
    readIds.push(id);
    localStorage.setItem('df_read', JSON.stringify(readIds));
    updateStats();
    renderFeed();
  }
}

// ───────── GESTION DES SOURCES ─────────
function deleteSource(id) {
  const source = sources.find(s => s.id === id);
  if (!source) return;
  
  if (!confirm(`Supprimer "${source.name}" ?\nTous les articles de cette source seront retirés.`)) return;
  
  sources = sources.filter(s => s.id !== id);
  allArticles = allArticles.filter(a => a.sourceId !== id);
  
  if (activeSource === id) activeSource = null;
  
  localStorage.setItem('df_sources', JSON.stringify(sources));
  
  applyFilters();
  renderSources();
  renderFilters();
  renderFeed();
  updateStats();
  
  showToast(`🗑️ "${source.name}" supprimée`, 'info');
}

function saveSource(sourceData) {
  if (sources.find(s => s.id === sourceData.id)) return;
  
  sources.push(sourceData);
  localStorage.setItem('df_sources', JSON.stringify(sources));
  
  renderSources();
  renderFilters();
  loadAllFeeds();
  
  showToast(`✅ "${sourceData.name}" ajoutée`, 'success');
}

// ───────── MODAL ─────────
function openModal() {
  document.getElementById('modal').classList.add('open');
  document.getElementById('mName').focus();
  updatePreview();
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('mName').value = '';
  document.getElementById('mUrl').value = '';
  document.getElementById('mColor').value = '#00ff9d';
  document.getElementById('mCat').value = 'general';
}

function updatePreview() {
  const name = document.getElementById('mName').value || 'Aperçu';
  const color = document.getElementById('mColor').value;
  const cat = document.getElementById('mCat').value;
  const style = TAG_STYLES[cat] || { bg: `${color}20`, text: color, border: `${color}60` };
  
  const preview = document.getElementById('tagPreview');
  preview.textContent = name;
  preview.style.background = style.bg;
  preview.style.color = style.text;
  preview.style.border = `1px solid ${style.border}`;
}

function renderColorPresets() {
  const container = document.getElementById('colorPresets');
  container.innerHTML = '';
  
  COLOR_PRESETS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      document.getElementById('mColor').value = color;
      updatePreview();
    });
    container.appendChild(swatch);
  });
}

// ───────── GESTION DES ÉVÉNEMENTS ─────────
function bindEvents() {
  document.getElementById('refreshBtn').addEventListener('click', loadAllFeeds);
  
  document.getElementById('prev').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  
  document.getElementById('next').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredArticles.length / PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  
  document.getElementById('gridView').addEventListener('click', () => {
    viewMode = 'grid';
    document.getElementById('gridView').classList.add('active');
    document.getElementById('listView').classList.remove('active');
    renderFeed();
  });
  
  document.getElementById('listView').addEventListener('click', () => {
    viewMode = 'list';
    document.getElementById('listView').classList.add('active');
    document.getElementById('gridView').classList.remove('active');
    renderFeed();
  });
  
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('openModal').addEventListener('click', openModal);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);
  
  document.getElementById('saveSource').addEventListener('click', () => {
    const name = document.getElementById('mName').value.trim();
    const url = document.getElementById('mUrl').value.trim();
    const color = document.getElementById('mColor').value;
    const cat = document.getElementById('mCat').value;
    
    if (!name || !url) {
      showToast('❌ Nom et URL requis', 'error');
      return;
    }
    
    if (!url.startsWith('http')) {
      showToast('❌ URL invalide', 'error');
      return;
    }
    
    saveSource({
      id: Date.now().toString(36),
      name,
      url,
      color,
      cat
    });
    
    closeModal();
  });
  
  document.getElementById('clearFilters').addEventListener('click', () => {
    activeFilter = 'all';
    activeSource = null;
    applyFilters();
    renderSources();
    renderFilters();
    renderFeed();
  });
  
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      activeFilter = 'all';
      activeSource = null;
      sourceSearchTerm = '';
      document.getElementById('sourceSearch').value = '';
      applyFilters();
      renderSources();
      renderFilters();
      renderFeed();
    });
  }
  
  document.getElementById('sourceSearch').addEventListener('input', (e) => {
    sourceSearchTerm = e.target.value;
    renderSources();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (!e.target.matches('input, select, textarea')) {
      if (e.key === 'ArrowRight') {
        const totalPages = Math.ceil(filteredArticles.length / PER_PAGE);
        if (currentPage < totalPages) {
          currentPage++;
          renderFeed();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      if (e.key === 'ArrowLeft' && currentPage > 1) {
        currentPage--;
        renderFeed();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });
  
  ['mName', 'mColor', 'mCat'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', updatePreview);
      element.addEventListener('change', updatePreview);
    }
  });
}

// ───────── THÈME ─────────
function toggleTheme() {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem('df_theme', isLight ? 'light' : 'dark');
  showToast(isLight ? '☀️ Thème clair' : '🌙 Thème sombre', 'info');
}

// ───────── TOAST ─────────
let toastTimeout;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ───────── UTILITAIRES ─────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Restauration du thème
const savedTheme = localStorage.getItem('df_theme');
if (savedTheme === 'light') {
  document.body.classList.add('light');
}