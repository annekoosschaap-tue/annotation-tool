import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const RootComponent = () => {
  const [token, setToken] = useState(null);

  // Ask for token on app startup
  const handleTokenInput = () => {
    const userToken = prompt("Enter your authentication token:");
    if (userToken) {
      setToken(userToken);
    } else {
      alert("Token is required to proceed.");
      handleTokenInput(); // Ask again if no token is provided
    }
  };

  useEffect(() => {
    handleTokenInput();  // Request token on initial load
  }, []);

  return token ? <App token={token} /> : <div>Loading...</div>;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // <React.StrictMode>
    <RootComponent />
  // </React.StrictMode>
);

reportWebVitals();
