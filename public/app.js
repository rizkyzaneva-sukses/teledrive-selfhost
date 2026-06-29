const tokenInput = document.querySelector('#tokenInput');
const newFolderInput = document.querySelector('#newFolderInput');
const searchInput = document.querySelector('#searchInput');
const typeFilters = document.querySelector('#typeFilters');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadForm = document.querySelector('#uploadForm');
const folderForm = document.querySelector('#folderForm');
const message = document.querySelector('#message');
const statusEl = document.querySelector('#status');
const folderTree = document.querySelector('#folderTree');
const folderList = document.querySelector('#folderList');
const fileList = document.querySelector('#fileList');
const refreshButton = document.querySelector('#refreshButton');
const rootButton = document.querySelector('#rootButton');
const breadcrumb = document.querySelector('#breadcrumb');
const currentTitle = document.querySelector('#currentTitle');
const destinationText = document.querySelector('#destinationText');
const uploadButton = document.querySelector('#uploadButton');
const upButton = document.querySelector('#upButton');
const summaryText = document.querySelector('#summaryText');
const previewModal = document.querySelector('#previewModal');
const previewTitle = document.querySelector('#previewTitle');
const previewMeta = document.querySelector('#previewMeta');
const previewBody = document.querySelector('#previewBody');
const previewOpen = document.querySelector('#previewOpen');
const previewDownload = document.querySelector('#previewDownload');

let allFiles = [];
let allFolders = [];
let currentFolder = localStorage.getItem('currentFolder') || '';
let activeType = localStorage.getItem('activeType') || 'all';

tokenInput.value = localStorage.getItem('adminToken') || '';

function getHeaders() {
  const token = tokenInput.value.trim();
  return token ? { 'x-admin-token': token } : {};
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function normalizeFolder(value) {
  return String(value || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
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

async function loadFiles() {
  try {
    localStorage.setItem('adminToken', tokenInput.value.trim());
    const headers = getHeaders();
    [allFiles, allFolders] = await Promise.all([
      fetchJson('/api/files', { headers }),
      fetchJson('/api/folders', { headers })
    ]);
    renderDrive();
  } catch (error) {
    folderTree.innerHTML = '';
    folderList.innerHTML = '';
    fileList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderDrive() {
  const folders = buildFolderSet(allFiles, allFolders);
  const search = searchInput.value.trim().toLowerCase();
  const typeFilteredFiles = filterFilesByType(allFiles, activeType);

  rootButton.classList.toggle('active', currentFolder === '');
  renderTypeFilters();
  destinationText.textContent = `Upload masuk ke ${currentFolder ? currentFolder : 'My Drive'}`;
  uploadButton.textContent = `Upload ke ${currentFolder ? lastSegment(currentFolder) : 'My Drive'}`;
  upButton.disabled = currentFolder === '';
  renderBreadcrumb();
  renderFolderTree(folders);

  if (search) {
    currentTitle.textContent = 'Search Results';
    const folderMatches = folders.filter((folder) => folder.toLowerCase().includes(search));
    renderFolderCards(folderMatches);
    const matches = typeFilteredFiles.filter((file) => {
      const folder = normalizeFolder(file.folder).toLowerCase();
      return file.originalName.toLowerCase().includes(search) || folder.includes(search);
    });
    renderFiles(matches, `Tidak ada file untuk "${searchInput.value.trim()}".`);
    return;
  }

  currentTitle.textContent = currentFolder ? lastSegment(currentFolder) : 'My Drive';
  const childFolders = getChildFolders(folders, currentFolder);
  renderFolderCards(childFolders);

  const visibleFiles = typeFilteredFiles.filter((file) => normalizeFolder(file.folder) === currentFolder);
  renderFiles(visibleFiles, 'Folder ini masih kosong.');
}

function buildFolderSet(files, storedFolders) {
  const folders = new Set();

  for (const storedFolder of storedFolders) {
    const folder = normalizeFolder(storedFolder);
    if (!folder) continue;

    const parts = folder.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join('/'));
    }
  }

  for (const file of files) {
    const folder = normalizeFolder(file.folder);
    if (!folder) continue;

    const parts = folder.split('/');
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join('/'));
    }
  }

  return [...folders].sort((a, b) => a.localeCompare(b));
}

function getChildFolders(folders, parent) {
  const prefix = parent ? `${parent}/` : '';
  return folders.filter((folder) => {
    if (parent && !folder.startsWith(prefix)) return false;
    const rest = parent ? folder.slice(prefix.length) : folder;
    return rest && !rest.includes('/');
  });
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
    const active = folder === currentFolder ? ' active' : '';
    return `
      <button class="tree-item${active}" type="button" data-folder="${escapeHtml(folder)}" style="--depth:${depth}">
        ${escapeHtml(lastSegment(folder))}
      </button>
    `;
  }).join('');
}

function renderFolderCards(folders) {
  if (!folders.length) {
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

function renderFiles(files, emptyMessage) {
  renderSummary(files);

  if (!files.length) {
    fileList.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  fileList.innerHTML = files.map((file) => `
    <article class="file-item">
      <div class="file-main">
        <div class="file-kind">${escapeHtml(fileTypeLabel(file))}</div>
        <div class="file-name">${escapeHtml(file.originalName)}</div>
        <div class="file-meta">${formatBytes(file.size)} - ${new Date(file.createdAt).toLocaleString('id-ID')}</div>
        ${file.folder ? `<button class="file-folder" type="button" data-folder="${escapeHtml(normalizeFolder(file.folder))}">${escapeHtml(normalizeFolder(file.folder))}</button>` : ''}
      </div>
      <div class="file-actions">
        <button class="secondary" type="button" data-preview="${file.id}">Preview</button>
        <a href="/api/files/${file.id}/view${tokenQuery()}" target="_blank" rel="noreferrer">Open</a>
        <a href="/api/files/${file.id}/download${tokenQuery()}" target="_blank" rel="noreferrer">Download</a>
        <button type="button" data-delete="${file.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

function renderSummary(files) {
  const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const folderLabel = currentFolder ? lastSegment(currentFolder) : 'My Drive';
  const typeNames = {
    all: 'semua tipe',
    image: 'Images',
    video: 'Videos',
    document: 'Documents',
    other: 'Other'
  };
  const typeLabel = typeNames[activeType] || 'semua tipe';
  summaryText.textContent = `${files.length} file - ${formatBytes(totalSize)} - ${folderLabel} - ${typeLabel}`;
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
  const type = getFileType(file);
  const labels = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    other: 'Other'
  };
  return labels[type] || 'File';
}

function filterFilesByType(files, type) {
  if (type === 'all') return files;
  if (type === 'other') {
    return files.filter((file) => !['image', 'video', 'audio', 'document'].includes(getFileType(file)));
  }
  return files.filter((file) => getFileType(file) === type);
}

function setCurrentFolder(folder) {
  currentFolder = normalizeFolder(folder);
  localStorage.setItem('currentFolder', currentFolder);
  searchInput.value = '';
  renderDrive();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileLabel.textContent = file ? `${file.name} (${formatBytes(file.size)})` : 'Pilih file untuk upload';
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];
  if (!file) return;

  try {
    setMessage('Uploading...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', currentFolder);

    await fetchJson('/api/files', {
      method: 'POST',
      headers: getHeaders(),
      body: formData
    });

    uploadForm.reset();
    fileLabel.textContent = 'Pilih file untuk upload';
    setMessage('Upload selesai.');
    await loadFiles();
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
      headers: {
        ...getHeaders(),
        'content-type': 'application/json'
      },
      body: JSON.stringify({ folder })
    });

    newFolderInput.value = '';
    setMessage(`Folder "${lastSegment(folder)}" dibuat.`);
    await loadFiles();
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

  const folder = event.target.closest('[data-folder]')?.dataset.folder;
  if (folder !== undefined) {
    setCurrentFolder(folder);
    return;
  }

  const previewId = event.target.closest('[data-preview]')?.dataset.preview;
  if (previewId) {
    const file = allFiles.find((item) => item.id === previewId);
    if (file) openPreview(file);
    return;
  }

  const fileId = event.target.dataset.delete;
  if (!fileId) return;

  if (!confirm('Hapus metadata file ini? File di Telegram tidak ikut terhapus.')) return;

  try {
    await fetchJson(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await loadFiles();
  } catch (error) {
    setMessage(error.message, true);
  }
});

refreshButton.addEventListener('click', loadFiles);
rootButton.addEventListener('click', () => setCurrentFolder(''));
upButton.addEventListener('click', () => setCurrentFolder(parentFolder(currentFolder)));
tokenInput.addEventListener('change', loadFiles);
searchInput.addEventListener('input', renderDrive);
typeFilters.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-type-filter]')?.dataset.typeFilter;
  if (!filter) return;
  activeType = filter;
  localStorage.setItem('activeType', activeType);
  renderDrive();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePreview();
});

checkHealth();
loadFiles();
