const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { parse } = require('json2csv');
const http = require('http');
const { getWebSocketServer } = require('./websocket'); // Import the WebSocket getter function
const { readCSV, writeCSV } = require('./csvUtils'); // Import the CSV utility functions
const e = require('cors');

const router = express.Router();


// --- SUPPORT ---
const decimals = 2;
//const minTax = 0 //Math.pow(10, -decimals);
const taxP = 0.01;
const dividendP = 0;
const sellRound = 'up';
const buyRound = 'down';

const roundUp = (amount, decimals) => {
  const factor = Math.pow(10, decimals);
  return Math.ceil(amount * factor) / factor;
};

const roundDown = (amount, decimals) => {
  const factor = Math.pow(10, decimals);
  return Math.floor(amount * factor) / factor;
};

const roundReg = (amount, decimals) => {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
};


// --- API ---
// Main route to provide endpoint information
router.get('/', (req, res) => {
  res.json({
    message: "Full Stocks API",
    endpoints: {
      stock_info: "/api/stocks/info",
      stock_data: "/api/stocks/data",
      update_stock_data: "/api/stocks/data/update",
      buy_stock: "/api/stocks/data/buy",
      sell_stock: "/api/stocks/data/sell"
    }
  });
});

// Function to make internal API calls
const internalApiCall = (path, data, callback) => {
  const postData = JSON.stringify(data);

  const options = {
    hostname: 'localhost',
    port: 5001,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };

  const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      callback(null, responseData);
    });
  });

  req.on('error', (e) => {
    callback(e);
  });

  req.write(postData);
  req.end();
};

// Route to get stock_info.csv data
router.get('/info', (req, res) => {
  const stockInfo = [];

  fs.createReadStream(path.resolve(__dirname, '../sorted_stock_info.csv'))
    .pipe(csv())
    .on('data', (row) => {
      stockInfo.push(row);
    })
    .on('end', () => {
      res.json(stockInfo);
    });
});

// Route to get stocks.csv data
router.get('/data', (req, res) => {
  const stockData = [];

  fs.createReadStream(path.resolve(__dirname, '../stocks.csv'))
    .pipe(csv())
    .on('data', (row) => {
      row.x = parseFloat(row.x);
      row.y = parseFloat(row.y);
      row.Pa = parseFloat(row.Pa);
      row.Pb = parseFloat(row.Pb);
      row.price = parseFloat(row.price);
      row.L = parseFloat(row.L);
      row.buyP = parseFloat(row.buyP);
      row.sellP = parseFloat(row.sellP);
      stockData.push(row);
    })
    .on('end', () => {
      res.json(stockData);
    });
});

// Route to update stocks.csv data
router.post('/data/update', async (req, res) => {
  try {
    const stockFilePath = path.resolve(__dirname, '../stocks.csv');
    const oldStockData = await readCSV(stockFilePath);
    
    const oldPrices = oldStockData.reduce((acc, stock) => {
      acc[stock.ticker] = {
        buyP: parseFloat(stock.buyP),
        sellP: parseFloat(stock.sellP)
      };
      return acc;
    }, {});

    const updatedStockData = req.body.map(stock => {
      const ticker = stock.ticker;

      // Read old prices if they exist
      const oldBuyP = oldPrices[ticker] ? oldPrices[ticker].buyP : null;
      const oldSellP = oldPrices[ticker] ? oldPrices[ticker].sellP : null;

      // Log old prices for debugging
      console.log(`Old prices for ${ticker}: buyP=${oldBuyP}, sellP=${oldSellP}`);

      const buyFile = path.resolve(__dirname, `../orders/${ticker}/buy.csv`);
      const sellFile = path.resolve(__dirname, `../orders/${ticker}/sell.csv`);

      // Remove old buy LP order if the price is not null
      if (oldBuyP !== null && fs.existsSync(buyFile)) {
        try {
          removeOrder(ticker, 'buy', 1, oldBuyP, `LP-${ticker}`);
          console.log(`Old buy LP order removed successfully for ${ticker} (update)`);
        } catch (err) {
          console.error(`Error removing old buy LP order for ${ticker} (update):`, err);
        }
      }

      // Remove old sell LP order if the price is not null
      if (oldSellP !== null && fs.existsSync(sellFile)) {
        try {
          removeOrder(ticker, 'sell', 1, oldSellP, `LP-${ticker}`);
          console.log(`Old sell LP order removed successfully for ${ticker} (update)`);
        } catch (err) {
          console.error(`Error removing old sell LP order for ${ticker} (update):`, err);
        }
      }

      const x = parseFloat(stock.x);
      const y = parseFloat(stock.y);
      const Pa = parseFloat(stock.Pa);
      const Pb = parseFloat(stock.Pb);
      const price = y / x;
      const L = calculateL(Pa, Pb, x, y);
      const virtualX = L / Math.sqrt(Pb);
      const virtualY = L * Math.sqrt(Pa);
      const buyP = calculatePrices('buy', x, y, virtualX, virtualY);
      const sellP = calculatePrices('sell', x, y, virtualX, virtualY);

      addOrder(ticker, 'buy', 1, buyP, `LP-${ticker}`, 'book');
      addOrder(ticker, 'sell', 1, sellP, `LP-${ticker}`, 'book');

      return {
        ticker: stock.ticker,
        x: parseFloat(x.toFixed(2)),
        y: parseFloat(y.toFixed(2)),
        Pa: parseFloat(Pa.toFixed(5)),
        Pb: parseFloat(Pb.toFixed(5)),
        price: parseFloat(price.toFixed(2)),
        L: parseFloat(L.toFixed(2)),
        buyP: parseFloat(buyP.toFixed(2)),
        sellP: parseFloat(sellP.toFixed(2))
      };
    });

    
    const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
    const opts = { fields };  

    const csvData = parse(updatedStockData, opts);
    fs.writeFileSync(stockFilePath, csvData);

    /*
    // Read existing stock_info.csv data to preserve the 'type' field
    const existingStockInfoData = [];
    fs.createReadStream(path.resolve(__dirname, '../stock_info.csv'))
      .pipe(csv())
      .on('data', (row) => {
        existingStockInfoData.push(row);
      })
      .on('end', () => {
        const stockInfoData = updatedStockData.map(stock => {
          const existingStock = existingStockInfoData.find(s => s.ticker === stock.ticker);
          return {
            ticker: stock.ticker,
            buyP: stock.buyP,
            sellP: stock.sellP,
            type: existingStock ? existingStock.type : ''
          };
        });

        const infoFields = ['ticker', 'buyP', 'sellP', 'type'];
        const infoOpts = { fields: infoFields };
        const csvInfoData = parse(stockInfoData, infoOpts);
        fs.writeFileSync(path.resolve(__dirname, '../stock_info.csv'), csvInfoData);

        // Broadcast updated stock data to all connected WebSocket clients
        const wss = getWebSocketServer(); // Get the WebSocket server instance
        wss.broadcast({ type: 'update', data: updatedStockData });

        res.status(200).send(updatedStockData);
      });
      */
    res.status(200).send('Stock data updated successfully');
  } catch (err) {
    console.error('Error updating stock data:', err);
    res.status(500).send('Error updating stock data');
  }
});

// --- LP MATH ---
const calculatePrices = (action, X, Y, virtualX, virtualY) => {
  const roundPrices = (price, direction) => {
    let roundedPrice;
    if (direction === 'up') {
      roundedPrice = roundUp(price, decimals);
    } else if (direction === 'down') {
      roundedPrice = roundDown(price, decimals);
    } else {
      roundedPrice = roundReg(price, decimals);
    }
    return roundedPrice;
  };

  X = parseFloat(X);
  Y = parseFloat(Y);
  virtualX = parseFloat(virtualX);
  virtualY = parseFloat(virtualY);

  //console.log(`${action}`);

  const totalX = X + virtualX;
  const totalY = Y + virtualY;

  let newTotalX;
  if (action === 'buy') {
    newTotalX = totalX + 1;
  } else if (action === 'sell') {
    newTotalX = totalX - 1;
  }

  const K = totalX * totalY;
  //console.log(`K: ${K}`);

  const newTotalY = K / newTotalX;
  //console.log(`newTotalY: ${newTotalY}`);

  const newY = newTotalY - virtualY;
  
  let preTaxP;
  //let direction;
  let taxAmount;
  if (action === 'buy') {
    preTaxP = Y - newY;
    //direction = buyRound;
    taxAmount = 0;
  } else if (action === 'sell') {
    preTaxP = newY - Y;
    //direction = sellRound;
    taxAmount = 0;
    //taxAmount = Math.max(minTax, preTaxP * (taxP / 100));
    //console.log(`taxAmount: ${taxAmount}`);
  }

  const preRoundP = preTaxP - taxAmount;
  let P;
  if (action == 'buy') {
    P = roundPrices(preRoundP, buyRound);
  } else if (action == 'sell') {
    P = roundPrices(preRoundP, sellRound);
  }

  //const P = preRoundP
  /*
  let newFullY;
  if (action == 'buy') {
    newFullY = totalY - P;
  } else if (action == 'sell') {
    newFullY = totalY + P;
  }
  const newK = newTotalX * newFullY;
  //console.log(`New K: ${newK}`);
  */

  return P;
};

const calculateL = (Pa, Pb, X_r, Y_r) => {
  const Pa_sq = Math.sqrt(Pa);
  const Pb_sq = Math.sqrt(Pb);

  const part1 = Pa * Pb * Math.pow(X_r, 2) - 2 * Pa_sq * Pb_sq * X_r * Y_r + 4 * Pb * X_r * Y_r + Math.pow(Y_r, 2);
  const part2 = Pa_sq * Pb_sq * X_r + Y_r;

  const numerator = Math.sqrt(part1) + part2;
  const denominator = 2 * Pa_sq - 2 * Pb_sq;

  const L = - numerator / denominator;
  
  return parseFloat(L);
};

const getNewPrices = async (stock, newX, newY) => {
  console.log(`Received stock: ${stock}, x: ${newX}, y: ${newY}`);
  const Pa = parseFloat(stock.Pa);
  const Pb = parseFloat(stock.Pb);
  const x = parseFloat(newX);
  const y = parseFloat(newY);
  //console.log(`X: ${x}, Y: ${y}, Pa: ${Pa}, Pb: ${Pb}`);
  const L = calculateL(Pa, Pb, x, y);
  //console.log(`current L: ${L}`);
  //const price = y / x;
  const virtualX = L / Math.sqrt(Pb);
  const virtualY = L * Math.sqrt(Pa);
  const ticker = stock.ticker;

  /*
  let sellPrice, price;
  if (x > 0) {
    sellPrice = roundUp(calculatePrices('sell', x, y, virtualX, virtualY), 2);
    await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
    price = y / x;
  } else {
    sellPrice = '-';
    price = 999999999.99;
  }

  let buyPrice = roundDown(calculatePrices('buy', x, y, virtualX, virtualY), 2);
  if (y > buyPrice) {
    await addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`, 'book');
  } else {
    buyPrice = '-';
  }
  */
  let buyPrice = roundDown(calculatePrices('buy', x, y, virtualX, virtualY), 2);
  if (y < buyPrice) {
    buyPrice = '-';
  }
  let sellPrice, price;
  if (x > 0) {
    sellPrice = roundUp(calculatePrices('sell', x, y, virtualX, virtualY), 2);
    //await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
    price = y / x;
  } else {
    sellPrice = '-';
    price = 999999999.99;
  }
  
  
  /*
  if (newX == 0) {
    buyPrice = "NA";
  } else if (newX == 1) {
    buyPrice = buyPrice * 2.5;
  } else if (newX == 2) {
    buyPrice = buyPrice * 1.5;
  }
  */
  
  //console.log('in prices func');
  
  
  const updatedStock = {
    ...stock,
    x: String(newX),
    y: String(newY),
    price: String(roundReg(price, 2)),
    L: String(roundReg(L, 2)),
    buyP: String(buyPrice),
    sellP: String(sellPrice)
  };

  const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
  const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);

  const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
  const opts = { fields };
  const csvData = parse(updatedStockData, opts);
  fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);

  console.log(`buyPrice: ${buyPrice}, sellPrice: ${sellPrice}`);

  return { buyPrice, sellPrice };
};


// --- USER MODIFICATION ---
// Update user balance
const updateUserBalance = async (userId, amount) => {
  const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
  const user = users.find(u => u.user_id === userId);
  if (user) {
    console.log(`Updating user ${userId} balance by amount: ${amount}`);
    user.balance = (parseFloat(user.balance) + amount).toFixed(2);
    writeCSV(path.resolve(__dirname, '../users/details.csv'), users);

    // Broadcast updated balance
    const wss = getWebSocketServer();
    wss.broadcast({ type: 'balanceUpdate', userId, balance: user.balance });
  }
};

// Function to update user inventory
const updateUserInventory = async (userId, ticker, quantity, action) => {
  const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
  let inventory = [];

  if (fs.existsSync(filePath)) {
    inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  
  const stock = inventory.find(s => s.ticker === ticker);
  if (action === 'buy') {
    console.log(`Adding ${quantity} of ${ticker} to user ${userId} inventory`);
    if (stock) {
      stock.quantity += quantity;
    } else {
      inventory.push({ ticker, quantity });
    }
  } else if (action === 'sell') {
    console.log(`Removing ${quantity} of ${ticker} from user ${userId} inventory`);
    if (stock) {
      stock.quantity -= quantity;
      if (stock.quantity <= 0) {
        inventory = inventory.filter(s => s.ticker !== ticker);
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));

  // Broadcast updated inventory
  const wss = getWebSocketServer();
  wss.broadcast({ type: 'inventoryUpdate', userId, inventory: inventory });
};

// old buy/sell handling
/*
// buy/sell logic
const handleTransaction = async (req, res, userAction) => {
  if (!req.session.userId) {
    console.log('User not logged in');
    return res.status(401).send('User not logged in');
  }

  const { ticker } = req.body;
  const userId = req.session.userId;
  let type;
  if (userAction === 'buy') {
    type = 'sell'
  } else if (userAction === 'sell') {
    type = 'buy'
  }

  const stockData = [];
  fs.createReadStream(path.resolve(__dirname, '../stocks.csv'))
    .pipe(csv())
    .on('data', (row) => {
      stockData.push(row);
    })
    .on('end', async () => {
      const stock = stockData.find(stock => stock.ticker === ticker);
      if (!stock) {
        return res.status(404).send('Stock not found');
      }

      const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
      const user = users.find(u => u.user_id === userId);
      if (!user) {
        return res.status(404).send('User not found');
      }

      const price = type === 'buy' ? parseFloat(stock.buyP) : parseFloat(stock.sellP);
      const userBalance = parseFloat(user.balance);

      if (userAction === 'buy' && userBalance < price) {
        console.log(`User ${userId} tried to buy stock ${ticker} with insufficient balance`);
        //return res.status(400).send('Insufficient balance');
        return;
      }

      const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
      let inventory = [];
      if (fs.existsSync(filePath)) {
        inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }

      const userStock = inventory.find(s => s.ticker === ticker);
      if (userAction === 'sell' && (!userStock || userStock.quantity <= 0)) {
        console.log(`User ${userId} tried to sell stock ${ticker} with insufficient quantity`);
        //return res.status(400).send('Insufficient quantity');
        return;
      }

      const updatedStockData = await Promise.all(stockData.map(async (stock) => {
        if (stock.ticker === ticker) {
          console.log('starting to remove old orders');
          await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`);
          //addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`);
          await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`);
          const oldX = parseFloat(stock.x);
          const oldY = parseFloat(stock.y);
          let newX, newY;
          if (type === 'buy') {
            //newX = parseFloat(stock.x) - 1;
            //newY = parseFloat(stock.y) + price;
            newX = oldX + 1;
            newY = oldY - price;
          } else if (type === 'sell') {
            //newX = parseFloat(stock.x) + 1;
            //newY = parseFloat(stock.y) - price;
            newX = oldX - 1;
            newY = oldY + price;
          }
          // remove old orders
          return await getNewPrices(stock, newX, newY);
        } else {
          return stock;
        }
      }));

      // Update the stocks.csv with the modified stock data
      const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
      const opts = { fields };
      const csvData = parse(updatedStockData, opts);
      fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);

      // Ensure that only the relevant stock's prices are updated in stock_info.csv
      console.log('updating stock price from handleTransaction');
      await updateStockPrices(ticker);

      await updateUserBalance(userId, userAction === 'buy' ? -price : price);
      updateUserInventory(userId, ticker, 1, userAction);
      res.status(200).send(`Stock ${type}ed successfully`);
    });
};

// Route to handle buy signal
router.post('/data/buy', async (req, res) => {
  handleTransaction(req, res, 'buy');
});

// Route to handle sell signal
router.post('/data/sell', async (req, res) => {
  handleTransaction(req, res, 'sell');
});
*/


// --- ORDER HANDLING ---
// Function to insert order in the correct position
const insertOrder = (orders, newOrder, orderType) => {
  let inserted = false;
  const newOrderPrice = parseFloat(newOrder.price);
  let orderPrice;
  
  if (orderType === 'buy') {
    for (let i = 0; i < orders.length; i++) {
      orderPrice = parseFloat(orders[i].price);
      if (orderPrice < newOrderPrice) {
        orders.splice(i, 0, newOrder);
        inserted = true;
        break;
      }
    }
  } else if (orderType === 'sell') {
    for (let i = 0; i < orders.length; i++) {
      orderPrice = parseFloat(orders[i].price);
      if (orderPrice > newOrderPrice) {
        orders.splice(i, 0, newOrder);
        inserted = true;
        break;
      }
    }
  }
  if (!inserted) {
    orders.push(newOrder);
  }
  return orders;
};

/*
// Route to fulfill orders
router.post('/fulfill-order', async (req, res) => {
  const { type, ticker, action, price } = req.body;
  try {
    console.log('Fulfilling order from route fulfill-order');
    await fulfillOrder(req, res, ticker, type, action, price);
  } catch (error) {
    console.error('Error fulfilling order:', error);
    res.status(500).send('Error fulfilling order');
  }
});

// function to fulfill orders
const fulfillOrder = async (req, res, frontendTicker, type, askerAction, frontendPrice) => {
  const ticker = frontendTicker;
  //console.log(`ticker: ${ticker}`);
  let askerId, quantity;
  let asker, giver, giverAction;
  if (askerAction === 'buy') {
    asker = 'buyer'
    giver = 'seller'
    giverAction = 'sell'
  } else if (askerAction === 'sell') {
    asker = 'seller'
    giver = 'buyer'
    giverAction = 'buy'
  }
  const giverOrderFile = path.join(__dirname, `../orders/${ticker}/${giverAction}.csv`);
  const giverOrders = await readCSV(giverOrderFile);

  if (type === 'market') {
    if (!req.session.userId) {
      console.log('User not logged in');
      return res.status(401).send('User not logged in');
    }
    askerId = req.session.userId;
    //ticker = req.body;
    quantity = 1;
    // Get the best offer (top order)
    const bestOffer = giverOrders[0];
    //console.log(`bestOffer: ${bestOffer}`)
    const giverQuantity = parseInt(bestOffer.q);
    const giverPrice = parseFloat(bestOffer.price);
    const giverId = bestOffer.user;

    if (isNaN(giverQuantity) || isNaN(giverPrice)) {
      return res.status(500).send('Invalid order data');
    }

    // Compare the frontend price with the orderPrice (just in case of lag)
    if (frontendPrice !== giverPrice) {
      //return res.status(400).send('Price mismatch');
      console.log('Price mismatch');
      console.log('updating stock price because of price mismatch');
      await updateStockPrices(ticker);
      return;
    }

    const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const askerUser = users.find(u => u.user_id === askerId);
    if (!askerUser) {
      return res.status(404).send('User not found');
    }

    if (askerId === giverId) {
      cancelOrder(ticker, giverAction, 1, giverPrice, giverId);
      console.log(`User ${askerId} tried to ${askerAction} from himself`);
      return;
    }

    const askerBalance = parseFloat(askerUser.balance);

    const askerInventoryPath = path.resolve(__dirname, `../users/inventory/${askerId}.json`);
    let askerInventory = [];
    if (fs.existsSync(askerInventoryPath)) {
      askerInventory = JSON.parse(fs.readFileSync(askerInventoryPath, 'utf-8'));
    }
    const askerInventoryStock = askerInventory.find(s => s.ticker === ticker);

    if (askerAction === 'buy') {
      if (askerBalance < giverPrice) {
        console.log(`User ${askerId} tried to buy stock ${ticker} with insufficient balance`);
        //return res.status(400).send('Insufficient balance');
        return;
      }
    } else if (askerAction === 'sell') {
      if (!askerInventoryStock || askerInventoryStock.quantity <= 0) {
        console.log(`User ${askerId} tried to sell stock ${ticker} with insufficient quantity`);
        //return res.status(400).send('Insufficient quantity');
        return;
      }
    }

    updateUserBalance(askerId, askerAction === 'sell' ? giverPrice : -giverPrice);
    updateUserInventory(askerId, ticker, 1, askerAction);

    // if giver is LP, then add/subtract from the LP, otherwise add/subtract to a specific user
    // Handle case where the giver is the LP
    if (giverId.startsWith('LP-')) {
      const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
      const stock = stockData.find(s => s.ticker === ticker);
      if (stock) {
        await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`);
        await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`);
        //console.log('removed old orders successfully');
        const oldX = parseFloat(stock.x);
        const oldY = parseFloat(stock.y);
        let newX, newY;

        if (askerAction === 'buy') {
          newX = oldX - 1;
          newY = roundReg(oldY + giverPrice, 2);
        } else if (askerAction === 'sell') {
          newX = oldX + 1;
          newY = roundReg(oldY - giverPrice, 2);
        }

        const updatedStock = await getNewPrices(stock, newX, newY);
        const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);

        const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
        const opts = { fields };
        const csvData = parse(updatedStockData, opts);
        fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);

        //console.log(`Updated LP values for ${ticker}`);
      }
    } else {
      removeOrder(ticker, giverAction, 1, giverPrice, giverId);
      // it already subtracts balance from giver when he created buy order or inventory when creating sell order, so we dont need to do that for the second time
      if (askerAction === 'sell') {
        updateUserInventory(giverId, ticker, 1, 'buy');
      } else if (askerAction === 'buy') {
        updateUserBalance(giverId, giverPrice);
      }
    }
    
    res.status(200).send(`Order fulfilled successfully`);
  } else if (type === 'book') {
    // Handle limit orders here
  }
  // Ensure that only the relevant stock's prices are updated in stock_info.csv
  console.log('updating stock price from fulfillOrder');
  await updateStockPrices(ticker);
}
*/

// Route to handle order creation
router.post('/data/order', async (req, res) => {
  if (!req.session.userId) {
    console.log('User not logged in');
    return res.status(401).send('User not logged in');
  }

  const { ticker, orderType, quantity, price, orderExecution } = req.body;
  const userId = req.session.userId;

  try {
    console.log(`User ${userId} creating ${orderExecution} ${orderType} order for ${ticker} of ${quantity} at price of ${price}..`);
    await addOrder(ticker, orderType, quantity, price, userId, orderExecution);
    res.status(200).send(`Order created successfully`);
    console.log(`User ${userId} created ${orderExecution} ${orderType} order for ${ticker} of ${quantity} at price of ${price}`);
    await updateStockPrices(ticker); // Ensure this runs after order is added
    console.log(`updating ${ticker} price from addOrder`);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).send('Error creating order');
  }
});

// Function to add order
const addOrderOld = async (ticker, action, quantity, price, userId, type) => {
  const validateOrder = async (ticker, action, price, userId) => {
    const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
    const stockInfoData = await readCSV(stockInfoFile).catch(() => []);
    const validTickers = stockInfoData.map(stock => stock.ticker);
  
    const userDetailsFile = path.resolve(__dirname, '../users/details.csv');
    const userDetailsData = await readCSV(userDetailsFile).catch(() => []);
    const validUserIds = userDetailsData.map(user => user.user_id);
  
    if (!validTickers.includes(ticker)) {
      console.log(`Invalid ticker: ${ticker}`);
      //console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
      return false;
    }
  
    if (action !== 'buy' && action !== 'sell') {
      console.log(`Invalid action: ${action}`);
      //console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
      return false;
    }
  
    if (isNaN(price) || price <= 0 || !/^\d+(\.\d{1,2})?$/.test(price.toString())) {
      console.log(`Invalid price: ${price}`);
      //console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
      return false;
    }
  
    if (!validUserIds.includes(userId) && !userId.startsWith('LP-')) {
      console.log(`Invalid userId: ${userId}`);
      //console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
      return false;
    }
  
    return true;
  };

  const updateUserDetails = async (action, ticker, userId, quantity, price) => {
    if (action === 'buy') {
      await updateUserInventory(userId, ticker, quantity, 'buy');
      await updateUserBalance(userId, -price * quantity);
    } else if (action === 'sell') {
      await updateUserInventory(userId, ticker, quantity, 'sell');
      await updateUserBalance(userId, price * quantity);
    }
  };

  /*
  // Read stock info to validate ticker
  const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
  const stockInfoData = await readCSV(stockInfoFile).catch(() => []);
  const validTickers = stockInfoData.map(stock => stock.ticker);

  // Read user details to validate userId
  const userDetailsFile = path.resolve(__dirname, '../users/details.csv');
  const userDetailsData = await readCSV(userDetailsFile).catch(() => []);
  const validUserIds = userDetailsData.map(user => user.user_id);

  // Validation checks
  if (!validTickers.includes(ticker)) {
    console.log(`Invalid ticker: ${ticker}`);
    console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
    return;
  }

  if (action !== 'buy' && action !== 'sell') {
    console.log(`Invalid action: ${action}`);
    console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
    return;
  }

  if (isNaN(price) || price <= 0 || !/^\d+(\.\d{1,2})?$/.test(price.toString())) {
    console.log(`Invalid price: ${price}`);
    console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
    return;
  }

  if (!validUserIds.includes(userId) && !userId.startsWith('LP-')) {
    console.log(`Invalid userId: ${userId}`);
    console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
    return;
  }*/
  if (!await validateOrder(ticker, action, price, userId)) {
    console.log(`Validation failed for order: User ${userId} ${action} ${ticker} ${quantity} at ${price}`);
    return;
  }

  //console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
  const orderDir = path.resolve(__dirname, `../orders/${ticker}`);
  const oppositeAction = action === 'buy' ? 'sell' : 'buy';
  const oppositeOrderFile = path.join(orderDir, `${oppositeAction}.csv`);
  const date = new Date().toISOString();

  // Read existing opposite action orders
  let oppositeOrders = [];
  if (fs.existsSync(oppositeOrderFile)) {
    oppositeOrders = await readCSV(oppositeOrderFile);
  }


  if (type === 'market') {
    // handle market orders here
    quantity = 1;


    const bestOffer = oppositeOrders[0];
    //const giverQuantity = parseInt(bestOffer.q);
    const giverPrice = parseFloat(bestOffer.price);
    const giverId = bestOffer.user;

    /*
    if (!req.session.userId) {
      console.log('User not logged in');
      return res.status(401).send('User not logged in');
    }
    userId = req.session.userId;

    if (isNaN(giverQuantity) || isNaN(giverPrice)) {
      return res.status(500).send('Invalid order data');
    }*/

    if (price !== giverPrice) {
      console.log('Price mismatch');
      await updateStockPrices(ticker);
      return;
    }

    const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const askerUser = users.find(u => u.user_id === userId);
    if (!askerUser) {
      return res.status(404).send('User not found');
    }

    if (userId === giverId) {
      await cancelOrder(ticker, oppositeAction, 1, giverPrice, giverId);
      console.log(`User ${userId} tried to ${action} from himself`);
      return;
    }

    const askerBalance = parseFloat(askerUser.balance);
    const askerInventoryPath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
    let askerInventory = [];
    if (fs.existsSync(askerInventoryPath)) {
      askerInventory = JSON.parse(fs.readFileSync(askerInventoryPath, 'utf-8'));
    }
    const askerInventoryStock = askerInventory.find(s => s.ticker === ticker);

    if (action === 'buy') {
      if (askerBalance < giverPrice) {
        console.log(`User ${userId} tried to buy stock ${ticker} with insufficient balance`);
        return;
      }
    } else if (action === 'sell') {
      if (!askerInventoryStock || askerInventoryStock.quantity <= 0) {
        console.log(`User ${userId} tried to sell stock ${ticker} with insufficient quantity`);
        return;
      }
    }

    await updateUserBalance(userId, action === 'sell' ? giverPrice : -giverPrice);
    await updateUserInventory(userId, ticker, 1, action);

    if (giverId.startsWith('LP-')) {
      const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
      const stock = stockData.find(s => s.ticker === ticker);
      if (stock) {
        await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`);
        await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`);
        const oldX = parseFloat(stock.x);
        const oldY = parseFloat(stock.y);
        let newX, newY;

        if (action === 'buy') {
          newX = oldX - 1;
          newY = roundReg(oldY + giverPrice, 2);
        } else if (action === 'sell') {
          newX = oldX + 1;
          newY = roundReg(oldY - giverPrice, 2);
        }

        const updatedStock = await getNewPrices(stock, newX, newY);
        const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);

        const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
        const opts = { fields };
        const csvData = parse(updatedStockData, opts);
        fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);
      }
    } else {
      await removeOrder(ticker, oppositeAction, 1, giverPrice, giverId);
      if (action === 'sell') {
        await updateUserInventory(giverId, ticker, 1, 'buy');
      } else if (action === 'buy') {
        await updateUserBalance(giverId, giverPrice);
      }
    }

    
  } else if (type === 'book') {
    // Handle book orders here
    if (!Number.isInteger(parseInt(quantity)) || parseInt(quantity) <= 0) {
      console.log(`Invalid quantity: ${parseInt(quantity)}`);
      console.log(`Function trying to: User ${userId} create ${action} order for ${ticker} of ${quantity} at price of ${price}`);
      return;
    }

    let remainingQuantity = quantity;
    
    // Preliminary check for the best price
    if (oppositeOrders.length > 0) {
      const bestPrice = parseFloat(oppositeOrders[0].price);
      if ((action === 'buy' && price < bestPrice) || (action === 'sell' && price > bestPrice)) {
        console.log('No favorable price found, placing on the book');
      } else {
        // Fulfill existing opposite action orders if price is favorable
        console.log('Order with favorable price should exist');
        for (let i = 0; i < oppositeOrders.length && remainingQuantity > 0; i++) {
          const order = oppositeOrders[i];
          const giverPrice = parseFloat(order.price);
          const orderQuantity = parseInt(order.q);

          if ((action === 'buy' && price >= giverPrice) || (action === 'sell' && price <= giverPrice)) {
            const fulfillQuantity = Math.min(remainingQuantity, orderQuantity);
            remainingQuantity -= fulfillQuantity;

            // Update user balances and inventories
            const giverId = order.user;
            if (userId === giverId) {
              await cancelOrder(ticker, oppositeAction, fulfillQuantity, giverPrice, giverId);
              console.log(`User ${userId} tried to ${action} from himself`);
            } else {
              if (action === 'buy') {
                await updateUserBalance(userId, -giverPrice * fulfillQuantity);
                await updateUserInventory(userId, ticker, fulfillQuantity, 'buy');
              } else if (action === 'sell') {
                await updateUserBalance(userId, giverPrice * fulfillQuantity);
                await updateUserInventory(userId, ticker, fulfillQuantity, 'sell');
              }

              if (giverId.startsWith('LP-')) {
                const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
                const stock = stockData.find(s => s.ticker === ticker);
                if (stock) {
                  await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`);
                  await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`);
                  //console.log('removed old orders successfully');
                  //console.log('1');
                  const oldX = parseFloat(stock.x);
                  const oldY = parseFloat(stock.y);
                  let newX, newY;
          
                  if (action === 'buy') {
                    newX = oldX - 1;
                    newY = roundReg(oldY + giverPrice, 2);
                  } else if (action === 'sell') {
                    newX = oldX + 1;
                    newY = roundReg(oldY - giverPrice, 2);
                  }
                  //console.log('2');
                  const updatedStock = await getNewPrices(stock, newX, newY);
                  const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);
          
                  const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
                  const opts = { fields };
                  const csvData = parse(updatedStockData, opts);
                  //console.log('3');
                  fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);
          
                  //console.log(`Updated LP values for ${ticker}`);
                }
              } else {
                console.log('giver is not a lp');
                if (action === 'buy') {
                  await updateUserBalance(giverId, giverPrice * fulfillQuantity);
                  console.log(`Adding ${fulfillQuantity} * ${giverPrice} = ${fulfillQuantity * giverPrice} to user ${giverId}`);
                  //await updateUserInventory(giverId, stock, fulfillQuantity, 'sell'); // no need to remove items from givers inv, as they are already removed to create sell order
                } else if (action === 'sell') {
                  //await updateUserBalance(giverId, -orderPrice * fulfillQuantity); // no need to remove balance from giver, as its already removed to create buy order
                  await updateUserInventory(giverId, ticker, fulfillQuantity, 'buy');
                }

                // Remove the fulfilled quantity from the giver's order
                await removeOrder(ticker, oppositeAction, fulfillQuantity, giverPrice, giverId);
              }
            //console.log('4');

            // Log the fulfillment
            console.log(`Fulfilled ${fulfillQuantity} of ${oppositeAction} from ${giverId} order for ${ticker} at price ${giverPrice}`);
            }

            // Break if the remaining quantity is zero
            if (remainingQuantity === 0) {
              break;
            }
          } else {
            break; // No more orders can be fulfilled at this price
          }
        }
      }
    } else {
      console.log('no opposite orders');
    }

    // Place any remaining quantity as a new order
    if (remainingQuantity > 0) {
      if (!userId.startsWith('LP-')) {
        if (action === 'buy') {
          await updateUserBalance(userId, -price * remainingQuantity);
          //await updateUserInventory(userId, ticker, fulfillQuantity, 'buy');
        } else if (action === 'sell') {
          //await updateUserBalance(userId, giverPrice * fulfillQuantity);
          await updateUserInventory(userId, ticker, remainingQuantity, 'sell');
        }
      }

      const orderFile = path.join(orderDir, `${action}.csv`);
      const userDir = path.resolve(__dirname, `../orders/users`);
      const userOrderFile = path.resolve(userDir, `${userId}.csv`);

      // Ensure stock directory exists
      if (!fs.existsSync(orderDir)) {
        fs.mkdirSync(orderDir, { recursive: true });
      }

      // Ensure user directory exists
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      let existingOrders = [];
      if (fs.existsSync(orderFile)) {
        existingOrders = await readCSV(orderFile);
      }

      const newOrder = { q: String(remainingQuantity), price: String(price), user: String(userId), date: String(date) };
      const updatedOrders = insertOrder(existingOrders, newOrder, action);
      const csvData = parse(updatedOrders);
      fs.writeFileSync(orderFile, csvData);

      console.log(`Function: User ${userId} created ${type} ${action} order for ${ticker} of ${remainingQuantity} at price of ${price}, date: ${date}`);
    
      // Read and update user's orders
      const userOrders = [];
      if (fs.existsSync(userOrderFile)) {
        await new Promise((resolve, reject) => {
          fs.createReadStream(userOrderFile)
            .pipe(csv())
            .on('data', (row) => {
              userOrders.push(row);
            })
            .on('end', () => {
              userOrders.push({ stock: String(ticker), action: String(action), q: String(remainingQuantity), price: String(price), date: String(date) });
              const userCsvData = parse(userOrders);
              fs.writeFileSync(userOrderFile, userCsvData);
              resolve();
            });
        });
      } else {
        const newUserOrders = [{ stock: String(ticker), action: String(action), q: String(remainingQuantity), price: String(price), date: String(date) }];
        const userCsvData = parse(newUserOrders);
        fs.writeFileSync(userOrderFile, userCsvData);
      }
    }
  }


  //await updateStockPrices(ticker); // Ensure this runs after order is added
  //console.log(`updating ${ticker} price from addOrder`);
};


// Main function to add order
const addOrder = async (ticker, action, quantity, price, userId, type) => {
  const validateOrder = async (ticker, action, price, userId) => {
    const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
    const stockInfoData = await readCSV(stockInfoFile).catch(() => []);
    const validTickers = stockInfoData.map(stock => stock.ticker);
  
    const userDetailsFile = path.resolve(__dirname, '../users/details.csv');
    const userDetailsData = await readCSV(userDetailsFile).catch(() => []);
    const validUserIds = userDetailsData.map(user => user.user_id);
  
    if (!validTickers.includes(ticker)) {
      console.log(`Invalid ticker: ${ticker}`);
      return false;
    }
  
    if (action !== 'buy' && action !== 'sell') {
      console.log(`Invalid action: ${action}`);
      return false;
    }
  
    if (isNaN(price) || price <= 0 || !/^\d+(\.\d{1,2})?$/.test(price.toString())) {
      console.log(`Invalid price: ${price}`);
      return false;
    }
  
    if (!validUserIds.includes(userId) && !userId.startsWith('LP-')) {
      console.log(`Invalid userId: ${userId}`);
      return false;
    }
  
    return true;
  };

  //const addToUserBalanceAfterTax = async (ticker, userId, price, quantity) => {
  const addToUserBalanceAfterTax = async (ticker, userId, priceTimesQuantity) => {
    //const priceTimesQuantity = roundReg(price * quantity, 2);
    //const priceTimesQuantity = price * quantity;
    const saleTaxAmount = Math.max(roundReg(priceTimesQuantity * taxP, 2), 0.01);
    console.log(`the tax rounded should be ${saleTaxAmount}`);
    const taxToLP = roundUp(saleTaxAmount / 2, 2);
    const taxToOne = roundReg(saleTaxAmount - taxToLP, 2);
    console.log(`LP gets: ${taxToLP}, id one gets: ${taxToOne}`);
    const receivedAmountOnSale = roundReg(priceTimesQuantity - saleTaxAmount, 2)
    console.log(`the after tax received should be ${receivedAmountOnSale}`);
    // sellers balance is updated with after tax amount
    await updateUserBalance(userId, receivedAmountOnSale);

    // add LPs share of tax to that LPs y
    const filePath = path.resolve(__dirname, '../stocks.csv');
    const stockData = await readCSV(filePath);
    // Find and update the specific stock's 'y' value
    const updatedStockData = stockData.map(s => {
      if (s.ticker === ticker) {
        const newY = roundReg(parseFloat(s.y) + taxToLP, 2);
        console.log(`added ${taxToLP} to ${ticker} LP, new Y: ${newY}`);
        return { ...s, y: String(newY) }; // Only update the 'y' field
      }
      return s; // No change for other stocks
    });
    
    // Convert the updated data back to CSV format
    const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
    const opts = { fields };
    const csvData = parse(updatedStockData, opts);

    // Write the updated data back to the CSV file
    await fs.writeFileSync(filePath, csvData);

    if (taxToOne > 0) {
      await updateUserBalance("1", taxToOne);
    }
  }

  const updateAskerDetails = async (action, ticker, userId, quantity, price) => {
    if (action === 'buy') {
      await updateUserBalance(userId, -price * quantity);
      await updateUserInventory(userId, ticker, quantity, 'buy');
    } else if (action === 'sell')  {
      await updateUserInventory(userId, ticker, quantity, 'sell');
      // instead of adding full price to the users inventory, but subtract the tax and then add it
      await addToUserBalanceAfterTax(ticker, userId, price * quantity);

      //await updateUserBalance(userId, price * quantity);

      // function that takes the amount (price * quantity), userId, ticker and does this
      // probably should also be called by updateGiverDetails (if they sell and asker buys)
      
      //const saleTaxAmount = Math.max(parseFloat((price * quantity * taxP).toFixed(2)), 0.01);
      //console.log(`the tax should be ${saleTaxAmount}`);

      /*
      const taxToLP = parseFloat((saleTaxAmount / 2).toFixed(2));
      const taxToOne = parseFloat((saleTaxAmount - taxToLP).toFixed(2));
      console.log(`LP gets: ${taxToLP}, id one gets: ${taxToOne}`);
      const receivedAmountOnSale = parseFloat((price * quantity - saleTaxAmount).toFixed(2));
      console.log(`the after tax received should be ${receivedAmountOnSale}`);
      */
      /*
      const priceTimesQuantity = roundReg(price * quantity, 2);
      const saleTaxAmountRounded = Math.max(roundReg(priceTimesQuantity * taxP, 2), 0.01);
      console.log(`the tax rounded should be ${saleTaxAmountRounded}`);
      const taxToLPRounded = roundUp(saleTaxAmountRounded / 2, 2);
      const taxToOneRounded = roundReg(saleTaxAmountRounded - taxToLPRounded, 2);
      console.log(`LP gets: ${taxToLPRounded}, id one gets: ${taxToOneRounded}`);
      const receivedAmountOnSaleRounded = roundReg(priceTimesQuantity - saleTaxAmountRounded, 2)
      console.log(`the after tax received should be ${receivedAmountOnSaleRounded}`);

      await updateUserBalance(userId, receivedAmountOnSaleRounded);
      */
      /*
      const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
      const stock = stockData.find(s => s.ticker === ticker);
      const oldY = parseFloat(stock.y);
      newY = roundReg(oldY + taxToLPRounded, 2);
      
      const updatedStock = {
        ...stock,
        x: String(stock.x),
        y: String(roundReg(stock.y + taxToLPRounded, 2)),
        price: String(stock.price),
        L: String(stock.L),
        buyP: String(stock.buyP),
        sellP: String(stock.sellP)
      };

      const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
      const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);

      const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
      const opts = { fields };
      const csvData = parse(updatedStockData, opts);
      fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);
      }*/
      /*
      const filePath = path.resolve(__dirname, '../stocks.csv');
      const stockData = await readCSV(filePath);
      // Find and update the specific stock's 'y' value
      const updatedStockData = stockData.map(s => {
        if (s.ticker === ticker) {
          const newY = roundReg(parseFloat(s.y) + taxToLPRounded, 2);
          console.log(`added ${taxToLPRounded} to ${ticker} LP, new Y: ${newY}`);
          return { ...s, y: String(newY) }; // Only update the 'y' field
        }
        return s; // No change for other stocks
      });
      
      // Convert the updated data back to CSV format
      const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
      const opts = { fields };
      const csvData = parse(updatedStockData, opts);

      // Write the updated data back to the CSV file
      await fs.writeFileSync(filePath, csvData);

      if (taxToOneRounded > 0) {
        await updateUserBalance("1", taxToOneRounded);
      }
      */
    }
  };

  const updateGiverDetails = async (action, ticker, quantity, price, giverId) => {
    await removeOrder(ticker, action === 'buy' ? 'sell' : 'buy', quantity, price, giverId);
    if (action === 'sell') {
      await updateUserInventory(giverId, ticker, quantity, 'buy');
    } else if (action === 'buy') {
      // perhaps price * quantity
      // shouldnt receive the full amount, taxes should be subtracted
      //await updateUserBalance(giverId, price);
      // instead of adding full price to the users inventory, but subtract the tax and then add it
      await addToUserBalanceAfterTax(ticker, giverId, price * quantity);
    }
  };

  const updateLPDetails = async (action, ticker, price) => {
    const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
    const stock = stockData.find(s => s.ticker === ticker);
    if (stock) {
      //await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`);
      //await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`);
      const oldX = parseFloat(stock.x);
      const oldY = parseFloat(stock.y);
      let newX, newY;
  
      if (action === 'buy') {
        // user is buying, LP is selling
        // we need to instantly remove old sellOrder and create new one
        // but the buyOrder should be updated after 3 mins
        //await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`, true);
        newX = oldX - 1;
        newY = roundReg(oldY + price, 2);
      } else if (action === 'sell') {
        // user is selling, LP is buying
        // we need to instantly remove old buyOrder and create new one
        // but the sellOrder should be updated after 3 mins
        //await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`, true);
        newX = oldX + 1;
        newY = roundReg(oldY - price, 2);
      }
  
      const { buyPrice, sellPrice } = await getNewPrices(stock, newX, newY);
      const orderDelay = 10000;

      if (action === 'buy') {
        if (sellPrice !== '-') {
          const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
          const stockInfo = stockInfos.find(s => s.ticker === ticker);
          if (parseFloat(stockInfo.buyP) < parseFloat(sellPrice)) {
            console.log(`adjusting sell order from ${stockInfo.buyP} to ${sellPrice}`);
            await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`, true);
            await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
          } else {
            console.log(`not removing/adding sell order, as it would decrease from ${stockInfo.buyP} to ${sellPrice}`);
          }
          
          //await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
        } else {
          await removeOrder(ticker, 'sell', 1, stock.sellP, `LP-${ticker}`, true);
        }
        //console.log(`Adjusted sell order, gonna remove buy order at ${stock.buyP} and create new one at ${buyPrice} after ${orderDelay/1000}s`);
        console.log(`Adjusted buy order, gonna adjust the sell order after ${orderDelay/1000}s`);
        setTimeout(async () => {
          console.log(`timeout of ${orderDelay/1000}s has ended`);
          /*
          await removeOrder(ticker, 'buy', 1, oldBuyP, `LP-${ticker}`);
          if (buyPrice !== '-') {
            await addOrder(ticker, 'buy', 1, newBuyP, `LP-${ticker}`, 'book');
          }
          */
          const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
          const stock = stockData.find(s => s.ticker === ticker);
          const { buyPrice, sellPrice } = await getNewPrices(stock, parseFloat(stock.x), parseFloat(stock.y));
          const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
          const stockInfo = stockInfos.find(s => s.ticker === ticker);
          console.log(`Timeout expired, removing buy order at ${stockInfo.sellP} and creating new at ${buyPrice}`);
          console.log(`old stocks.csv buy order price: ${stock.buyP}`);
          if (parseFloat(buyPrice) !== parseFloat(stockInfo.sellP)) {
            console.log(`sell order price should be $${sellPrice}`);
            await removeOrder(ticker, 'buy', 1, stockInfo.sellP, `LP-${ticker}`, true);
            if (buyPrice !== '-') {
              await addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`, 'book');
            }
          }

        }, orderDelay); // 3 minutes delay (180,000 milliseconds)

      } else {
        if (buyPrice !== '-') {
          const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
          const stockInfo = stockInfos.find(s => s.ticker === ticker);
          if (parseFloat(stockInfo.sellP) > parseFloat(buyPrice)) {
            console.log(`adjusting buy order from ${stockInfo.sellP} to ${buyPrice}`);
            await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`, true);
            await addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`, 'book');    
          } else {
            console.log(`not removing/adding buy order, as it would increase from ${stockInfo.sellP} to ${buyPrice}`);
            //console.log(`not removing/adding order, as both should be ${buyPrice}`);
          }
          //await addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`, 'book');
        } else {
          await removeOrder(ticker, 'buy', 1, stock.buyP, `LP-${ticker}`, true);
        }
        //console.log(`Adjusted buy order, gonna remove sell order at ${stock.sellP} and create new one at ${sellPrice} after ${orderDelay/1000}s`);
        console.log(`Adjusted buy order, gonna adjust the sell order after ${orderDelay/1000}s`);
        setTimeout(async () => {
          console.log(`timeout of ${orderDelay/1000}s has ended`);
          /*
          await removeOrder(ticker, 'sell', 1, oldSellP, `LP-${ticker}`);
          if (sellPrice !== '-') {
            await addOrder(ticker, 'sell', 1, newSellP, `LP-${ticker}`, 'book');
          }
          */
          const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
          const stock = stockData.find(s => s.ticker === ticker);
          const { buyPrice, sellPrice } = await getNewPrices(stock, parseFloat(stock.x), parseFloat(stock.y));
          const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
          const stockInfo = stockInfos.find(s => s.ticker === ticker);
          console.log(`Timeout expired, removing sell order at ${stockInfo.buyP} and creating new at ${sellPrice}`);
          console.log(`old stocks.csv sell order price: ${stock.sellP}`);
          if (parseFloat(sellPrice) !== parseFloat(stockInfo.buyP)) {
            console.log(`buy order price should be $${buyPrice}`);
            await removeOrder(ticker, 'sell', 1, stockInfo.buyP, `LP-${ticker}`, true);
            if (sellPrice !== '-') {
              await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
            }   
          }

        }, orderDelay); // 3 minutes delay (180,000 milliseconds)
      }


    }
  };

  const placeRemainingOrder = async (ticker, action, quantity, price, userId) => {
    console.log(`${userId} is writing to book`);
    const orderDir = path.resolve(__dirname, `../orders/${ticker}`);
    const userDir = path.resolve(__dirname, `../orders/users`);
    const userOrderFile = path.resolve(userDir, `${userId}.csv`);
    const date = new Date().toISOString();
  
    if (!fs.existsSync(orderDir)) {
      fs.mkdirSync(orderDir, { recursive: true });
    }
  
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
  
    let existingOrders = [];
    const orderFile = path.join(orderDir, `${action}.csv`);
    if (fs.existsSync(orderFile)) {
      existingOrders = await readCSV(orderFile);
    }
  
    const newOrder = { q: String(quantity), price: String(price), user: String(userId), date: String(date) };
    const updatedOrders = insertOrder(existingOrders, newOrder, action);
    const csvData = parse(updatedOrders);
    fs.writeFileSync(orderFile, csvData);
  
    console.log(`User ${userId} created ${action} order for ${ticker} of ${quantity} at price of ${price}, date: ${date}`);
  
    const userOrders = [];
    if (fs.existsSync(userOrderFile)) {
      await new Promise((resolve, reject) => {
        fs.createReadStream(userOrderFile)
          .pipe(csv())
          .on('data', (row) => {
            userOrders.push(row);
          })
          .on('end', () => {
            userOrders.push({ stock: String(ticker), action: String(action), q: String(quantity), price: String(price), date: String(date) });
            const userCsvData = parse(userOrders);
            fs.writeFileSync(userOrderFile, userCsvData);
            resolve();
          });
      });
    } else {
      const newUserOrders = [{ stock: String(ticker), action: String(action), q: String(quantity), price: String(price), date: String(date) }];
      const userCsvData = parse(newUserOrders);
      fs.writeFileSync(userOrderFile, userCsvData);
    }
  };

  const handleMarketOrder = async (oppositeOrders, action, ticker, price, userId) => {
    const bestOffer = oppositeOrders[0];
    const giverPrice = parseFloat(bestOffer.price);
    const giverId = bestOffer.user;
  
    if (price !== giverPrice) {
      console.log('Price mismatch');
      await updateStockPrices(ticker);
      return;
    }
  
    const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
    const askerUser = users.find(u => u.user_id === userId);
    if (!askerUser) {
      return res.status(404).send('User not found');
    }
  
    if (userId === giverId) {
      await cancelOrder(ticker, action === 'buy' ? 'sell' : 'buy', 1, giverPrice, giverId);
      console.log(`User ${userId} tried to ${action} from himself`);
      return;
    }
  
    const askerBalance = parseFloat(askerUser.balance);
    const askerInventoryPath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
    let askerInventory = [];
    if (fs.existsSync(askerInventoryPath)) {
      askerInventory = JSON.parse(fs.readFileSync(askerInventoryPath, 'utf-8'));
    }
    const askerInventoryStock = askerInventory.find(s => s.ticker === ticker);
  
    if (action === 'buy' && askerBalance < giverPrice) {
      console.log(`User ${userId} tried to buy stock ${ticker} with insufficient balance`);
      return;
    } else if (action === 'sell' && (!askerInventoryStock || askerInventoryStock.quantity <= 0)) {
      console.log(`User ${userId} tried to sell stock ${ticker} with insufficient quantity`);
      return;
    }
  
    await updateAskerDetails(action, ticker, userId, 1, giverPrice);
  
    if (giverId.startsWith('LP-')) {
      await updateLPDetails(action, ticker, giverPrice);
    } else {
      await updateGiverDetails(action, ticker, 1, giverPrice, giverId);
    }
  };

  const handleBookOrder = async (oppositeOrders, action, ticker, price, userId, quantity) => {
    let remainingQuantity = quantity;
  
    if (oppositeOrders.length > 0) {
      const bestPrice = parseFloat(oppositeOrders[0].price);
      if ((action === 'buy' && price < bestPrice) || (action === 'sell' && price > bestPrice)) {
        console.log('No favorable price found, placing on the book');
      } else {
        for (let i = 0; i < oppositeOrders.length && remainingQuantity > 0; i++) {
          const order = oppositeOrders[i];
          const giverPrice = parseFloat(order.price);
          const orderQuantity = parseInt(order.q);
  
          if ((action === 'buy' && price >= giverPrice) || (action === 'sell' && price <= giverPrice)) {
            const fulfillQuantity = Math.min(remainingQuantity, orderQuantity);
            remainingQuantity -= fulfillQuantity;
  
            const giverId = order.user;
            if (userId === giverId) {
              await cancelOrder(ticker, action === 'buy' ? 'sell' : 'buy', fulfillQuantity, giverPrice, giverId);
              console.log(`User ${userId} tried to ${action} from himself`);
            } else {
              await updateAskerDetails(action, ticker, userId, fulfillQuantity, giverPrice);
              if (giverId.startsWith('LP-')) {
                await updateLPDetails(action, ticker, giverPrice);
                if (remainingQuantity > 0) {
                  console.log(`Trying to fulfill ${action} order at $${price} of ${remainingQuantity} quantity`);

                  // Re-fetch oppositeOrders after updating LP details
                  oppositeOrders = await readCSV(path.join(orderDir, `${action === 'buy' ? 'sell' : 'buy'}.csv`));
                  i = -1;
                  console.log(`rereading ${action === 'buy' ? 'sell' : 'buy'} orders`);
                  console.log(oppositeOrders);
                }
              } else {
                await updateGiverDetails(action, ticker, fulfillQuantity, giverPrice, giverId);
              }
            }
            console.log(`Fulfilled ${fulfillQuantity} of ${action === 'buy' ? 'sell' : 'buy'} from ${giverId} order for ${ticker} at price ${giverPrice}`);
            if (remainingQuantity === 0) {
              break;
            }
          } else {
            break;
          }
        }
      }
    }
  
    if (remainingQuantity > 0) {
      await placeRemainingOrder(ticker, action, remainingQuantity, price, userId);
    }
  };

  if (!await validateOrder(ticker, action, price, userId)) {
    console.log(`Validation failed for order: User ${userId} ${action} ${ticker} ${quantity} at ${price}`);
    return;
  }

  const orderDir = path.resolve(__dirname, `../orders/${ticker}`);
  const oppositeAction = action === 'buy' ? 'sell' : 'buy';
  const oppositeOrderFile = path.join(orderDir, `${oppositeAction}.csv`);

  let oppositeOrders = [];
  if (fs.existsSync(oppositeOrderFile)) {
    oppositeOrders = await readCSV(oppositeOrderFile);
  }

  if (type === 'market') {
    await handleMarketOrder(oppositeOrders, action, ticker, price, userId);
  } else if (type === 'book') {
    await handleBookOrder(oppositeOrders, action, ticker, price, userId, quantity);
  }
  console.log('updating stock from addOrder');
  await updateStockPrices(ticker);
};


// (old) Function to add order
/*
const addOrderOld = async (stock, action, quantity, price, userId) => {
  const orderDir = path.resolve(__dirname, `../orders/${stock}`);
  const orderFile = path.join(orderDir, `${action}.csv`);
  //const orderFile = path.join(__dirname, `../orders/${stock}/${action}.csv`);
  const userDir = path.resolve(__dirname, `../orders/users`);
  const userOrderFile = path.resolve(userDir, `${userId}.csv`);
  const date = new Date().toISOString();

  // Ensure stock directory exists
  if (!fs.existsSync(orderDir)) {
    fs.mkdirSync(orderDir, { recursive: true });
  }

  // Ensure user directory exists
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Read existing orders for the stock
  const existingOrders = [];
  if (fs.existsSync(orderFile)) {
    fs.createReadStream(orderFile)
      .pipe(csv())
      .on('data', (row) => {
        existingOrders.push(row);
      })
      .on('end', async () => {
        //const newOrder = { q: quantity, price: price, user: userId, date };
        const newOrder = { q: String(quantity), price: String(price), user: String(userId), date: String(date) };
        const updatedOrders = insertOrder(existingOrders, newOrder, action);
        const csvData = parse(updatedOrders);
        fs.writeFileSync(orderFile, csvData);
        await updateStockPrices(stock); // Ensure this runs after order is added
        console.log('updating stock price from addOrder');
        console.log(`Function: User ${userId} created ${action} order for ${stock} of ${quantity} at price of ${price}`);
      });
  } else {
    //const newOrder = [{ q: quantity, price: price, user: userId, date }];
    const newOrder = [{ q: String(quantity), price: String(price), user: String(userId), date: String(date) }];
    const csvData = parse(newOrder);
    fs.writeFileSync(orderFile, csvData);
    await updateStockPrices(stock); // Ensure this runs after order is added
    console.log(`updating ${stock} price from addOrder`);
    console.log(`Function: User ${userId} created ${action} order for ${stock} of ${quantity} at price of ${price}`);
  }

  // Read and update user's orders
  const userOrders = [];
  if (fs.existsSync(userOrderFile)) {
    await new Promise((resolve, reject) => {
      fs.createReadStream(userOrderFile)
        .pipe(csv())
        .on('data', (row) => {
          userOrders.push(row);
        })
        .on('end', () => {
          //console.log(`User orders before addition: ${JSON.stringify(userOrders, null, 2)}`);

          //userOrders.push({ stock, action, q: quantity, price: price, date });
          userOrders.push({ stock: String(stock), action: String(action), q: String(quantity), price: String(price), date: String(date) });

          //console.log(`User orders after addition: ${JSON.stringify(userOrders, null, 2)}`);
          const userCsvData = parse(userOrders);
          fs.writeFileSync(userOrderFile, userCsvData);
          resolve();
        });
    });
  } else {
    //const newUserOrders = [{ stock, action, q: quantity, price: price, date }];
    const newUserOrders = [{ stock: String(stock), action: String(action), q: String(quantity), price: String(price), date: String(date) }];
    //console.log(`Creating initial user order: ${JSON.stringify(newUserOrders, null, 2)}`);
    const userCsvData = parse(newUserOrders);
    fs.writeFileSync(userOrderFile, userCsvData);
  }
};
*/
  
// Route to trigger removing an order
router.post('/data/remove-order', async (req, res) => {
  if (!req.session.userId) {
    console.log('User not logged in');
    return res.status(401).send('User not logged in');
  }

  const { ticker, orderType, quantity, price } = req.body;
  const userId = req.session.userId;

  try {
    await removeOrder(ticker, orderType, quantity, price, userId);
    res.status(200).send('Order removed successfully');
    console.log(`User ${userId} removed ${orderType} order for ${ticker} of ${quantity} at price of ${price}`);
  } catch (error) {
    console.error('Error removing order:', error);
    res.status(500).send('Error removing order');
  }
});

const removeOrder = async (stock, action, quantity, price, userId, allOrders = false) => {
  const orderDir = path.resolve(__dirname, `../orders/${stock}`);
  const orderFile = path.join(orderDir, `${action}.csv`);
  const userOrderFile = path.resolve(__dirname, `../orders/users/${userId}.csv`);

  // Read existing orders for the stock
  let existingOrders = await readCSV(orderFile).catch(() => []);
  let orderFound = false;

  // Log the existing orders before removal
  //console.log(`Existing ${action} orders before removal: ${JSON.stringify(existingOrders, null, 2)}`);

  existingOrders = existingOrders.map(order => {
    if (allOrders && order.user === String(userId)) {
      return null;
    } else if (!allOrders && 
               !orderFound && 
               order.user === String(userId) && 
               parseFloat(order.price) === parseFloat(price)) {
      const newQuantity = parseInt(order.q) - quantity;
      orderFound = true;
      if (newQuantity > 0) {
        return { ...order, q: newQuantity.toString() };
      }
      return null;
    }
    return order;
  }).filter(order => order !== null);


  // Log the updated orders after removal
  //console.log(`Updated ${action} orders after removal: ${JSON.stringify(existingOrders, null, 2)}`);
  
  //writeCSV(orderFile, existingOrders, ['q', 'price', 'user', 'date']);
  // Write the updated orders back to the order file
  await writeCSV(orderFile, existingOrders);

  // Update stock prices after removing the order
  //await updateStockPrices(stock);
  //console.log('updating stock price from removeOrder');
  console.log(`Function: User ${userId} removed ${action} order for ${stock} of ${quantity} at price of ${price}`);

  // Read and update user's orders
  let userOrders = await readCSV(userOrderFile).catch(() => []);
  orderFound = false; // Reset orderFound for userOrders

  // Log the user's orders before removal
  //console.log(`User orders before removal: ${JSON.stringify(userOrders, null, 2)}`);

  userOrders = userOrders.map(order => {
    if (allOrders && order.stock === stock && order.action === action) {
      return null;
    } else if (!allOrders && 
               !orderFound && 
               order.stock === stock && 
               order.action === action && 
               parseFloat(order.price) === parseFloat(price)) {
      const newQuantity = parseInt(order.q) - quantity;
      orderFound = true;
      if (newQuantity > 0) {
        return { ...order, q: newQuantity.toString() };
      }
      return null;
    }
    return order;
  }).filter(order => order !== null);

  // Log the updated user's orders after removal
  //console.log(`Updated user orders after removal: ${JSON.stringify(userOrders, null, 2)}`);

  await writeCSV(userOrderFile, userOrders, ['stock', 'action', 'q', 'price', 'date']);
};

const cancelOrder = async (ticker, action, quantity, price, userId) => {
  console.log(`cancelling users ${userId} stock ${ticker} ${action} order at ${price} for ${quantity}`);
  await removeOrder(ticker, action, quantity, price, userId);
  if (action === 'buy') {
    updateUserBalance(userId, price * quantity);
  } else if (action === 'sell') {
    updateUserInventory(userId, ticker, quantity, 'buy');
  }
  await updateStockPrices(ticker);
  console.log('updating stock price from cancelOrder');
};


// --- UPDATING ---
let selectedStock = null; // Global variable to store the selected stock

// Route to trigger stock price update
router.post('/update-stock-prices', async (req, res) => {
  const { ticker, updatedTime } = req.body;
  console.log(`TICKER: ${ticker}, UPDATED TIME: ${updatedTime}`);
  try {
    selectedStock = ticker; // Set the selected stock
    console.log(`Updating stock price for ${ticker}`);
    const updatedStockData = await updateStockPrices(ticker);
    if (updatedStockData) {
      res.status(200).send(`Stock prices for ${ticker} updated successfully`);
    } else {
      res.status(404).send(`No orders found for ${ticker}`);
    }
  } catch (error) {
    console.error('Error updating stock prices:', error);
    res.status(500).send('Error updating stock prices');
  } finally {
    selectedStock = null; // Reset the selected stock after updating
  }
});

const updateStockPrices = async (ticker) => {
  const buyFile = path.resolve(__dirname, `../orders/${ticker}/buy.csv`);
  const sellFile = path.resolve(__dirname, `../orders/${ticker}/sell.csv`);
  const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
  const sortedStockInfoFile = path.resolve(__dirname, '../sorted_stock_info.csv');

  const [topBuyOrder, topSellOrder] = await Promise.all([
    fs.existsSync(buyFile) ? readTopOrder(buyFile) : null,
    fs.existsSync(sellFile) ? readTopOrder(sellFile) : null
  ]);

  if (!topBuyOrder && !topSellOrder) {
    console.log(`!No order price found for ${ticker}, setting price as '-' !`);
  }

  const stockInfoData = [];
  const updatedTime = new Date().toISOString(); // Get current timestamp

  await new Promise((resolve, reject) => {
    fs.createReadStream(stockInfoFile)
      .pipe(csv())
      .on('data', (row) => {
        if (row.ticker === ticker) {
          row.buyP = topSellOrder ? topSellOrder.price : '-';
          row.sellP = topBuyOrder ? topBuyOrder.price : '-';
          row.updated = updatedTime; // Add updated time
        }
        stockInfoData.push(row);
      })
      .on('end', () => {
        const fields = ['ticker', 'buyP', 'sellP', 'type', 'updated'];
        const opts = { fields };
        const csvData = parse(stockInfoData, opts);
        fs.writeFileSync(stockInfoFile, csvData);
        console.log(`!Updated stock_info.csv with new prices for ${ticker} !`);
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  });

  const updatedStockData = { 
    ticker: ticker, 
    buyP: topSellOrder ? topSellOrder.price : '-', 
    sellP: topBuyOrder ? topBuyOrder.price : '-',
    updated: updatedTime
  };

  // Broadcast updated stock data to all connected WebSocket clients
  const wss = getWebSocketServer(); // Get the WebSocket server instance
  wss.broadcast({ type: 'update', data: updatedStockData });

  // Call the function to update the sorted CSV file
  updateSortedCsv(stockInfoFile, sortedStockInfoFile);

  return updatedStockData;
};

const updateSortedCsv = (sourceFilePath, sortedFilePath) => {
  const readCsv = (filePath) => {
    return new Promise((resolve, reject) => {
      const data = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => data.push(row))
        .on('end', () => resolve(data))
        .on('error', (error) => reject(error));
    });
  };

  const writeCsv = (filePath, data, fieldnames) => {
    const csvData = parse(data, { fields: fieldnames });
    fs.writeFileSync(filePath, csvData);
  };

  const sortByRecent = (data) => {
    return data.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  };

  readCsv(sourceFilePath).then((data) => {
    const sortedData = sortByRecent(data);
    const fieldnames = ['ticker', 'buyP', 'sellP', 'type', 'updated'];
    writeCsv(sortedFilePath, sortedData, fieldnames);
    console.log(`!Updated ${sortedFilePath} with sorted stock data!`);
  }).catch((error) => {
    console.error('Error updating sorted CSV:', error);
  });
};

// Function to read the top order from a CSV file
const readTopOrder = (filePath) => {
  return new Promise((resolve, reject) => {
    const orders = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        orders.push(row);
      })
      .on('end', () => {
        resolve(orders.length > 0 ? orders[0] : null);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Function to update all stock prices sequentially with a delay
const updateAllStockPrices = async () => {
  const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
  const tickers = [];

  // Read the tickers from stock_info.csv
  await new Promise((resolve, reject) => {
    fs.createReadStream(stockInfoFile)
      .pipe(csv())
      .on('data', (row) => {
        tickers.push(row.ticker);
      })
      .on('end', () => resolve())
      .on('error', (error) => reject(error));
  });

  const delay = 10000; // 5 seconds delay

  const updateTicker = async (ticker) => {
    //console.log(`Updating prices for ${ticker}`);
    try {
      await updateStockPrices(ticker);
    } catch (error) {
      console.error('Error updating stock prices:', error);
      res.status(500).send('Error updating stock prices');
    }
    
  };

  const updateTickersWithDelay = async () => {
    for (let i = 0; i < tickers.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await updateTicker(tickers[i]);
    }
  };

  // Start the update process and then schedule the next round
  while (true) {
    await updateTickersWithDelay();
    console.log('Completed one full cycle of updates. Restarting...');
  }
};


// Start the process of updating all stock prices
updateAllStockPrices();

module.exports = router;
