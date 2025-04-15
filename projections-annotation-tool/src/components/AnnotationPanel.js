import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from "./../config";

export const AnnotationPanel = ({ fileName }) => {
  const currentAngles = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (fileName) {
      axios.get(`${API_BASE_URL}/annotations/${fileName}`, {
        withCredentials: true,
      })
      .then((response) => {
        setAnnotations(response.data.annotations || []);
      })
      .catch((error) => {
        console.error("Failed to load annotations", error);
      });
    }
  }, [fileName]);

  const handleSaveAnnotation = () => {
    if (!currentAngles.viewVector || currentAngles.rao === null || currentAngles.cran === null) {
      alert("No valid angles to save.");
      return;
    }

    const newAnnotation = {
      viewVector: currentAngles.viewVector,
      rao: currentAngles.rao,
      cran: currentAngles.cran,
      note: note || '',
    };

    axios.post(`${API_BASE_URL}/annotations/${fileName}`, newAnnotation, {
      withCredentials: true,
    })
    .then(() => {
      setAnnotations(prev => [...prev, newAnnotation]);
      setNote('');
    })
    .catch((error) => {
      console.error("Failed to save annotation", error);
    });
  };

  const handleDelete = (indexToDelete) => {
    axios.delete(`${API_BASE_URL}/annotations/${fileName}/${indexToDelete}`, {
      withCredentials: true,
    })
    .then(() => {
      setAnnotations((prev) => prev.filter((_, index) => index !== indexToDelete));
    })
    .catch((error) => {
      console.error("Failed to delete annotation", error);
    });
  };

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <p><strong>RAO:</strong> {currentAngles.rao ?? 'N/A'}°</p>
        <p><strong>CRAN:</strong> {currentAngles.cran ?? 'N/A'}°</p>
        <p><strong>View Vector:</strong> {currentAngles.viewVector ? currentAngles.viewVector.map(v => v.toFixed(2)).join(', ') : 'N/A'}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note..."
          style={{ width: '100%', marginTop: '10px' }}
        />
        <button onClick={handleSaveAnnotation} style={{ marginTop: '10px' }}>
          Save Annotation
        </button>
      </div>

      <h4>Saved Annotations</h4>
      {annotations.length === 0 && <p>No saved annotations.</p>}
      <ul>
        {annotations.map((ann, idx) => (
          <li key={idx} style={{ marginBottom: '0.5rem', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem' }}>
            <div><strong>RAO:</strong> {ann.rao}°, <strong>CRAN:</strong> {ann.cran}°</div>
            <div><strong>Note:</strong> {ann.note || '—'}</div>
            <button onClick={() => handleDelete(idx)} style={{ marginTop: '5px' }}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
