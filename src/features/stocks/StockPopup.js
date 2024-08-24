import React, { useRef, useEffect, useState } from 'react';
import './StockPopup.css';
import CreateOrderPopup from './CreateOrderPopup';
import ConfirmOrderPopup from './ConfirmOrderPopup';
import axios from 'axios';
import Graph from '../graphs/Graph'; // Import Graph component

axios.defaults.withCredentials = true; // Ensure credentials are sent with each request

function StockPopup({ stock, onClose, userId, userBalance, inventory, refreshUserData, stocks, refreshStock }) {
  const popupRef = useRef(null);
  const createOrderPopupRef = useRef(null);
  const confirmOrderPopupRef = useRef(null);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [orderType, setOrderType] = useState('');
  const [orderDetails, setOrderDetails] = useState(stock); // Initialize with stock details
  const [confirmDetails, setConfirmDetails] = useState({}); // For storing details to confirm order
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [canBuy, setCanBuy] = useState(false);
  const [hasStock, setHasStock] = useState(false);

  useEffect(() => {
    document.addEventListener('mousedown', handleOverlayClick);
    document.addEventListener('keydown', handleEscKey); // Add keydown event listener
    if (isCreateOrderOpen) {
      //document.addEventListener('mousedown', handleCreateOrderOverlayClick);
    }
    if (isConfirmOpen) {
      //document.addEventListener('mousedown', handleConfirmOrderOverlayClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOverlayClick);
      document.removeEventListener('keydown', handleEscKey); // Remove keydown event listener
      //document.removeEventListener('mousedown', handleCreateOrderOverlayClick);
      //document.removeEventListener('mousedown', handleConfirmOrderOverlayClick);
    };
  }, [isCreateOrderOpen, isConfirmOpen]);

  const handleOverlayClick = (e) => {
    if (!isCreateOrderOpen && !isConfirmOpen && popupRef.current && !popupRef.current.contains(e.target)) {
      onClose();
    }
  };

  const handleEscKey = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    setOrderDetails(stock); // Reset orderDetails when stock prop changes
    console.log('new stock:', JSON.stringify(stock, null, 2));
  }, [stock]);

  useEffect(() => {
    if (!isCreateOrderOpen) {
      setOrderDetails(stock); // Reset orderDetails when CreateOrderPopup is closed
    }
  }, [isCreateOrderOpen, stock]);

  useEffect(() => {
    if (!isConfirmOpen) {
      setOrderDetails(stock); // Reset orderDetails when ConfirmOrderPopup is closed
    }
  }, [isConfirmOpen, stock]);


  useEffect(() => {
    checkUserBalance();
  }, [userBalance, stock.buyP]);

  useEffect(() => {
    checkUserInventory();
  }, [stock]);
  
  /*
  useEffect(() => {
    console.log(`POPUP: ${stock.ticker} new buy: ${stock.buyP} and sell: ${stock.sellP}`);
  }, [stock]);
  */

  /*
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5000');
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'update') {
        // Ensure message.data is treated as an array
        const updatedStockArray = Array.isArray(message.data) ? message.data : [message.data];
        const updatedStock = updatedStockArray.find(s => s.ticker === stock.ticker);
        if (updatedStock) {
          setOrderDetails(updatedStock);
        }
      }
    };

    return () => {
      ws.close();
    };
  }, [stock]);
  

  useEffect(() => {
    // Listen for updates to the selected stock from the parent component (StockList)
    const updatedStock = stocks.find(s => s.ticker === stock.ticker);
    if (updatedStock) {
      setOrderDetails(updatedStock);
    }
  }, [stocks, stock]);
  
  useEffect(() => {
    setOrderDetails(stock);
  }, [stock]);
  */

  const openCreateOrderPopup = (type) => {
    //console.log('Opening create order');
    setOrderType(type);
    //const bestPrice = type === 'buy' ? stock.buyP : stock.sellP;
    //setOrderDetails({ ticker: stock.ticker, icon: stock.icon, price: bestPrice });
    setIsCreateOrderOpen(true);
  };

  const closeCreateOrderPopup = () => {
    //console.log('Closing create order');
    setIsCreateOrderOpen(false);
    setOrderType('');
    setOrderDetails(stock); // Refresh the order details from the stock
  };

  
  const closeConfirmPopup = () => {
    setIsConfirmOpen(false);
    setConfirmDetails({});
  };
  

  const handleBuyAtPrice = async () => {
    if (userId && stock.buyP !== "-") {
      /*
      await axios.post('http://localhost:5000/api/stocks/fulfill-order', {
        ticker: stock.ticker,
        type: 'market',
        action: 'buy',
        price: parseFloat(orderDetails.buyP)
      });
      refreshUserData(userId);
      */
      setConfirmDetails({
        orderType: 'buy',
        ticker: stock.ticker,
        //price: parseFloat(stock.buyP),
        quantity: 1,
      });
      setIsConfirmOpen(true);
    }
  };

  const handleSellAtPrice = async () => {
    if (userId && stock.sellP !== "-") {
      /*
      await axios.post('http://localhost:5000/api/stocks/fulfill-order', {
        ticker: stock.ticker,
        type: 'market',
        action: 'sell',
        price: parseFloat(orderDetails.sellP)
      });
      refreshUserData(userId);
      */
      setConfirmDetails({
        orderType: 'sell',
        ticker: stock.ticker,
        //price: parseFloat(stock.sellP),
        quantity: 1,
      });
      setIsConfirmOpen(true);
    }
  };

  /*
  useEffect(() => {
    //console.log(`User ${userId} with balance of ${userBalance} opened stock ${stock.ticker}`);
  }, [stock, userId, userBalance]);
  */



  /*
  const handleCreateOrderOverlayClick = (e) => {
    console.log('Closing create order');
    if (createOrderPopupRef.current && !createOrderPopupRef.current.contains(e.target)) {
      setIsCreateOrderOpen(false);
    }
  };
  
  const handleConfirmOrderOverlayClick = (e) => {
    if (confirmOrderPopupRef.current && !confirmOrderPopupRef.current.contains(e.target)) {
      setIsConfirmOpen(false);
    }
  };
  */



  /*
  const handleBuy = async () => {
    if (userId) {
      await axios.post('http://localhost:5000/api/stocks/data/buy', { ticker: stock.ticker });
      refreshUserData(userId); // Refresh user data after buy
    }
  };

  const handleSell = async () => {
    if (userId) {
      await axios.post('http://localhost:5000/api/stocks/data/sell', { ticker: stock.ticker });
      refreshUserData(userId); // Refresh user data after sell
    }
  };
  */

  const checkUserBalance = () => {
    //console.log('checking user balance');
    const balance = parseFloat(userBalance);
    //console.log(`user balance: ${balance}`);
    const buyPrice = parseFloat(stock.buyP);
    setCanBuy(balance >= buyPrice);
  };

  const checkUserInventory = () => {
    //console.log('checking user inventory');
    const hasStock = inventory.some(item => {
      //console.log(`stock ${item.ticker} in inventory: ${item.quantity}`);
      return item.ticker === stock.ticker && item.quantity > 0;
    });
    setHasStock(hasStock);
  };


  const hasStockInInventory = () => {
    console.log('checking users inventory again');
    //return inventory.some(item => item.ticker === stock.ticker && item.quantity > 0);
    return inventory.some(item => {
      console.log(`stock ${item.ticker} in inventory: ${item.quantity}`);
      return item.ticker === stock.ticker && item.quantity > 0;
    });
  };

  const canBuyStock = () => {
    console.log('checking users balance again');
    const balance = parseFloat(userBalance);
    console.log(`user balance: ${balance}`);
    const buyPrice = parseFloat(stock.buyP);
    const canBuy = balance >= buyPrice;
    //console.log(`Checking if user can buy: userBalance (${userBalance}) >= stock.buyP (${stock.buyP}) => ${canBuy}`);
    return canBuy;
  };

  return (
    <div className="stock-popup">
      <div className="popup-content" ref={popupRef}>
        <div className="content-container">
          <div className="stock-details">
            <button className="close-button" onClick={onClose}>X</button>
            <img src={`/logos/${stock.ticker.toLowerCase()}.svg`} alt={`${stock.ticker} icon`} className="popup-stock-icon" />
            <h2 className='font-bold'>{orderDetails.ticker}</h2>
            <p>{stock.fullName}</p>
            <a href={`https://finance.yahoo.com/quote/${stock.ticker}`} target="_blank" rel="noopener noreferrer">
              View on Yahoo Finance
            </a>
            <div className="popup-actions">
              <button 
                className="sell-button" 
                onClick={handleSellAtPrice} 
                disabled={!userId || !hasStock || stock.sellP === "-"}
              >
                {orderDetails.sellP === "-" ? "No Sell Offers" : `Sell at $${stock.sellP}`}
              </button>
              <button 
                className="buy-button" 
                onClick={handleBuyAtPrice} 
                disabled={!userId || !canBuy || stock.buyP === "-"}
              >
                {orderDetails.buyP === "-" ? "No Buy Offers" : `Buy at $${stock.buyP}`}
              </button>
              <div></div>
              <button className="create-sell-order-button" onClick={() => openCreateOrderPopup('sell')} disabled={!userId || !hasStock}>Create Sell Order</button>
              <button className="create-buy-order-button" onClick={() => openCreateOrderPopup('buy')} disabled={!userId}>Create Buy Order</button>
            </div>
          </div>
          <div className="stock-graph">
            <Graph ticker={stock.ticker} /> {/* Pass ticker to Graph component */}
          </div>
        </div>
      </div>
      {isCreateOrderOpen && (
        <CreateOrderPopup
          ref={createOrderPopupRef}
          orderType={orderType}
          orderDetails={orderDetails}
          onClose={closeCreateOrderPopup}
          userInventory={inventory} 
          userBalance={userBalance} 
          bestPrice={orderType === 'buy' ? stock.sellP : stock.buyP} // Pass best price
        />
      )}
      {isConfirmOpen && (
        <ConfirmOrderPopup
          ref={confirmOrderPopupRef}
          //orderType={confirmDetails.orderType}
          orderDetails = {confirmDetails}
          priceDetails={stock}
          onClose={closeConfirmPopup}
          orderExecution="market"
          /*
          onConfirm={async () => {
            if (confirmDetails.orderType === 'buy') {
              await axios.post('http://localhost:5000/api/stocks/fulfill-order', {
                ticker: confirmDetails.ticker,
                type: 'market',
                action: 'buy',
                price: confirmDetails.price
              });
            } else {
              await axios.post('http://localhost:5000/api/stocks/fulfill-order', {
                ticker: confirmDetails.ticker,
                type: 'market',
                action: 'sell',
                price: confirmDetails.price
              });
            }
            refreshUserData(userId);
          }}
          */
        />
      )}
    </div>
  );
}

export default StockPopup;
