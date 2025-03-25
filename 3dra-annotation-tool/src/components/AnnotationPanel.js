import React, { useState } from 'react';
import axios from 'axios';

export const AnnotationPanel = ({ fileName }) => {
  const [angle, setAngle] = useState('');
  const [note, setNote] = useState('');

  const handleSave = () => {
    axios.post('http://127.0.0.1:8000/save-annotation', {
      file_name: fileName,
      angle: angle,
      note: note,
    }).then(response => {
      alert('Annotation Saved!');
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
    </div>
  );
};
