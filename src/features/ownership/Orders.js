import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Orders.css';

const UserOrders = ({ userId }) => {
  const [orders, setOrders] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'ascending' });

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

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
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

  return (
    <div className="orders-container">
      <div className="orders-list">
        <div className="order-headers">
          <div className="order-header" onClick={() => handleSort('stock')}>Ticker</div>
          <div className="order-header" onClick={() => handleSort('action')}>Order</div>
          <div className="order-header" onClick={() => handleSort('q')}>Quantity</div>
          <div className="order-header" onClick={() => handleSort('price')}>Price</div>
          <div className="order-header" onClick={() => handleSort('date')}>Date</div>
        </div>
        {sortedOrders.map(order => (
          <div key={order.date} className="order-item">
            <div className="order-stock">{order.stock}</div>
            <div className="order-action">{formatAction(order.action)}</div>
            <div className="order-quantity">{order.q}</div>
            <div className="order-price">${order.price}</div>
            <div className="order-date">{new Date(order.date).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserOrders;
