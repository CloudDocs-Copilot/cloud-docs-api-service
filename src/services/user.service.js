const User = require('../models/user.model.js');
const HttpError = require('../models/error.model');

async function getAllUsers() {
  // Retorna todos los usuarios (la contraseña se elimina por la transformación del esquema)
  return User.find();
}

async function setUserActive(id, active) {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.active === active) return user; // sin cambios
  user.active = active;
  // Al actualizar el usuario, se actualiza updatedAt (esto invalida tokens de ese usuario)
  await user.save();
  return user;
}

async function updateUser(id, { name, email }) {
  
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
 
  await user.save();
  return user;
}

async function changePassword(id, { currentPassword, newPassword }) {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  const bcrypt = require('bcryptjs');
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new HttpError(401, 'Current password is incorrect');
  const saltRounds = 10;
  user.password = await bcrypt.hash(newPassword, saltRounds);
  user.lastPasswordChange = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  return { message: 'Password updated successfully' };
}
module.exports = { getAllUsers, setUserActive, updateUser, changePassword };
// Servicio de borrado duro de usuario
async function deleteUser(id) {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

module.exports.deleteUser = deleteUser;
