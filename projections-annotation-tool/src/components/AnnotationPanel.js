import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from "./../config";

export const AnnotationPanel = ({ patientId, viewData, updateAnnotationsCount, onAnnotationSelect, onResetView }) => {
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  const fetchAnnotations = () => {
    if (!patientId) return;
    axios.get(`${API_BASE_URL}/annotations/${patientId}`, {
      withCredentials: true,
    })
      .then((response) => {
        setAnnotations(response.data.annotations || []);
        setSelectedAnnotationId(null);
      })
      .catch((error) => {
        console.error("Failed to load annotations", error);
      });
  };

  useEffect(() => {
    fetchAnnotations();
  }, [patientId]);

  const handleDelete = (annotationId) => {
    axios.delete(`${API_BASE_URL}/annotations/${annotationId}`, {
      withCredentials: true,
    })
      .then(() => {
        fetchAnnotations();
        updateAnnotationsCount();
      })
      .catch((error) => {
        console.error("Failed to delete annotation", error);
      });
  };

  const handleUpdate = () => {
    if (!selectedAnnotationId) return;
    axios.put(`${API_BASE_URL}/annotations/${selectedAnnotationId}`, {
      rao: viewData.rao,
      cran: viewData.cran,
      viewVector: viewData.viewVector,
      note: noteInput,
    }, {
      withCredentials: true,
    })
      .then(() => {
        setNoteInput('');
        setSelectedAnnotationId(null);
        fetchAnnotations();
        updateAnnotationsCount();
      })
      .catch((err) => console.error("Failed to update annotation", err));
  };

  const handleSaveNew = () => {
    const newAnnotation = {
      rao: viewData.rao,
      cran: viewData.cran,
      viewVector: viewData.viewVector,
      note: noteInput
    };
    axios.post(`${API_BASE_URL}/annotations/${patientId}`, newAnnotation, {
      withCredentials: true,
    })
      .then(() => {
        setNoteInput('');
        fetchAnnotations();
        updateAnnotationsCount();
      })
      .catch((err) => console.error("Failed to save new annotation", err));
  };

  const handleReset = () => {
    onResetView();
  };

  return (
    <div>
      <h4>Current projection</h4>
      <p>Viewing Vector: ({viewData.viewVector.map(v => v.toFixed(2)).join(', ')})</p>
      <p>RAO: {viewData.rao}°</p>
      <p>CRAN: {viewData.cran}°</p>

      <textarea
        value={noteInput}
        onChange={(e) => setNoteInput(e.target.value)}
        placeholder="Add a note..."
        style={{ width: '100%', minHeight: '80px', marginTop: '10px' }}
      />

      <div style={{ marginTop: '10px' }}>
        <button
          onClick={handleUpdate}
          disabled={selectedAnnotationId === null}
          style={{
            marginRight: '10px',
            backgroundColor: selectedAnnotationId === null ? '#ccc' : '#007bff',
            color: 'white',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedAnnotationId === null ? 'default' : 'pointer'
          }}
        >
          Update annotation
        </button>

        <button
          onClick={handleSaveNew}
          style={{
            marginTop: '5px',
            marginRight: '10px',
            backgroundColor: '#28a745',
            color: 'white',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Save new annotation
        </button>

        <button
          onClick={handleReset}
          style={{
            marginTop: '5px',
            backgroundColor: '#bf212f',
            color: 'white',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset view
        </button>
      </div>

      <h4 style={{ marginTop: '20px' }}>Saved projections</h4>
      {annotations.length === 0 && <p>No saved annotations.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {annotations.map((ann) => (
          <li
            key={ann.id}
            onClick={() => {
              if (selectedAnnotationId === ann.id) {
                setSelectedAnnotationId(null);
                setNoteInput('');
                onAnnotationSelect(null);
              } else {
                const selectedAnnotation = ann;
                setSelectedAnnotationId(ann.id);
                setNoteInput(ann.note || '');
                onAnnotationSelect({
                  rao: selectedAnnotation.rao,
                  cran: selectedAnnotation.cran,
                  viewVector: selectedAnnotation.view_vector
                });
              }
            }}            
            style={{
              position: 'relative',
              cursor: 'pointer',
              border: '1px solid #ccc',
              borderRadius: '6px',
              padding: '10px 30px 10px 10px',
              marginBottom: '8px',
              backgroundColor: selectedAnnotationId === ann.id ? '#e0f7fa' : '#fff',
              transition: 'background-color 0.2s',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '10px',
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#888',
              cursor: 'pointer',
              lineHeight: '1',
            }}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(ann.id);
              }}
              title="Delete"
            >
              &times;
            </div>
            <div><strong>RAO:</strong> {ann.rao ?? '—'}°, <strong>CRAN:</strong> {ann.cran ?? '—'}°</div>
            <div><strong>Note:</strong> {ann.note || '—'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};
