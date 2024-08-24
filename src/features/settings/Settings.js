import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Settings.css';

function Settings() {
  const [stocks, setStocks] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'default' });
  const [sortedStocks, setSortedStocks] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5001/api/stocks/data')
      .then(response => {
        setStocks(response.data);
        setSortedStocks(response.data); // Initialize sortedStocks with the fetched data
      })
      .catch(error => console.error('Error fetching stocks:', error));
  }, []);

  const handleInputChange = (index, field, value) => {
    if (value < 0) {
      alert('Value must be a positive number');
      return;
    }

    const newStocks = [...stocks];
    newStocks[index][field] = parseFloat(value);

    /*
    // Recalculate calculated fields if necessary
    if (['x', 'price', 'mult'].includes(field)) {
      const stock = newStocks[index];
      const x = parseFloat(stock.x);
      const price = parseFloat(stock.price);
      const mult = parseFloat(stock.mult);
      const y = parseFloat((x * price).toFixed(2));
      stock.y = y;
      stock.Pa = parseFloat((price / mult).toFixed(5));
      stock.Pb = parseFloat((price * mult).toFixed(2));
      stock.L = parseFloat(calculateL(stock.Pa, stock.Pb, x, y));
      const virtualX = stock.L / Math.sqrt(stock.Pb);
      const virtualY = stock.L * Math.sqrt(stock.Pa);
      stock.buyP = parseFloat(calculatePrices('buy', x, y, virtualX, virtualY).toFixed(2));
      stock.sellP = parseFloat(calculatePrices('sell', x, y, virtualX, virtualY).toFixed(2));
      stock.capital = y * 2;
    }
    */

    setStocks(newStocks);
  };

  const handleSave = () => {
    const updatedStocks = stocks.map(stock => ({
      ticker: stock.ticker,
      x: parseFloat(stock.x),
      y: parseFloat(stock.y),
      Pa: parseFloat(stock.Pa),
      Pb: parseFloat(stock.Pb)
    }));


  /*
  const handleSave = () => {
    for (const stock of stocks) {
      if (stock.x < 0 || stock.y < 0 || stock.Pa < 0 || stock.Pb < 0) {
        alert('Values for x, y, Pa, and Pb must be positive numbers');
        return;
      }
    }

    
    const updatedStocks = stocks.map(stock => {
      const x = parseFloat(stock.x);
      const price = parseFloat(stock.price);
      const mult = parseFloat(stock.mult);
      const y = x * price;
      const Pa = parseFloat((price / mult).toFixed(5));
      const Pb = parseFloat((price * mult).toFixed(2));
      const L = parseFloat(calculateL(Pa, Pb, x, y));
      const virtualX = L / Math.sqrt(Pb);
      const virtualY = L * Math.sqrt(Pa);
      const buyP = parseFloat(calculatePrices('buy', x, y, virtualX, virtualY).toFixed(2));
      const sellP = parseFloat(calculatePrices('sell', x, y, virtualX, virtualY).toFixed(2));
      const capital = y * 2;
      return {
        ...stock,
        x,
        y,
        Pa,
        Pb
      };
    });
    */

    axios.post('http://localhost:5001/api/stocks/data/update', updatedStocks)
      .then(response => {
        setStocks(response.data);
        setSortedStocks(response.data); // Assuming the response contains updated stock data
        //updateStockInfo(updatedStocks);
        alert('Changes saved successfully');
      })
      .catch(error => console.error('Error saving changes:', error));
  };

  /*
  const updateStockInfo = (updatedStocks) => {
    updatedStocks.forEach(updatedStock => {
      const { id, buyPrice, sellPrice } = updatedStock;
      const stockElement = document.getElementById(`ticker`); // Assuming each stock has a unique ID
      if (stockElement) {
        stockElement.querySelector('.buyPrice').textContent = buyPrice;
        stockElement.querySelector('.sellPrice').textContent = sellPrice;
      }
    });
  };
  */

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    } else if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'default';
    }
    setSortConfig({ key, direction });

    let sortableStocks = [...stocks];
    if (direction !== 'default') {
      sortableStocks.sort((a, b) => {
        if (a[key] < b[key]) {
          return direction === 'ascending' ? -1 : 1;
        }
        if (a[key] > b[key]) {
          return direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    setSortedStocks(sortableStocks);
  };

  /*
  const calculateL = (Pa, Pb, X_r, Y_r) => {
    const Pa_sq = Math.sqrt(Pa);
    const Pb_sq = Math.sqrt(Pb);

    const part1 = Pa * Pb * Math.pow(X_r, 2) - 2 * Pa_sq * Pb_sq * X_r * Y_r + 4 * Pb * X_r * Y_r + Math.pow(Y_r, 2);
    const part2 = Pa_sq * Pb_sq * X_r + Y_r;

    const numerator = Math.sqrt(part1) + part2;
    const denominator = 2 * Pa_sq - 2 * Pb_sq;

    const L = - numerator / denominator;
    
    return parseFloat(L.toFixed(2));
  };

  const calculatePrices = (action, X, Y, virtualX, virtualY) => {
    const buyRound = 'up';
    const sellRound = 'down';
    const taxP = 0;
    //const minTax = 0.01;
    const decimals = 2;
    
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
  
    //console.log(`${action}`);
  
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
    //console.log(`K: ${K}`);
  
    const newTotalY = K / newTotalX;
    //console.log(`newTotalY: ${newTotalY}`);
  
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
      taxAmount = Math.max(0.00, preTaxP * (taxP / 100));
      //console.log(`taxAmount: ${taxAmount}`);
      
    }
  
    const preRoundP = preTaxP - taxAmount;
    let P;
    if (action === 'buy') {
      P = roundPrices(preRoundP, buyRound);
    } else if (action === 'sell') {
      P = roundPrices(preRoundP, sellRound);
    }
  
    return P;
  };
  */

  const formatNumberWithThousandSeparators = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  };
  

  return (
    <div className="settings text-c-white">
      <h1>Settings</h1>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Shares (x)</th>
            <th>USD (y)</th>
            <th>Pa (min)</th>
            <th>Pb (max)</th>
            <th>Price</th>
            <th>L</th>
            <th>Capital</th>
            <th>buyP</th>
            <th>sellP</th>
          </tr>
        </thead>
        <tbody>
          {sortedStocks.map((stock, index) => {
            //const price = parseFloat((parseFloat(stock.y) / parseFloat(stock.x)).toFixed(2));
            //const price = calculateP(stock.x, stock.y);
            const x = parseFloat(stock.x);
            const y = parseFloat(stock.y);
            const Pa = parseFloat(stock.Pa);
            const Pb = parseFloat(stock.Pb);
            //const price = y / x;
            //const mult = parseFloat(stock.mult);
            //const y = x * price;
            //const Pa = parseFloat((price / mult).toFixed(2));
            //const Pb = parseFloat((price * mult).toFixed(2));
            //const L = calculateL(Pa, Pb, x, y);
            const capReq = y * 2;
            //const virtualX = L / Math.sqrt(Pb);
            //const virtualY = L * Math.sqrt(Pa);
            //const buyP = calculatePrices('buy', x, y, virtualX, virtualY);
            //const sellP = calculatePrices('sell', x, y, virtualX, virtualY);
            return (
              <tr className='text-black' key={stock.ticker}>
                <td className='text-c-white'>{stock.ticker}</td>
                <td>
                  <input
                    type="number"
                    value={x}
                    onChange={(e) => handleInputChange(index, 'x', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={y}
                    onChange={(e) => handleInputChange(index, 'y', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={Pa}
                    onChange={(e) => handleInputChange(index, 'Pa', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={Pb}
                    onChange={(e) => handleInputChange(index, 'Pb', e.target.value)}
                  />
                </td>
                <td className='text-c-white'>{formatNumberWithThousandSeparators(stock.price)}</td>
                <td className='text-c-white'>{formatNumberWithThousandSeparators(stock.L)}</td>
                <td className='text-c-white'>{formatNumberWithThousandSeparators(capReq)}</td>
                <td className='text-c-white'>{formatNumberWithThousandSeparators(stock.buyP)}</td>
                <td className='text-c-white'>{formatNumberWithThousandSeparators(stock.sellP)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={handleSave}>Save Changes</button>
    </div>
  );
}

export default Settings;
