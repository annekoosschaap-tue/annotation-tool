import React, { useState, useEffect } from "react";
import axios from "axios";

export const DICOMViewer = ({ fileName }) => {
  const [imageSrc, setImageSrc] = useState("");

  // Fetch the DICOM rendering when the file is selected
  useEffect(() => {
    if (fileName) {
      const fetchImage = async () => {
        try {
          const response = await axios.get(
            `http://127.0.0.1:8000/view-dicom2/${fileName}`,
            { responseType: "arraybuffer" }
          );
          const imageBlob = new Blob([response.data], { type: "image/png" });
          const imageUrl = URL.createObjectURL(imageBlob);
          setImageSrc(imageUrl); // Set the image source for rendering
        } catch (error) {
          console.error("Error fetching DICOM image", error);
        }
      };

      fetchImage();
    }
  }, [fileName]);

  return (
    <div>
      <h2>DICOM Viewer</h2>
      {imageSrc ? (
        <img src={imageSrc} alt="DICOM Render" />
      ) : (
        <p>Loading DICOM...</p>
      )}
    </div>
  );
};

export default DICOMViewer;
