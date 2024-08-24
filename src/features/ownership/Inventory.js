import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Inventory.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

const Inventory = ({ userId }) => {
  const [inventory, setInventory] = useState([]);
  const [stockInfo, setStockInfo] = useState([]);
  const [mergedStocks, setMergedStocks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('default');
  const [isDropdownDisabled, setDropdownDisabled] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchInventory();
      fetchStockInfo();
      //console.log('fetched inv and info');
      //sortStocks('default');
    }
  }, [userId]);

  useEffect(() => {
    if (inventory.length && stockInfo.length) {
      mergeStockData();
      console.log('merged');
    }
  }, [inventory, stockInfo]);

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`http://localhost:5001/api/users/inventory/${userId}`);
      //const reversedInventory = response.data.reverse();
      const reversedInventory = response.data.reverse().map((stock, index) => ({
        ...stock,
        order: index
      }));
      //console.log(reversedInventory);
      setInventory(reversedInventory);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchStockInfo = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/stocks/info');
      setStockInfo(response.data);
    } catch (error) {
      console.error('Error fetching stock info:', error);
    }
  };

  const mergeStockData = () => {
    const merged = inventory.map(stock => {
      const stockDetails = stockInfo.find(info => info.ticker === stock.ticker) || {};
      return { ...stock, ...stockDetails };
    });
    setMergedStocks(merged);
  };

  const handleSortChange = (e) => {
    setSortOption(e.target.value);
    sortStocks(e.target.value);
    setDropdownDisabled(true);
    setTimeout(() => {
      setDropdownDisabled(false);
    }, 750);
  };

  const sortStocks = (option) => {
    let sortedStocks = [...mergedStocks];

    const sortFunction = (a, b, key, ascending = true) => {
      const aValue = isNaN(parseFloat(a[key])) ? (ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : parseFloat(a[key]);
      const bValue = isNaN(parseFloat(b[key])) ? (ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : parseFloat(b[key]);

      if (ascending) {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    };

    if (option === 'default') {
      //sortedStocks.sort((a, b) => new Date(b.updated) - new Date(a.updated));
      sortedStocks.sort((a, b) => a.order - b.order); // Sort by initial order
    } else if (option === 'alphabetical') {
      sortedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker));
    } else if (option === 'cheapest') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'buyP'));
    } else if (option === 'expensive') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'sellP', false));
    } else if (option === 'mostQuantity') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'quantity', false)); // Sort by quantity descending
    } else if (option === 'leastQuantity') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'quantity', true)); // Sort by quantity ascending
    }

    console.log('sorted');
    console.log(sortedStocks);
    setInventory(sortedStocks);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const filteredStocks = mergedStocks.filter(stock =>
    stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stock.type && stock.type.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="inventory-container">
      <div className='flex justify-end'>
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="Search by name or type..." 
            value={searchQuery} 
            onChange={handleSearchChange}
          />
        </div>
        <div className="sort-dropdown">
          <label htmlFor="sort">Sort: </label>
          <select 
              id="sort" 
              value={sortOption} 
              onChange={handleSortChange} 
              disabled={isDropdownDisabled}
            >
              <option value="default">Default</option>
            <option value="alphabetical">Alphabetically</option>
            <option value="cheapest">Cheapest</option>
            <option value="expensive">Most Expensive</option>
            <option value="mostQuantity">Highest Quantity</option>
            <option value="leastQuantity">Least Quantity</option>
          </select>
          <FontAwesomeIcon icon={faChevronDown} />
        </div>
      </div>
      <div className="inventory-list">
        {filteredStocks.map(stock => {
          const { ticker, quantity, buyP, sellP } = stock;
          return (
            <div key={ticker} className="inventory-item">
              <img src={`/logos/${stock.ticker.toLowerCase()}.svg`} alt={`${stock.ticker} icon`} className="stock-icon" />
              <div className="inventory-stock-details">
                <div className="inventory-stock-ticker">{ticker}</div>
                <div className="inventory-stock-quantity">Quantity: {quantity}</div>
                <div className="inventory-stock-prices">
                  <div className="inventory-stock-bid">Bid: {buyP === "NaN" ? "No buy order" : `$${sellP}`}</div>
                  <div className="inventory-stock-ask">Ask: {sellP === "NaN" ? "No sell order" : `$${buyP}`}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Inventory;
