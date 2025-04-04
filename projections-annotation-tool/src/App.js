import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import VTKVisualizer from './components/VTKVisualizer';
import { AnnotationPanel } from './components/AnnotationPanel';
import { API_BASE_URL } from "./config";

function App() {
  const [dicomFiles, setDicomFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [rao, setRao] = useState(null);
  const [cran, setCran] = useState(null);
  const [viewVector, setViewVector] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/dicom-files`, {
      withCredentials: true, 
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then(response => setDicomFiles(response.data.files))
    .catch(error => console.log(error));
  }, []);
  
  const handleFileSelection = (fileName) => {
    setSelectedFile(fileName);
    axios.get(`${API_BASE_URL}/annotations/${fileName}`, {
      withCredentials: true,  
    })
    .then(response => {
      const annotations = response.data.annotations[0] || {};
      setRao(annotations.rao || 'N/A');
      setCran(annotations.cran || 'N/A');
      setViewVector(annotations.viewVector || 'N/A');
    })
    .catch(error => console.log(error));
  };

  return (
    <div className="app-container" >
      <div className="file-list" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Available Files</h3>
        <ul>
          {dicomFiles.map(file => (
            <li key={file} onClick={() => handleFileSelection(file)} style={{ cursor: 'pointer', padding: '5px' }}>
              {file}
            </li>
          ))}
        </ul>
      </div>
      <div className="visualizer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', height: '100vh' }}>
        {selectedFile && <VTKVisualizer fileName={selectedFile} />}
      </div>
      <div className="annotation-panel" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderLeft: '1px solid #ccc' }}>
        <h3>Annotations</h3>
        {selectedFile && <AnnotationPanel fileName={selectedFile} />}
      </div>
    </div>
  );
}

export default App;
