const authServices = require('../services/auth.service.js');

const HttpError = require('../models/error.model');

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    const user = await authServices.registerUser(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) {
      return next(new HttpError(409, 'Email already registered'));
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authServices.loginUser(req.body);
    res.json(result);
  } catch (err) {
    if (err.message === 'User not found') return next(new HttpError(404, 'Invalid credentials'));
    if (err.message === 'Invalid password') return next(new HttpError(401, 'Invalid credentials'));
    next(err);
  }
}

module.exports = { register, login };
