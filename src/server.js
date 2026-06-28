require('dotenv').config();

const fs = require('fs/promises');
const createReadStream = require('fs').createReadStream;
const path = require('path');
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const DB_PATH = path.join(DATA_DIR, 'files.json');
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireConfig() {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) {
    const error = new Error('BOT_TOKEN and STORAGE_CHAT_ID must be configured');
    error.statusCode = 500;
    throw error;
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    next();
    return;
  }

  const providedToken =
    req.header('x-admin-token') ||
    req.query.token ||
    req.header('authorization')?.replace(/^Bearer\s+/i, '');

  if (providedToken !== ADMIN_TOKEN) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
    return;
  }

  next();
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, '[]\n', 'utf8');
  }
}

async function readFiles() {
  await ensureStorage();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeFiles(files) {
  await fs.writeFile(DB_PATH, `${JSON.stringify(files, null, 2)}\n`, 'utf8');
}

async function uploadToTelegram(file) {
  requireConfig();

  const form = new FormData();
  form.append('chat_id', STORAGE_CHAT_ID);
  form.append('caption', file.originalname);
  form.append('document', createReadStream(file.path), {
    filename: file.originalname,
    contentType: file.mimetype
  });

  const response = await axios.post(`${TELEGRAM_API}/sendDocument`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000
  });

  if (!response.data.ok) {
    throw new Error(response.data.description || 'Telegram upload failed');
  }

  const document = response.data.result.document;

  return {
    telegramFileId: document.file_id,
    telegramFileUniqueId: document.file_unique_id,
    messageId: response.data.result.message_id
  };
}

async function getTelegramFileUrl(fileId) {
  requireConfig();

  const response = await axios.get(`${TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
    timeout: 30000
  });

  if (!response.data.ok) {
    throw new Error(response.data.description || 'Telegram getFile failed');
  }

  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${response.data.result.file_path}`;
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: Boolean(BOT_TOKEN && STORAGE_CHAT_ID),
      maxUploadMb: MAX_UPLOAD_MB
    }
  });
});

app.get('/api/files', requireAdmin, async (req, res, next) => {
  try {
    const files = await readFiles();
    const search = String(req.query.search || '').trim().toLowerCase();
    const folder = String(req.query.folder || '').trim().toLowerCase();
    const filteredFiles = files.filter((file) => {
      const matchesSearch = search
        ? file.originalName.toLowerCase().includes(search)
        : true;
      const matchesFolder = folder
        ? String(file.folder || '').toLowerCase() === folder
        : true;

      return matchesSearch && matchesFolder;
    });

    res.json({
      success: true,
      data: filteredFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/files', requireAdmin, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'File is required'
    });
    return;
  }

  try {
    const telegramFile = await uploadToTelegram(req.file);
    const files = await readFiles();
    const storedFile = {
      id: uuidv4(),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      folder: String(req.body.folder || '').trim(),
      ...telegramFile,
      createdAt: new Date().toISOString()
    };

    await writeFiles([...files, storedFile]);

    res.status(201).json({
      success: true,
      data: storedFile
    });
  } catch (error) {
    next(error);
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

app.get('/api/files/:id/download', requireAdmin, async (req, res, next) => {
  try {
    const files = await readFiles();
    const file = files.find((item) => item.id === req.params.id);

    if (!file) {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
      return;
    }

    const url = await getTelegramFileUrl(file.telegramFileId);
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120000
    });

    res.setHeader('content-type', file.mimeType || 'application/octet-stream');
    res.setHeader('content-length', response.headers['content-length'] || file.size);
    res.setHeader(
      'content-disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`
    );

    response.data.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/files/:id', requireAdmin, async (req, res, next) => {
  try {
    const files = await readFiles();
    const nextFiles = files.filter((item) => item.id !== req.params.id);

    if (nextFiles.length === files.length) {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
      return;
    }

    await writeFiles(nextFiles);

    res.json({
      success: true,
      data: { id: req.params.id }
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message =
    error.code === 'LIMIT_FILE_SIZE'
      ? `File is larger than ${MAX_UPLOAD_MB}MB`
      : error.message || 'Internal server error';

  console.error(JSON.stringify({
    level: 'error',
    message,
    path: req.path,
    method: req.method
  }));

  res.status(statusCode).json({
    success: false,
    error: message
  });
});

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`TeleDrive Selfhost running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
