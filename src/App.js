import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import StockList from './features/stocks/StockList';
import Settings from './features/settings/Settings';
import Inventory from './features/ownership/Inventory';
import UserOrders from './features/ownership/Orders';
import LoginPopup from './features/users/LoginPopup';
import RegisterPopup from './features/users/RegisterPopup';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCoffee } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [userId, setUserId] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      checkActiveSession(storedUserId);
    }
  }, []);

  const checkActiveSession = async (storedUserId) => {
    try {
      const response = await axios.get(`http://localhost:5001/api/users/check-session/${storedUserId}`, { withCredentials: true });
      if (response.data.active) {
        setUserId(storedUserId);
        fetchUserBalance(storedUserId);
        fetchUserInventory(storedUserId);
        setupWebSocket(storedUserId);
      } else {
        handleLogout();
      }
    } catch (error) {
      console.error('Error checking active session:', error);
      handleLogout();
    }
  };

  const fetchUserBalance = async (userId) => {
    try {
      const response = await axios.get(`http://localhost:5001/api/users/details/${userId}`);
      setUserBalance(response.data.balance);
    } catch (error) {
      console.error('Error fetching user balance:', error);
    }
  };

  const fetchUserInventory = async (userId) => {
    try {
      const response = await axios.get(`http://localhost:5001/api/users/inventory/${userId}`);
      //console.log('App.js received response:', JSON.stringify(response, null, 2));
      //console.log('App.js received response.data:', JSON.stringify(response.data, null, 2));
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching user inventory:', error);
    }
  };

  const setupWebSocket = (userId) => {
    const socket = new WebSocket('ws://localhost:5001');

    socket.onopen = () => {
      console.log('WebSocket connection established');
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'balanceUpdate' && message.userId === userId) {
        setUserBalance(message.balance);
      } else if (message.type === 'inventoryUpdate' && message.userId === userId) {
        setInventory(message.inventory);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket connection closed');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const formatBalance = (balance) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(balance).replace('$', '$').replace(',', '\'');
  };

  const handleLogin = (userId) => {
    setUserId(userId);
    fetchUserBalance(userId);
    fetchUserInventory(userId);
    localStorage.setItem('userId', userId);
    setupWebSocket(userId);
  };

  const handleLogout = async () => {
    try {
      await axios.post('http://localhost:5001/api/users/logout', {}, { withCredentials: true });
      setUserId(null);
      setUserBalance(null);
      setInventory([]);
      localStorage.removeItem('userId'); 
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const refreshUserData = async (userId) => {
    await fetchUserBalance(userId);
    await fetchUserInventory(userId);
  };

  const openLogin = () => {
    setIsLoginOpen(true);
    setIsRegisterOpen(false);
  };

  const openRegister = () => {
    setIsRegisterOpen(true);
    setIsLoginOpen(false);
  };

  const closeLogin = (openRegister) => {
    setIsLoginOpen(false);
    if (openRegister) {
      setIsRegisterOpen(true);
    }
  };

  const closeRegister = (openLogin) => {
    setIsRegisterOpen(false);
    if (openLogin) {
      setIsLoginOpen(true);
    }
  };

  return (
    <Router>
      <div className="App" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <header className="bg-c-dark text-white w-full">
          <div className="max-w-screen-2xl w-10/12 mx-auto flex justify-between items-center p-4" style={{ marginLeft: 100, marginRight: 'auto' }}>
            <div className="flex items-center space-x-4">
              <a className="font-bold text-lg">LPM</a>
              <FontAwesomeIcon icon={faCoffee} className="h-8 w-8" />
            </div>
            <nav className="flex space-x-4 font-bold min-w-min">
              <a href="/" className="text-lg hover:text-c-dark-white px-4 pl-6">Home</a>
              <a href="/about" className="text-lg hover:text-c-dark-white px-4">About</a>
              <a href="/settings" className="text-lg hover:text-c-dark-white px-4">Settings</a>
              {userId ? (
                <>  
                  <span className="text-lg px-4 balance">{`${formatBalance(userBalance)}`}</span>
                  <span className="text-lg px-4">{`ID: ${userId}`}</span>
                  <span onClick={handleLogout} className="text-lg hover:text-c-dark-white px-4 cursor-pointer">Logout</span>
                </>
              ) : (
                <span onClick={openLogin} className="text-lg hover:text-c-dark-white px-4 cursor-pointer">Login</span>
              )}
            </nav>
          </div>
        </header>
        <main className='h-7/8 bg-c-light' style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route exact path="/" element={<StockList userId={userId} userBalance={parseFloat(userBalance)} inventory={inventory} refreshUserData={refreshUserData} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/inventory" element={<Inventory userId={userId} />} />
            <Route path="/orders" element={<UserOrders userId={userId} />} />
          </Routes>
        </main>
        <footer className='inset-x-0 bottom-5 bg-c-dark text-c-white' style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          made possible by nicotine ;)
        </footer>
        {isLoginOpen && (
          <LoginPopup onClose={closeLogin} onLogin={handleLogin} />
        )}
        {isRegisterOpen && (
          <RegisterPopup onClose={closeRegister} onRegister={handleLogin} />
        )}
      </div>
    </Router>
  );
}

export default App;
