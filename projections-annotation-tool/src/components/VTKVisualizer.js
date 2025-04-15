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
    const response = await axios.get(`${API_BASE_URL}/get_dicom/${fileName}`, {
      responseType: 'arraybuffer', // Ensure you're getting the raw binary data
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data; // This should now be a binary ArrayBuffer
  } catch (error) {
    console.error("Error fetching DICOM data:", error);
    return null;
  }
}

function findTag(dataSet, tag) {
  if (!dataSet || !dataSet.elements) return null;
  
  if (dataSet.elements[tag]) {
      return dataSet.string(tag);  // Found at top level
  }
  
  // Search in sequences
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
  const byteArray = new Uint8Array(dicomData); // Convert to byte array

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
    if (dataSet.elements.x7fe00010.encapsulated) {
      // Encapsulated (JPEG, JPEG2000, etc.)
      pixelData = dicomParser.readEncapsulatedPixelData(dataSet, pixelDataElement, 0);
    } else {
      // Uncompressed (RAW)
      pixelData = dataSet.byteArray.slice(pixelDataElement.dataOffset, pixelDataElement.dataOffset + pixelDataElement.length);
    }
    
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

function computeDirectionMatrix(iop) {
// Compute the normal vector as the cross product
  const normal = [
      iop[1] * iop[5] - iop[2] * iop[4],
      iop[2] * iop[3] - iop[0] * iop[5],
      iop[0] * iop[4] - iop[1] * iop[3]
  ];

  // Construct the direction matrix in column-major order (matching DICOM convention)
  const directionMatrix = [
      iop[0], iop[3], normal[0],
      iop[1], iop[4], normal[1],
      iop[2], iop[5], normal[2]
  ];

  return directionMatrix;
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

  const directionMatrix = computeDirectionMatrix(iop);  
  imageData.setDirection(directionMatrix.flat());

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

  // Calculate view direction vector
  const viewDirection = [
    focalPoint[0] - position[0],
    focalPoint[1] - position[1],
    focalPoint[2] - position[2],
  ];

  const norm = Math.sqrt(viewDirection.reduce((sum, val) => sum + val * val, 0));
  const normalizedDirection = viewDirection.map(val => val / norm);

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


function VTKVisualizer({ fileName }) {
  const vtkContainerRef = useRef(null);
  const controllerContainerRef = useRef(null);
  const viewInfoRef = useRef(null);
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

      renderer.setBackground(0.1, 0.1, 0.1);

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
        controllerWidget.setExpanded(true);
      }
  
      renderer.resetCamera();
      renderWindow.render();
  
      const updateAngles = () => {
        const { viewDirection } = getCameraViewAngles(renderer);
        const { rao, cran } = computeRAOAndCRAN(viewDirection);

        console.log('Angles are being updated:', { rao, cran });
  
        setViewData({
          viewVector: viewDirection,
          rao,
          cran,
        });
      };

      updateAngles();
  
      const camera = renderer.getActiveCamera();

      const cameraSubscription = camera.onModified(() => {
        updateAngles();
      });

      const interactionSubscription = interactor.onStartAnimation(() => {
        console.log('Interaction started');
      });

      const endInteractionSubscription = interactor.onEndAnimation(() => {
        console.log('Interaction ended');
        updateAngles();
      });
  
      return () => {
        if (cameraSubscription && typeof cameraSubscription.unsubscribe === 'function') {
          cameraSubscription.unsubscribe();
        }
        if (interactionSubscription && typeof interactionSubscription.unsubscribe === 'function') {
          interactionSubscription.unsubscribe();
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
    console.log('viewData updated:', viewData);
  }, [viewData]);

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
      <div
        ref={viewInfoRef}
        className="p-4 bg-black bg-opacity-60 text-white rounded-lg shadow-md"
        style={{
          position: "absolute",
          padding: '8px',
          bottom: "0px",
          zIndex: 1000,
          color: 'white',
          lineHeight: '0.2',
        }}
      >
        <p>Viewing Vector: ({viewData.viewVector[0].toFixed(2)}, {viewData.viewVector[1].toFixed(2)}, {viewData.viewVector[2].toFixed(2)})</p>
        <p>RAO: {viewData.rao}°</p>
        <p>CRAN: {viewData.cran}°</p>
      </div>
    </div>  
  );
}

export default VTKVisualizer;
