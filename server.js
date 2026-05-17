require('dotenv').config();
const express = require('express');
const path = require('path');
require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/summary',      require('./routes/summary'));
app.use('/api/last-email',   require('./routes/last-email'));

app.listen(PORT, () => {
  console.log(`Personal Finance App running at http://localhost:${PORT}`);
  require('./gmail-agent/agent').runAgent().catch((err) => {
    console.error('[Gmail Agent] Startup run failed:', err.message);
  });
});
