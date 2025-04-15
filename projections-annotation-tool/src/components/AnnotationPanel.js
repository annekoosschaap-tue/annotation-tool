import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from "./../config";

export const AnnotationPanel = ({ fileName }) => {
  const [annotations, setAnnotations] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);

  useEffect(() => {
    if (fileName) {
      axios.get(`${API_BASE_URL}/annotations/${fileName}`, {
        withCredentials: true,
      })
      .then((response) => {
        setAnnotations(response.data.annotations || []);
        setSelectedIndex(null); // Reset selection on new file
      })
      .catch((error) => {
        console.error("Failed to load annotations", error);
      });
    }
  }, [fileName]);

  const handleDelete = (indexToDelete) => {
    axios.delete(`${API_BASE_URL}/annotations/${fileName}/${indexToDelete}`, {
      withCredentials: true,
    })
    .then(() => {
      setAnnotations((prev) => prev.filter((_, index) => index !== indexToDelete));
      if (selectedIndex === indexToDelete) {
        setSelectedIndex(null);
      } else if (selectedIndex > indexToDelete) {
        setSelectedIndex(selectedIndex - 1);
      }
    })
    .catch((error) => {
      console.error("Failed to delete annotation", error);
    });
  };

  return (
    <div>
      <h4>Annotation note</h4>
      <textarea
        value={selectedIndex !== null ? annotations[selectedIndex].note : ''}
        readOnly
        placeholder="Select an annotation to view its note..."
        style={{ width: '100%', minHeight: '80px', marginTop: '10px' }}
      />
      
      <h4>Saved projections</h4>
      {annotations.length === 0 && <p>No saved annotations.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {annotations.map((ann, idx) => (
          <li
            key={idx}
            onClick={() => setSelectedIndex(idx)}
            style={{
              cursor: 'pointer',
              border: '1px solid #ccc',
              borderRadius: '6px',
              padding: '10px',
              marginBottom: '8px',
              backgroundColor: selectedIndex === idx ? '#e0f7fa' : '#fff',
              transition: 'background-color 0.2s',
            }}
          >
            <div><strong>RAO:</strong> {ann.rao}°, <strong>CRAN:</strong> {ann.cran}°</div>
            <div><strong>Note:</strong> {ann.note || '—'}</div>
            <button
              onClick={(e) => {
                e.stopPropagation(); // prevent selection on delete
                handleDelete(idx);
              }}
              style={{ marginTop: '6px', fontSize: '0.9rem' }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
