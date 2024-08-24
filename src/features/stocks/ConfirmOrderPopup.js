import React, { forwardRef, useEffect, useState } from 'react';
import './ConfirmOrderPopup.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeftLong } from '@fortawesome/free-solid-svg-icons';
import axios from 'axios';

const taxAmount = 0.01;
//const receivedAfterTax = 1 - taxAmount;

const ConfirmOrderPopup = forwardRef(({ orderDetails, priceDetails, onClose, onConfirm, createOrderPopupRef, orderExecution }, ref) => {
  //const { ticker, orderType, quantity, price } = orderDetails;

  //const [orderDetails, setOrderDetails] = useState(orderDetails); // Initialize with stock details

  const { orderType, ticker, quantity } = orderDetails;
  //const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState('');
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
  }, [orderDetails, priceDetails, orderExecution]);

  // For book orders, use the price from orderDetails directly
  useEffect(() => {
    if (orderExecution === 'book') {
      setPrice(orderDetails.price);
      console.log(`${orderExecution} ${orderType} order ${ticker} at $${orderDetails.price} for ${quantity}`);
    }
  }, [orderDetails, orderExecution]);



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

  

  const total = (parseFloat(price) * parseInt(quantity)).toFixed(2);
  const tax = parseFloat(Math.max(total * taxAmount, 0.01));
  const received = (total - tax).toFixed(2);

  const handleConfirm = async () => {
    //console.log("Entering handleConfirm function");
    //alert(`1`);
    try {
      //alert(`creating order..`);
      await axios.post(`http://localhost:5001/api/stocks/data/order`, {
        ticker,
        orderType,
        quantity,
        price: parseFloat(price),
        orderExecution
      });
      onClose();
      if (orderExecution === 'book') {
        onConfirm();
      }

      //console.log(`Created ${orderExecution} ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);
      alert(`Created ${orderExecution} ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);      

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
  };

  useEffect(() => {
    // Function to handle keydown event
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        handleConfirm();
      }
    };

    // Add event listener for keydown
    window.addEventListener('keydown', handleKeyDown);

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleConfirm]);

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
