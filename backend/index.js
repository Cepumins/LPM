// index.js
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const http = require('http');
const { setupWebSocketServer } = require('./routes/websocket');
const { clearSessions } = require('./users/activeSessions');

const app = express();
const PORT = process.env.PORT || 5001;

// Create the session store
const sessionStore = new session.MemoryStore();

app.use(cors({
  origin: 'http://localhost:3000', // Replace with your frontend URL
  credentials: true
}));
app.use(express.json());
app.use(session({
  store: sessionStore,
  secret: 'your-secret-key', // Replace with your own secret key
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true } // Ensure secure is false for local development
  //cookie: { secure: false } // Set to true if using HTTPS
}));

// Clear the session store on server start
clearSessions();
sessionStore.clear((err) => {
  if (err) {
    console.error('Failed to clear session store:', err);
  } else {
    console.log('Session store cleared on server start');
  }
});

const server = http.createServer(app);
setupWebSocketServer(server);

const stockRoutes = require('./routes/stockRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/stocks', stockRoutes);
app.use('/api/users', userRoutes);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
