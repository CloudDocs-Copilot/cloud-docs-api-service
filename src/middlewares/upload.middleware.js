const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const HttpError = require('../models/error.model');

// Asegura que el directorio de cargas exista
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '5242880', 10); // 5MB por defecto
const ALLOWED = (process.env.ALLOWED_MIME_TYPES || 'application/pdf,image/png,image/jpeg,text/plain').split(',');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = crypto.randomUUID();
    cb(null, `${base}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED.includes(file.mimetype)) {
    return cb(new HttpError(400, 'Unsupported file type'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

module.exports = { upload };