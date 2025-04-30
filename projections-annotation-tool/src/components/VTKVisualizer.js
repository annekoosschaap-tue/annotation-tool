import React, { useState, useRef, useEffect, useCallback } from 'react';
import _ from 'lodash';
import axios from 'axios';
import dicomParser from 'dicom-parser';
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
import { API_BASE_URL } from "./../config";

async function fetchData(fileName) {
  try {
    const response = await axios.get(`${API_BASE_URL}/dicom-files/${fileName}`, {
      responseType: 'arraybuffer',
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data; 
  } catch (error) {
    console.error("Error fetching DICOM data:", error);
    return null;
  }
}

function findTag(dataSet, tag) {
  if (!dataSet || !dataSet.elements) return null;
  
  if (dataSet.elements[tag]) {
      return dataSet.string(tag);
  }
  
  for (const key in dataSet.elements) {
      const element = dataSet.elements[key];
      if (element.items) {
          for (const item of element.items) {
              const nestedValue = findTag(item.dataSet, tag);
              if (nestedValue) return nestedValue;
          }
      }
  }
  return null;
}

function parseDicom(dicomData) {
  const byteArray = new Uint8Array(dicomData); 

  try {
    const dataSet = dicomParser.parseDicom(byteArray); // Parse the DICOM data
    // Extract metadata and pixel data
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const numberOfFrames = findTag(dataSet, 'x00280008');
    const pixelSpacingStr = dataSet.string('x00280030');
    const spacing = pixelSpacingStr ? pixelSpacingStr.split('\\').map(parseFloat) : [1.0, 1.0]; 
    spacing.push(1.0);

    const iopStr = findTag(dataSet, 'x00200037')
    const iop = iopStr ? iopStr.split('\\').map(parseFloat) : [1, 0, 0, 0, 1, 0];

    const ippStr = findTag(dataSet, 'x00200032');
    const ipp = ippStr ? ippStr.split('\\').map(parseFloat) : [0, 0, 0];

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      throw new Error("No pixel data found in the DICOM file.");
    }

    let pixelData;
    pixelData = dataSet.byteArray.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
    
    return {
      pixel_array: pixelData,
      shape: [columns, rows, numberOfFrames],
      spacing: spacing,
      iop: iop,
      ipp: ipp,
    };
  } catch (error) {
    console.error("Error parsing DICOM data:", error);
    return null;
  }
}

function createVTKImageData(parsedData) {
  if (!parsedData || !parsedData.pixel_array || parsedData.pixel_array.length === 0) {
    console.error("Invalid pixel array: ", parsedData.pixel_array);
    return null;
  }
  const imageData = vtkImageData.newInstance();
  const { pixel_array, shape, spacing, iop, ipp } = parsedData;

  imageData.setDimensions(shape[0], shape[1], shape[2]);
  imageData.setSpacing(spacing[0], spacing[1], spacing[2]);
  imageData.setOrigin(ipp[0], ipp[1], ipp[2]);

  try {
    // Determine bytes per pixel
    const bytesPerPixel = pixel_array.length / (shape[0] * shape[1] * shape[2]);
    if (bytesPerPixel !== 1 && bytesPerPixel !== 2) {
      throw new Error(`Unexpected bytes per pixel: ${bytesPerPixel}`);
    }

    const decodedData = new Uint16Array(pixel_array.length / (bytesPerPixel === 2 ? 2 : 1));
    const dataView = new DataView(pixel_array.buffer);

    for (let i = 0; i < decodedData.length; i++) {
      decodedData[i] = dataView.getUint16(i * 2, true);
    }

    const scalars = vtkDataArray.newInstance({
      values: decodedData,
      name: 'Scalars',
    });

    imageData.getPointData().setScalars(scalars);
    return imageData;
  } catch (error) {
    console.error("Error processing pixel data:", error);
    return null;
  }
}

function getCameraViewAngles(renderer) {
  const camera = renderer.getActiveCamera();
  const position = camera.getPosition();
  const focalPoint = camera.getFocalPoint();
  const viewUp = camera.getViewUp();
  console.log(`viewUp`, viewUp)

  // Calculate view direction vector
  const viewDirection = [
    focalPoint[0] - position[0],
    focalPoint[1] - position[1],
    focalPoint[2] - position[2],
  ];

  console.log(`viewDirection`, viewDirection)

  const norm = Math.sqrt(viewDirection.reduce((sum, val) => sum + val * val, 0));
  console.log(`norm`, norm)
  const normalizedDirection = viewDirection.map(val => val / norm);
  console.log(`normalizedDirection`, normalizedDirection)

  return {
    position,
    focalPoint,
    viewUp,
    viewDirection: normalizedDirection,
  };
}

function computeRAOAndCRAN(viewDirection) {
  const [x, y, z] = viewDirection;

  // Compute RAO and CRAN in degrees
  const rao = Math.atan2(x, z) * (180 / Math.PI);    // rotation around Y
  const cran = Math.atan2(y, z) * (180 / Math.PI);   // rotation around X

  return {
    rao: parseFloat(rao.toFixed(1)),
    cran: parseFloat(cran.toFixed(1))
  };
}


function VTKVisualizer({ fileName, onViewDataChange, selectedAnnotation, resetTrigger }) {
  const vtkContainerRef = useRef(null);
  const controllerContainerRef = useRef(null);
  const context = useRef(null);
  const [parsedData, setParsedData] = useState(null);
  const [viewData, setViewData] = useState({
    viewVector: [0, 0, 0],
    rao: 0,
    cran: 0
  });


  useEffect(() => {
    setViewData({
      viewVector: [0, 0, 0],
      rao: 0,
      cran: 0
    });

    const fetchAndRenderData = async () => {
      const dicomData = await fetchData(fileName);
      if (dicomData) {
        const parsedData = parseDicom(dicomData); 
        setParsedData(parsedData); 
      }
    };
    fetchAndRenderData();
  }, [fileName]);

  useEffect(() => {
    if (!context.current && vtkContainerRef.current) {
      // VTK setup
      const renderWindow = vtkRenderWindow.newInstance();
      const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
      renderWindow.addView(openGLRenderWindow);
      openGLRenderWindow.setContainer(vtkContainerRef.current);

      const renderer = vtkRenderer.newInstance();
      renderWindow.addRenderer(renderer);

      const interactor = vtkRenderWindowInteractor.newInstance();
      interactor.setView(openGLRenderWindow);
      interactor.initialize();
      interactor.bindEvents(vtkContainerRef.current);

      const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
      interactor.setInteractorStyle(interactorStyle);

      renderer.setBackground(0.9, 0.9, 0.9);

      context.current = { renderWindow, renderer, openGLRenderWindow, interactor };
      const { width, height } = document.querySelector(".visualizer-container")?.getBoundingClientRect();
      openGLRenderWindow.setSize(width, height);
      document.querySelector(".visualizer-container").style.padding = "0";

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

  useEffect(() => {
    if (parsedData && context.current) {
      const { renderer, renderWindow, interactor } = context.current;
  
      renderer.removeAllViewProps();
  
      const imageData = createVTKImageData(parsedData);
  
      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);
      mapper.setMaximumSamplesPerRay(2000);
  
      const volume = vtkVolume.newInstance();
      volume.setMapper(mapper);
  
      renderer.addVolume(volume);
  
      if (controllerContainerRef.current) {
        while (controllerContainerRef.current.firstChild) {
          controllerContainerRef.current.removeChild(controllerContainerRef.current.firstChild);
        }
  
        const controllerWidget = vtkVolumeController.newInstance({
          size: [400, 150],
        });
        controllerWidget.setContainer(controllerContainerRef.current);
        controllerWidget.setupContent(renderWindow, volume);
        controllerWidget.setExpanded(false);
      }
  
      const camera = renderer.getActiveCamera();
      camera.setPosition(0, 0, -1);
      camera.setFocalPoint(0, 0, 0);
      camera.setViewUp(0, -1, 0);

      renderer.resetCamera();
      renderWindow.render();
      // Trigger a dummy camera interaction to ensure listeners are active
      camera.modified();
  
      const updateAngles = () => {
        const { viewDirection } = getCameraViewAngles(renderer);
        const { rao, cran } = computeRAOAndCRAN(viewDirection);

        const newViewData = {
          viewVector: viewDirection,
          rao,
          cran,
        };
  
        setViewData(newViewData);
        if (onViewDataChange) onViewDataChange(newViewData);
      };

      updateAngles();
  
      const cameraSubscription = camera.onModified(() => {
        updateAngles();
      });

      const endInteractionSubscription = interactor.onEndAnimation(() => {
        updateAngles();
      });
  
      return () => {
        if (cameraSubscription && typeof cameraSubscription.unsubscribe === 'function') {
          cameraSubscription.unsubscribe();
        }
        if (endInteractionSubscription && typeof endInteractionSubscription.unsubscribe === 'function') {
          endInteractionSubscription.unsubscribe();
        }
      };
    }
  }, [parsedData]);

  useEffect(() => {
    if (context.current && vtkContainerRef.current) {
      const { openGLRenderWindow, renderWindow } = context.current;
      const { width, height } = vtkContainerRef.current.getBoundingClientRect();
      openGLRenderWindow.setSize(width, height);
      renderWindow.render();
    }
  }, []);

  useEffect(() => {
    if (selectedAnnotation && context.current) {
      const { viewVector } = selectedAnnotation;
      const { renderer, renderWindow } = context.current;
      const camera = renderer.getActiveCamera();
  
      // Assume focal point is always [0, 0, 0]
      const focalPoint = [0, 0, 0];
      const distance = 500; // distance from focal point — you can tune this
  
      const cameraPosition = [
        focalPoint[0] - viewVector[0] * distance,
        focalPoint[1] - viewVector[1] * distance,
        focalPoint[2] - viewVector[2] * distance,
      ];

      console.log(`cameraPosition`, cameraPosition)
      console.log(`current position`, camera.getPosition())
  
      camera.setPosition(...cameraPosition);
      console.log(`new position`, camera.getPosition())
      camera.setFocalPoint(...focalPoint);
      camera.setViewUp(0, 1, 0); // could be improved if you want precise control
      console.log(`final position`, camera.getPosition())
      camera.modified();
  
      renderer.resetCamera();
      renderWindow.render();
    }
  }, [selectedAnnotation]);

  useEffect(() => {
    const { renderer, renderWindow } = context.current;
    const camera = renderer.getActiveCamera();
    if (!renderer || !camera || !renderWindow) return;
  
    // Reset to initial camera view (manual or default)
    camera.setPosition(0, 0, -1);
    camera.setFocalPoint(0, 0, 0);
    camera.setViewUp(0, -1, 0);
    renderer.resetCamera()
    renderWindow.render();
  }, [resetTrigger]);

  return (
    <div>
      <div ref={vtkContainerRef} />
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
  );
}

export default VTKVisualizer;
