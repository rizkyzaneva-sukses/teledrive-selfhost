const tokenInput = document.querySelector('#tokenInput');
const folderInput = document.querySelector('#folderInput');
const searchInput = document.querySelector('#searchInput');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadForm = document.querySelector('#uploadForm');
const message = document.querySelector('#message');
const statusEl = document.querySelector('#status');
const folderTree = document.querySelector('#folderTree');
const folderList = document.querySelector('#folderList');
const fileList = document.querySelector('#fileList');
const refreshButton = document.querySelector('#refreshButton');
const rootButton = document.querySelector('#rootButton');
const breadcrumb = document.querySelector('#breadcrumb');
const currentTitle = document.querySelector('#currentTitle');

let allFiles = [];
let currentFolder = localStorage.getItem('currentFolder') || '';

tokenInput.value = localStorage.getItem('adminToken') || '';
folderInput.value = currentFolder;

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
    allFiles = await fetchJson('/api/files', { headers: getHeaders() });
    renderDrive();
  } catch (error) {
    folderTree.innerHTML = '';
    folderList.innerHTML = '';
    fileList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderDrive() {
  const folders = buildFolderSet(allFiles);
  const search = searchInput.value.trim().toLowerCase();

  folderInput.value = currentFolder;
  rootButton.classList.toggle('active', currentFolder === '');
  renderBreadcrumb();
  renderFolderTree(folders);

  if (search) {
    currentTitle.textContent = 'Search Results';
    folderList.innerHTML = '';
    const matches = allFiles.filter((file) => file.originalName.toLowerCase().includes(search));
    renderFiles(matches, `Tidak ada file untuk "${searchInput.value.trim()}".`);
    return;
  }

  currentTitle.textContent = currentFolder ? lastSegment(currentFolder) : 'My Drive';
  const childFolders = getChildFolders(folders, currentFolder);
  renderFolderCards(childFolders);

  const visibleFiles = allFiles.filter((file) => normalizeFolder(file.folder) === currentFolder);
  renderFiles(visibleFiles, 'Folder ini masih kosong.');
}

function buildFolderSet(files) {
  const folders = new Set();

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

function renderFiles(files, emptyMessage) {
  if (!files.length) {
    fileList.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  fileList.innerHTML = files.map((file) => `
    <article class="file-item">
      <div>
        <div class="file-name">${escapeHtml(file.originalName)}</div>
        <div class="file-meta">${formatBytes(file.size)} - ${new Date(file.createdAt).toLocaleString('id-ID')}</div>
        ${file.folder ? `<button class="file-folder" type="button" data-folder="${escapeHtml(normalizeFolder(file.folder))}">${escapeHtml(normalizeFolder(file.folder))}</button>` : ''}
      </div>
      <div class="file-actions">
        <a href="/api/files/${file.id}/download${tokenQuery()}" target="_blank" rel="noreferrer">Download</a>
        <button type="button" data-delete="${file.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

function setCurrentFolder(folder) {
  currentFolder = normalizeFolder(folder);
  localStorage.setItem('currentFolder', currentFolder);
  renderDrive();
}

function lastSegment(folder) {
  return folder.split('/').filter(Boolean).pop() || 'My Drive';
}

function tokenQuery() {
  const token = encodeURIComponent(tokenInput.value.trim());
  return token ? `?token=${token}` : '';
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
    formData.append('folder', normalizeFolder(folderInput.value || currentFolder));

    await fetchJson('/api/files', {
      method: 'POST',
      headers: getHeaders(),
      body: formData
    });

    uploadForm.reset();
    folderInput.value = currentFolder;
    fileLabel.textContent = 'Pilih file untuk upload';
    setMessage('Upload selesai.');
    await loadFiles();
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.addEventListener('click', async (event) => {
  const folder = event.target.closest('[data-folder]')?.dataset.folder;
  if (folder !== undefined) {
    setCurrentFolder(folder);
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
tokenInput.addEventListener('change', loadFiles);
searchInput.addEventListener('input', renderDrive);
folderInput.addEventListener('change', () => {
  folderInput.value = normalizeFolder(folderInput.value);
});

checkHealth();
loadFiles();
