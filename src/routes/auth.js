import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { sendConfirmationEmail } from '../services/emailService.js';
import Profile from '../models/profile.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();
// Endpoint para confirmar el email (debe ir después de la inicialización de router)
router.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const decoded = jwt.verify(token, 'secret');
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).send('Usuario no encontrado.');
    }
    if (user.confirmed) {
      return res.send('Tu cuenta ya está confirmada.');
    }
    user.confirmed = true;
    await user.save();
    // Crear perfil básico si no existe
    const existingProfile = await Profile.findOne({ user: user._id });
    if (!existingProfile) {
      await Profile.create({ user: user._id, name: user.name });
    }
    res.send('¡Cuenta confirmada exitosamente! Ya puedes iniciar sesión.');
  } catch (err) {
    res.status(400).send('Enlace de confirmación inválido o expirado.');
  }
});

router.post('/register', async (req, res) => {
  console.log('POST /register recibido');
  console.log('req.body:', req.body);
  try {
    const { name, email, password, confirmPassword } = req.body;
    // Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }
    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    // Generar token de confirmación (JWT simple)
    const token = jwt.sign({ userId: user._id }, 'secret', { expiresIn: '1d' });
    const confirmationUrl = `http://localhost:4000/api/auth/confirm/${token}`;

    // Leer y personalizar el template HTML
    const templatePath = path.join(process.cwd(), 'src', 'services', 'confirmationTemplate.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace('{{name}}', name).replace('{{confirmationUrl}}', confirmationUrl);

    // Enviar email de confirmación
    await sendConfirmationEmail(
      email,
      'Confirma tu cuenta en CloudDocs Copilot',
      html
    );

    res.status(201).json({ message: 'Usuario registrado. Por favor revisa tu email para confirmar la cuenta.' });
  } catch (err) {
    console.error(err); // Mostrar error en la terminal
    // Si el error es de clave duplicada de MongoDB
    if (err.code === 11000) {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign({ id: user._id, role: user.role }, 'secret', { expiresIn: '1d' });
    res.json({ token, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// Actualizar datos de usuario
router.put('/:id', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const update = { name, email };
    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario actualizado', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;