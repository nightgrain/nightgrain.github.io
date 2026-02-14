// WARNING: do NOT embed your Flickr *secret* in client-side code.
// This example uses only the public API key to call non-authenticated methods.
const API_KEY = '6fda04f2f11e1909a500b20d2e58d47e';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Note: echo button removed from UI; no echo handler needed.

document.getElementById('btnFav').addEventListener('click', async () => {
  const output = document.getElementById('output');
  const userId = document.getElementById('userId').value.trim() || '7357400@N08';
  output.textContent = `Fetching favorites for ${userId}...`;
  const params = new URLSearchParams({
    method: 'flickr.favorites.getPublicList',
    api_key: API_KEY,
    user_id: userId,
    per_page: '30',
    page: '1',
    format: 'json',
    nojsoncallback: '1'
  });
  const url = `https://api.flickr.com/services/rest/?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    if (data.stat !== 'ok') throw new Error(JSON.stringify(data));
    const photos = data.photos.photo;
    if (!photos || photos.length === 0) { output.textContent = 'No favorites found.'; return; }
    // Render list with placeholders for owner thumbnails; collect unique owners
    const ownerCells = {}; // owner -> element id
    const uniqueOwners = new Set();
    const rows = photos.map((p, idx) => {
      const ownerStream = `https://www.flickr.com/photos/${p.owner}/`;
      const thumb = `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_q.jpg`;
      const title = p.title || p.id;
      const ownerId = p.owner;
      uniqueOwners.add(ownerId);
      const ownerCellId = `owner-${ownerId.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
      ownerCells[ownerId] = ownerCellId;
      return `<div style="display:flex;align-items:center;margin:0.5rem 0;gap:1rem">
        <img src="${thumb}" alt="${escapeHtml(title)}" style="width:150px;height:150px;object-fit:cover;border-radius:6px">
        <div id="${ownerCellId}" style="width:560px;text-align:right;vertical-align:top">
          <div><a href="${ownerStream}" target="_blank" rel="noopener noreferrer">${escapeHtml(ownerId)}</a></div>
          <div style="margin-top:6px;text-align:right"><div class="thumb-grid">Loading...</div></div>
        </div>
      </div>`;
    });
    const headerHtml = '<div style="display:flex;align-items:center;margin:0.5rem 0;gap:1rem;font-weight:600;border-bottom:1px solid #444;padding-bottom:0.25rem"><div style="width:150px">Thumbnail</div><div style="width:560px;text-align:right">Owner (NSID) & Recent Photos</div></div>';
    output.innerHTML = headerHtml + rows.join('');

    // Fetch recent photos for each unique owner (limit concurrency)
    const owners = Array.from(uniqueOwners);
    const concurrency = 6;
    let i = 0;
    async function worker() {
      while (i < owners.length) {
        const idx = i++;
        const owner = owners[idx];
        try {
          const p = new URLSearchParams({
            method: 'flickr.people.getPublicPhotos',
            api_key: API_KEY,
            user_id: owner,
            per_page: '32',
            page: '1',
            format: 'json',
            nojsoncallback: '1'
          });
          const url = `https://api.flickr.com/services/rest/?${p.toString()}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          const d = await res.json();
          if (d.stat !== 'ok') throw new Error(JSON.stringify(d));
          const photos2 = d.photos.photo || [];
          const slots = 32;
          const arr = photos2.slice(0, slots);
          const cells = [];
          for (let j = 0; j < slots; j++) {
            const pp = arr[j];
            if (pp) {
              const t = `https://live.staticflickr.com/${pp.server}/${pp.id}_${pp.secret}_s.jpg`;
              const photoPage = `https://www.flickr.com/photos/${owner}/${pp.id}`;
              cells.push(`<a href="${photoPage}" target="_blank" rel="noopener noreferrer"><img src="${t}" style="width:40px;height:40px;object-fit:cover;margin:2px" alt="${escapeHtml(pp.title||pp.id)}"></a>`);
            } else {
              cells.push(`<div style="width:40px;height:40px;margin:2px;background:#111;border:1px solid #222"></div>`);
            }
          }
          const thumbsGrid = `<div class="thumb-grid">${cells.join('')}</div>`;
          const cell = document.getElementById(ownerCells[owner]);
          if (cell) cell.innerHTML = `<div><a href="https://www.flickr.com/photos/${owner}/" target="_blank" rel="noopener noreferrer">${escapeHtml(owner)}</a></div><div style="margin-top:6px;text-align:right">${thumbsGrid}</div>`;
        } catch (err) {
          const cell = document.getElementById(ownerCells[owner]);
          if (cell) cell.innerHTML = `<div><a href="https://www.flickr.com/photos/${owner}/" target="_blank" rel="noopener noreferrer">${escapeHtml(owner)}</a></div><div style="font-size:0.75rem;color:#900">Error loading thumbnails</div>`;
        }
      }
    }
    await Promise.all(new Array(concurrency).fill(0).map(worker));
  } catch (err) {
    output.textContent = 'Error: ' + err.message;
  }
});
