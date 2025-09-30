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
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;

  if (password) {
    const saltRounds = Number.parseInt(BCRYPT_SALT_ROUNDS, 10) || 10;
    user.password = await bcrypt.hash(password, saltRounds);
    user.lastPasswordChange = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate existing tokens
  }

  await user.save();
  return user;
}

module.exports = {
  registerUser,
  loginUser,
  updateUser,
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new Error('Current password is incorrect');
    const saltRounds = Number.parseInt(BCRYPT_SALT_ROUNDS, 10) || 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    user.lastPasswordChange = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    return { message: 'Password updated successfully' };
  }
};
