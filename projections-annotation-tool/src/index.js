import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const RootComponent = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function to authenticate user and store token in cookies
  const authenticateUser = async () => {
    const userToken = prompt("Enter your authentication token:");
    if (userToken) {
      try {
        await axios.post(
          "http://localhost:8000/set-token",
          { token: userToken }, // Send the token in request body
          { withCredentials: true } // Ensure cookies are sent and received
        );
        setIsAuthenticated(true);
      } catch (error) {
        console.error("Authentication failed:", error);
        alert("Invalid token. Please try again.");
        authenticateUser(); // Retry if authentication fails
      }
    } else {
      alert("Token is required to proceed.");
      authenticateUser(); // Ask again if no token is provided
    }
  };
  
  // Verify if token is already set
  const verifyAuthentication = async () => {
    try {
      await axios.get("http://localhost:8000/dicom-files", {
        withCredentials: true, // Send cookies
      });
      setIsAuthenticated(true);
    } catch (error) {
      console.log("Token is missing or invalid, prompting for authentication.");
      authenticateUser(); // Request token if not authenticated
    }
  };
  
  useEffect(() => {
    verifyAuthentication();
  }, []);

  return isAuthenticated ? <App /> : <div>Loading...</div>;
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);

reportWebVitals();
