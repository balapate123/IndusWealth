require('dotenv').config();
const app = require('./src/app');
const { initDb } = require('./src/services/db');

const PORT = process.env.PORT || 10000; // Render usually defaults to 10000 but sets PORT env var

const startServer = async () => {
  // Initialize DB tables if they don't exist
  await initDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
