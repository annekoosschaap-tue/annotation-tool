const isLocal = window.location.hostname === "localhost";

export const API_BASE_URL = isLocal 
  ? "http://localhost:8000" 
  : "https://annotation-tool-s1jy.onrender.com";
