const userService = require('../services/user.service.js');
const HttpError = require('../models/error.model');

async function list(req, res, next) {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function activate(req, res, next) {
  try {
    const user = await userService.setUserActive(req.params.id, true);
    res.json({ message: 'User activated', user });
  } catch (err) {
    next(err);
  }
}

async function deactivate(req, res, next) {
  try {
    if (req.user.id === req.params.id) return next(new HttpError(400, 'Cannot deactivate self'));
    const user = await userService.setUserActive(req.params.id, false);
    res.json({ message: 'User deactivated', user });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    const { name, email } = req.body;
    if (!name || !email ) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    console.log(name, email);
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    const status = err.message === 'User not found' ? 404 : 400;
    next(new HttpError(status, err.message));
  }
}

async function changePassword(req, res, next) {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    const result = await userService.changePassword(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    const status = err.message === 'User not found' ? 404 : err.message.includes('incorrect') ? 401 : 400;
    next(new HttpError(status, err.message));
  }
}

async function remove(req, res, next) {
  try {
    if (req.user && req.user.id === req.params.id) {
      return next(new HttpError(400, 'Cannot delete self')); // resguardo de seguridad
    }
    const user = await userService.deleteUser(req.params.id);
    res.json({ message: 'User deleted', user });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, activate, deactivate, update, changePassword, remove };
