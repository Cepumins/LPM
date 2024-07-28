const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('json2csv');
const bcrypt = require('bcrypt');
const router = express.Router();
const { readCSV, writeCSV } = require('./csvUtils'); // Import the CSV utility functions
const { addSession, removeSession, loadActiveSessions } = require('../users/activeSessions');

router.get('/test', (req, res) => {
  res.send('Test route is working');
});

// Get user details
router.get('/details/:userId', async (req, res) => {
  const userId = req.params.userId;
  const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
  const user = users.find(u => u.user_id === userId);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// Get user inventory
router.get('/inventory/:userId', (req, res) => {
  const userId = req.params.userId;
  const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
  if (fs.existsSync(filePath)) {
    const inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(inventory);
  } else {
    res.json([]);
  }
});

// Get user orders
router.get('/orders/:userId', (req, res) => {
  const userId = req.params.userId;
  const userOrderFile = path.resolve(__dirname, `../orders/users/${userId}.csv`);

  if (!fs.existsSync(userOrderFile)) {
    return res.status(404).send('Orders not found');
  }

  const orders = [];
  fs.createReadStream(userOrderFile)
    .pipe(csv())
    .on('data', (row) => {
      orders.push(row);
    })
    .on('end', () => {
      res.json(orders);
    })
    .on('error', (error) => {
      console.error('Error reading user orders:', error);
      res.status(500).send('Error reading user orders');
    });
});

// Update user inventory (buy stock)
router.post('/inventory/:userId/buy', (req, res) => {
  const userId = req.params.userId;
  const { ticker, quantity } = req.body;
  const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);

  let inventory = [];
  if (fs.existsSync(filePath)) {
    inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  const stock = inventory.find(s => s.ticker === ticker);
  if (stock) {
    stock.quantity += quantity;
  } else {
    inventory.push({ ticker, quantity });
  }

  console.log(`User: ${userId} bought stock ${ticker}`);
  fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));
  res.json(inventory);
});

// Update user inventory (sell stock)
router.post('/inventory/:userId/sell', (req, res) => {
  const userId = req.params.userId;
  const { ticker, quantity } = req.body;
  const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);

  let inventory = [];
  if (fs.existsSync(filePath)) {
    inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  const stock = inventory.find(s => s.ticker === ticker);
  if (stock) {
    stock.quantity -= quantity;
    if (stock.quantity <= 0) {
      inventory = inventory.filter(s => s.ticker !== ticker);
    }
    console.log(`User: ${userId} sold stock ${ticker}`);
    fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));
    res.json(inventory);
  } else {
    res.status(400).json({ message: 'Stock not found in inventory' });
  }
});

// User login
router.post('/login', async (req, res) => {
  const { name, password } = req.body;
  const users = await readCSV(path.resolve(__dirname, '../users/security.csv'));
  const user = users.find(u => u.name === name);

  if (user) {
    //console.log(`Found user: ${JSON.stringify(user)}`);
    const match = await bcrypt.compare(password, user.password);
    //console.log(`Password match: ${match}`);
    if (match) {
      req.session.userId = user.user_id; // Store userId in session
      addSession(user.user_id); // Track active session
      console.log('Session after login:', req.session); // Log session after login
      res.json({ message: 'Login successful', userId: user.user_id });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
  }
});

// User registration
router.post('/register', async (req, res) => {
  const { name, password } = req.body;
  const users = await readCSV(path.resolve(__dirname, '../users/security.csv'));
  const userExists = users.find(u => u.name === name);

  if (userExists) {
    console.log(`User registration failed: Username "${name}" already exists.`);
    res.status(400).json({ message: 'Username already exists' });
  } else {
    const lastUserId = users.length > 0 ? Math.max(...users.map(u => parseInt(u.user_id))) : 0;
    const userId = (lastUserId + 1).toString();

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`Hashed password: ${hashedPassword}`);

    const newUser = { user_id: userId, name, password: hashedPassword };
    users.push(newUser);
    writeCSV(path.resolve(__dirname, '../users/security.csv'), users);

    const details = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const startingBalance = 5000;
    const newUserDetails = { user_id: userId, name, balance: startingBalance }; // Starting balance
    details.push(newUserDetails);
    writeCSV(path.resolve(__dirname, '../users/details.csv'), details);

    // Initialize empty inventory for the new user
    fs.writeFileSync(path.resolve(__dirname, `../users/inventory/${userId}.json`), JSON.stringify([]));

    // Set the session information
    req.session.userId = userId;
    addSession(userId); // Track active session

    console.log(`User "${name}" registered successfully with userId "${userId}".`);
    res.json({ message: 'User registered successfully', userId });
  }
});

// User logout
router.post('/logout', (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    removeSession(userId); // Remove active session
    res.json({ message: 'Logout successful' });
    console.log(`User with userId "${userId}" logged out.`);
  });
});

// Check if session is active
router.get('/check-session/:userId', (req, res) => {
  const { userId } = req.params;
  if (req.session.userId && req.session.userId === userId) {
    res.json({ active: true });
  } else {
    res.json({ active: false });
  }
});

module.exports = router;
