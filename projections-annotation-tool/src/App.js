import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import VTKVisualizer from './components/VTKVisualizer';
import { AnnotationPanel } from './components/AnnotationPanel';
import { API_BASE_URL } from "./config";

function App() {
  const [dicomFiles, setDicomFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [annotationsMap, setAnnotationsMap] = useState({});

  // Load DICOM files
  useEffect(() => {
    axios.get(`${API_BASE_URL}/dicom-files`, { withCredentials: true })
      .then(res => setDicomFiles(res.data.files))
      .catch(err => console.error("Failed to fetch DICOM files", err));
  }, []);

  // Load annotations for each patient
  useEffect(() => {
    axios.get(`${API_BASE_URL}/annotations`, { withCredentials: true })
      .then(res => {
        const annotationsObj = res.data.annotations;
        const counts = {};
  
        for (const fileName in annotationsObj) {
          if (annotationsObj.hasOwnProperty(fileName)) {
            counts[fileName] = annotationsObj[fileName].length;
          }
        }
  
        setAnnotationsMap(counts);
      })
      .catch(err => {
        console.error("Failed to fetch annotations", err);
        setAnnotationsMap({});
      });
  }, []);

  const handleFileSelection = (fileName) => {
    setSelectedFile(fileName);
  };

  return (
    <div className="app-container">
      {/* Left panel: DICOM list with annotation check */}
      <div className="file-list" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Patient files</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
        {dicomFiles.map(file => (
          <li
            key={file}
            onClick={() => handleFileSelection(file)}
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              backgroundColor: selectedFile === file ? '#ffe0b2' : '#fff',
              borderRadius: '4px',
              marginBottom: '5px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid #ddd'
            }}
          >
            <span>{file}</span>
            <span style={{ fontSize: '0.8rem', color: annotationsMap[file] ? 'green' : '#aaa' }}>
              {annotationsMap[file] ? `${annotationsMap[file]}` : '0×'}
            </span>
          </li>
        ))}
      </ul>
      </div>

      {/* Middle panel: 3D visualizer */}
      <div className="visualizer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', height: '100vh' }}>
        {selectedFile && <VTKVisualizer fileName={selectedFile} />}
      </div>

      {/* Right panel: annotation panel */}
      <div className="annotation-panel" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderLeft: '1px solid #ccc' }}>
        <h3>Annotations</h3>
        {selectedFile && <AnnotationPanel fileName={selectedFile} />}
      </div>
    </div>
  );
}

export default App;
