const { registerUser, loginUser, updateUser } = require('../services/auth.service.js');

async function register(req, res) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err) {
    const status = err.message === 'User not found' ? 404 : 401;
    res.status(status).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    // Authorization: user can only update self unless admin
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const user = await updateUser(req.params.id, req.body);
    res.json({ message: 'User updated successfully', user });
  } catch (err) {
    const status = err.message === 'User not found' ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
}

module.exports = { register, login, update };
