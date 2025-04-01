import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkVolumeController from './VolumeController';

async function fetchData(fileName, token) {
  try {
    const response = await axios.get(`http://localhost:8000/get_3d_array/${fileName}`, {
      headers: { Authorization: `Bearer ${token}` },
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
    const fetchAndRenderData = async () => {
      const data = await fetchData(fileName, token);
      if (data) {
        setLoadedData(data);
      }
    };
    fetchAndRenderData();
  }, [fileName]);

  // Initialize VTK rendering context
  useEffect(() => {
    if (!context.current && vtkContainerRef.current) {
      // Create the VTK render window
      const renderWindow = vtkRenderWindow.newInstance();
      
      // Create the OpenGL render window and associate it with the container
      const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
      renderWindow.addView(openGLRenderWindow);
      openGLRenderWindow.setContainer(vtkContainerRef.current);
      
      // Create the renderer
      const renderer = vtkRenderer.newInstance();
      renderWindow.addRenderer(renderer); // This is where the renderer is added to the renderWindow
      
      // Set up the interactor
      const interactor = vtkRenderWindowInteractor.newInstance();
      interactor.setView(openGLRenderWindow);
      interactor.initialize();
      interactor.bindEvents(vtkContainerRef.current);
      
      // Set up the interactor style
      const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);
      
      // Set background color
      renderer.setBackground(0.1, 0.1, 0.1);
      
      // Store the context
      context.current = { renderWindow, renderer, openGLRenderWindow, interactor };
      const { width, height } = document.querySelector(".visualizer-container")?.getBoundingClientRect();
      openGLRenderWindow.setSize(width, height);
      document.querySelector(".visualizer-container").style.padding = "0";

      // Handle window resize
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (vtkContainerRef.current) {
            const visualizerContainer = document.querySelector(".visualizer-container");
            visualizerContainer.style.display = "none";
            visualizerContainer.style.display = "block";
            const { width, height } = document.querySelector(".visualizer-container")?.getBoundingClientRect();
            openGLRenderWindow.setSize(width, height);
            renderWindow.render();
          }
        });
      });
      
      resizeObserver.observe(vtkContainerRef.current);
      
      return () => {
        resizeObserver.disconnect();
        interactor.unbindEvents();
        renderWindow.delete();
        openGLRenderWindow.delete();
        renderer.delete();
        interactor.delete();
        interactorStyle.delete();
        context.current = null;
      };
    }
  }, []);

  // Update visualization when loaded data changes
  useEffect(() => {
    if (loadedData && context.current) {
      const { renderer, renderWindow } = context.current;

      renderer.removeAllViewProps();
      
      // Create new volume from loaded data
      const { pixel_array, shape } = loadedData;
      const imageData = createVTKImageData(pixel_array, shape);
      
      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);
      
      const volume = vtkVolume.newInstance();
      volume.setMapper(mapper);
      
      renderer.addVolume(volume);
      
      // Set up volume controller
      if (controllerContainerRef.current) {
        // Remove existing controller if any
        while (controllerContainerRef.current.firstChild) {
          controllerContainerRef.current.removeChild(controllerContainerRef.current.firstChild);
        }
        
        const controllerWidget = vtkVolumeController.newInstance({
          size: [400, 150],
        });
        controllerWidget.setContainer(controllerContainerRef.current);
        controllerWidget.setupContent(renderWindow, volume);
        controllerWidget.setExpanded(true);
      }
      
      // Reset camera to fit the volume
      renderer.resetCamera();
      renderWindow.render();
    }
  }, [loadedData]);

  // Update renderer size on window resize
  useEffect(() => {
    if (context.current && vtkContainerRef.current) {
      const { openGLRenderWindow, renderWindow } = context.current;
      const { width, height } = vtkContainerRef.current.getBoundingClientRect();
      openGLRenderWindow.setSize(width, height);
      renderWindow.render();
    }
  }, []);

  return (
    <div>
      <div>
        <div 
          ref={vtkContainerRef} 
        />
        <div 
          ref={controllerContainerRef} 
          className="w-64 p-4 bg-gray-100"
          style={{
            position: "absolute",
            top: 0,
            height: "auto",
          }}
        />
      </div>
    </div>
  );
}

export default VTKVisualizer;