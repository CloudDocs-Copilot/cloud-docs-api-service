const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  active: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  lastPasswordChange: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);