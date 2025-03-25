import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { AnnotationPanel } from './components/AnnotationPanel';
import ThreeDViewer from './components/ThreeDViewer';

function App({ token }) {
  const [dicomFiles, setDicomFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [rao, setRao] = useState(null);
  const [cran, setCran] = useState(null);
  const [viewVector, setViewVector] = useState(null);

  useEffect(() => {
    if (token) {
      // Fetch the DICOM files once the token is available
      axios.get('http://127.0.0.1:8000/dicom-files', {
        headers: {
          'Authorization': `Bearer ${token}`,  // Send token in the Authorization header
        }
      })
        .then(response => {
          setDicomFiles(response.data.files);
        })
        .catch(error => console.log(error));
    }
  }, [token]);

  const handleFileSelection = (fileName) => {
    setSelectedFile(fileName);

    // Fetch angles and view vector data from FastAPI
    axios.get(`http://127.0.0.1:8000/annotations/${fileName}`, {
      headers: {
        'Authorization': `Bearer ${token}`,  // Send token in the Authorization header
      }
    })
      .then(response => {
        const annotations = response.data.annotations[0] || {};
        setRao(annotations.rao || 'N/A');
        setCran(annotations.cran || 'N/A');
        setViewVector(annotations.viewVector || 'N/A');
      });
  };

  return (
    <div className="app-container">
      <div className="left-pane">
        <h2>Patients</h2>
        <ul>
          {dicomFiles.map(file => (
            <li key={file} onClick={() => handleFileSelection(file)}>
              {file}
            </li>
          ))}
        </ul>
      </div>
      <div className="middle-pane">
        {selectedFile && <ThreeDViewer fileName={selectedFile} token={token} />}
      </div>
      <div className="right-pane">
        <h2>Current working projection</h2>
        {selectedFile && (
          <div>
            <p><strong>RAO:</strong> {rao}</p>
            <p><strong>CRAN:</strong> {cran}</p>
            <p><strong>View Vector:</strong> {viewVector}</p>
            <AnnotationPanel fileName={selectedFile} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
