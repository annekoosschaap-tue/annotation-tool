import React, { useEffect } from 'react';
import axios from 'axios';

export const VtkRenderer = ({ fileName }) => {
  useEffect(() => {
    if (!fileName) return;

    // Fetch DICOM data from FastAPI and render it with VTK
    const apiUrl = `http://127.0.0.1:8000/view-dicom/${fileName}`;

    axios.get(apiUrl)
      .then(response => {
        console.log(response.data.message);
      })
      .catch(error => {
        console.error("Error fetching DICOM:", error);
      });
  }, [fileName]);

  return <div id="vtk-renderer"></div>;
};
