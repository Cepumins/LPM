// ConfirmOrderPopup.js
import React, { forwardRef, useEffect, useState, useCallback } from 'react';
import './ConfirmOrderPopup.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeftLong } from '@fortawesome/free-solid-svg-icons';
import axios from 'axios';

const taxAmount = 0.00;
//const receivedAfterTax = 1 - taxAmount;

const ConfirmOrderPopup = forwardRef(({ orderDetails, priceDetails, onClose, onConfirm,  userBalance, inventory, orderExecution }, ref) => {
  //const { ticker, orderType, quantity, price } = orderDetails;

  //const [orderDetails, setOrderDetails] = useState(orderDetails); // Initialize with stock details

  const { orderType, ticker, quantity } = orderDetails;
  //const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState('');

  const total = (parseFloat(price) * parseInt(quantity)).toFixed(2);
  const tax = parseFloat(Math.max(total * taxAmount, 0.01));
  const received = (total - tax).toFixed(2);

  const checkIfCanSubmitOrder = useCallback(() => {
    if (orderType === 'buy' && parseFloat(userBalance) < total) {
      onClose(); // Close popup if user can't afford the buy order
      //alert('Insufficient balance to execute this buy order.');
      return false;
    }

    if (orderType === 'sell') {
      const stockInInventory = inventory.find(stock => stock.ticker === ticker);
      if (!stockInInventory || stockInInventory.quantity < quantity) {
        onClose(); // Close popup if user doesn't have enough stock to sell
        //alert('Not enough stock available to sell.');
        return false;
      }
    }

    return true;
  }, [orderType, userBalance, total, inventory, ticker, quantity, onClose]);

  // Automatically check the balance or stock when they change, and close the popup if invalid
  useEffect(() => {
    checkIfCanSubmitOrder();
  }, [userBalance, inventory, checkIfCanSubmitOrder]);
  //const ticker = '';
  //const quantity = '';
  //const price = '';
  /*
  //console.log(`Ticker: ${orderDetails.ticker}`);
  //console.log(`Order Type: ${orderType}`);
  //console.log(`Quantity: ${quantity}`);
  //console.log(`Price: ${price}`);

  useEffect(() => {
    console.log("ConfirmOrderPopup received orderDetails:", orderDetails);
  }, [orderDetails]);
  */
  // Initialize local state with orderDetails prop
  //const [localOrderDetails, setLocalOrderDetails] = useState(orderDetails);

  useEffect(() => {
    if (orderExecution === 'market') {
      if (orderType) {
        if (orderType === 'buy') {
          setPrice(priceDetails.buyP);
          console.log(`${orderExecution} ${orderType} order ${ticker} at $${priceDetails.buyP} for ${quantity}`);
        } else if (orderType === 'sell') {
          setPrice(priceDetails.sellP);
          console.log(`${orderExecution} ${orderType} order ${ticker} at $${priceDetails.sellP} for ${quantity}`);
        }
      }

      // Log the updated price details
      console.log('new price details:', JSON.stringify(priceDetails, null, 2));
    }
  //}, [orderDetails, priceDetails, orderExecution]);
  }, [orderDetails, priceDetails, orderExecution, orderType, quantity, ticker]);

  // For book orders, use the price from orderDetails directly
  useEffect(() => {
    if (orderExecution === 'book') {
      setPrice(orderDetails.price);
      console.log(`${orderExecution} ${orderType} order ${ticker} at $${orderDetails.price} for ${quantity}`);
    }
  //}, [orderDetails, orderExecution]);
  }, [orderDetails, orderExecution, orderType, ticker, quantity]);



  //const { ticker, orderType, quantity, price } = localOrderDetails;

  useEffect(() => {
    const handleOverlayClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOverlayClick);

    return () => {
      document.removeEventListener('mousedown', handleOverlayClick);
    };
  }, [onClose, ref]);

  



  //const handleConfirm = async () => {
  const handleConfirm = useCallback(async () => {
    //console.log("Entering handleConfirm function");
    //alert(`1`);
    try {
      //alert(`creating order..`);
      onClose();
      if (orderExecution === 'book') {
        onConfirm();
      }
      
      await axios.post(`http://localhost:5001/api/stocks/data/order`, {
        ticker,
        orderType,
        quantity,
        price: parseFloat(price),
        orderExecution
      });


      //console.log(`Created ${orderExecution} ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);
      //alert(`Created ${orderExecution} ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);      

      /*
      if (orderExecution === 'market') {
        await axios.post('http://localhost:5000/api/stocks/fulfill-order', {
          type: 'market',
          ticker,
          action: orderType,
          quantity,
          price: parseFloat(price)
        });
        alert(`${ticker} stock ${orderType}ing at $${price} (Q: ${quantity}) was successful.`);      
      } else if (orderExecution === 'book') {
        await axios.post(`http://localhost:5000/api/stocks/data/order`, {
          ticker,
          orderType,
          quantity,
          price: parseFloat(price),
          orderExecution
        });
        alert(`Created ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);        
      }*/
      

    } catch (error) {
      console.error(`Error creating ${orderType} order:`, error);
      alert(`Failed to create order. Please try again: ${error}`);
    }
  //};
  //}, [onClose, onConfirm, orderExecution, ticker, orderType, quantity, price]);
  }, [onClose, onConfirm, orderExecution, ticker, orderType, quantity, price]);

  useEffect(() => {
    // Function to handle keydown event
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        handleConfirm();

        // If it's a 'book' order, close the popup after sending the order
        if (orderExecution === 'book') {
          onClose();
        }
      }
    };

    // Add event listener for keydown
    window.addEventListener('keydown', handleKeyDown);

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  //}, [handleConfirm]);
  }, [handleConfirm, onClose, orderExecution]);

  /*
  useEffect(() => {
    const handleOverlayClick = (e) => {
      if (
        ref.current && 
        !ref.current.contains(e.target) && 
        (!createOrderPopupRef || (createOrderPopupRef.current && !createOrderPopupRef.current.contains(e.target)))
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOverlayClick);

    return () => {
      document.removeEventListener('mousedown', handleOverlayClick);
    };
  }, [onClose, ref, createOrderPopupRef]);
  */

  return (
    <div className="confirm-order-popup">
      <div className="order-content" ref={ref}>
        <button className="close-arrow" onClick={onClose}>
          <FontAwesomeIcon icon={faLeftLong} />
        </button>

        <h2>Confirm {orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order</h2>
        <img src={`/logos/${ticker.toLowerCase()}.svg`} alt={`${ticker} icon`} className="order-stock-icon" />
        <p className='font-bold'>{ticker}</p>

        <div className="order-details">
          <p>Price: ${parseFloat(price).toFixed(2)}</p>
          <p>Quantity: {quantity}</p>
          <p>Total: ${total}</p>
          {orderType === 'sell' && <p>Received (after tax): ${received}</p>}
        </div>

        <button 
          className="confirm-button" 
          onClick={handleConfirm}
        >
          Confirm
        </button>
      </div>
    </div>
  );
});

export default ConfirmOrderPopup;
