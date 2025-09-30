require('dotenv').config();
const express = require('express');
const { connectMongo } = require('./configurations/database-config/mongoDB.js');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes.js');
const documentRoutes = require('./routes/document.routes.js');
const folderRoutes = require('./routes/folder.routes.js');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);

app.get('/api', (req, res) => {
  res.json({ message: 'API running' });
});

// 404 catch-all (after all defined routes, before error handler)
const HttpError = require('./models/error.model');
app.use((req, _res, next) => {
  next(new HttpError(404, 'Route not found'));
});

// Global error handler
const errorHandler = require('./middlewares/error.middleware.js');
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

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

