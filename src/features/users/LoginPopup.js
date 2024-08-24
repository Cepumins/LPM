import React, { useState } from 'react';
import axios from 'axios';
import './LoginPopup.css';

axios.defaults.withCredentials = true;

function LoginPopup({ onClose, onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5001/api/users/login', { name, password });
      const userId = response.data.userId;
      localStorage.setItem('userId', userId); // Store user ID in localStorage
      onLogin(userId);
      onClose(false); // Close the popup after successful login
    } catch (error) {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="login-popup">
      <div className="popup-content">
        <button className="close-button" onClick={() => onClose(false)}>X</button>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div>
            <label>Username </label>
            <input className='login-field' type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>Password </label>
            <input className='login-field' type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit">Login</button>
        </form>
        <p className="redirect">
          Don't have an account? <span onClick={() => onClose(true)}>Register Here!</span>
        </p>
      </div>
    </div>
  );
}

export default LoginPopup;
