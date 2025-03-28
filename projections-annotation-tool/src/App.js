import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkVolumeProperty from '@kitware/vtk.js/Rendering/Core/VolumeProperty';
import vtkVolumeController from '@kitware/vtk.js/Interaction/UI/VolumeController';

async function fetchData(fileName, token) {
  try {
    const response = await axios.get(`http://localhost:8000/get_3d_array/${fileName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching 3D data:", error);
    return null;
  }
}

function createVTKImageData(imageArray, shape) {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(shape[0], shape[1], shape[2]);
  
  imageData.setSpacing(1.0, 1.0, 1.0);
  imageData.setOrigin(0, 0, 0);

  const decodedData = new Uint8Array(atob(imageArray).split("").map(char => char.charCodeAt(0)));
  
  const scalars = vtkDataArray.newInstance({
    values: decodedData,
    name: 'Scalars',
  });

  imageData.getPointData().setScalars(scalars);
  return imageData;
}

function App() {
  const vtkContainerRef = useRef(null);
  const controllerContainerRef = useRef(null);
  const context = useRef(null);
  const [loadedData, setLoadedData] = useState(null);

  useEffect(() => {
    if (!context.current) {
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer: vtkContainerRef.current,
      });
      
      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      
      context.current = { fullScreenRenderer, renderWindow, renderer };
    }

    return () => {
      if (context.current) {
        context.current.fullScreenRenderer.delete();
        context.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const fetchAndRenderData = async () => {
      const fileName = "IM_00001.dcm";
      const token = "test";
      const data = await fetchData(fileName, token);
      if (data) {
        setLoadedData(data);
      }
    };
    fetchAndRenderData();
  }, []);

  useEffect(() => {
    if (loadedData && context.current) {
      const { renderer, renderWindow } = context.current;

      const { pixel_array, shape } = loadedData;
      const imageData = createVTKImageData(pixel_array, shape);
      
      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);
      
      const volumeProperty = vtkVolumeProperty.newInstance();
      
      const volume = vtkVolume.newInstance();
      volume.setMapper(mapper);

      renderer.addVolume(volume);
      
      // Create volume controller in a separate container
      const controllerWidget = vtkVolumeController.newInstance();
      controllerWidget.setContainer(controllerContainerRef.current);
      controllerWidget.setupContent(renderWindow, volume);
      controllerWidget.setExpanded(true);
      
      renderer.resetCamera();
      renderWindow.render();
    }
  }, [loadedData]);

  return (
    <div className="flex flex-col h-screen">
      <div ref={vtkContainerRef} className="flex-grow" />
      <div 
        ref={controllerContainerRef} 
        className="w-full p-4 bg-gray-100"
        style={{ maxHeight: '200px', overflowY: 'auto' }}
      />
    </div>
  );
}

export default App;