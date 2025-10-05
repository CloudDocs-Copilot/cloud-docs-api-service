const Folder = require('../models/folder.model.js');
const User = require('../models/user.model.js');
const HttpError = require('../models/error.model');
const Document = require('../models/document.model.js');
const fs = require('fs');
const path = require('path');

function sanitizeDirName(name) {
  // Normaliza y elimina caracteres no seguros para Windows/Linux
  let s = String(name || '')
    .normalize('NFKD')
  .replace(/[<>:"/\\|?*]+/g, '-') // inválidos en Windows
  .replace(/[\x00-\x1F]+/g, '-') // caracteres de control
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .trim();
  // Quita puntos o guiones al inicio y al final
  s = s.replace(/^[\.-]+|[\.-]+$/g, '');
  // Nombres de dispositivos reservados en Windows
  const reserved = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1','com2','com3','com4','com5','com6','com7','com8','com9',
    'lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9'
  ]);
  if (!s || reserved.has(s)) s = `folder-${Date.now()}`;
  // Limita el largo para evitar problemas de ruta
  if (s.length > 50) s = s.slice(0, 50);
  return s;
}

async function createFolder({ name, owner }) {
  if (!name) throw new HttpError(400, 'Folder name is required');
  if (!owner) throw new HttpError(400, 'Owner is required');
  const exists = await User.exists({ _id: owner });
  if (!exists) throw new HttpError(404, 'Owner user not found');
  try {
    const folder = await Folder.create({ name, owner });
  // Crea el directorio en el sistema de archivos: storage/<owner>/<folderName>
    const baseDir = path.join(process.cwd(), 'storage');
    const ownerDir = path.join(baseDir, String(owner));
    const safe = sanitizeDirName(name);
    const folderDir = path.join(ownerDir, `${safe}-${folder._id}`);
    if (!fs.existsSync(ownerDir)) fs.mkdirSync(ownerDir, { recursive: true });
    if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });
    return folder;
  } catch (err) {
  // Error de clave duplicada para índice único (owner,name)
    if (err && err.code === 11000) {
      throw new HttpError(409, 'Folder name already exists for this user');
    }
    throw err;
  }
}

function listFolders(owner) {
  return Folder.find({ owner }).populate('documents');
}


async function deleteFolder({ id, owner, force = false }) {
  const folder = await Folder.findById(id);
  if (!folder) throw new HttpError(404, 'Folder not found');
  if (String(folder.owner) !== String(owner)) throw new HttpError(403, 'Forbidden');
  if (!force) {
    const hasDocs = await Document.exists({ folder: id });
    if (hasDocs) throw new HttpError(400, 'Folder is not empty');
  } else {
  // Forzar: elimina documentos en BD y sus archivos
    const docs = await Document.find({ folder: id });
    for (const doc of docs) {
      try {
        const uploadsPath = path.join(process.cwd(), 'uploads', doc.filename || '');
        const storagePath = path.join(process.cwd(), 'storage', doc.filename || '');
        if (doc.filename) {
          if (fs.existsSync(uploadsPath)) fs.unlinkSync(uploadsPath);
          else if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
        }
      } catch (e) {
        console.error('[force-delete-doc-file-error]', { id: doc._id, err: e.message });
      }
      await Document.findByIdAndDelete(doc._id);
    }
  }
  await Folder.findByIdAndDelete(id);
  // Elimina el directorio del sistema de archivos: storage/<owner>/*-<folderId>
  try {
    const baseDir = path.join(process.cwd(), 'storage');
    const ownerDir = path.join(baseDir, String(owner));
    const suffix = `-${folder._id}`;
    if (fs.existsSync(ownerDir)) {
      const entries = fs.readdirSync(ownerDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && ent.name.endsWith(suffix)) {
          const dirPath = path.join(ownerDir, ent.name);
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    console.error('[folder-fs-delete-error]', e);
  }
  return { success: true };
}
async function renameFolder({ id, owner, name }) {
  if (!name) throw new HttpError(400, 'Folder name is required');
  const folder = await Folder.findById(id);
  if (!folder) throw new HttpError(404, 'Folder not found');
  if (String(folder.owner) !== String(owner)) throw new HttpError(403, 'Forbidden');
  const oldSafe = sanitizeDirName(folder.name);
  const newSafe = sanitizeDirName(name);
  try {
  // Actualiza primero en BD para validar unicidad
    folder.name = name;
    await folder.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new HttpError(409, 'Folder name already exists for this user');
    }
    throw err;
  }
  // Mueve el directorio en el sistema de archivos
  try {
    const baseDir = path.join(process.cwd(), 'storage');
    const ownerDir = path.join(baseDir, String(owner));
    const oldDir = path.join(ownerDir, `${oldSafe}-${folder._id}`);
    const newDir = path.join(ownerDir, `${newSafe}-${folder._id}`);
    if (!fs.existsSync(ownerDir)) fs.mkdirSync(ownerDir, { recursive: true });
    if (oldDir === newDir) {
  // Nada que hacer
    } else if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    } else if (!fs.existsSync(newDir)) {
  // Si el dir antiguo no existe (legado), asegura que el nuevo exista
      fs.mkdirSync(newDir, { recursive: true });
    }
  } catch (e) {
    console.error('[folder-fs-rename-error]', e);
  }
  return folder;
}

module.exports = { createFolder, listFolders, deleteFolder, renameFolder };

