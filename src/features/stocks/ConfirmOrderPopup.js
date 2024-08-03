import React, { forwardRef, useEffect } from 'react';
import './ConfirmOrderPopup.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeftLong } from '@fortawesome/free-solid-svg-icons';
import axios from 'axios';

const taxAmount = 0.01;

const ConfirmOrderPopup = forwardRef(({ orderDetails, onClose, onConfirm, createOrderPopupRef, orderExecution }, ref) => {
  const { ticker, orderType, quantity, price } = orderDetails;

  /*
  //console.log(`Ticker: ${orderDetails.ticker}`);
  //console.log(`Order Type: ${orderType}`);
  //console.log(`Quantity: ${quantity}`);
  //console.log(`Price: ${price}`);

  useEffect(() => {
    console.log("ConfirmOrderPopup received orderDetails:", orderDetails);
  }, [orderDetails]);
  */

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
  const received = (total - total * taxAmount).toFixed(2);

  const handleConfirm = async () => {
    //console.log("Entering handleConfirm function");
    //alert(`1`);
    try {
      //alert(`creating order..`);
      await axios.post(`http://localhost:5000/api/stocks/data/order`, {
        ticker,
        orderType,
        quantity,
        price: parseFloat(price),
        orderExecution
      });
      console.log(`Created ${orderExecution} ${orderType} order for ${quantity} shares of ${ticker} at $${price} each.`);
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
      
      onConfirm();
      onClose();
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
          <p>Price: ${price}</p>
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
