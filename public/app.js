const tokenInput = document.querySelector('#tokenInput');
const loginScreen = document.querySelector('#loginScreen');
const loginForm = document.querySelector('#loginForm');
const loginTokenInput = document.querySelector('#loginTokenInput');
const loginMessage = document.querySelector('#loginMessage');
const newFolderInput = document.querySelector('#newFolderInput');
const searchInput = document.querySelector('#searchInput');
const sortSelect = document.querySelector('#sortSelect');
const typeFilters = document.querySelector('#typeFilters');
const viewToggle = document.querySelector('#viewToggle');
const modeNav = document.querySelector('#modeNav');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadTagsInput = document.querySelector('#uploadTagsInput');
const uploadForm = document.querySelector('#uploadForm');
const folderForm = document.querySelector('#folderForm');
const message = document.querySelector('#message');
const statusEl = document.querySelector('#status');
const folderTree = document.querySelector('#folderTree');
const folderList = document.querySelector('#folderList');
const fileList = document.querySelector('#fileList');
const activityList = document.querySelector('#activityList');
const refreshButton = document.querySelector('#refreshButton');
const rootButton = document.querySelector('#rootButton');
const breadcrumb = document.querySelector('#breadcrumb');
const currentTitle = document.querySelector('#currentTitle');
const destinationText = document.querySelector('#destinationText');
const uploadButton = document.querySelector('#uploadButton');
const upButton = document.querySelector('#upButton');
const renameFolderButton = document.querySelector('#renameFolderButton');
const deleteFolderButton = document.querySelector('#deleteFolderButton');
const summaryText = document.querySelector('#summaryText');
const previewModal = document.querySelector('#previewModal');
const previewTitle = document.querySelector('#previewTitle');
const previewMeta = document.querySelector('#previewMeta');
const previewBody = document.querySelector('#previewBody');
const previewOpen = document.querySelector('#previewOpen');
const previewDownload = document.querySelector('#previewDownload');

let allFiles = [];
let allFolders = [];
let trashFiles = [];
let activityItems = [];
let currentFolder = localStorage.getItem('currentFolder') || '';
let activeType = localStorage.getItem('activeType') || 'all';
let activeMode = localStorage.getItem('activeMode') || 'drive';
let activeView = localStorage.getItem('activeView') || 'list';
let activeSort = localStorage.getItem('activeSort') || 'newest';

tokenInput.value = localStorage.getItem('adminToken') || '';
loginTokenInput.value = tokenInput.value;
sortSelect.value = activeSort;

function getHeaders(extra = {}) {
  const token = tokenInput.value.trim();
  return {
    ...(token ? { 'x-admin-token': token } : {}),
    ...extra
  };
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function setLoginMessage(text, isError = false) {
  loginMessage.textContent = text;
  loginMessage.classList.toggle('error', isError);
}

function setLoggedIn(isLoggedIn) {
  loginScreen.classList.toggle('hidden', isLoggedIn);
}

function normalizeFolder(value) {
  return String(value || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('id-ID') : '-';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();

  if (!response.ok || !body.success) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return body.data;
}

async function checkHealth() {
  try {
    const health = await fetchJson('/api/health');
    statusEl.textContent = health.configured ? 'Ready' : 'Need config';
  } catch {
    statusEl.textContent = 'Offline';
  }
}

async function loadData({ quiet = false } = {}) {
  try {
    localStorage.setItem('adminToken', tokenInput.value.trim());
    const headers = getHeaders();
    [allFiles, allFolders, trashFiles, activityItems] = await Promise.all([
      fetchJson('/api/files', { headers }),
      fetchJson('/api/folders', { headers }),
      fetchJson('/api/trash', { headers }),
      fetchJson('/api/activity', { headers })
    ]);
    setLoggedIn(true);
    renderApp();
  } catch (error) {
    if (!quiet) setLoginMessage(error.message, true);
    folderTree.innerHTML = '';
    folderList.innerHTML = '';
    fileList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderApp() {
  const folders = buildFolderSet(allFiles, allFolders);

  renderModeNav();
  renderTypeFilters();
  renderViewToggle();
  renderBreadcrumb();
  renderFolderTree(folders);

  rootButton.classList.toggle('active', currentFolder === '' && activeMode === 'drive');
  upButton.disabled = currentFolder === '' || activeMode !== 'drive';
  renameFolderButton.disabled = currentFolder === '' || activeMode !== 'drive';
  deleteFolderButton.disabled = currentFolder === '' || activeMode !== 'drive';

  activityList.innerHTML = '';
  folderList.innerHTML = '';
  fileList.classList.toggle('gallery-view', activeView === 'gallery');

  if (activeMode === 'activity') {
    renderActivity();
    return;
  }

  const files = getVisibleFiles(folders);
  renderFiles(files, emptyMessageForMode());
}

function getVisibleFiles(folders) {
  const search = searchInput.value.trim().toLowerCase();
  let files = activeMode === 'trash' ? trashFiles : allFiles;

  if (activeMode === 'drive') {
    currentTitle.textContent = currentFolder ? lastSegment(currentFolder) : 'My Drive';
    destinationText.textContent = `Upload masuk ke ${currentFolder ? currentFolder : 'My Drive'}`;
    uploadButton.textContent = `Upload ${fileInput.files.length || ''} ke ${currentFolder ? lastSegment(currentFolder) : 'My Drive'}`.replace('  ', ' ');
    renderFolderCards(getChildFolders(folders, currentFolder));
    files = files.filter((file) => normalizeFolder(file.folder) === currentFolder);
  } else if (activeMode === 'recent') {
    currentTitle.textContent = 'Recent Files';
    destinationText.textContent = 'File terbaru dari semua folder';
    files = [...files].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 60);
  } else if (activeMode === 'trash') {
    currentTitle.textContent = 'Trash';
    destinationText.textContent = 'File yang dihapus dari web app bisa direstore';
  }

  files = filterFilesByType(files, activeType);

  if (search) {
    const folderMatches = folders.filter((folder) => folder.toLowerCase().includes(search));
    if (activeMode !== 'trash') renderFolderCards(folderMatches);
    files = files.filter((file) => searchHaystack(file).includes(search));
  }

  return sortFiles(files, activeSort);
}

function emptyMessageForMode() {
  if (activeMode === 'trash') return 'Trash masih kosong.';
  if (activeMode === 'recent') return 'Belum ada file terbaru.';
  return 'Folder ini masih kosong.';
}

function searchHaystack(file) {
  return [
    file.originalName,
    file.folder,
    file.mimeType,
    getFileType(file),
    fileTypeLabel(file),
    formatDate(file.createdAt),
    ...(file.tags || [])
  ].join(' ').toLowerCase();
}

function sortFiles(files, sort) {
  const sorted = [...files];
  const byDate = (key) => (a, b) => new Date(b[key] || b.createdAt) - new Date(a[key] || a.createdAt);

  if (sort === 'oldest') sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort === 'name-asc') sorted.sort((a, b) => a.originalName.localeCompare(b.originalName));
  else if (sort === 'name-desc') sorted.sort((a, b) => b.originalName.localeCompare(a.originalName));
  else if (sort === 'size-desc') sorted.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  else if (sort === 'size-asc') sorted.sort((a, b) => Number(a.size || 0) - Number(b.size || 0));
  else if (sort === 'type') sorted.sort((a, b) => getFileType(a).localeCompare(getFileType(b)));
  else sorted.sort(activeMode === 'trash' ? byDate('deletedAt') : byDate('createdAt'));

  return sorted;
}

function buildFolderSet(files, storedFolders) {
  const folders = new Set();

  for (const storedFolder of storedFolders) addFolderParts(folders, storedFolder);
  for (const file of files) addFolderParts(folders, file.folder);

  return [...folders].sort((a, b) => a.localeCompare(b));
}

function addFolderParts(folders, value) {
  const folder = normalizeFolder(value);
  if (!folder) return;
  const parts = folder.split('/');
  for (let index = 1; index <= parts.length; index += 1) {
    folders.add(parts.slice(0, index).join('/'));
  }
}

function getChildFolders(folders, parent) {
  const prefix = parent ? `${parent}/` : '';
  return folders.filter((folder) => {
    if (parent && !folder.startsWith(prefix)) return false;
    const rest = parent ? folder.slice(prefix.length) : folder;
    return rest && !rest.includes('/');
  });
}

function renderModeNav() {
  for (const button of modeNav.querySelectorAll('[data-mode]')) {
    button.classList.toggle('active', button.dataset.mode === activeMode);
  }
}

function renderBreadcrumb() {
  const parts = currentFolder ? currentFolder.split('/') : [];
  const items = [
    '<button type="button" data-folder="">My Drive</button>',
    ...parts.map((part, index) => {
      const folder = parts.slice(0, index + 1).join('/');
      return `<button type="button" data-folder="${escapeHtml(folder)}">${escapeHtml(part)}</button>`;
    })
  ];

  breadcrumb.innerHTML = items.join('<span>/</span>');
}

function renderFolderTree(folders) {
  if (!folders.length) {
    folderTree.innerHTML = '<div class="tree-empty">Belum ada folder</div>';
    return;
  }

  folderTree.innerHTML = folders.map((folder) => {
    const depth = folder.split('/').length - 1;
    const active = folder === currentFolder && activeMode === 'drive' ? ' active' : '';
    return `
      <button class="tree-item${active}" type="button" data-folder="${escapeHtml(folder)}" style="--depth:${depth}">
        ${escapeHtml(lastSegment(folder))}
      </button>
    `;
  }).join('');
}

function renderFolderCards(folders) {
  if (activeMode !== 'drive' || !folders.length) {
    folderList.innerHTML = '';
    return;
  }

  folderList.innerHTML = folders.map((folder) => `
    <button class="folder-card" type="button" data-folder="${escapeHtml(folder)}">
      <span class="folder-icon">Folder</span>
      <strong>${escapeHtml(lastSegment(folder))}</strong>
      <small>${escapeHtml(folder)}</small>
    </button>
  `).join('');
}

function renderTypeFilters() {
  for (const button of typeFilters.querySelectorAll('[data-type-filter]')) {
    button.classList.toggle('active', button.dataset.typeFilter === activeType);
  }
}

function renderViewToggle() {
  for (const button of viewToggle.querySelectorAll('[data-view]')) {
    button.classList.toggle('active', button.dataset.view === activeView);
  }
}

function renderFiles(files, emptyMessage) {
  renderSummary(files);

  if (!files.length) {
    fileList.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  fileList.innerHTML = files.map((file) => activeView === 'gallery' ? renderGalleryItem(file) : renderListItem(file)).join('');
}

function renderListItem(file) {
  const isTrash = activeMode === 'trash';
  return `
    <article class="file-item">
      <div class="file-main">
        <div class="file-kind">${escapeHtml(fileTypeLabel(file))}</div>
        <div class="file-name">${escapeHtml(file.originalName)}</div>
        <div class="file-meta">${formatBytes(file.size)} - ${formatDate(file.createdAt)}${isTrash ? ` - deleted ${formatDate(file.deletedAt)}` : ''}</div>
        ${renderTags(file)}
        ${file.folder ? `<button class="file-folder" type="button" data-folder="${escapeHtml(normalizeFolder(file.folder))}">${escapeHtml(normalizeFolder(file.folder))}</button>` : ''}
      </div>
      <div class="file-actions">${renderFileActions(file)}</div>
    </article>
  `;
}

function renderGalleryItem(file) {
  const previewAttr = activeMode === 'trash' ? '' : ` data-preview="${file.id}"`;
  return `
    <article class="gallery-item">
      <button class="gallery-thumb" type="button"${previewAttr}>
        ${activeMode === 'trash' ? '<span>Trash</span>' : renderThumbnail(file)}
      </button>
      <div class="gallery-info">
        <strong>${escapeHtml(file.originalName)}</strong>
        <span>${formatBytes(file.size)} - ${fileTypeLabel(file)}</span>
        ${renderTags(file)}
      </div>
      <div class="file-actions compact">${renderFileActions(file)}</div>
    </article>
  `;
}

function renderThumbnail(file) {
  const type = getFileType(file);
  if (type === 'image') {
    return `<img src="${viewUrl(file)}" alt="${escapeHtml(file.originalName)}" loading="lazy">`;
  }
  if (type === 'video') {
    return `<video src="${viewUrl(file)}" muted preload="metadata"></video><span>Video</span>`;
  }
  if (String(file.mimeType || '').toLowerCase().includes('pdf') || /\.pdf$/i.test(file.originalName)) {
    return '<span>PDF</span>';
  }
  return `<span>${escapeHtml(fileTypeLabel(file))}</span>`;
}

function renderTags(file) {
  if (!file.tags?.length) return '';
  return `<div class="tags">${file.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function renderFileActions(file) {
  if (activeMode === 'trash') {
    return `
      <button class="secondary" type="button" data-restore="${file.id}">Restore</button>
      <button type="button" data-trash-delete="${file.id}">Delete Forever</button>
    `;
  }

  return `
    <button class="secondary" type="button" data-preview="${file.id}">Preview</button>
    <button class="secondary" type="button" data-edit-file="${file.id}">Edit</button>
    <a href="${viewUrl(file)}" target="_blank" rel="noreferrer">Open</a>
    <a href="${downloadUrl(file)}" target="_blank" rel="noreferrer">Download</a>
    <button type="button" data-delete="${file.id}">Trash</button>
  `;
}

function renderSummary(files) {
  const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const folderLabel = activeMode === 'drive' ? (currentFolder ? lastSegment(currentFolder) : 'My Drive') : currentTitle.textContent;
  const typeNames = {
    all: 'semua tipe',
    image: 'Images',
    video: 'Videos',
    document: 'Documents',
    other: 'Other'
  };
  summaryText.textContent = `${files.length} file - ${formatBytes(totalSize)} - ${folderLabel} - ${typeNames[activeType] || 'semua tipe'}`;
}

function renderActivity() {
  currentTitle.textContent = 'Activity Log';
  destinationText.textContent = 'Riwayat upload, rename, move, delete, dan restore';
  summaryText.textContent = `${activityItems.length} activity terakhir`;
  fileList.innerHTML = '';
  folderList.innerHTML = '';
  activityList.innerHTML = activityItems.length ? activityItems.map((item) => `
    <article class="activity-item">
      <strong>${escapeHtml(activityLabel(item.action))}</strong>
      <span>${formatDate(item.createdAt)}</span>
      <small>${escapeHtml(activityDetails(item.details || {}))}</small>
    </article>
  `).join('') : '<div class="empty">Belum ada activity.</div>';
}

function activityLabel(action) {
  return String(action || '').replaceAll('_', ' ');
}

function activityDetails(details) {
  return [
    details.name,
    details.folder,
    details.fromName && details.toName ? `${details.fromName} -> ${details.toName}` : '',
    details.fromFolder && details.toFolder ? `${details.fromFolder || 'My Drive'} -> ${details.toFolder || 'My Drive'}` : '',
    details.from && details.to ? `${details.from} -> ${details.to}` : ''
  ].filter(Boolean).join(' | ') || '-';
}

function getFileType(file) {
  const mime = String(file.mimeType || '').toLowerCase();
  const name = String(file.originalName || '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation') ||
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(name)
  ) {
    return 'document';
  }

  return 'other';
}

function fileTypeLabel(file) {
  const labels = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    other: 'Other'
  };
  return labels[getFileType(file)] || 'File';
}

function filterFilesByType(files, type) {
  if (type === 'all') return files;
  if (type === 'other') {
    return files.filter((file) => !['image', 'video', 'audio', 'document'].includes(getFileType(file)));
  }
  return files.filter((file) => getFileType(file) === type);
}

function setCurrentFolder(folder) {
  activeMode = 'drive';
  currentFolder = normalizeFolder(folder);
  localStorage.setItem('activeMode', activeMode);
  localStorage.setItem('currentFolder', currentFolder);
  searchInput.value = '';
  renderApp();
}

function setMode(mode) {
  activeMode = mode;
  localStorage.setItem('activeMode', activeMode);
  renderApp();
}

function parentFolder(folder) {
  const parts = normalizeFolder(folder).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function lastSegment(folder) {
  return folder.split('/').filter(Boolean).pop() || 'My Drive';
}

function tokenQuery() {
  const token = encodeURIComponent(tokenInput.value.trim());
  return token ? `?token=${token}` : '';
}

function viewUrl(file) {
  return `/api/files/${file.id}/view${tokenQuery()}`;
}

function downloadUrl(file) {
  return `/api/files/${file.id}/download${tokenQuery()}`;
}

function fileById(id) {
  return [...allFiles, ...trashFiles].find((item) => item.id === id);
}

function openPreview(file) {
  const source = viewUrl(file);
  const type = getFileType(file);

  previewTitle.textContent = file.originalName;
  previewMeta.textContent = `${fileTypeLabel(file)} - ${formatBytes(file.size)} - ${file.folder ? normalizeFolder(file.folder) : 'My Drive'}`;
  previewOpen.href = source;
  previewDownload.href = downloadUrl(file);

  if (type === 'image') {
    previewBody.innerHTML = `<img src="${source}" alt="${escapeHtml(file.originalName)}">`;
  } else if (type === 'video') {
    previewBody.innerHTML = `<video src="${source}" controls playsinline></video>`;
  } else if (type === 'audio') {
    previewBody.innerHTML = `<audio src="${source}" controls></audio>`;
  } else if (String(file.mimeType || '').toLowerCase().includes('pdf') || /\.pdf$/i.test(file.originalName)) {
    previewBody.innerHTML = `<iframe src="${source}" title="${escapeHtml(file.originalName)}"></iframe>`;
  } else {
    previewBody.innerHTML = `
      <div class="preview-empty">
        <strong>Preview belum tersedia untuk tipe file ini.</strong>
        <span>Pakai Open tab atau Download untuk membuka file.</span>
      </div>
    `;
  }

  previewModal.classList.add('open');
  previewModal.setAttribute('aria-hidden', 'false');
}

function closePreview() {
  previewModal.classList.remove('open');
  previewModal.setAttribute('aria-hidden', 'true');
  previewBody.innerHTML = '';
}

async function patchFile(file, payload) {
  await fetchJson(`/api/files/${file.id}`, {
    method: 'PATCH',
    headers: getHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  await loadData({ quiet: true });
}

async function editFile(file) {
  const nextName = prompt('Nama file', file.originalName);
  if (nextName === null) return;
  const nextFolder = prompt('Folder tujuan. Kosong = My Drive', normalizeFolder(file.folder));
  if (nextFolder === null) return;
  const nextTags = prompt('Tags, pisahkan koma', (file.tags || []).join(', '));
  if (nextTags === null) return;

  await patchFile(file, {
    name: nextName,
    folder: normalizeFolder(nextFolder),
    tags: normalizeTags(nextTags)
  });
  setMessage('File diperbarui.');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  tokenInput.value = loginTokenInput.value.trim();
  setLoginMessage('Checking...');
  await loadData();
});

fileInput.addEventListener('change', () => {
  const files = [...fileInput.files];
  const total = files.reduce((sum, file) => sum + file.size, 0);
  fileLabel.textContent = files.length
    ? `${files.length} file dipilih (${formatBytes(total)})`
    : 'Pilih satu atau banyak file untuk upload';
  renderApp();
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = [...fileInput.files];
  if (!files.length) return;

  try {
    const tags = uploadTagsInput.value;
    for (let index = 0; index < files.length; index += 1) {
      setMessage(`Uploading ${index + 1}/${files.length}: ${files[index].name}`);
      const formData = new FormData();
      formData.append('file', files[index]);
      formData.append('folder', currentFolder);
      formData.append('tags', tags);

      await fetchJson('/api/files', {
        method: 'POST',
        headers: getHeaders(),
        body: formData
      });
    }

    uploadForm.reset();
    fileLabel.textContent = 'Pilih satu atau banyak file untuk upload';
    setMessage(`${files.length} file selesai diupload.`);
    await loadData({ quiet: true });
  } catch (error) {
    setMessage(error.message, true);
  }
});

folderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const folderName = normalizeFolder(newFolderInput.value);
  if (!folderName) return;

  const folder = normalizeFolder([currentFolder, folderName].filter(Boolean).join('/'));

  try {
    await fetchJson('/api/folders', {
      method: 'POST',
      headers: getHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ folder })
    });
    newFolderInput.value = '';
    setMessage(`Folder "${lastSegment(folder)}" dibuat.`);
    await loadData({ quiet: true });
    setCurrentFolder(folder);
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-preview-close]')) {
    closePreview();
    return;
  }

  const mode = event.target.closest('[data-mode]')?.dataset.mode;
  if (mode) {
    setMode(mode);
    return;
  }

  const folder = event.target.closest('[data-folder]')?.dataset.folder;
  if (folder !== undefined) {
    setCurrentFolder(folder);
    return;
  }

  const previewId = event.target.closest('[data-preview]')?.dataset.preview;
  if (previewId) {
    const file = fileById(previewId);
    if (file) openPreview(file);
    return;
  }

  const editId = event.target.closest('[data-edit-file]')?.dataset.editFile;
  if (editId) {
    const file = fileById(editId);
    if (file) await editFile(file);
    return;
  }

  const restoreId = event.target.closest('[data-restore]')?.dataset.restore;
  if (restoreId) {
    await fetchJson(`/api/trash/${restoreId}/restore`, { method: 'POST', headers: getHeaders() });
    await loadData({ quiet: true });
    setMessage('File direstore.');
    return;
  }

  const trashDeleteId = event.target.closest('[data-trash-delete]')?.dataset.trashDelete;
  if (trashDeleteId) {
    if (!confirm('Hapus metadata ini permanen dari trash? File di Telegram tetap tidak ikut terhapus.')) return;
    await fetchJson(`/api/trash/${trashDeleteId}`, { method: 'DELETE', headers: getHeaders() });
    await loadData({ quiet: true });
    return;
  }

  const fileId = event.target.closest('[data-delete]')?.dataset.delete;
  if (!fileId) return;

  if (!confirm('Pindahkan metadata file ini ke Trash? File di Telegram tidak ikut terhapus.')) return;

  try {
    await fetchJson(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await loadData({ quiet: true });
    setMessage('File masuk Trash.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

refreshButton.addEventListener('click', () => loadData({ quiet: true }));
rootButton.addEventListener('click', () => setCurrentFolder(''));
upButton.addEventListener('click', () => setCurrentFolder(parentFolder(currentFolder)));
tokenInput.addEventListener('change', () => {
  loginTokenInput.value = tokenInput.value;
  loadData();
});
searchInput.addEventListener('input', renderApp);
sortSelect.addEventListener('change', () => {
  activeSort = sortSelect.value;
  localStorage.setItem('activeSort', activeSort);
  renderApp();
});
typeFilters.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-type-filter]')?.dataset.typeFilter;
  if (!filter) return;
  activeType = filter;
  localStorage.setItem('activeType', activeType);
  renderApp();
});
viewToggle.addEventListener('click', (event) => {
  const view = event.target.closest('[data-view]')?.dataset.view;
  if (!view) return;
  activeView = view;
  localStorage.setItem('activeView', activeView);
  renderApp();
});
renameFolderButton.addEventListener('click', async () => {
  if (!currentFolder) return;
  const nextFolder = normalizeFolder(prompt('Nama/path folder baru', currentFolder));
  if (!nextFolder || nextFolder === currentFolder) return;

  await fetchJson('/api/folders', {
    method: 'PATCH',
    headers: getHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ folder: currentFolder, nextFolder })
  });
  await loadData({ quiet: true });
  setCurrentFolder(nextFolder);
  setMessage('Folder diperbarui.');
});
deleteFolderButton.addEventListener('click', async () => {
  if (!currentFolder) return;
  if (!confirm('Delete folder kosong ini? Kalau masih ada file/subfolder, server akan menolak.')) return;

  try {
    await fetchJson(`/api/folders?folder=${encodeURIComponent(currentFolder)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    setMessage('Folder dihapus.');
    await loadData({ quiet: true });
    setCurrentFolder(parentFolder(currentFolder));
  } catch (error) {
    setMessage(error.message, true);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePreview();
});

checkHealth();
if (tokenInput.value.trim()) {
  loadData({ quiet: true });
} else {
  setLoggedIn(false);
}
