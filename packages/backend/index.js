require('dotenv').config();
const app = require('./src/app');
const { initDb } = require('./src/services/db');

const PORT = process.env.PORT || 10000; // Render usually defaults to 10000 but sets PORT env var

const startServer = async () => {
  // Run migrations non-blocking — tables already exist on Render after first deploy.
  // To run migrations explicitly: npm run migrate
  initDb().catch(err => console.error('DB init error (non-fatal):', err));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
