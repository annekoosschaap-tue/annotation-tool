import React, { useState, useEffect } from 'react';
import axios from 'axios';

export const AnnotationPanel = ({ fileName, token }) => {
  const [angle, setAngle] = useState('');
  const [note, setNote] = useState('');
  const [annotations, setAnnotations] = useState([]);

  // Fetch existing annotations for the file on component mount
  useEffect(() => {
    axios.get(`http://127.0.0.1:8000/annotations/${fileName}`, {
      withCredentials: true,  
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        setAnnotations(response.data.annotations);
      })
      .catch(error => {
        console.error('There was an error fetching annotations:', error);
      });
  }, [fileName]);

  const handleSave = () => {
    console.log(token)
    axios.post(
      'http://127.0.0.1:8000/save-annotation', 
      { file_name: fileName, angle: angle, note: note },
      { headers: { 'Authorization': `Bearer ${token}` } }
    ).then(response => {
      setAnnotations(prevAnnotations => [...prevAnnotations, { angle, note }]);
    });
  };

  return (
    <div>
      <input
        type="text"
        value={angle}
        onChange={(e) => setAngle(e.target.value)}
        placeholder="Viewing Angle"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note"
      />
      <button onClick={handleSave}>Save Annotation</button>

      <h3>Saved Annotations:</h3>
      <ul>
        {annotations.map((annotation, index) => (
          <li key={index}>
            <strong>Angle:</strong> {annotation.angle} <br />
            <strong>Note:</strong> {annotation.note}
          </li>
        ))}
      </ul>
    </div>
  );
};
