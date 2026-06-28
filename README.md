# TeleDrive Self-Hosted MVP

Versi aman untuk storage file berbasis Telegram: user upload lewat web, server mengirim file ke private channel menggunakan Telegram Bot API, lalu metadata disimpan lokal.

Bedanya dengan app yang minta OTP Telegram:

- Tidak minta nomor HP, OTP, atau 2FA akun Telegram.
- Tidak menyimpan session akun pribadi.
- Cukup pakai bot token dan private channel sebagai storage.

## Setup

1. Buat bot via `@BotFather`.
2. Buat private channel/group khusus storage.
3. Tambahkan bot ke channel/group itu.
4. Isi `.env` dari `.env.example`.
5. Jalankan:

```bash
npm install
npm start
```

Buka `http://localhost:3000`.

## Fitur

- Upload file via web
- Folder/tag sederhana
- Search file
- List file seperti drive sederhana
- Download via server proxy, jadi bot token tidak tampil di URL browser
- Admin token opsional
- Dockerfile dan `docker-compose.yml`
- Healthcheck `/api/health`

## Easypanel

Deploy sebagai Docker app dari repo GitHub ini, lalu set environment:

- `BOT_TOKEN`
- `STORAGE_CHAT_ID`
- `ADMIN_TOKEN`
- `MAX_UPLOAD_MB`

Mount volume ke `/app/data` supaya metadata tidak hilang saat redeploy.

Recommended Easypanel settings:

- Build method: Dockerfile
- Internal port: `3000`
- Volume: `/app/data`
- Health path: `/api/health`

## Cara Mendapatkan `STORAGE_CHAT_ID`

1. Buat private channel/group.
2. Tambahkan bot sebagai member/admin.
3. Kirim satu pesan ke channel/group.
4. Ambil chat ID dengan salah satu cara:
   - Forward pesan ke bot seperti `@RawDataBot`
   - Atau panggil `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`

Chat ID private channel biasanya diawali `-100`.

## Catatan

Untuk MVP ini download memakai redirect ke file URL Telegram. Jika ingin mode premium nanti bisa ditambah:

- Login user
- Folder/tag/search
- Preview gambar/video
- Encryption sebelum upload
- Multi-bot atau MTProto untuk file besar
