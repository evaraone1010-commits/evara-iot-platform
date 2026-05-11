const path = require('path');
const dotenv = require('dotenv');

// Load .env.test before any tests run
dotenv.config({ path: path.resolve(__dirname, '.env.test') });
