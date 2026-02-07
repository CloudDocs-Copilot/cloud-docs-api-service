import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import HttpError from '../models/error.model';

/**
 * Configuración del middleware de subida de archivos
 * 
 * Utiliza Multer para manejar la subida de archivos con:
 * - Almacenamiento en disco con nombres aleatorios
 * - Validación de tipos MIME permitidos
 * - Límite de tamaño configurable
 */

// Asegura que el directorio de cargas exista
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '104857600', 10); // 100MB por defecto
const ALLOWED = (process.env.ALLOWED_MIME_TYPES || 
  'application/pdf,' +
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,image/bmp,' +
  'video/mp4,video/webm,video/ogg,video/quicktime,' +
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,' +
  'text/plain,text/csv,text/html,text/xml,text/css,text/javascript,' +
  'application/json,application/xml,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,' +
  'application/zip,application/x-rar-compressed'
).split(',');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Extraer extensión de forma segura
    const ext = path.extname(file.originalname || '').toLowerCase();
    
    // Validar que la extensión solo contiene caracteres permitidos
    if (ext && !/^\.[\w-]+$/.test(ext)) {
      return cb(new Error('Invalid file extension') as any, '');
    }
    
    // Generar nombre aleatorio seguro (solo UUID + extensión validada)
    const base = crypto.randomUUID();
    const safeFilename = `${base}${ext}`;
    
    cb(null, safeFilename);
  }
});

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  console.log(`[upload] Checking file type: ${file.mimetype}`);
  console.log(`[upload] Allowed types:`, ALLOWED);
  
  if (!ALLOWED.includes(file.mimetype)) {
    console.log(`[upload] ❌ File type ${file.mimetype} is NOT allowed`);
    return cb(new HttpError(400, 'Unsupported file type') as any);
  }
  
  console.log(`[upload] ✅ File type ${file.mimetype} is allowed`);
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

export default { upload };
