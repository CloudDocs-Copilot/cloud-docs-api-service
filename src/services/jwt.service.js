const jwt = require('jsonwebtoken');

const { JWT_SECRET = 'change_me_dev', JWT_EXPIRES_IN = '1d' } = process.env;

function signToken(payload, options = {}) {
  return jwt.sign({ ...payload, tokenCreatedAt: new Date().toISOString() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    ...options
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken
};
