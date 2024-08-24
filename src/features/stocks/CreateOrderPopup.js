import React, { forwardRef, useState, useEffect, useRef } from 'react';
import './CreateOrderPopup.css';
import ConfirmOrderPopup from './ConfirmOrderPopup';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeftLong } from '@fortawesome/free-solid-svg-icons';
//import axios from 'axios';

const CreateOrderPopup = forwardRef(({ orderType, orderDetails, onClose, userInventory, userBalance }, ref) => {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [maxQuantity, setMaxQuantity] = useState(null);
  const [confirmDetails, setConfirmDetails] = useState({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmOrderPopupRef = useRef(null);

  useEffect(() => {
    setPrice(orderDetails.price ? orderDetails.price.toString() : '');
    if (orderType === 'sell') {
      const stockInInventory = userInventory.find(stock => stock.ticker === orderDetails.ticker);
      setMaxQuantity(stockInInventory ? stockInInventory.quantity : 0);
    } else {
      setMaxQuantity(null);
    }
  }, [orderType, orderDetails.ticker, userInventory]);

  const handleQuantityChange = (e) => {
    const value = e.target.value;
    if (value.match(/^[0-9]*$/)) { // Ensure only integers
      if (orderType === 'sell' && maxQuantity !== null && parseInt(value) > maxQuantity) {
        setQuantity(maxQuantity);
      } else {
        setQuantity(value);
      }
    }
  };

  const roundToTwoDecimalPlaces = (value) => {
    return Math.round(value * 100) / 100;
  };

  const handlePriceChange = (e) => {
    const value = e.target.value;
    if (value.match(/^[0-9]*\.?[0-9]*$/)) { // Ensure only numbers
      setPrice(value);
    }
  };

  const handleSubmit = async () => {
    const roundedPrice = roundToTwoDecimalPlaces(parseFloat(price));
    //const totalCost = roundedPrice * parseInt(quantity);
    const totalCost = price * parseInt(quantity);
    if (orderType === 'buy' && totalCost > userBalance) {
      alert('Insufficient balance to create this buy order.');
      return;
    }

    //alert(`0`);
    const newConfirmDetails  = {
      ticker: orderDetails.ticker,
      orderType: orderType,
      quantity: parseInt(quantity),
      price: roundedPrice
    };

    //console.log("Confirm details before setting state:", newConfirmDetails );
    setConfirmDetails(newConfirmDetails);
    /*console.log(`Ticker: ${confirmDetails.ticker}`);
    console.log(`Order Type: ${confirmDetails.orderType}`);
    console.log(`Quantity: ${confirmDetails.quantity}`);
    console.log(`Price: ${confirmDetails.price}`);
    setConfirmDetails(confirmDetails);*/
    setIsConfirmOpen(true);
    //console.log(`State after setting confirm details`, confirmDetails);
    //console.log(`Is Confirm Open: ${isConfirmOpen}`);
    //console.log(`Confirm Details:`, confirmDetails);
    /*
    try {
      await axios.post(`http://localhost:5000/api/stocks/data/order`, {
        ticker: orderDetails.ticker,
        orderType,
        quantity,
        price: roundedPrice
      });
      alert(`Created ${orderType} order for ${quantity} shares of ${orderDetails.ticker} at $${roundedPrice} each.`);
      onClose();
    } catch (error) {
      console.error(`Error creating ${orderType} order:`, error);
      alert('Failed to create order. Please try again.');
    }
    */
  };

  const preventInvalidInput = (e, isPrice) => {   
    if (
      !(e.key >= '0' && e.key <= '9') && // Allow only numbers
      e.key !== 'Backspace' && // Allow backspace
      e.key !== 'Delete' && // Allow delete
      e.key !== 'ArrowLeft' && // Allow left arrow
      e.key !== 'ArrowRight' && // Allow right arrow
      e.key !== 'Tab' && // Allow tab
      (!isPrice || e.key !== '.') // Allow decimal point for price
    ) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    const handleOverlayClick = (e) => {
      if (!isConfirmOpen && ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOverlayClick);

    return () => {
      document.removeEventListener('mousedown', handleOverlayClick);
    };
  }, [onClose, ref, isConfirmOpen]);

  const closeConfirmPopup = () => {
    setIsConfirmOpen(false);
  };

  const handleConfirmOrder = () => {
    //console.log(`closing confirm and create!`);
    setIsConfirmOpen(false);
    onClose(); // Close the CreateOrderPopup as well
  };

  return (
    <>
      <div className="create-order-popup">
        <div className="order-content" ref={ref}>
          <button className="close-arrow " onClick={onClose}>
            <FontAwesomeIcon icon={faLeftLong} />
          </button>
          
          <h2>Create {orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order</h2>
          <img src={`/logos/${orderDetails.ticker.toLowerCase()}.svg`} alt={`${orderDetails.ticker} icon`} className="order-stock-icon" />
          <p className='font-bold'>{orderDetails.ticker}</p>
          <div className="order-inputs">
            <label>
              Quantity:
              <input 
                className='text-black' 
                type="number" 
                value={quantity} 
                onChange={handleQuantityChange} 
                min="1" 
                step="1" 
                onKeyDown={(e) => preventInvalidInput(e, false)} // Prevent invalid input for quantity
              />
            </label>
            <label>
              Price:
              <input 
                className='text-black' 
                type="number" 
                value={price} 
                onChange={handlePriceChange} 
                min="0.01" 
                step="0.01" 
                onBlur={() => setPrice(roundToTwoDecimalPlaces(parseFloat(price)))}
                onKeyDown={(e) => preventInvalidInput(e, true)} // Prevent invalid input for price
              />
            </label>
          </div>
          <button 
            className="submit-button" 
            onClick={handleSubmit}
            disabled={quantity === '' || price === '' || parseInt(quantity) <= 0 || parseFloat(price) <= 0}
          >
            Submit
          </button>
        </div>
      </div>
      {isConfirmOpen && (
        <ConfirmOrderPopup
          ref={confirmOrderPopupRef}
          //orderType={confirmDetails.orderType}
          orderDetails={confirmDetails}
          onClose={closeConfirmPopup}
          onConfirm={handleConfirmOrder}
          //createOrderPopupRef={ref}
          orderExecution='book'
          /*
          onConfirm={async () => {
            // Placeholder for onConfirm logic
          }}
          */
        />
      )}
    </>
  );
});

export default CreateOrderPopup;
