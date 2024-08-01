import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './StockList.css';
import StockPopup from './StockPopup';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

function StockList({ userId, userBalance, inventory, refreshUserData }) {
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [sortOption, setSortOption] = useState('default');
  const [isDropdownDisabled, setDropdownDisabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/stocks/info');
        const fetchedStocks = response.data;
        setStocks(fetchedStocks);
        sortStocks(sortOption, fetchedStocks);
        //sortStocks('default', fetchedStocks); // Sort alphabetically initially
      } catch (error) {
        console.error('Error fetching stocks:', error);
      }
    };

    fetchStocks();

    const ws = new WebSocket('ws://localhost:5000');
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'update') {
        if (Array.isArray(message.data)) {
          setStocks(prevStocks => {
            const updatedStocks = [...prevStocks];
            message.data.forEach(updatedStock => {
              const index = updatedStocks.findIndex(stock => stock.ticker === updatedStock.ticker);
              if (index !== -1) {
                //console.log(`ARRAY: ${updatedStock.ticker} new buy: ${updatedStock.buyP} and sell: ${updatedStock.sellP}`);
                updatedStocks[index] = { ...updatedStocks[index], ...updatedStock };
              }
            });
            return updatedStocks;
          });
        } else if (typeof message.data === 'object' && message.data.ticker) {
          setStocks(prevStocks => {
            const updatedStocks = [...prevStocks];
            const index = updatedStocks.findIndex(stock => stock.ticker === message.data.ticker);
            if (index !== -1) {
              //console.log(`OBJECT: ${message.data.ticker} new sell: ${message.data.sellP} and buy: ${message.data.buyP}`);

              updatedStocks[index] = { ...updatedStocks[index], ...message.data };
              if (selectedStock && updatedStocks[index].ticker === selectedStock.ticker) {
                setSelectedStock(updatedStocks[index]);
              
              }
              //console.log('selected stock:');
              //console.log(selectedStock);
            }
            //sortStocks(sortOption, updatedStocks);
            return updatedStocks;
          });
        }
      }
    };

    return () => {
      ws.close();
    };
  }, [selectedStock, sortOption]);

  /*
  useEffect(() => {
    console.log(`Selected stock:`, selectedStock);
  }, [selectedStock]);
  */

  const handleStockClick = (stock) => {
    console.log(`Stock clicked: ${stock.ticker}`);
    setSelectedStock(stock);
  };

  const closePopup = () => {
    console.log('Popup closed');
    setSelectedStock(null);
  };

  const refreshStock = (ticker) => {
    const updatedStock = stocks.find(s => s.ticker === ticker);
    setSelectedStock(updatedStock);
  };

  const handleSortChange = (e) => {
    const newSortOption = e.target.value;
    if (newSortOption !== sortOption) {
      console.log(`applying sorting as old was ${sortOption} and the new is ${newSortOption}`);
      //sortOption = newSortOption;
      setSortOption(newSortOption);
      sortStocks(newSortOption, stocks);
    } else {
      console.log(`new and old sorting options both are ${sortOption}`);
    }
    setDropdownDisabled(true);
    setTimeout(() => {
      setDropdownDisabled(false);
    }, 750);
  };

  const sortStocks = (option, fetchedStocks = stocks) => {
    //console.log(`sorting to ${option}`);
    let sortedStocks = [...fetchedStocks];
  
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
      sortedStocks.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    } else if (option === 'alphabetical') {
      sortedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker));
    } else if (option === 'cheapest') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'buyP'));
    } else if (option === 'expensive') {
      sortedStocks.sort((a, b) => sortFunction(a, b, 'sellP', false));
    }
  
    setStocks(sortedStocks);
  };
  

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const filteredStocks = stocks.filter(stock =>
    stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (stock.type && stock.type.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="stock-container">
      <div className='flex justify-end'>
      <div className="search-bar">
          <input 
            type="text" 
            placeholder="Search by name..." 
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
          </select>
          <FontAwesomeIcon icon={faChevronDown} />
        </div>
      </div>

      <div className={`stock-list ${selectedStock ? 'blurred' : ''}`}>
        {filteredStocks.length === 0 ? <p>No stocks available</p> : null}
        {filteredStocks.map(stock => (
          <div key={stock.ticker} className="stock-item" onClick={() => handleStockClick(stock)}>
            <img src={`/logos/${stock.ticker.toLowerCase()}.svg`} alt={`${stock.ticker} icon`} className="stock-icon" />
            <div className="stock-ticker">{stock.ticker}</div>
            <div className="stock-prices">
              <div className="sell-price">{stock.sellP === "-" ? <>No sell<br />order</> : <>Bid:<br />${stock.sellP}</>}</div>
              <div className="buy-price">{stock.buyP === "-" ? <>No buy<br />order</> : <>Ask:<br />${stock.buyP}</>}</div>
            </div>
          </div>
        ))}
      </div>
      {selectedStock && (
        <StockPopup
          //key={selectedStock.ticker} // Use key to force re-render
          stock={selectedStock} 
          onClose={closePopup} 
          userId={userId} 
          userBalance={userBalance} 
          inventory={inventory} 
          refreshUserData={refreshUserData}
          //stocks={stocks} // Pass the full stocks list
          //refreshStock={refreshStock} // Pass refreshStock callback
        />
      )}
    </div>
  );
}

export default StockList;
