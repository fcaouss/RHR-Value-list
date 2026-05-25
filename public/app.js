const API = '';

let allPets = [];
let filteredPets = [];
let favorites = JSON.parse(localStorage.getItem('rhr_favorites') || '[]');
let activeFilter = 'all';
let adminPassword = sessionStorage.getItem('rhr_admin_pw') || '';
let editingPetId = null;
let uploadedImageUrl = '';
let logoClickCount = 0;
let logoClickTimer = null;

const $ = id => document.getElementById(id);

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getDemandClass(demand) {
  if (!demand) return '';
  return 'demand-' + demand.replace(' ', '-');
}

function getDemandColor(demand) {
  const map = {
    'Very High': '#f97316',
    'High': '#eab308',
    'Medium': '#60a5fa',
    'Low': '#94a3b8',
    'Very Low': '#475569'
  };
  return map[demand] || '#94a3b8';
}

function isFav(id) { return favorites.includes(id); }

function toggleFav(id, e) {
  if (e) e.stopPropagation();
  if (isFav(id)) {
    favorites = favorites.filter(f => f !== id);
  } else {
    favorites.push(id);
  }
  localStorage.setItem('rhr_favorites', JSON.stringify(favorites));
  updateFavCount();
  renderPets();
}

function updateFavCount() {
  $('favCount').textContent = favorites.length;
}

function buildCard(pet) {
  const fav = isFav(pet.id);
  const val = pet.normal_value || 'O/C';
  const isOC = val.toUpperCase() === 'O/C';

  const card = document.createElement('div');
  card.className = 'pet-card';
  card.dataset.id = pet.id;

  card.innerHTML = `
    <div class="card-img-wrap">
      ${pet.image_url
        ? `<img class="card-img" src="${pet.image_url}" alt="${pet.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''
      }
      <div class="card-img-placeholder" style="${pet.image_url ? 'display:none' : ''}">?</div>
      ${pet.category && pet.category !== 'Standard' ? `<span class="card-category-badge badge-${pet.category}">${pet.category}</span>` : ''}
      <button class="card-fav ${fav ? 'active' : ''}" data-id="${pet.id}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">
        <svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
    </div>
    <div class="card-body">
      <div class="card-name">${pet.name}</div>
      ${pet.existence_rate ? `<div class="card-rate">${pet.existence_rate}</div>` : ''}
      <div class="card-value-row">
        <span class="card-crown">
          <svg viewBox="0 0 20 14" fill="#f5c842" width="16" height="12"><path d="M1 13L3 4l4 4 3-7 3 7 4-4 2 9H1z"/></svg>
        </span>
        <span class="card-value">${val}</span>
      </div>
      <div class="card-meta">
        ${pet.pet_power ? `<span class="card-power"><svg viewBox="0 0 24 24" fill="#fbbf24" width="11" height="11"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>${pet.pet_power}</span>` : ''}
        ${pet.demand ? `<span class="card-demand-badge ${getDemandClass(pet.demand)}">${pet.demand}</span>` : ''}
      </div>
      ${isOC ? `<div style="margin-top:6px"><span class="card-oc-badge">O/C</span></div>` : ''}
    </div>
  `;

  card.querySelector('.card-fav').addEventListener('click', e => toggleFav(pet.id, e));
  card.addEventListener('click', () => openPetModal(pet));
  return card;
}

function renderPets() {
  const grid = $('petsGrid');
  grid.innerHTML = '';

  if (filteredPets.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No pets found.</p></div>';
    $('resultCount').textContent = '0 results';
    return;
  }

  $('resultCount').textContent = `${filteredPets.length} result${filteredPets.length !== 1 ? 's' : ''}`;

  filteredPets.forEach(pet => grid.appendChild(buildCard(pet)));
}

function applyFilters() {
  const q = $('searchInput').value.toLowerCase().trim();
  const cat = $('categoryFilter').value;
  const sort = $('sortFilter').value;

  filteredPets = allPets.filter(pet => {
    if (q && !pet.name.toLowerCase().includes(q)) return false;
    if (cat !== 'all' && pet.category !== cat) return false;
    if (activeFilter === 'gold' && !pet.has_gold) return false;
    if (activeFilter === 'rainbow' && !pet.has_rainbow) return false;
    if (activeFilter === 'favorites' && !isFav(pet.id)) return false;
    return true;
  });

  const demandOrder = { 'Very High': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Very Low': 4, '': 5 };

  if (sort === 'name') {
    filteredPets.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'demand') {
    filteredPets.sort((a, b) => (demandOrder[a.demand] ?? 5) - (demandOrder[b.demand] ?? 5));
  } else if (sort === 'newest') {
    filteredPets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  renderPets();
}

async function loadPets() {
  try {
    const res = await fetch(`${API}/api/pets`);
    allPets = await res.json();
    $('navPetCount').textContent = `${allPets.length} pets`;
    applyFilters();
    $('loadingState')?.remove();
  } catch (e) {
    $('petsGrid').innerHTML = '<div class="empty-state"><p>Failed to load pets. Is the server running?</p></div>';
  }
}

function openPetModal(pet) {
  const modal = $('petModal');
  $('petModalImg').src = pet.image_url || '';
  $('petModalImg').style.display = pet.image_url ? 'block' : 'none';
  $('petModalName').textContent = pet.name;
  $('petModalRate').textContent = pet.existence_rate || '—';
  $('petModalPower').textContent = pet.pet_power || '—';
  $('petModalEdited').textContent = formatDate(pet.updated_at);

  const demandBox = $('petModalDemandBox');
  const demandEl = $('petModalDemand');
  if (pet.demand) {
    demandEl.textContent = pet.demand;
    demandEl.style.color = getDemandColor(pet.demand);
    demandBox.style.display = 'block';
  } else {
    demandBox.style.display = 'none';
  }

  const badges = $('petModalBadges');
  badges.innerHTML = '';
  if (pet.category) {
    const b = document.createElement('span');
    b.className = `card-category-badge badge-${pet.category}`;
    b.textContent = pet.category;
    badges.appendChild(b);
  }

  const setVariant = (valId, subId, val) => {
    const isOC = !val || val.toUpperCase() === 'O/C';
    $(valId).textContent = isOC ? 'O/C' : val;
    $(subId).textContent = isOC ? "owner's choice" : '';
  };

  setVariant('varNormal', 'varNormalSub', pet.normal_value);
  setVariant('varGold', 'varGoldSub', pet.gold_value);
  setVariant('varRainbow', 'varRainbowSub', pet.rainbow_value);

  $('goldCard').style.display = pet.has_gold !== false ? 'flex' : 'none';
  $('rainbowCard').style.display = pet.has_rainbow !== false ? 'flex' : 'none';

  const notes = $('petModalNotes');
  if (pet.notes) {
    notes.textContent = pet.notes;
    notes.classList.add('visible');
  } else {
    notes.classList.remove('visible');
  }

  const favBtn = $('petModalFav');
  const updateFavBtn = () => {
    const saved = isFav(pet.id);
    favBtn.className = `btn-save${saved ? ' saved' : ''}`;
    favBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ${saved ? 'Saved' : 'Save'}`;
  };
  updateFavBtn();
  favBtn.onclick = () => { toggleFav(pet.id); updateFavBtn(); };

  $('copyValues').onclick = () => {
    const txt = `${pet.name}\nNormal: ${pet.normal_value || 'O/C'}\nGold: ${pet.gold_value || 'O/C'}\nRainbow: ${pet.rainbow_value || 'O/C'}`;
    navigator.clipboard.writeText(txt).then(() => showToast('Values copied!'));
  };

  $('priceHistorySection').style.display = 'none';
  $('toggleHistory').textContent = '';
  $('toggleHistory').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> Price History`;
  let historyLoaded = false;

  $('toggleHistory').onclick = async () => {
    const section = $('priceHistorySection');
    if (section.style.display === 'none') {
      section.style.display = 'block';
      $('toggleHistory').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> Hide History`;
      if (!historyLoaded) {
        historyLoaded = true;
        await loadHistory(pet.id);
      }
    } else {
      section.style.display = 'none';
      $('toggleHistory').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> Price History`;
    }
  };

  modal.classList.add('open');
}

async function loadHistory(petId) {
  try {
    const res = await fetch(`${API}/api/pets/${petId}/history`);
    const history = await res.json();
    const list = $('historyList');
    if (!history.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">No history yet.</div>';
      return;
    }
    list.innerHTML = history.slice().reverse().map(h => `
      <div class="history-item">
        <span class="history-date">${formatDate(h.recorded_at)}</span>
        <span class="history-val" style="color:#60a5fa">${h.normal_value || 'O/C'}</span>
        <span class="history-val" style="color:var(--gold)">G: ${h.gold_value || 'O/C'}</span>
        <span class="history-val" style="color:#c084fc">R: ${h.rainbow_value || 'O/C'}</span>
      </div>
    `).join('');
  } catch (e) {
    $('historyList').innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">Could not load history.</div>';
  }
}

function openAddModal(pet = null) {
  editingPetId = pet ? pet.id : null;
  uploadedImageUrl = pet ? (pet.image_url || '') : '';

  $('addPetTitle').textContent = pet ? 'Edit Pet' : 'Add Pet';
  $('submitPetLabel').textContent = pet ? 'Save Changes' : 'Add Pet';
  $('fName').value = pet ? pet.name : '';
  $('fCategory').value = pet ? pet.category : 'Standard';
  $('fRate').value = pet ? (pet.existence_rate || '') : '';
  $('fNormal').value = pet ? (pet.normal_value || '') : '';
  $('fGold').value = pet ? (pet.gold_value || '') : '';
  $('fRainbow').value = pet ? (pet.rainbow_value || '') : '';
  $('fPower').value = pet ? (pet.pet_power || '') : '';
  $('fDemand').value = pet ? (pet.demand || '') : '';
  $('fHasGold').checked = pet ? pet.has_gold !== false : true;
  $('fHasRainbow').checked = pet ? pet.has_rainbow !== false : true;
  $('fNotes').value = pet ? (pet.notes || '') : '';
  $('formError').textContent = '';
  $('imageUrlHint').textContent = uploadedImageUrl ? 'Image uploaded.' : '';

  const preview = $('imagePreview');
  const inner = $('dropZoneInner');
  if (uploadedImageUrl) {
    preview.src = uploadedImageUrl;
    preview.style.display = 'block';
    inner.style.display = 'none';
  } else {
    preview.style.display = 'none';
    inner.style.display = 'flex';
  }

  $('addPetModal').classList.add('open');
}

function closeAddModal() {
  $('addPetModal').classList.remove('open');
  editingPetId = null;
  uploadedImageUrl = '';
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${API}/api/upload`, {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword },
    body: formData
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }

  const data = await res.json();
  return data.url;
}

function setupDropZone() {
  const zone = $('dropZone');
  const input = $('imageFileInput');
  const preview = $('imagePreview');
  const inner = $('dropZoneInner');

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragging');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));

  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await handleImageFile(file, preview, inner);
    }
  });

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (file) await handleImageFile(file, preview, inner);
  });
}

async function handleImageFile(file, preview, inner) {
  const localUrl = URL.createObjectURL(file);
  preview.src = localUrl;
  preview.style.display = 'block';
  inner.style.display = 'none';
  $('imageUrlHint').textContent = 'Uploading...';

  try {
    uploadedImageUrl = await uploadImage(file);
    $('imageUrlHint').textContent = 'Uploaded successfully.';
    showToast('Image uploaded!');
  } catch (e) {
    $('imageUrlHint').textContent = 'Upload failed: ' + e.message;
    showToast('Image upload failed: ' + e.message, 'error');
    uploadedImageUrl = '';
    preview.style.display = 'none';
    inner.style.display = 'flex';
  }
}

async function submitPet() {
  const name = $('fName').value.trim();
  if (!name) { $('formError').textContent = 'Pet name is required.'; return; }

  const body = {
    name,
    category: $('fCategory').value,
    image_url: uploadedImageUrl || null,
    existence_rate: $('fRate').value.trim() || null,
    normal_value: $('fNormal').value.trim() || 'O/C',
    gold_value: $('fGold').value.trim() || 'O/C',
    rainbow_value: $('fRainbow').value.trim() || 'O/C',
    pet_power: $('fPower').value.trim() || null,
    demand: $('fDemand').value || null,
    has_gold: $('fHasGold').checked,
    has_rainbow: $('fHasRainbow').checked,
    notes: $('fNotes').value.trim() || null
  };

  const btn = $('submitPet');
  btn.disabled = true;
  $('formError').textContent = '';

  try {
    const url = editingPetId ? `${API}/api/pets/${editingPetId}` : `${API}/api/pets`;
    const method = editingPetId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }

    closeAddModal();
    showToast(editingPetId ? 'Pet updated!' : 'Pet added!');
    await loadPets();
    await loadAdminList();
  } catch (e) {
    $('formError').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

async function deletePet(id) {
  if (!confirm('Delete this pet? This cannot be undone.')) return;

  try {
    const res = await fetch(`${API}/api/pets/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });

    if (!res.ok) throw new Error('Delete failed');
    showToast('Pet deleted.');
    await loadPets();
    await loadAdminList();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function loadAdminList() {
  const list = $('adminList');
  list.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`${API}/api/pets`);
    const pets = await res.json();

    const q = $('adminSearch').value.toLowerCase();
    const shown = q ? pets.filter(p => p.name.toLowerCase().includes(q)) : pets;

    if (!shown.length) {
      list.innerHTML = '<div class="empty-state" style="padding:40px 0"><p>No pets found.</p></div>';
      return;
    }

    list.innerHTML = shown.map(pet => `
      <div class="admin-row">
        ${pet.image_url
          ? `<img class="admin-row-img" src="${pet.image_url}" alt="${pet.name}" loading="lazy">`
          : `<div class="admin-row-img-placeholder">?</div>`
        }
        <div class="admin-row-info">
          <div class="admin-row-name">
            ${pet.name}
            ${pet.category && pet.category !== 'Standard' ? `<span class="card-category-badge badge-${pet.category}" style="font-size:10px">${pet.category}</span>` : ''}
            ${pet.demand ? `<span class="card-demand-badge ${getDemandClass(pet.demand)}" style="font-size:10px">${pet.demand}</span>` : ''}
          </div>
          <div class="admin-row-meta">
            ${pet.existence_rate ? `${pet.existence_rate} · ` : ''}${pet.pet_power ? `${pet.pet_power} power` : ''}
          </div>
        </div>
        <div class="admin-row-values">
          <span class="val-badge val-normal">${pet.normal_value || 'O/C'}</span>
          ${pet.has_gold !== false ? `<span class="val-badge val-gold">G: ${pet.gold_value || 'O/C'}</span>` : ''}
          ${pet.has_rainbow !== false ? `<span class="val-badge val-rainbow">R: ${pet.rainbow_value || 'O/C'}</span>` : ''}
        </div>
        <div class="admin-row-actions">
          <button class="btn-edit" onclick="editPet('${pet.id}')">Edit</button>
          <button class="btn-icon delete" onclick="deletePet('${pet.id}')" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state" style="padding:40px 0"><p>Failed to load pets.</p></div>';
  }
}

async function editPet(id) {
  try {
    const res = await fetch(`${API}/api/pets/${id}`);
    const pet = await res.json();
    openAddModal(pet);
  } catch (e) {
    showToast('Could not load pet data.', 'error');
  }
}

window.editPet = editPet;
window.deletePet = deletePet;

async function verifyAdminPassword(password) {
  const res = await fetch(`${API}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return res.ok;
}

function showAdminPage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-admin').classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector('[data-page="admin"]').classList.add('active');
  loadAdminList();
}

function showHomePage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-home').classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector('[data-page="home"]').classList.add('active');
}

function init() {
  loadPets();
  updateFavCount();
  setupDropZone();

  $('logoClick').addEventListener('click', () => {
    logoClickCount++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 600);
    if (logoClickCount >= 3) {
      logoClickCount = 0;
      if (adminPassword) {
        showAdminPage();
      } else {
        $('passwordModal').classList.add('open');
      }
    }
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === 'admin') {
        if (adminPassword) {
          showAdminPage();
        } else {
          $('passwordModal').classList.add('open');
        }
      } else {
        showHomePage();
      }
    });
  });

  $('submitPassword').addEventListener('click', async () => {
    const pw = $('adminPasswordInput').value;
    $('pwError').textContent = '';
    $('submitPassword').disabled = true;

    try {
      const valid = await verifyAdminPassword(pw);
      if (valid) {
        adminPassword = pw;
        sessionStorage.setItem('rhr_admin_pw', pw);
        $('passwordModal').classList.remove('open');
        $('adminPasswordInput').value = '';
        showAdminPage();
      } else {
        $('pwError').textContent = 'Incorrect password.';
      }
    } catch (e) {
      $('pwError').textContent = 'Server error. Try again.';
    } finally {
      $('submitPassword').disabled = false;
    }
  });

  $('adminPasswordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('submitPassword').click();
  });

  $('cancelPassword').addEventListener('click', () => {
    $('passwordModal').classList.remove('open');
    $('adminPasswordInput').value = '';
    $('pwError').textContent = '';
  });

  $('closePetModal').addEventListener('click', () => $('petModal').classList.remove('open'));
  $('petModal').addEventListener('click', e => {
    if (e.target === $('petModal')) $('petModal').classList.remove('open');
  });

  $('openAddPet').addEventListener('click', () => openAddModal());
  $('cancelAddPet').addEventListener('click', closeAddModal);
  $('closeAddPet').addEventListener('click', closeAddModal);
  $('addPetModal').addEventListener('click', e => {
    if (e.target === $('addPetModal')) closeAddModal();
  });

  $('submitPet').addEventListener('click', submitPet);

  $('searchInput').addEventListener('input', applyFilters);
  $('categoryFilter').addEventListener('change', applyFilters);
  $('sortFilter').addEventListener('change', applyFilters);

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      applyFilters();
    });
  });

  $('adminSearch').addEventListener('input', loadAdminList);

  $('passwordModal').addEventListener('click', e => {
    if (e.target === $('passwordModal')) {
      $('passwordModal').classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
