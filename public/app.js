const tokenInput = document.querySelector('#tokenInput');
const folderInput = document.querySelector('#folderInput');
const searchInput = document.querySelector('#searchInput');
const folderFilterInput = document.querySelector('#folderFilterInput');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadForm = document.querySelector('#uploadForm');
const message = document.querySelector('#message');
const statusEl = document.querySelector('#status');
const fileList = document.querySelector('#fileList');
const refreshButton = document.querySelector('#refreshButton');

tokenInput.value = localStorage.getItem('adminToken') || '';

function getHeaders() {
  const token = tokenInput.value.trim();
  return token ? { 'x-admin-token': token } : {};
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
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
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (folderFilterInput.value.trim()) params.set('folder', folderFilterInput.value.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const files = await fetchJson(`/api/files${suffix}`, { headers: getHeaders() });

    if (!files.length) {
      fileList.innerHTML = '<div class="empty">Belum ada file.</div>';
      return;
    }

    fileList.innerHTML = files.map((file) => `
      <article class="file-item">
        <div>
          <div class="file-name">${escapeHtml(file.originalName)}</div>
          <div class="file-meta">${formatBytes(file.size)} - ${new Date(file.createdAt).toLocaleString('id-ID')}</div>
          ${file.folder ? `<div class="file-folder">${escapeHtml(file.folder)}</div>` : ''}
        </div>
        <div class="file-actions">
          <a href="/api/files/${file.id}/download${tokenQuery()}" target="_blank" rel="noreferrer">Download</a>
          <button type="button" data-delete="${file.id}">Delete</button>
        </div>
      </article>
    `).join('');
  } catch (error) {
    fileList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
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
    formData.append('folder', folderInput.value.trim());

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

fileList.addEventListener('click', async (event) => {
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
tokenInput.addEventListener('change', loadFiles);
searchInput.addEventListener('input', loadFiles);
folderFilterInput.addEventListener('input', loadFiles);

checkHealth();
loadFiles();
