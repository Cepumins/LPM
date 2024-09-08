import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Orders.css';

const UserOrders = ({ userId }) => {
  const [orders, setOrders] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'descending' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrders, setSelectedOrders] = useState([]);

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`http://localhost:5001/api/users/orders/${userId}`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const formatAction = (action) => {
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleSort = (key) => {
    let direction;
    // Set initial sort direction based on the column
    if (key === 'stock' || key === 'action') {
      // For Ticker and Order columns, initial sort should be ascending
      direction = 'ascending';
    } else {
      // For other columns, initial sort should be descending
      direction = 'descending';
    }
  
    // Toggle direction if the same column is selected again
    if (sortConfig.key === key) {
      direction = sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
    }
  
    setSortConfig({ key, direction });
  };

  const handleOrderClick = (orderDate) => {
    setSelectedOrders((prevSelected) =>
      prevSelected.includes(orderDate)
        ? prevSelected.filter((date) => date !== orderDate)
        : [...prevSelected, orderDate]
    );
  };

  const cancelSelectedOrders = async () => {
    try {
      // Prepare the orders to be sent to the backend
      const ordersToCancel = orders.filter(order => selectedOrders.includes(order.date));

      console.log('Orders to cancel:', ordersToCancel);
  
      // Send the selected orders to the backend for cancellation
      await axios.post('http://localhost:5001/api/stocks/data/cancel-order', { orders: ordersToCancel });
  
      // Update frontend state to reflect the cancelled orders
      setOrders((prevOrders) => prevOrders.filter(order => !selectedOrders.includes(order.date)));
      setSelectedOrders([]);
    } catch (error) {
      console.error('Error cancelling orders:', error);
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'ascending' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'ascending' ? 1 : -1;
    }
    return 0;
  });

  const getTimeDifference = (date) => {
    const orderDate = new Date(date);
    const currentDate = new Date();
    const differenceInSeconds = Math.floor((currentDate - orderDate) / 1000);

    if (differenceInSeconds < 60) {
      return `${differenceInSeconds} seconds ago`;
    } else if (differenceInSeconds < 120) {
      const minutes = Math.floor(differenceInSeconds / 60);
      return `${minutes} minute ago`;
    } else if (differenceInSeconds < 3600) {
      const minutes = Math.floor(differenceInSeconds / 60);
      return `${minutes} minutes ago`;
    } else if (differenceInSeconds < 7200) {
      const hours = Math.floor(differenceInSeconds / 3600);
      return `${hours} hour ago`;
    } else if (differenceInSeconds < 86400) {
      const hours = Math.floor(differenceInSeconds / 3600);
      return `${hours} hours ago`;
    } else {
      const days = Math.floor(differenceInSeconds / 86400);
      return `${days} days ago`;
    }
  };

  // Filter the sorted orders based on the search query
  const filteredOrders = sortedOrders.filter(order => {
    const total = (order.q * order.price).toFixed(2);
    const timeDifference = getTimeDifference(order.date).toLowerCase();

    return (
      order.stock.toLowerCase().includes(searchQuery) ||
      formatAction(order.action).toLowerCase().includes(searchQuery) ||
      order.q.toString().includes(searchQuery) ||
      parseFloat(order.price).toFixed(2).includes(searchQuery) ||
      total.includes(searchQuery) ||
      timeDifference.includes(searchQuery)
    );
  });

  if (!userId) {
    return <div className="default-message">Login to see your orders.</div>;
  }

  return (
    <div className="orders-container">
      <div className='flex justify-end'>
        {selectedOrders.length > 0 && (
          <button className="cancel-orders-button" onClick={cancelSelectedOrders}>
            {selectedOrders.length === 1 ? 'Cancel Order\u00A0' : 'Cancel Orders'}
          </button>
        )}
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="Search by name or type..." 
            value={searchQuery} 
            onChange={handleSearchChange}
          />
        </div>
      </div>
      <div className="orders-list">
        <div className="order-headers">
          <div className="order-header" onClick={() => handleSort('stock')}>Ticker</div>
          <div className="order-header" onClick={() => handleSort('action')}>Order</div>
          <div className="order-header" onClick={() => handleSort('q')}>Quantity</div>
          <div className="order-header" onClick={() => handleSort('price')}>Price</div>
          <div className="order-header" onClick={() => handleSort('price')}>Total</div>
          <div className="order-header" onClick={() => handleSort('date')}>Time</div>
        </div>
        {filteredOrders.map(order => (
          <div 
            key={order.date} 
            className={`order-item ${selectedOrders.includes(order.date) ? 'selected' : ''}`} 
            onClick={() => handleOrderClick(order.date)}
          >
          <div className="order-stock">{order.stock}</div>
          <div 
            className={`order-action ${order.action.toLowerCase() === 'buy' ? 'order-buy' : 'order-sell'}`}
          >
            {formatAction(order.action)}
          </div>
            <div className="order-quantity">{order.q}</div>
            <div className="order-price">${parseFloat(order.price).toFixed(2)}</div>
            <div className="order-price">${(order.q * order.price).toFixed(2)}</div>
            <div className="order-date">{getTimeDifference(order.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserOrders;
