const folderService = require('../services/folder.service.js');

async function create(req, res, next) {
  try {
    const folder = await folderService.createFolder({ name: req.body.name, owner: req.user.id });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const folders = await folderService.listFolders(req.user.id);
    res.json(folders);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const forceParam = (req.query && req.query.force) || 'false';
    const force = String(forceParam).toLowerCase() === 'true' || String(forceParam) === '1';
    const result = await folderService.deleteFolder({ id: req.params.id, owner: req.user.id, force });
    res.json({ message: 'Folder deleted successfully', ...result });
  } catch (err) {
    next(err);
  }
}

async function rename(req, res, next) {
  try {
    const folder = await folderService.renameFolder({ id: req.params.id, owner: req.user.id, name: req.body.name });
    res.json(folder);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, remove, rename };
