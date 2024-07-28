const buyRound = 'up';
const sellRound = 'down';
const taxP = 10;
const minTax = 0.01;
const decimals = 2;

const calculatePrices = (action, X, Y, virtualX, virtualY) => {
  const roundPrices = (price, direction) => {
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

  console.log(`${action}`);

  const totalX = X + virtualX;
  const totalY = Y + virtualY;

  let newTotalX;
  if (action === 'buy') {
    newTotalX = totalX - 1;
  }
  else if (action === 'sell') {
    newTotalX = totalX + 1;
  }

  const K = totalX * totalY;
  console.log(`K: ${K}`);

  const newTotalY = K / newTotalX;
  console.log(`newTotalY: ${newTotalY}`);

  const newY = newTotalY - virtualY;
  
  let preTaxP;
  let direction;
  let taxAmount;
  if (action === 'buy') {
    preTaxP = newY - Y;
    direction = buyRound;
    taxAmount = 0;
    
  }
  else if (action === 'sell') {
    preTaxP = Y - newY;
    direction = sellRound;
    taxAmount = Math.max(0.01, preTaxP * (taxP / 100));
    console.log(`taxAmount: ${taxAmount}`);
    
  }

  const preRoundP = preTaxP - taxAmount;
  let P;
  if (action == 'buy') {
    P = roundPrices(preRoundP, buyRound);
  } else if (action == 'sell') {
    P = roundPrices(preRoundP, sellRound);
  }

  //const P = preRoundP
  let newFullY;
  if (action == 'buy') {
    newFullY = totalY + P;
  } else if (action == 'sell') {
    newFullY = totalY - P;
  }
  const newK = newTotalX * newFullY;
  console.log(`New K: ${newK}`);

  return P;
};

const infinity = Math.pow(10, 10000);

const X = 50;
const Y = 500;
const currentP = Y / X;
const rangeMult = 100;
const Pa = currentP / rangeMult;
const Pb = currentP * rangeMult;
const L = 175.68;

const virtualX = L / Math.sqrt(Pb);
const virtualY = L * Math.sqrt(Pa);
console.log(`virtualX: ${virtualX}`);
console.log(`virtualY: ${virtualY}`);

console.time('calculatePrices');
console.log(`buy: ${calculatePrices('buy', X, Y, virtualX, virtualY)}`);
console.timeEnd('calculatePrices');

console.time('calculatePrices');
console.log(`sell: ${calculatePrices('sell', X, Y, virtualX, virtualY)}`);
console.timeEnd('calculatePrices');