require('dotenv').config();
const express = require('express');
const { connectMongo } = require('./configurations/database-config/mongoDB.js');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes.js');
const documentRoutes = require('./routes/document.routes.js');
const folderRoutes = require('./routes/folder.routes.js');
const userRoutes = require('./routes/user.routes.js');
const HttpError = require('./models/error.model');
// Manejador global de errores
const errorHandler = require('./middlewares/error.middleware.js');
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/users', userRoutes);

app.get('/api', (req, res) => {
  res.json({ message: 'API running' });
});

// Captura 404 (después de todas las rutas definidas y antes del manejador de errores)

app.use((req, _res, next) => {
  next(new HttpError(404, 'Route not found'));
});

app.use(errorHandler);

async function start() {
  try {
    await connectMongo();
    app.listen(PORT, () => console.log(`Backend server listening on port ${PORT}`));
  } catch (err) {
    console.error('Startup failed. Exiting process.');
    process.exit(1);
  }
}

start();
