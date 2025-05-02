import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import VTKVisualizer from './components/VTKVisualizer';
import { AnnotationPanel } from './components/AnnotationPanel';
import { API_BASE_URL } from "./config";

function App() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [annotationsMap, setAnnotationsMap] = useState({});
  const [viewData, setViewData] = useState({
    viewVector: [0, 0, 0],
    rao: 0,
    cran: 0
  });
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [resetTrigger, setResetTrigger] = useState(false);

  // Load patients
  useEffect(() => {
    axios.get(`${API_BASE_URL}/patients`, { withCredentials: true })
      .then(res => setPatients(res.data.patient_ids))
      .catch(err => console.error("Failed to fetch patient IDs", err));
  }, []);

  // Load annotations for each patient
  useEffect(() => {
  axios.get(`${API_BASE_URL}/annotations`, { withCredentials: true })
    .then(res => {
      const annotationsList = res.data.annotations;
      const counts = {};

      for (const annotation of annotationsList) {
        const patientId = annotation.patient_id;
        if (counts[patientId]) {
          counts[patientId] += 1;
        } else {
          counts[patientId] = 1;
        }
      }

      setAnnotationsMap(counts);
    })
    .catch(err => {
      console.error("Failed to fetch annotations", err);
      setAnnotationsMap({});
    });
}, []);

  const handlePatientSelection = (patientId) => {
    setSelectedPatient(patientId);
  };

  const handleResetView = () => {
    setResetTrigger(prev => !prev);
  }

  const updateAnnotationsCount = () => {
    axios.get(`${API_BASE_URL}/annotations`, { withCredentials: true })
      .then(res => {
        const annotations  = res.data.annotations;

        const counts = {};

        annotations.forEach(annotation => {
          const patientId = annotation.patient_id;
          counts[patientId] = (counts[patientId] || 0) + 1;
        });
  
        setAnnotationsMap(counts);
      })
      .catch(err => console.error("Failed to fetch annotations", err));
  };

  return (
    <div className="app-container">
      {/* Left panel: Patient list with annotation number */}
      <div className="patient-list" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderRight: '1px solid #ccc' }}>
        <h3>Patients</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {patients.map(patient => (
            <li
              key={patient}
              onClick={() => handlePatientSelection(selectedPatient === patient ? null : patient)}
              style={{
                cursor: 'pointer',
                padding: '6px 8px',
                backgroundColor: selectedPatient === patient ? '#ffe0b2' : '#fff',
                borderRadius: '4px',
                marginBottom: '5px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid #ddd'
              }}
            >
              <span>{patient}</span>
              <span style={{ fontSize: '0.8rem', color: annotationsMap[patient] ? 'green' : '#aaa' }}>
                {annotationsMap[patient] ? `${annotationsMap[patient]}` : '0'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Middle panel: 3D visualizer */}
      <div className="visualizer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px', height: '100vh' }}>
        {selectedPatient && <VTKVisualizer 
          patientId={selectedPatient} 
          onViewDataChange={setViewData} 
          selectedAnnotation={selectedAnnotation}
          resetTrigger={resetTrigger}
        />}
      </div>

      {/* Right panel: Annotation panel */}
      <div className="annotation-panel" style={{ width: '20%', padding: '10px', overflowY: 'auto', borderLeft: '1px solid #ccc' }}>
        <h3>Annotations</h3>
        {selectedPatient && <AnnotationPanel 
          patientId={selectedPatient} 
          viewData={viewData} 
          updateAnnotationsCount={updateAnnotationsCount} 
          onAnnotationSelect={setSelectedAnnotation}
          onResetView={handleResetView}
        />}
      </div>
    </div>
  );
}

export default App;
