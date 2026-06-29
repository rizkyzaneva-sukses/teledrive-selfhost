const crypto = require('crypto');
const fs = require('fs/promises');
const { createReadStream } = require('fs');
const http = require('http');
const path = require('path');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const DATA_DIR = path.join(__dirname, '..', 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DB_PATH = path.join(DATA_DIR, 'files.json');
const FOLDERS_PATH = path.join(DATA_DIR, 'folders.json');
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, '[]\n', 'utf8');
  }

  try {
    await fs.access(FOLDERS_PATH);
  } catch {
    await fs.writeFile(FOLDERS_PATH, '[]\n', 'utf8');
  }
}

async function readFiles() {
  await ensureStorage();
  return JSON.parse(await fs.readFile(DB_PATH, 'utf8'));
}

async function writeFiles(files) {
  await fs.writeFile(DB_PATH, `${JSON.stringify(files, null, 2)}\n`, 'utf8');
}

async function readFolders() {
  await ensureStorage();
  return JSON.parse(await fs.readFile(FOLDERS_PATH, 'utf8'));
}

async function writeFolders(folders) {
  const uniqueFolders = [...new Set(folders.map(normalizeFolder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  await fs.writeFile(FOLDERS_PATH, `${JSON.stringify(uniqueFolders, null, 2)}\n`, 'utf8');
}

function normalizeFolder(value) {
  return String(value || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function getAdminToken(req, url) {
  const authHeader = req.headers.authorization || '';
  return (
    req.headers['x-admin-token'] ||
    url.searchParams.get('token') ||
    authHeader.replace(/^Bearer\s+/i, '')
  );
}

function isAuthorized(req, url) {
  return !ADMIN_TOKEN || getAdminToken(req, url) === ADMIN_TOKEN;
}

function requireConfig() {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) {
    const error = new Error('BOT_TOKEN and STORAGE_CHAT_ID must be configured');
    error.statusCode = 500;
    throw error;
  }
}

async function readRequestBody(req, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error(`File is larger than ${MAX_UPLOAD_MB}MB`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType || '');
  if (!boundaryMatch) {
    const error = new Error('Missing multipart boundary');
    error.statusCode = 400;
    throw error;
  }

  const boundary = `--${boundaryMatch[1].replace(/^"|"$/g, '')}`;
  const raw = buffer.toString('latin1');
  const fields = {};
  let file = null;
  let searchFrom = 0;

  while (true) {
    const partBoundary = raw.indexOf(boundary, searchFrom);
    if (partBoundary === -1) break;

    const nextBoundary = raw.indexOf(boundary, partBoundary + boundary.length);
    if (nextBoundary === -1) break;

    let partStart = partBoundary + boundary.length;
    if (raw.slice(partStart, partStart + 2) === '--') break;
    if (raw.slice(partStart, partStart + 2) === '\r\n') partStart += 2;

    const headerEnd = raw.indexOf('\r\n\r\n', partStart);
    if (headerEnd === -1 || headerEnd > nextBoundary) {
      searchFrom = nextBoundary;
      continue;
    }

    const headerRaw = raw.slice(partStart, headerEnd);
    const contentStart = headerEnd + 4;
    const contentEnd = raw.slice(nextBoundary - 2, nextBoundary) === '\r\n'
      ? nextBoundary - 2
      : nextBoundary;
    const content = buffer.subarray(contentStart, contentEnd);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerRaw)?.[1] || '';
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headerRaw)?.[1]?.trim() || 'application/octet-stream';

    if (name && filename !== undefined) {
      file = {
        originalName: path.basename(filename) || 'upload.bin',
        mimeType,
        size: content.length,
        buffer: content
      };
    } else if (name) {
      fields[name] = content.toString('utf8');
    }

    searchFrom = nextBoundary;
  }

  return { fields, file };
}

async function uploadToTelegram(file) {
  requireConfig();

  const form = new FormData();
  form.append('chat_id', STORAGE_CHAT_ID);
  form.append('caption', file.originalName);
  form.append('document', new Blob([file.buffer], { type: file.mimeType }), file.originalName);

  const response = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: form
  });
  const body = await response.json();

  if (!response.ok || !body.ok) {
    throw new Error(body.description || 'Telegram upload failed');
  }

  return {
    telegramFileId: body.result.document.file_id,
    telegramFileUniqueId: body.result.document.file_unique_id,
    messageId: body.result.message_id
  };
}

async function getTelegramFileUrl(fileId) {
  requireConfig();

  const response = await fetch(`${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const body = await response.json();

  if (!response.ok || !body.ok) {
    throw new Error(body.description || 'Telegram getFile failed');
  }

  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${body.result.file_path}`;
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { success: false, error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');

    res.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'content-length': stat.size
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { success: false, error: 'Not found' });
  }
}

async function handleApi(req, res, url) {
  if (!isAuthorized(req, url) && url.pathname !== '/api/health') {
    sendJson(res, 401, { success: false, error: 'Unauthorized' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      success: true,
      data: {
        configured: Boolean(BOT_TOKEN && STORAGE_CHAT_ID),
        maxUploadMb: MAX_UPLOAD_MB
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    const files = await readFiles();
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const folder = normalizeFolder(url.searchParams.get('folder') || '').toLowerCase();
    const filteredFiles = files.filter((file) => {
      const matchesSearch = search ? file.originalName.toLowerCase().includes(search) : true;
      const matchesFolder = folder ? normalizeFolder(file.folder).toLowerCase() === folder : true;
      return matchesSearch && matchesFolder;
    });

    sendJson(res, 200, {
      success: true,
      data: filteredFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/folders') {
    const [files, storedFolders] = await Promise.all([readFiles(), readFolders()]);
    const folderSet = new Set(storedFolders.map(normalizeFolder).filter(Boolean));

    for (const file of files) {
      const folder = normalizeFolder(file.folder);
      if (!folder) continue;

      const parts = folder.split('/');
      for (let index = 1; index <= parts.length; index += 1) {
        folderSet.add(parts.slice(0, index).join('/'));
      }
    }

    sendJson(res, 200, {
      success: true,
      data: [...folderSet].sort((a, b) => a.localeCompare(b))
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/folders') {
    const body = await readRequestBody(req, 1024 * 32);
    let payload;

    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      return;
    }

    const folder = normalizeFolder(payload.folder);
    if (!folder) {
      sendJson(res, 400, { success: false, error: 'Folder name is required' });
      return;
    }

    const folders = await readFolders();
    await writeFolders([...folders, folder]);
    sendJson(res, 201, { success: true, data: { folder } });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files') {
    const body = await readRequestBody(req, MAX_UPLOAD_BYTES + 1024 * 1024);
    const { fields, file } = parseMultipart(body, req.headers['content-type']);

    if (!file || !file.size) {
      sendJson(res, 400, { success: false, error: 'File is required' });
      return;
    }

    const telegramFile = await uploadToTelegram(file);
    const files = await readFiles();
    const storedFile = {
      id: crypto.randomUUID(),
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      folder: normalizeFolder(fields.folder),
      ...telegramFile,
      createdAt: new Date().toISOString()
    };

    if (storedFile.folder) {
      const folders = await readFolders();
      await writeFolders([...folders, storedFile.folder]);
    }

    await writeFiles([...files, storedFile]);
    sendJson(res, 201, { success: true, data: storedFile });
    return;
  }

  const downloadMatch = /^\/api\/files\/([^/]+)\/download$/.exec(url.pathname);
  if (req.method === 'GET' && downloadMatch) {
    const files = await readFiles();
    const file = files.find((item) => item.id === downloadMatch[1]);

    if (!file) {
      sendJson(res, 404, { success: false, error: 'File not found' });
      return;
    }

    const telegramUrl = await getTelegramFileUrl(file.telegramFileId);
    const response = await fetch(telegramUrl);

    if (!response.ok) {
      throw new Error(`Telegram download failed: HTTP ${response.status}`);
    }

    res.writeHead(200, {
      'content-type': file.mimeType || 'application/octet-stream',
      'content-disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`
    });
    Readable.fromWeb(response.body).pipe(res);
    return;
  }

  const deleteMatch = /^\/api\/files\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'DELETE' && deleteMatch) {
    const files = await readFiles();
    const nextFiles = files.filter((item) => item.id !== deleteMatch[1]);

    if (nextFiles.length === files.length) {
      sendJson(res, 404, { success: false, error: 'File not found' });
      return;
    }

    await writeFiles(nextFiles);
    sendJson(res, 200, { success: true, data: { id: deleteMatch[1] } });
    return;
  }

  sendJson(res, 404, { success: false, error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      path: url.pathname,
      method: req.method
    }));

    sendJson(res, error.statusCode || 500, {
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

ensureStorage()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`TeleDrive Selfhost running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
