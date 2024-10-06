const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
//const { parse } = require('json2csv');
const bcrypt = require('bcrypt');
const router = express.Router();
const { readCSV, writeCSV } = require('./csvUtils'); // Import the CSV utility functions
const { addSession, removeSession, loadActiveSessions } = require('../users/activeSessions');
const { accessFile, fileCache } = require('./cache'); // Import the CSV utility functions

router.get('/test', (req, res) => {
  res.send('Test route is working');
});

// Get user details
router.get('/details/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    // Use accessFile to load the users' details, leveraging the memory cache if available
    const users = await accessFile(path.resolve(__dirname, '../users'), 'details.csv');
    //const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const user = users.find(u => u.user_id === userId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).send(`Error fetching user details: ${error.message}`);
  }
});

// Get user inventory
/*
router.get('/inventory/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
    if (fs.existsSync(filePath)) {
      const inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.json(inventory);
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).send(`Error fetching user inventory: ${error.message}`);
  }
});*/

router.get('/inventory/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Use accessFile to read the inventory file (JSON format)
    const inventory = await accessFile(path.resolve(__dirname, '../users/inventory'), `${userId}.json`);

    // If inventory is found, parse and return it, otherwise return an empty array
    if (inventory) {
      //res.json(JSON.parse(inventory)); // Assuming the JSON data is stored as a string in the file
      res.json(inventory);
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).send(`Error fetching user inventory: ${error.message}`);
  }
});

// Get user orders
router.get('/orders/:userId', async (req, res) => {
  /*
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
  */
  try {
    const userId = req.params.userId;
    //const userOrderFile = path.resolve(__dirname, '../orders/users', `${userId}.csv`);

    // Use accessFile to read the user's orders
    const orders = await accessFile(path.resolve(__dirname, '../orders/users'), `${userId}.csv`);

    // Send the orders as JSON
    res.json(orders || []); // Return the orders or an empty array if no orders
  } catch (error) {
    console.error('Error reading user orders:', error);
    res.status(500).send(`Error reading user orders: ${error.message}`);
  }
});

/*
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
});*/

// User login
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const users = await accessFile(path.resolve(__dirname, '../users'), 'security.csv');
    const user = users.find(u => u.name === name);

    if (user) {
      // Check if the password matches using bcrypt
      const match = await bcrypt.compare(password, user.password);

      if (match) {
        // Store userId in session and track active session
        req.session.userId = user.user_id; 
        addSession(user.user_id); 

        console.log('Session after login:', req.session); // Log session after login
        res.json({ message: 'Login successful', userId: user.user_id });
      } else {
        res.status(401).json({ message: 'Invalid username or password' });
      }
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Error during login');
  }
});

// User registration
router.post('/register', async (req, res) => {
  try {

    const { name, password } = req.body;
    //const users = await readCSV(path.resolve(__dirname, '../users/security.csv'));
    const users = await accessFile(path.resolve(__dirname, '../users'), 'security.csv');
    const userExists = users.find(u => u.name === name);

    if (userExists) {
      console.log(`User registration failed: Username "${name}" already exists.`);
      return res.status(400).json({ message: 'Username already exists' });
    }
  
    const lastUserId = users.length > 0 ? Math.max(...users.map(u => parseInt(u.user_id))) : 0;
    const userId = (lastUserId + 1).toString();

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`Hashed password: ${hashedPassword}`);

    /*
    const newUser = { user_id: userId, name, password: hashedPassword };
    users.push(newUser);
    writeCSV(path.resolve(__dirname, '../users/security.csv'), users);*/
    // Add the new user to the security.csv file
    await accessFile(path.resolve(__dirname, '../users'), 'security.csv', (data) => {
      data.push({ user_id: userId, name, password: hashedPassword });
      return data; // Return the updated data to be written back to disk
    });

    /*
    const details = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const startingBalance = 5000;
    const newUserDetails = { user_id: userId, name, balance: startingBalance }; // Starting balance
    details.push(newUserDetails);
    writeCSV(path.resolve(__dirname, '../users/details.csv'), details);*/
    // Access details.csv to add the user with the starting balance
    await accessFile(path.resolve(__dirname, '../users'), 'details.csv', (data) => {
      const startingBalance = 5000; // Default starting balance
      data.push({ user_id: userId, name, balance: startingBalance });
      return data; // Return the updated data to be written back to disk
    });

    // Initialize empty inventory for the new user
    //fs.writeFileSync(path.resolve(__dirname, `../users/inventory/${userId}.json`), JSON.stringify([]));
    accessFile(path.resolve(__dirname, '../users/inventory'), `${userId}.json`, () => {
      return []; // Initialize with an empty array as the new user's inventory
    });

    // Set the session information
    req.session.userId = userId;
    addSession(userId); // Track active session

    console.log(`User "${name}" registered successfully with userId "${userId}".`);
    res.json({ message: 'User registered successfully', userId });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// User logout
router.post('/logout', (req, res) => {
  try {
    const userId = req.session.userId;

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ message: 'Logout failed' });
      }

      // Clear session cookie
      res.clearCookie('connect.sid');
      removeSession(userId); // Remove active session

      // Send success response
      res.json({ message: 'Logout successful' });
      console.log(`User with userId "${userId}" logged out.`);
    });

  } catch (error) {
    // Handle any other unexpected errors
    console.error('Error during logout process:', error);
    res.status(500).json({ message: 'Logout failed due to server error' });
  }
});

// Check if session is active
router.get('/check-session/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    // Check if the session exists and matches the userId
    if (req.session.userId && req.session.userId === userId) {
      res.json({ active: true });
    } else {
      res.json({ active: false });
    }
  } catch (error) {
    // Log the error and send a generic failure response
    console.error('Error checking session:', error);
    res.status(500).json({ active: false, message: 'Error checking session' });
  }
});

module.exports = router;
