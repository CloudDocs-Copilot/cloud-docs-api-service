const bcrypt = require('bcryptjs');
const jwtService = require('./jwt.service.js');
const User = require('../models/user.model.js');

// Variables de entorno configurables
const {
  JWT_SECRET = 'change_me_dev',
  JWT_EXPIRES_IN = '1d',
  BCRYPT_SALT_ROUNDS = '10'
} = process.env;

async function registerUser({ name, email, password }) {
  const saltRounds = Number.parseInt(BCRYPT_SALT_ROUNDS, 10) || 10;
  const hashed = await bcrypt.hash(password, saltRounds);
  const user = await User.create({ name, email, password: hashed });
  return user;
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid password');
  const token = jwtService.signToken({
    id: user._id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion
  });
  return { token, user };
}

async function updateUser(id, { name, email, password }) {
  const update = { name, email };
  if (password) {
    const saltRounds = Number.parseInt(BCRYPT_SALT_ROUNDS, 10) || 10;
    update.password = await bcrypt.hash(password, saltRounds);
  }
  const user = await User.findByIdAndUpdate(id, update, { new: true });
  if (!user) throw new Error('Usuario no encontrado');
  return user;
}

module.exports = {
  registerUser,
  loginUser,
  updateUser
};
