// main.js
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { performance } = require('perf_hooks');
const { parse } = require('json2csv');
const { getWebSocketServer } = require('./websocket'); // Import the WebSocket getter function
const { readCSV, writeCSV, loadCSV } = require('./csvUtils'); // Import the CSV utility functions
const { accessFile, fileCache } = require('./cache'); // Import the CSV utility functions

const wss = getWebSocketServer(); // Get the WebSocket server instance

// Global cache object
//const cache = {};

// Cache entry structure
// cache = {
//   fileName: {
//     data: <file content>,
//     lastAccessed: <timestamp>,
//     timer: <expiry timer reference>,
//   },
// };

// --- SUPPORT ---
const decimals = 2;
//const minTax = 0 //Math.pow(10, -decimals);
const taxP = 0.01;
const dividendP = 0;
const sellRound = 'up';
const buyRound = 'down';
const lpOrderUpdateTimer = 10000; // time until lp updates opposite direction order

let selectedStock = null; // Global variable to store the selected stock

const activeTimeouts = {}; // Global timeout tracker
const maxTimeouts = 1; // Maximum allowed timeouts per ticker

// Utility function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// function timer
class MultiFunctionTimer {
  constructor() {
    this.timers = {}; // Object to hold timers for different functions
  }

  start(functionName) {
    if (!this.timers[functionName]) {
      this.timers[functionName] = {
        totalTime: 0,
        executionCount: 0,
        startTime: 0,
      };
    }
    this.timers[functionName].startTime = performance.now();
  }

  stop(functionName) {
    if (this.timers[functionName] && this.timers[functionName].startTime) {
      const endTime = performance.now();
      const duration = endTime - this.timers[functionName].startTime;
      this.timers[functionName].totalTime += duration;
      this.timers[functionName].executionCount += 1;
      console.log(
        `Execution ${this.timers[functionName].executionCount} of ${functionName}: ${duration.toFixed(2)} ms`
      );
    } else {
      console.warn(`Timer for function "${functionName}" was not started.`);
    }
  }

  report(functionName) {
    if (this.timers[functionName]) {
      const { totalTime, executionCount } = this.timers[functionName];
      const averageTime = executionCount > 0 ? (totalTime / executionCount) : 0;
      console.log(
        `Total time for ${functionName} (${executionCount} executions): ${totalTime.toFixed(2)} ms`
      );
      console.log(`Average time per execution: ${averageTime.toFixed(2)} ms`);
    } else {
      console.log(`No timing data for function "${functionName}".`);
    }
  }

  reportAll() {
    console.log('--- Timing Report for All Functions ---');
    for (const functionName in this.timers) {
      this.report(functionName);
    }
  }
}
  
// Example usage
const timer = new MultiFunctionTimer();

// function locker
class FunctionLock {
  constructor() {
    this.isLocked = false;
    this.queue = [];
  }

  async lock() {
      if (this.isLocked) {
        // Create a promise that will be resolved later
        const unlockPromise = new Promise((resolve) => this.queue.push(resolve));
        await unlockPromise;
      } else {
        this.isLocked = true;
      }
  }

  unlock() {
      if (this.queue.length > 0) {
        // Resolve the next promise in the queue
        const nextUnlock = this.queue.shift();
        nextUnlock();
      } else {
        this.isLocked = false;
      }
  }
}

function roundUp (amount, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.ceil(amount * factor) / factor;
};

function roundDown (amount, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.floor(amount * factor) / factor;
};

function roundReg (amount, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
};


// --- LP MATH ---
async function calculatePrices (action, X, Y, virtualX, virtualY) {
  timer.start('calculatePrices');
  const roundPrices = async (price, direction) => {
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

  /*
  X = parseInt(X);
  Y = parseFloat(Y);
  virtualX = parseFloat(virtualX);
  virtualY = parseFloat(virtualY);

  //console.log(`${action}`);

  const totalX = X + virtualX;
  const totalY = Y + virtualY;
  */
  const totalX = parseInt(X) + parseFloat(virtualX);
  virtualY = parseFloat(virtualY);
  Y = parseFloat(Y);
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

  timer.stop('calculatePrices');
  return P;
};

async function calculateL (Pa, Pb, X_r, Y_r) {
  timer.start('calculateL');
  const Pa_sq = Math.sqrt(Pa);
  const Pb_sq = Math.sqrt(Pb);

  const part1 = Pa * Pb * Math.pow(X_r, 2) - 2 * Pa_sq * Pb_sq * X_r * Y_r + 4 * Pb * X_r * Y_r + Math.pow(Y_r, 2);
  const part2 = Pa_sq * Pb_sq * X_r + Y_r;

  const numerator = Math.sqrt(part1) + part2;
  const denominator = 2 * Pa_sq - 2 * Pb_sq;

  const L = - numerator / denominator;
  
  timer.stop('calculateL');
  return parseFloat(L);
};

// Instantiate a lock for the updateStockLine function
const updateStockLineLock = new FunctionLock();

// Function to update the specific line in the CSV
async function oldupdateStockLine (ticker, updatedStock) {
  // Acquire the lock at the beginning of the function
  await updateStockLineLock.lock();
  try {
    timer.start('updateStockLine');
    console.log(`updating only single line, ticker: ${ticker}`);
    //const stockFilePath = path.resolve(__dirname, '../stocks.csv');
    const stockFilePath = await accessFile(path.resolve(__dirname, '../stocks.csv'));
    const tempFilePath = path.resolve(__dirname, '../stocks_temp.csv');

    // Wait until the temp file does not exist
    while (fs.existsSync(tempFilePath)) {
      console.log(`!_!Temporary file exists: ${tempFilePath}. Waiting...`);
      await delay(50); // Wait for 50 milliseconds before checking again
    }

    let needsUpdate = false;
    const readStream = fs.createReadStream(stockFilePath);
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    // Initialize a write stream but don't start writing yet
    const writeStream = fs.createWriteStream(tempFilePath);
    let header = true;

    for await (const line of rl) {
      if (header) {
        // Write the header line as-is
        writeStream.write(`${line}\n`);
        header = false;
        continue;
      }

      const fields = line.split(',');
      const formattedTicker = fields[0].replace(/^"|"$/g, '');

      // Check if this line is the stock we need to update
      if (formattedTicker === ticker) {
        console.log('old line: ', line);
        // Create the updated line with the modified stock data
        const updatedLine = `"${updatedStock.ticker}",${updatedStock.x},${updatedStock.y},${updatedStock.Pa},${updatedStock.Pb},${updatedStock.price},${updatedStock.L},${updatedStock.buyP},${updatedStock.sellP}`;
        
        // Compare the old line with the new line
        if (line.trim() === updatedLine) {
          console.log('new line the same as old, skipping file update.');
          // Close streams and delete the temp file
          writeStream.end(() => {
            fs.unlinkSync(tempFilePath);
            console.log(`Skipped update, removed temp file: ${tempFilePath}`);
          });
          readStream.destroy();
          return;
        } else {
          console.log('new line: ', updatedLine);
          writeStream.write(`${updatedLine}\n`);
          needsUpdate = true;
        }
      } else {
        // Write the unmodified line
        writeStream.write(`${line}\n`);
      }
    }

    // Only replace the original file if an update was necessary
    if (needsUpdate) {
      writeStream.on('finish', () => {
        fs.renameSync(tempFilePath, stockFilePath);
        console.log(`Stock data for ${ticker} updated successfully.`);
      });
    } else {
      // If no update was necessary, delete the temp file
      writeStream.on('finish', () => {
        fs.unlinkSync(tempFilePath);
        console.log(`No changes made to the stock data for ${ticker}.`);
      });
    }

    writeStream.end();
  } catch (error) {
    console.error('Error updating stock line:', error);
    throw error; // Throwing allows the calling function to handle the error and manage the mutex
  } finally {
    // Release the lock when the operation is done
    updateStockLineLock.unlock();
    // Ensure the timer stops even if there is an early return or an error
    timer.stop('updateStockLine');
  }
};

// Example function to update a stock line
async function updateStockLine(ticker, updatedStock) {
  try {
    // Acquire the lock at the beginning of the function
    timer.start('updateStockLine');
    await updateStockLineLock.lock();
    console.log(`Updating only single line, ticker: ${ticker}`);
    console.log(updatedStock);
    
    // Use accessFile with a modification callback
    await accessFile(path.resolve(__dirname, '../'), 'stocks.csv', (data) => {
      let needsUpdate = false;

      // Find and update the line in the data
      for (let i = 0; i < data.length; i++) {
        if (data[i].ticker === ticker) {
          const updatedLine = {
            ticker: updatedStock.ticker,
            x: updatedStock.x,
            y: updatedStock.y,
            Pa: updatedStock.Pa,
            Pb: updatedStock.Pb,
            price: updatedStock.price,
            L: updatedStock.L,
            buyP: updatedStock.buyP,
            sellP: updatedStock.sellP,
          };

          // Compare the old line with the updated line
          if (JSON.stringify(data[i]) !== JSON.stringify(updatedLine)) {
            // Log old and new line when they are different
            console.log('Old line:', data[i]);
            console.log('New line:', updatedLine);

            // Update the line in memory
            data[i] = updatedLine;
            needsUpdate = true;
            console.log(`Updated line for ticker: ${ticker}`);
          } else {
            // If they are the same, log that they are identical
            console.log('Same line:', data[i]);
          }
          break; // Once the line is found, break the loop
        }
      }

      // Print the updated CSV data from memory
      if (false) {
        console.log('Updated CSV data in memory:', data);
      };
      
      // Return the modified data
      return data;
    });

  } catch (error) {
    console.error('Error updating stock line:', error);
    throw error; // Propagate error to handle it in calling code
  } finally {
    // Release the lock when the operation is done
    updateStockLineLock.unlock();
    // Ensure the timer stops even if there is an early return or an error
    timer.stop('updateStockLine');
  }
}


const getNewPrices = async (stock, newX, newY) => {
  timer.start('getNewPrices');
  //console.log(`Received stock: ${stock}, x: ${newX}, y: ${newY}`);
  const Pa = parseFloat(stock.Pa);
  const Pb = parseFloat(stock.Pb);
  const x = parseInt(newX);
  const y = parseFloat(newY);
  //console.log(`X: ${x}, Y: ${y}, Pa: ${Pa}, Pb: ${Pb}`);
  const L = await calculateL(Pa, Pb, x, y);
  const roundedL = roundReg(L, 2)
  //console.log(`current L: ${L}`);
  //const price = y / x;
  const virtualX = L / Math.sqrt(Pb);
  const virtualY = L * Math.sqrt(Pa);
  const ticker = stock.ticker;
  //console.log(`X: ${x}, Y: ${y}, Pa: ${Pa}, Pb: ${Pb}, price: ${y/x}, L: ${L}`);

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
  let buyPrice = roundDown(await calculatePrices('buy', x, y, virtualX, virtualY), 2);
  if (y < buyPrice) {
    buyPrice = '-';
  }
  let sellPrice, price;
  if (x > 0) {
    sellPrice = roundUp(await calculatePrices('sell', x, y, virtualX, virtualY), 2);
    //await addOrder(ticker, 'sell', 1, sellPrice, `LP-${ticker}`, 'book');
    price = roundReg(y / x, 2);
  } else {
    sellPrice = '-';
    price = 999999999.99;
  }
  console.log(`X: ${x}, Y: ${y}, Pa: ${Pa}, Pb: ${Pb}, price: ${y/x}, L: ${L}, buyP: ${buyPrice}, sellP: ${sellPrice}`);
  //console.log('in prices func');
  
  
  const updatedStock = {
    ...stock,
    x: x,
    y: y,
    //price: await roundReg(price, 2),
    price: price,
    //L: await roundReg(L, 2),
    L: roundedL,
    buyP: buyPrice,
    sellP: sellPrice
  };

  //console.log(`getNewPrices stock: `, updatedStock);
  /*
  const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
  const updatedStockData = stockData.map(s => s.ticker === ticker ? updatedStock : s);

  const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
  const opts = { fields };
  const csvData = parse(updatedStockData, opts);
  fs.writeFileSync(path.resolve(__dirname, '../stocks.csv'), csvData);*/
  await updateStockLine(ticker, updatedStock);

  console.log(`buyPrice: ${buyPrice}, sellPrice: ${sellPrice}`);

  timer.stop('getNewPrices');
  return { buyPrice, sellPrice };
};


// --- USER MODIFICATION ---
// Update user balance
const oldupdateUserBalance = async (userId, amount) => {
  timer.start('updateUserBalance');
  const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
  const user = users.find(u => u.user_id === userId);
  if (user) {
    try {
      //await orderMutex.acquire();  // Acquire the mutex lock
      console.log(`Updating user ${userId} balance by amount: ${amount}`);
      oldUserBalance = user.balance;
      user.balance = Number((parseFloat(user.balance) + parseFloat(amount)).toFixed(2));
      console.log(`old balance: ${oldUserBalance}, new balance: ${user.balance}`);
      writeCSV(path.resolve(__dirname, '../users/details.csv'), users);

      // Broadcast updated balance
      //const wss = getWebSocketServer();
      wss.broadcast({ type: 'balanceUpdate', userId, balance: user.balance });
    } catch (error) {
      console.error('Error updating balance:', error);
      throw error; // Throwing allows the calling function to handle the error and manage the mutex
    } finally {
      timer.stop('updateUserBalance');
    }
  }
};

// --- USER MODIFICATION ---
// Update user balance
const updateUserBalance = async (userId, amount) => {
  try {
    timer.start('updateUserBalance');
    // Use accessFile to update the user balance in memory
    await accessFile(path.resolve(__dirname, '../users'), 'details.csv', (data) => {
      //let needsUpdate = false;

      // Find the user in the data and update their balance
      const user = data.find(u => u.user_id === userId);
      if (user) {
        const oldUserBalance = user.balance;
        const newUserBalance = Number((parseFloat(user.balance) + parseFloat(amount)).toFixed(2));

        // Compare old and new balance to check if there is any difference
        if (oldUserBalance !== newUserBalance) {
          console.log(`Old balance: ${oldUserBalance}, New balance: ${newUserBalance}`);
          user.balance = newUserBalance;
          //needsUpdate = true;
          
          // Broadcast updated balance
          wss.broadcast({ type: 'balanceUpdate', userId, balance: newUserBalance });
        } else {
          console.log(`Balance remains the same: ${oldUserBalance}`);
        }

      } else {
        console.log(`User with ID ${userId} not found.`);
      }

      // Return the modified data to be stored in memory
      return data;
    });
 
  } catch (error) {
    console.error('Error updating balance:', error);
    throw error; // Propagate the error for further handling
  } finally {
    timer.stop('updateUserBalance');
  }
};

// Function to update user inventory
const oldupdateUserInventory = async (userId, ticker, quantity, action) => {
  timer.start('updateUserInventory');
  if (userId.startsWith('LP-')) {
    return;
  }

  try {
    //await orderMutex.acquire();  // Acquire the mutex lock

    const filePath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
    let inventory = [];

    if (fs.existsSync(filePath)) {
      inventory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    
    const stock = inventory.find(s => s.ticker === ticker);
    if (action === 'buy') {
      console.log(`Adding ${quantity} of ${ticker} to user ${userId} inventory`);
      if (stock) {
        //const oldQuantity = parseInt(stock.quantity);
        //console.log(`Before adding: quantity = ${stock.quantity}`);
        //console.log(`Before adding: inventory entry = ${JSON.stringify(stock, null, 2)}`);
        stock.quantity += parseInt(quantity);
        //const newQuantity = oldQuantity + parseFloat(quantity);
      } else {
        const newQuantity = parseInt(quantity);
        //console.log(`Before adding: No existing inventory entry for ${ticker}`);
        inventory.push({ ticker, quantity: newQuantity });
      }
      // Log quantity and inventory after adding
      //const updatedStock = inventory.find(s => s.ticker === ticker);
      //console.log(`After adding: quantity = ${updatedStock.quantity}`);
      //console.log(`After adding: inventory entry = ${JSON.stringify(updatedStock, null, 2)}`);

    } else if (action === 'sell') {
      //console.log(`Removing ${quantity} of ${ticker} from user ${userId} inventory`);
      if (stock) {
        //console.log(`Before removing: quantity = ${stock.quantity}`);
        //console.log(`Before removing: inventory entry = ${JSON.stringify(stock, null, 2)}`);
        stock.quantity -= parseInt(quantity);
        //console.log(`After removing: quantity = ${stock.quantity}`);
        if (stock.quantity <= 0) {
          inventory = inventory.filter(s => s.ticker !== ticker);
          //console.log(`After removing: ${ticker} has been removed from inventory because quantity is ${stock.quantity}`);
        } else {
          //console.log(`After removing: inventory entry = ${JSON.stringify(stock, null, 2)}`);
        }
      } else {
        console.log(`!!!IMPORTANT Before removing: User ${userId} No inventory entry for ${ticker} !!!`);
      }
    
    }

    fs.writeFileSync(filePath, JSON.stringify(inventory, null, 2));

    // Broadcast updated inventory
    //const wss = getWebSocketServer();
    wss.broadcast({ type: 'inventoryUpdate', userId, inventory: inventory });
  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error; // Throwing allows the calling function to handle the error and manage the mutex
  } finally {
    timer.stop('updateUserInventory');
  }
};

// Function to update user inventory
const updateUserInventory = async (userId, ticker, quantity, action) => {
  timer.start('updateUserInventory');
  if (userId.startsWith('LP-')) {
    return;
  }

  try {
    // Use accessFile to update the user's inventory in memory
    await accessFile(path.resolve(__dirname, '../users/inventory'), `${userId}.json`, (inventory = []) => {
      const stock = inventory.find(s => s.ticker === ticker);
      
      if (action === 'buy') {
        console.log(`Adding ${quantity} of ${ticker} to user ${userId} inventory`);
        if (stock) {
          stock.quantity += parseInt(quantity);
        } else {
          inventory.push({ ticker, quantity: parseInt(quantity) });
        }
      } else if (action === 'sell') {
        console.log(`Removing ${quantity} of ${ticker} from user ${userId} inventory`);
        if (stock) {
          stock.quantity -= parseInt(quantity);
          if (stock.quantity <= 0) {
            inventory = inventory.filter(s => s.ticker !== ticker);
          }
        } else {
          console.log(`!!!IMPORTANT: User ${userId} has no inventory entry for ${ticker} !!!`);
        }
      }

      // Broadcast updated inventory
      wss.broadcast({ type: 'inventoryUpdate', userId, inventory });

      // Return the modified inventory
      return inventory;
    });

  } catch (error) {
    console.error('Error updating inventory:', error);
    throw error; // Propagate the error for further handling
  } finally {
    timer.stop('updateUserInventory');
  }
};

// --- ORDER HANDLING ---
// Function to insert order in the correct position
const insertOrder = (orders, newOrder, orderType) => {
  timer.start('insertOrder');
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
  timer.stop('insertOrder');
  return orders;
};


// Main function to add order
const addOrder = async (ticker, action, quantity, price, userId, type) => {
  try {
    timer.start('addOrder');
    const validateOrder = async (ticker, action, price, userId) => {
      timer.start('validateOrder');
      //const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
      //const stockInfoData = await readCSV(stockInfoFile).catch(() => []);
      const stockInfoData = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
      const validTickers = stockInfoData.map(stock => stock.ticker);
    
      //const userDetailsFile = path.resolve(__dirname, '../users/details.csv');
      //const userDetailsData = await readCSV(userDetailsFile).catch(() => []);
      const userDetailsData = await accessFile(path.resolve(__dirname, '../users'), 'details.csv');
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
    
      timer.stop('validateOrder');
      return true;
    };

    //const addToUserBalanceAfterTax = async (ticker, userId, price, quantity) => {
    const addToUserBalanceAfterTax = async (ticker, userId, priceTimesQuantity) => {
      timer.start('addToUserBalanceAfterTax');
      // Utility function to normalize ticker values by stripping quotes
      const normalizeTicker = (ticker) => ticker.replace(/^"|"$/g, '');

      //const priceTimesQuantity = roundReg(price * quantity, 2);
      //const priceTimesQuantity = price * quantity;
      const saleTaxAmount = Math.max(roundReg(priceTimesQuantity * taxP, 2), 0.01);
      //console.log(`the tax rounded should be ${saleTaxAmount}`);
      const taxToLP = roundUp(saleTaxAmount / 2, 2);
      const taxToOne = roundReg(saleTaxAmount - taxToLP, 2);
      //console.log(`LP gets: ${taxToLP}, id one gets: ${taxToOne}`);
      const receivedAmountOnSale = roundReg(priceTimesQuantity - saleTaxAmount, 2);
      //console.log(`the sellers balance is updated with after tax: ${receivedAmountOnSale}`);
      // sellers balance is updated with after tax amount
      await updateUserBalance(userId, receivedAmountOnSale);

      // add LPs share of tax to that LPs y
      //const filePath = path.resolve(__dirname, '../stocks.csv');
      //const stockData = await readCSV(filePath);
      const stockData = await accessFile(path.resolve(__dirname, '../'), 'stocks.csv');
      // Find and update the specific stock's 'y' value

      // Find the stock and calculate the updated 'y' value
      const stock = stockData.find(s => normalizeTicker(s.ticker) === normalizeTicker(ticker));
      
      if (stock) {
        const newY = roundReg(parseFloat(stock.y) + taxToLP, 2);
        console.log(`added ${taxToLP} to ${ticker} LP, new Y: ${newY}`);
        
        // Create the updated stock object with the new 'y' value
        const updatedStock = { 
          ...stock, 
          y: newY 
        };

        // Call updateStockLine to update the specific line in the CSV
        await updateStockLine(ticker, updatedStock);
      } else {
        console.error(`Stock with ticker ${ticker} not found.`);
      }
      /*
      const updatedStockData = stockData.map(s => {
        if (s.ticker === ticker) {
          const newY = roundReg(parseFloat(s.y) + taxToLP, 2);
          console.log(`added ${taxToLP} to ${ticker} LP, new Y: ${newY}`);
          return { ...s, y: parseFloat(newY) }; // Only update the 'y' field
        }
        return s; // No change for other stocks
      });
      
      // Convert the updated data back to CSV format
      const fields = ['ticker', 'x', 'y', 'Pa', 'Pb', 'price', 'L', 'buyP', 'sellP'];
      const opts = { fields };
      const csvData = parse(updatedStockData, opts);

      // Write the updated data back to the CSV file
      await fs.writeFileSync(filePath, csvData);*/

      if (taxToOne > 0) {
        await updateUserBalance("1", taxToOne);
      }
      timer.stop('addToUserBalanceAfterTax');
    }

    const updateAskerDetails = async (action, ticker, userId, quantity, price) => {
      timer.start('updateAskerDetails');
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
      }
      timer.stop('updateAskerDetails');
    };

    const updateGiverDetails = async (action, ticker, quantity, price, giverId) => {
      timer.start('updateGiverDetails');
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
      timer.stop('updateGiverDetails');
    };

    const updateLPDetails = async (action, ticker, price) => {
      timer.start('updateLPDetails');
      activeTimeouts[ticker] = activeTimeouts[ticker] || 0;

      //const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
      const stockData = await accessFile(path.resolve(__dirname, '../'), 'stocks.csv');
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
    
        console.log(`giving getNewPrices ${stock.ticker}, ${newX}, ${newY}`);
        const { buyPrice, sellPrice } = await getNewPrices(stock, newX, newY);
        const orderDelay = 10000;

        if (action === 'buy') {
          if (sellPrice !== '-') {
            //const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
            const stockInfos = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
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
          // Limit the number of active timeouts per ticker
          if (activeTimeouts[ticker] < maxTimeouts) {
            activeTimeouts[ticker] += 1;

            console.log(`Adjusted buy order, gonna adjust the sell order after ${orderDelay/1000}s`);
            setTimeout(async () => {
              try {
                console.log(`timeout of ${orderDelay/1000}s has ended`);
                /*
                await removeOrder(ticker, 'buy', 1, oldBuyP, `LP-${ticker}`);
                if (buyPrice !== '-') {
                  await addOrder(ticker, 'buy', 1, newBuyP, `LP-${ticker}`, 'book');
                }
                */
                //const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
                const stock = stockData.find(s => s.ticker === ticker);
                const { buyPrice, sellPrice } = await getNewPrices(stock, parseFloat(stock.x), parseFloat(stock.y));
                //const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
                const stockInfos = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
                const stockInfo = stockInfos.find(s => s.ticker === ticker);
                console.log(`Timeout expired, removing buy order at ${stockInfo.sellP} and creating new at ${buyPrice}`);
                //console.log(`old stocks.csv buy order price: ${stock.buyP}`);
                if (parseFloat(buyPrice) !== parseFloat(stockInfo.sellP)) {
                  console.log(`sell order price should be $${sellPrice}`);
                  await removeOrder(ticker, 'buy', 1, stockInfo.sellP, `LP-${ticker}`, true);
                  if (buyPrice !== '-') {
                    await addOrder(ticker, 'buy', 1, buyPrice, `LP-${ticker}`, 'book');
                  }
                }
              } finally {
                // Decrease the count of active timeouts
                activeTimeouts[ticker] = Math.max(activeTimeouts[ticker] - 1, 0);
                console.log(`Completed timeout for ${ticker}. Remaining active timeouts: ${activeTimeouts[ticker]}`);
              }
            }, orderDelay); // 3 minutes delay (180,000 milliseconds)
          } else {
            console.log(`Skipped setting new timeout for ${ticker} (${action} order). Active timeouts limit reached: ${activeTimeouts[ticker]}`);
          }

        } else {
          if (buyPrice !== '-') {
            //const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
            const stockInfos = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
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
          // Limit the number of active timeouts per ticker
          if (activeTimeouts[ticker] < maxTimeouts) {
            activeTimeouts[ticker] += 1;

            //console.log(`Adjusted buy order, gonna remove sell order at ${stock.sellP} and create new one at ${sellPrice} after ${orderDelay/1000}s`);
            console.log(`Adjusted buy order, gonna adjust the sell order after ${orderDelay/1000}s`);
            setTimeout(async () => {
              try {
                console.log(`timeout of ${orderDelay/1000}s has ended`);
                /*
                await removeOrder(ticker, 'sell', 1, oldSellP, `LP-${ticker}`);
                if (sellPrice !== '-') {
                  await addOrder(ticker, 'sell', 1, newSellP, `LP-${ticker}`, 'book');
                }
                */
                //const stockData = await readCSV(path.resolve(__dirname, '../stocks.csv'));
                const stockData = await accessFile(path.resolve(__dirname, '../'), 'stocks.csv');
                const stock = stockData.find(s => s.ticker === ticker);
                const { buyPrice, sellPrice } = await getNewPrices(stock, parseFloat(stock.x), parseFloat(stock.y));
                //const stockInfos = await readCSV(path.resolve(__dirname, '../stock_info.csv'));
                const stockInfos = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
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
              } finally {
                // Decrease the count of active timeouts
                activeTimeouts[ticker] = Math.max(activeTimeouts[ticker] - 1, 0);
                console.log(`Completed timeout for ${ticker}. Remaining active timeouts: ${activeTimeouts[ticker]}`);
              }
            }, orderDelay); // 3 minutes delay (180,000 milliseconds)
          } else {
            console.log(`Skipped setting new timeout for ${ticker} (${action} order). Active timeouts limit reached: ${activeTimeouts[ticker]}`);
          }
        }


      }
      timer.stop('updateLPDetails');
    };

    const handleMarketOrder = async (oppositeOrders, action, ticker, price, userId) => {
      timer.start('handleMarketOrder');
      try {

        const bestOffer = oppositeOrders[0];
        const giverPrice = parseFloat(bestOffer.price);
        const giverId = bestOffer.user;
      
        if (price !== giverPrice) {
          console.log('Price mismatch');
          await updateStockPrices(ticker);
          return;
        }
      
        //const users = await readCSV(path.resolve(__dirname, '../users/details.csv'));
        const users = await accessFile(path.resolve(__dirname, '../users'), 'details.csv');
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
        /*
        const askerInventoryPath = path.resolve(__dirname, `../users/inventory/${userId}.json`);
        let askerInventory = [];
        if (fs.existsSync(askerInventoryPath)) {
          askerInventory = JSON.parse(fs.readFileSync(askerInventoryPath, 'utf-8'));
        }*/
        const askerInventory = await accessFile(path.resolve(__dirname, '../users/inventory'), `${userId}.json`);
        const askerInventoryStock = askerInventory.find(s => s.ticker === ticker);
      
        if (action === 'buy' && askerBalance < giverPrice) {
          console.log(`User ${userId} tried to buy stock ${ticker} with insufficient balance`);
          return;
        } else if (action === 'sell' && (!askerInventoryStock || askerInventoryStock.quantity <= 0)) {
          console.log(`User ${userId} tried to sell stock ${ticker} with insufficient quantity`);
          return;
        }
      
        await updateAskerDetails(action, ticker, userId, 1, parseFloat(giverPrice));
      
        if (giverId.startsWith('LP-')) {
          await updateLPDetails(action, ticker, giverPrice);
        } else {
          await updateGiverDetails(action, ticker, 1, giverPrice, giverId);
        }
      } catch (error) {
        console.error('Error handling market order:', error);
        throw error; // Throwing allows the calling function to handle the error and manage the mutex
      } finally {
        // Ensure the timer stops even if there is an early return or an error
        timer.stop('handleMarketOrder');
      }
    };

    const handleBookOrder = async (oppositeOrders, action, ticker, price, userId, quantity) => {
      timer.start('handleBookOrder');
      try {
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
                      //oppositeOrders = await readCSV(path.join(orderDir, `${action === 'buy' ? 'sell' : 'buy'}.csv`));
                      if (action === 'buy') {
                        oppositeOrders = await accessFile(path.resolve(__dirname, `../orders/${ticker}`), 'sell.csv');
                      } else {
                        oppositeOrders = await accessFile(path.resolve(__dirname, `../orders/${ticker}`), 'buy.csv');
                      }
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
      } catch (error) {
        console.error('Error handling market order:', error);
        throw error; // Throwing allows the calling function to handle the error and manage the mutex
      } finally {
        // Ensure the timer stops even if there is an early return or an error
        timer.stop('handleBookOrder');
      }
    };

    if (!await validateOrder(ticker, action, price, userId)) {
      console.log(`Validation failed for order: User ${userId} ${action} ${ticker} ${quantity} at ${price}`);
      return;
    }

    //const orderDir = path.resolve(__dirname, `../orders/${ticker}`);
    //const oppositeAction = action === 'buy' ? 'sell' : 'buy';
    //const oppositeOrderFile = path.join(orderDir, `${oppositeAction}.csv`);
    let oppositeOrders = [];
    if (action === 'buy') {
      oppositeOrders = await accessFile(path.resolve(__dirname, `../orders/${ticker}`), 'sell.csv');
    } else {
      oppositeOrders = await accessFile(path.resolve(__dirname, `../orders/${ticker}`), 'buy.csv');
    }

    /*
    if (fs.existsSync(oppositeOrderFile)) {
      oppositeOrders = await readCSV(oppositeOrderFile);
    }*/

    if (type === 'market') {
      await handleMarketOrder(oppositeOrders, action, ticker, price, userId);
    } else if (type === 'book') {
      await handleBookOrder(oppositeOrders, action, ticker, price, userId, quantity);
    }
    console.log('updating stock from addOrder');
    await updateStockPrices(ticker);
    await new Promise(resolve => setTimeout(resolve, 10));
    
  } catch (error) {
    console.error('Error adding order:', error);
    throw error; // Throwing allows the calling function to handle the error and manage the mutex
  } finally {
    timer.stop('addOrder');
    timer.reportAll();
  }
};

const placeRemainingOrder = async (ticker, action, quantity, price, userId) => {
  if (action === 'sell') {
    await updateUserInventory(userId, ticker, quantity, 'sell');
  } else if (action === 'buy') {
    await updateUserBalance(userId, -quantity * price);
  }
  
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

  /*
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

  // Introduce a 10ms delay after placing each order
  //await new Promise(resolve => setTimeout(resolve, 10));*/
  // Using accessFile for orders
  await accessFile(orderDir, `${action}.csv`, (existingOrders = []) => {
    const newOrder = { q: String(quantity), price: String(price), user: String(userId), date: String(date) };
    
    // Use a helper function like insertOrder to add the new order to the array
    const updatedOrders = insertOrder(existingOrders, newOrder, action);
    console.log(`User ${userId} created ${action} order for ${ticker} of ${quantity} at price of ${price}, date: ${date}`);
    
    return updatedOrders; // Return the modified orders array
  });

  // Using accessFile for user orders
  await accessFile(userDir, `${userId}.csv`, (userOrders = []) => {
    const newUserOrder = { stock: String(ticker), action: String(action), q: String(quantity), price: String(price), date: String(date) };

    // Add the new order to the user's orders
    userOrders.push(newUserOrder);
    console.log(`Updated user orders for ${userId}`);
    
    return userOrders; // Return the modified orders array
  });
};

const removeOrder = async (stock, action, quantity, price, userId, allOrders = false) => {
  timer.start('removeOrder');
  /*
  //const orderDir = path.resolve(__dirname, `../orders/${stock}`);
  //const orderFile = path.join(orderDir, `${action}.csv`);
  
  //const userOrderFile = path.resolve(__dirname, `../orders/users/${userId}.csv`);
  

  // Read existing orders for the stock
  //let existingOrders = await readCSV(orderFile).catch(() => []);
  const existingOrders = await accessFile(path.resolve(__dirname, `../orders/${stock}`), `${action}.csv`);
  let orderFound = false;

  // Log the existing orders before removal
  console.log(`Existing ${action} orders before removal: ${JSON.stringify(existingOrders, null, 2)}`);

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
  console.log(`Updated ${action} orders after removal: ${JSON.stringify(existingOrders, null, 2)}`);
  
  //writeCSV(orderFile, existingOrders, ['q', 'price', 'user', 'date']);
  // Write the updated orders back to the order file
  await writeCSV(orderFile, existingOrders);

  // Update stock prices after removing the order
  //await updateStockPrices(stock);
  //console.log('updating stock price from removeOrder');*/
  const orderDir = path.resolve(__dirname, `../orders/${stock}`);
  const orderFile = `${action}.csv`; // This will be handled inside accessFile

  // Use accessFile to modify the existing orders
  await accessFile(orderDir, orderFile, (existingOrders = []) => {
    let orderFound = false;

    // Log the existing orders before removal
    console.log(`Existing ${action} orders before removal: ${JSON.stringify(existingOrders, null, 2)}`);

    // Modify the existing orders
    const updatedOrders = existingOrders.map(order => {
      if (allOrders && order.user === String(userId)) {
        return null; // Remove all orders for this user
      } else if (!allOrders && 
                !orderFound && 
                order.user === String(userId) && 
                parseFloat(order.price) === parseFloat(price)) {
        const newQuantity = parseInt(order.q) - quantity;
        orderFound = true;
        if (newQuantity > 0) {
          return { ...order, q: newQuantity.toString() }; // Update quantity
        }
        return null; // Remove the order if quantity becomes 0
      }
      return order; // Return unchanged orders
    }).filter(order => order !== null); // Filter out the null orders (orders to be removed)

    // Log the updated orders after removal
    console.log(`Updated ${action} orders after removal: ${JSON.stringify(updatedOrders, null, 2)}`);

    // Return the updated orders to be written back to the CSV
    return updatedOrders;
  });

  console.log(`Function: User ${userId} removed ${action} order for ${stock} of ${quantity} at price of ${price}`);


  // Read and update user's orders
  /*
  //let userOrders = await readCSV(userOrderFile).catch(() => []);
  const userOrders = await accessFile(path.resolve(__dirname, `../orders/${users}`), `${userId}.csv`);
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

  await writeCSV(userOrderFile, userOrders, ['stock', 'action', 'q', 'price', 'date']);*/
  const userOrderDir = path.resolve(__dirname, `../orders/users`);
  const userOrderFile = `${userId}.csv`; // The filename, handled by accessFile

  // Use accessFile to read and modify the user's personal orders
  await accessFile(userOrderDir, userOrderFile, (userOrders = []) => {
    orderFound = false; // Reset orderFound for userOrders

    // Log the user's orders before removal
    console.log(`User orders before removal: ${JSON.stringify(userOrders, null, 2)}`);

    // Modify the user's orders
    const updatedUserOrders = userOrders.map(order => {
      if (allOrders && order.stock === stock && order.action === action) {
        return null; // Remove all matching orders
      } else if (!allOrders && 
                !orderFound && 
                order.stock === stock && 
                order.action === action && 
                parseFloat(order.price) === parseFloat(price)) {
        const newQuantity = parseInt(order.q) - quantity;
        orderFound = true;
        if (newQuantity > 0) {
          return { ...order, q: newQuantity.toString() }; // Update quantity
        }
        return null; // Remove the order if quantity becomes 0
      }
      return order; // Return unchanged orders
    }).filter(order => order !== null); // Filter out nulls (orders to be removed)

    // Log the updated user's orders after removal
    console.log(`Updated user orders after removal: ${JSON.stringify(updatedUserOrders, null, 2)}`);

    // Return the modified user orders to be written back to the CSV
    return updatedUserOrders;
  });

  // Log final result after modification
  console.log(`User ${userId}'s orders have been updated after removing ${action} order for ${stock} of ${quantity} at price of ${price}`);
  timer.stop('removeOrder');
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

const updateStockPrices = async (ticker) => {
  try {
    timer.start('updateStockPrices');
    //const buyFile = path.resolve(__dirname, `../orders/${ticker}/buy.csv`);
    //const sellFile = path.resolve(__dirname, `../orders/${ticker}/sell.csv`);
    const orderDir = path.resolve(__dirname, `../orders/${ticker}`);
    //const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
    //const sortedStockInfoFile = path.resolve(__dirname, '../sorted_stock_info.csv');

    // Use accessFile to directly access the first order from buy.csv and sell.csv
    const [buyOrders, sellOrders] = await Promise.all([
      accessFile(orderDir, 'buy.csv'),  // No callback, just read the data
      accessFile(orderDir, 'sell.csv')  // No callback, just read the data
    ]);
    
    // Extract the top buy and sell orders (first row after header)
    const topBuyOrder = buyOrders.length > 0 ? buyOrders[0] : null;
    const topSellOrder = sellOrders.length > 0 ? sellOrders[0] : null;

    if (!topBuyOrder && !topSellOrder) {
      console.log(`!No order price found for ${ticker}, setting price as '-' !`);
    }

    //const stockInfoData = [];
    const updatedTime = new Date().toISOString(); // Get current timestamp

    /*await new Promise((resolve, reject) => {
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
    });*/
    // Log the current stock_info.csv before modification
    if (false) {
      console.log(`Before modification for ${ticker}:`);
      const stockInfoBefore = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
      console.log(JSON.stringify(stockInfoBefore, null, 2));
    };

    // Use accessFile to update stock_info.csv with new prices
    const updatedStockInfo = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv', (stockInfoData = []) => {
      return stockInfoData.map(row => {
        if (row.ticker === ticker) {
          row.buyP = topSellOrder ? topSellOrder.price : '-';
          row.sellP = topBuyOrder ? topBuyOrder.price : '-';
          row.updated = updatedTime; // Update timestamp
        }
        return row;
      });

      console.log(`Updated stock_info.csv with new prices for ${ticker}`);
      return updatedStockInfo;
    });

    // Log the stock_info.csv after modifications
    if (false) {
      console.log(`After modification for ${ticker}:`);
      console.log(JSON.stringify(updatedStockInfo, null, 2));
    };

    const updatedStockData = { 
      ticker: ticker, 
      buyP: topSellOrder ? topSellOrder.price : '-', 
      sellP: topBuyOrder ? topBuyOrder.price : '-',
      updated: updatedTime
    };

    // Broadcast updated stock data to all connected WebSocket clients
    //const wss = getWebSocketServer(); // Get the WebSocket server instance
    wss.broadcast({ type: 'update', data: updatedStockData });

    // Call the function to update the sorted CSV file
    //updateSortedCsv(stockInfoFile, sortedStockInfoFile);
    // Sort updated stock info by updatedTime and store it in sorted_stock_info.csv
    //const sortedStockInfo = [...updatedStockInfo].sort((a, b) => new Date(b.updated) - new Date(a.updated));
    // Sort updated stock info by updatedTime and store it in sorted_stock_info.csv
    const sortedStockInfo = [...updatedStockInfo].map(stock => {
      const buyPrice = parseFloat(stock.buyP) || null;
      const sellPrice = parseFloat(stock.sellP) || null;
      
      // Calculate midP as the average if both buyP and sellP are valid numbers
      let midP;
      if (buyPrice && sellPrice) {
        midP = ((buyPrice + sellPrice) / 2).toFixed(2);
      } else if (buyPrice) {
        midP = buyPrice.toFixed(2);  // If only buyP is valid
      } else if (sellPrice) {
        midP = sellPrice.toFixed(2); // If only sellP is valid
      } else {
        midP = "-";  // If neither is valid
      }
      
      return { ...stock, midP };
    }).sort((a, b) => new Date(b.updated) - new Date(a.updated));

    // Use accessFile to save sorted stock info in sorted_stock_info.csv
    await accessFile(path.resolve(__dirname, '../'), 'sorted_stock_info.csv', () => sortedStockInfo);

    return updatedStockData;
  } catch (error) {
    console.error('Error function updating stock prices:', error);
    throw error; // Throwing allows the calling function to handle the error and manage the mutex
  } finally {
    timer.stop('updateStockPrices');
  }
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
  /*const stockInfoFile = path.resolve(__dirname, '../stock_info.csv');
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
  });*/

  //const delay = 10000; // 5 seconds delay

  // Use accessFile to read the tickers from stock_info.csv
  //const users = await accessFile(path.resolve(__dirname, '../users'), 'details.csv');
  // Use accessFile to read the tickers from stock_info.csv
  /*
  const tickers = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv', (stockInfoData = []) => {
    return stockInfoData.map(row => row.ticker);
  });*/
  const stockInfoFile = await accessFile(path.resolve(__dirname, '../'), 'stock_info.csv');
  const tickers = stockInfoFile.map(row => row.ticker);

  const updateTicker = async (ticker) => {
    //console.log(`Updating prices for ${ticker}`);
    try {
      await updateStockPrices(ticker);
    } catch (error) {
      console.error('Error updating stock prices:', error);
      //res.status(500).send('Error updating stock prices');
      throw error; // Throwing allows the calling function to handle the error and manage the mutex
    }
    
  };

  const updateTickersWithDelay = async () => {
    //for (let i = 0; i < tickers.length; i++) {
    for (const ticker of tickers) {
      await new Promise((resolve) => setTimeout(resolve, lpOrderUpdateTimer));
      await updateTicker(ticker);
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


module.exports = {
  addOrder,
  removeOrder,
  cancelOrder,
  placeRemainingOrder,
  updateStockPrices,
  calculatePrices,
  calculateL
};