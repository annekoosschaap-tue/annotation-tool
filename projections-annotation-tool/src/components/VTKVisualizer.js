import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkVolumeController from './VolumeController';

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

  const decodedBase64 = atob(imageArray);
  
  const buffer = new ArrayBuffer(decodedBase64.length);
  const uint8View = new Uint8Array(buffer);
  
  for (let i = 0; i < decodedBase64.length; i++) {
    uint8View[i] = decodedBase64.charCodeAt(i);
  }

  const dataView = new DataView(buffer);
  const decodedData = new Uint16Array(buffer.byteLength / 2);
  
  for (let i = 0; i < decodedData.length; i++) {
    decodedData[i] = dataView.getUint16(i * 2, true);
  }

  const scalars = vtkDataArray.newInstance({
    values: decodedData,
    name: 'Scalars',
  });

  imageData.getPointData().setScalars(scalars);
  return imageData;
}

function VTKVisualizer({ fileName, token }) {
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
      const data = await fetchData(fileName, token);
      if (data) {
        setLoadedData(data);
      }
    };
    fetchAndRenderData();
  }, []);

  useEffect(() => {
    if (loadedData && context.current) {
      const { renderer, renderWindow, fullScreenRenderer } = context.current;

      const { pixel_array, shape } = loadedData;
      const imageData = createVTKImageData(pixel_array, shape);
      
      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);
      
      const volume = vtkVolume.newInstance();
      volume.setMapper(mapper);

      renderer.addVolume(volume);
      
      const controllerWidget = vtkVolumeController.newInstance({
        size: [400, 150],
      });
      controllerWidget.setContainer(controllerContainerRef.current);
      controllerWidget.setupContent(renderWindow, volume);
      controllerWidget.setExpanded(true);

      fullScreenRenderer.setResizeCallback(({ width, height }) => {
        // 2px padding + 2x1px boder + 5px edge = 14
        console.log(width)
        if (width > 414) {
          controllerWidget.setSize(400, 150);
        } else {
          controllerWidget.setSize(width - 14, 150);
        }
        controllerWidget.render();
      });
      
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
        style={{ maxHeight: '300px', overflowY: 'auto' }}
      />
    </div>
  );
}

export default VTKVisualizer;