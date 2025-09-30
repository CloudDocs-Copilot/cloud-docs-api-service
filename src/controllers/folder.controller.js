const folderService = require('../services/folder.service.js');

async function create(req, res) {
  try {
    const folder = await folderService.createFolder({ name: req.body.name, owner: req.user.id });
    res.status(201).json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function list(req, res) {
  const folders = await folderService.listFolders(req.user.id);
  res.json(folders);
}

module.exports = { create, list };
