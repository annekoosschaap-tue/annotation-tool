import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from "./../config";

export const AnnotationPanel = ({ fileName, viewData, updateAnnotationsCount, onAnnotationSelect, onResetView }) => {
  const [annotations, setAnnotations] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [selectedNote, setSelectedNote] = useState('');

  const fetchAnnotations = () => {
    if (!fileName) return;
    axios.get(`${API_BASE_URL}/annotations/${fileName}`, {
      withCredentials: true,
    })
      .then((response) => {
        setAnnotations(response.data.annotations || []);
        setSelectedIndex(null);
      })
      .catch((error) => {
        console.error("Failed to load annotations", error);
      });
  };

  useEffect(() => {
    fetchAnnotations();
  }, [fileName]);

  const handleDelete = (indexToDelete) => {
    axios.delete(`${API_BASE_URL}/annotations/${fileName}/${indexToDelete}`, {
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
    if (selectedIndex === null) return;

    axios.put(`${API_BASE_URL}/annotations/${fileName}/${selectedIndex}`, {
      angle: {
        rao: viewData.rao,
        cran: viewData.cran,
        viewVector: viewData.viewVector
      },
      note: selectedNote,
    }, {
      withCredentials: true,
    })
      .then(() => {
        fetchAnnotations();
        updateAnnotationsCount();
      })
      .catch((err) => console.error("Failed to update annotation", err));
  };

  const handleSaveNew = () => {
    const newAnnotation = {
      angle: {
        rao: viewData.rao,
        cran: viewData.cran,
        viewVector: viewData.viewVector
      },
      note: newNote
    };
    axios.post(`${API_BASE_URL}/annotations/${fileName}`, newAnnotation, {
      withCredentials: true,
    })
      .then(() => {
        setNewNote('');
        fetchAnnotations();
        updateAnnotationsCount();
      })
      .catch((err) => console.error("Failed to save new annotation", err));
  };

  const handleReset = () => {
    console.log("Reset view")
    onResetView();
  };

  return (
    <div>
      <h4>Current projection</h4>
      <p>Viewing Vector: ({viewData.viewVector.map(v => v.toFixed(2)).join(', ')})</p>
      <p>RAO: {viewData.rao}°</p>
      <p>CRAN: {viewData.cran}°</p>

      <textarea
        value={selectedIndex !== null ? selectedNote : newNote}
        onChange={(e) => {
          if (selectedIndex !== null) {
            setSelectedNote(e.target.value);
          } else {
            setNewNote(e.target.value);
          }
        }}
        placeholder="Add a note..."
        style={{ width: '100%', minHeight: '80px', marginTop: '10px' }}
      />

      <div style={{ marginTop: '10px' }}>
        <button
          onClick={handleUpdate}
          disabled={selectedIndex === null}
          style={{
            marginRight: '10px',
            backgroundColor: selectedIndex === null ? '#ccc' : '#007bff',
            color: 'white',
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedIndex === null ? 'default' : 'pointer'
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
        {annotations.map((ann, idx) => (
          <li
            key={idx}
            onClick={() => {
              if (selectedIndex === idx) {
                setSelectedIndex(null);
                setSelectedNote('');
                onAnnotationSelect(null);
              } else {
                const selectedAnnotation = annotations[idx];
                setSelectedIndex(idx);
                setSelectedNote(selectedAnnotation.note);
                onAnnotationSelect(selectedAnnotation.angle);
              }
            }}            
            style={{
              position: 'relative',
              cursor: 'pointer',
              border: '1px solid #ccc',
              borderRadius: '6px',
              padding: '10px 30px 10px 10px',
              marginBottom: '8px',
              backgroundColor: selectedIndex === idx ? '#e0f7fa' : '#fff',
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
                handleDelete(idx);
              }}
              title="Delete"
            >
              &times;
            </div>
            <div><strong>RAO:</strong> {ann.angle?.rao ?? '—'}°, <strong>CRAN:</strong> {ann.angle?.cran ?? '—'}°</div>
            <div><strong>Note:</strong> {ann.note || '—'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};
