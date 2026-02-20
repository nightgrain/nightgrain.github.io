// WARNING: do NOT embed your Flickr *secret* in client-side code.
// Cleaned implementation: favorites list + infinite scroll + owner/favorites grids
const API_KEY = '6fda04f2f11e1909a500b20d2e58d47e';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

function placeholderGridHTML(slots = 32) {
  const cells = [];
  for (let i = 0; i < slots; i++) {
    const v = 20 + Math.floor(Math.random() * 40); // 20..59
    const hex = v.toString(16).padStart(2, '0');
    const color = `#${hex}${hex}${hex}`;
    cells.push(`<div style="width:var(--micro-size);height:var(--micro-size);background:${color};border:1px solid rgba(0,0,0,0.25);border-radius:4px"></div>`);
  }
  return `<div class="thumb-grid">${cells.join('')}</div>`;
}

// State
const SAFETY_LEVELS = [
  { v: '1', label: 'Safe' },
  { v: '2', label: 'Moderate' },
  { v: '3', label: 'Restricted' }
];

function getCurrentSafety() {
  try {
    return localStorage.getItem('safety_level') || '1';
  } catch (e) {
    return '1';
  }
}

function setCurrentSafety(v) {
  try {
    localStorage.setItem('safety_level', String(v));
  } catch (e) {
    // ignore (e.g., private mode where storage is unavailable)
  }
}

function safetyLabelFor(v) {
  const found = SAFETY_LEVELS.find(s => s.v === String(v));
  return found ? found.label : String(v);
}

let currentSafety = getCurrentSafety();

let currentUser = null;
let perPage = 30;
let currentPage = 0;
let totalPages = null;
let loadingMore = false;
let ownerFetched = new Set();
let globalRowIndex = 0;

const output = document.getElementById('output');
const btn = document.getElementById('btnFav');
const btnClear = document.getElementById('btnClear');
const btnSafety = document.getElementById('btnSafety');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
  return r.json();
}

async function loadFavoritesPage(page, append = true) {
  const qs = new URLSearchParams({ method: 'flickr.favorites.getPublicList', api_key: API_KEY, user_id: currentUser, per_page: String(perPage), page: String(page), safe_search: String(currentSafety), format: 'json', nojsoncallback: '1' });
  const url = `https://api.flickr.com/services/rest/?${qs.toString()}`;
  const data = await fetchJson(url);
  if (data.stat !== 'ok') throw new Error(JSON.stringify(data));
  const photos = data.photos.photo || [];
  totalPages = data.photos ? Number(data.photos.pages) : totalPages;
  currentPage = Number(data.photos ? data.photos.page : page);

  if (!append) output.innerHTML = '';
  if (currentPage === 1) {
    // add header once
    const headerHtml = '<div style="display:flex;align-items:center;margin:0.5rem 0;gap:1rem;font-weight:600;border-bottom:1px solid #444;padding-bottom:0.25rem"><div style="width:calc((var(--micro-size) * 4) + (var(--micro-gap) * 3))">Thumbnail</div><div style="width:calc((var(--micro-size) * 8) + (var(--micro-gap) * 7));text-align:right">Owner (NSID) & Recent Photos</div><div style="width:calc((var(--micro-size) * 8) + (var(--micro-gap) * 7));text-align:right;margin-left:12px">Favorites</div></div>';
    output.innerHTML = headerHtml;
  }

  const ownersOnPage = new Set();
  const rowsHtml = photos.map((p) => {
    const owner = p.owner;
    ownersOnPage.add(owner);
    const ownerEnc = encodeURIComponent(owner);
    const ownerCellId = `owner-${ownerEnc}-${globalRowIndex}`;
    const favCellId = `fav-${ownerEnc}-${globalRowIndex}`;
    globalRowIndex++;
    const thumb = `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_q.jpg`;
    const browseHref = `?nsid=${encodeURIComponent(owner)}`;
    return `<div style="display:flex;align-items:center;margin:0.5rem 0;gap:1rem">
      <img src="${thumb}" alt="${escapeHtml(p.title||p.id)}" style="width:calc((var(--micro-size) * 4) + (var(--micro-gap) * 3));height:calc((var(--micro-size) * 4) + (var(--micro-gap) * 3));object-fit:cover;border-radius:6px">
      <div id="${ownerCellId}" data-owner-enc="${ownerEnc}" style="width:calc((var(--micro-size) * 8) + (var(--micro-gap) * 7));text-align:right;vertical-align:top">
        <div><a href="https://www.flickr.com/photos/${owner}/" target="_blank" rel="noopener noreferrer">${escapeHtml(owner)}</a></div>
        <div style="margin-top:6px;text-align:right">${placeholderGridHTML(32)}</div>
      </div>
      <div id="${favCellId}" data-owner-enc="${ownerEnc}" style="width:calc((var(--micro-size) * 8) + (var(--micro-gap) * 7));text-align:right;vertical-align:top;margin-left:12px">
        <div style="color:var(--muted);font-size:0.9rem"><a href="https://www.flickr.com/photos/${owner}/favorites" target="_blank" rel="noopener noreferrer">Favorites</a> <span style="color:var(--muted)">|</span> <a href="${browseHref}">Browse</a></div>
        <div style="margin-top:6px;text-align:right">${placeholderGridHTML(32)}</div>
      </div>
    </div>`;
  }).join('');

  output.innerHTML += rowsHtml;

  // Fetch owner data for owners not yet fetched
  const ownersToFetch = Array.from(ownersOnPage).filter(o => !ownerFetched.has(o));
  if (ownersToFetch.length) await fetchOwners(ownersToFetch);
}

async function fetchOwners(owners) {
  const concurrency = 6;
  let i = 0;
  async function worker() {
    while (i < owners.length) {
      const idx = i++;
      const owner = owners[idx];
      ownerFetched.add(owner);
      const ownerEnc = encodeURIComponent(owner);
      try {
        // recent photos
        const p = new URLSearchParams({ method: 'flickr.people.getPublicPhotos', api_key: API_KEY, user_id: owner, per_page: '32', page: '1', safe_search: String(currentSafety), format: 'json', nojsoncallback: '1' });
        const url = `https://api.flickr.com/services/rest/?${p.toString()}`;
        const d = await fetchJson(url);
        if (d.stat !== 'ok') throw new Error(JSON.stringify(d));
        const photos2 = d.photos.photo || [];
        const slots = 32;
        const arr = photos2.slice(0, slots);
        const cells = arr.map(pp => `<a href="https://www.flickr.com/photos/${owner}/${pp.id}" target="_blank" rel="noopener noreferrer"><img src="https://live.staticflickr.com/${pp.server}/${pp.id}_${pp.secret}_s.jpg" style="width:var(--micro-size);height:var(--micro-size);object-fit:cover;border-radius:4px" alt="${escapeHtml(pp.title||pp.id)}"></a>`);
        while (cells.length < slots) cells.push(`<div style="width:var(--micro-size);height:var(--micro-size);background:#111;border:1px solid #222;border-radius:4px"></div>`);
        const thumbsGrid = `<div class="thumb-grid">${cells.join('')}</div>`;
        const ownerEls = document.querySelectorAll(`[data-owner-enc="${ownerEnc}"]`);
        ownerEls.forEach(el => { if (el.id && el.id.startsWith('owner-')) el.innerHTML = `<div><a href="https://www.flickr.com/photos/${owner}/" target="_blank" rel="noopener noreferrer">${escapeHtml(owner)}</a></div><div style="margin-top:6px;text-align:right">${thumbsGrid}</div>`; });

        // favorites for that owner
        try {
          const pf = new URLSearchParams({ method: 'flickr.favorites.getPublicList', api_key: API_KEY, user_id: owner, per_page: '32', page: '1', safe_search: String(currentSafety), format: 'json', nojsoncallback: '1' });
          const urlf = `https://api.flickr.com/services/rest/?${pf.toString()}`;
          const df = await fetchJson(urlf);
          if (df.stat !== 'ok') throw new Error(JSON.stringify(df));
          const favs = df.photos.photo || [];
          const favArr = favs.slice(0, slots);
          const favCellsArr = favArr.map(pp => `<a href="https://www.flickr.com/photos/${pp.owner}/${pp.id}" target="_blank" rel="noopener noreferrer"><img src="https://live.staticflickr.com/${pp.server}/${pp.id}_${pp.secret}_s.jpg" style="width:var(--micro-size);height:var(--micro-size);object-fit:cover;border-radius:4px" alt="${escapeHtml(pp.title||pp.id)}"></a>`);
          while (favCellsArr.length < slots) favCellsArr.push(`<div style="width:var(--micro-size);height:var(--micro-size);background:#111;border:1px solid #222;border-radius:4px"></div>`);
          const favGrid = `<div class="thumb-grid">${favCellsArr.join('')}</div>`;
          const favEls = document.querySelectorAll(`[data-owner-enc="${ownerEnc}"]`);
          favEls.forEach(el => { if (el.id && el.id.startsWith('fav-')) {
            const browseHref = `?nsid=${encodeURIComponent(owner)}`;
            el.innerHTML = `<div style="color:var(--muted);font-size:0.9rem"><a href="https://www.flickr.com/photos/${owner}/favorites" target="_blank" rel="noopener noreferrer">Favorites</a> <span style="color:var(--muted)">|</span> <a href="${browseHref}">Browse</a></div><div style="margin-top:6px;text-align:right">${favGrid}</div>`;
          } });
        } catch (errFav) {
          const favEls = document.querySelectorAll(`[data-owner-enc="${ownerEnc}"]`);
          favEls.forEach(el => { if (el.id && el.id.startsWith('fav-')) el.innerHTML = `<div style="color:var(--muted);font-size:0.9rem"><a href="https://www.flickr.com/photos/${owner}/favorites" target="_blank" rel="noopener noreferrer">Favorites</a></div><div style="font-size:0.75rem;color:#900">Error</div>`; });
        }
      } catch (err) {
        const ownerEls = document.querySelectorAll(`[data-owner-enc="${ownerEnc}"]`);
        ownerEls.forEach(el => { if (el.id && el.id.startsWith('owner-')) el.innerHTML = `<div><a href="https://www.flickr.com/photos/${owner}/" target="_blank" rel="noopener noreferrer">${escapeHtml(owner)}</a></div><div style="font-size:0.75rem;color:#900">Error loading thumbnails</div>`; });
      }
    }
  }
  await Promise.all(new Array(concurrency).fill(0).map(worker));
}

// simple debounce for scroll
let scrollTimer = null;
function onScrollNearBottom(cb) {
  if (scrollTimer) return;
  scrollTimer = setTimeout(async () => {
    scrollTimer = null;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 300);
    if (nearBottom) await cb();
  }, 150);
}

// attach handler (guard in case element isn't present)
if (btn) {
  btn.addEventListener('click', async () => {
  currentUser = document.getElementById('userId').value.trim() || '7357400@N08';
  perPage = 30;
  currentPage = 0;
  totalPages = null;
  loadingMore = false;
  ownerFetched.clear();
  globalRowIndex = 0;
  output.innerHTML = '<div style="color:var(--muted)">Loading first page...</div>';
  try {
    await loadFavoritesPage(1, false);
  } catch (e) {
    output.textContent = 'Error: ' + e.message;
    return;
  }

  // add scroll listener once
  window.addEventListener('scroll', async () => {
    if (loadingMore) return;
    if (totalPages && currentPage >= totalPages) return;
    onScrollNearBottom(async () => {
      if (loadingMore) return;
      loadingMore = true;
      try {
        await loadFavoritesPage(currentPage + 1, true);
      } catch (e) {
        console.error(e);
      }
      loadingMore = false;
    });
  });
  });
} else {
  console.warn('Get Favorites button not found; click handler not attached');
}

// Clear / reset to defaults
if (btnClear) {
  btnClear.addEventListener('click', () => {
    const input = document.getElementById('userId');
    if (input) input.value = '7357400@N08';
    currentUser = null;
    perPage = 30;
    currentPage = 0;
    totalPages = null;
    loadingMore = false;
    ownerFetched.clear();
    globalRowIndex = 0;
    output.innerHTML = '';
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  });
}

// Safety UI: button shows static label; status text is printed next to it
function updateSafetyUI() {
  if (btnSafety) {
    btnSafety.textContent = 'Safety';
    btnSafety.title = 'Click to cycle safety level';
  }
  const statusEl = document.getElementById('safetyStatus');
  if (statusEl) statusEl.textContent = safetyLabelFor(currentSafety);
}
updateSafetyUI();

if (btnSafety) {
  btnSafety.addEventListener('click', () => {
    const idx = SAFETY_LEVELS.findIndex(s => s.v === String(currentSafety));
    const next = SAFETY_LEVELS[(idx + 1) % SAFETY_LEVELS.length].v;
    setCurrentSafety(next);
    // reload so the new safety setting is applied to displayed content
    try { location.reload(); } catch (e) { window.location = window.location; }
  });
}

// If page is loaded with ?nsid=..., auto-populate and run
window.addEventListener('load', () => {
  const qp = new URLSearchParams(window.location.search);
  const nsid = qp.get('nsid');
  if (nsid) {
    const input = document.getElementById('userId');
    input.value = nsid;
    // trigger the same behavior as clicking Get Favorites
    btn.click();
  }
});
