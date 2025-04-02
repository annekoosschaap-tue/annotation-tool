import React, { useState, useRef, useEffect } from 'react';
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

async function fetchData(fileName) {
  try {
    const response = await axios.get(`http://localhost:8000/get_dicom/${fileName}`, {
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

function parseDicom(dicomData) {
  const byteArray = new Uint8Array(dicomData); // Convert to byte array

  console.log('byteArray', byteArray)
  try {
    const dataSet = dicomParser.parseDicom(byteArray); // Parse the DICOM data
    console.log('dataset', dataSet)
    // Extract metadata and pixel data
    const rows = dataSet.uint16('x00280010');
    console.log('rows', rows)
    const columns = dataSet.uint16('x00280011');
    console.log('columns', columns)
    const numberOfFrames = dataSet.string('x00280008');
    console.log('numberofslices', numberOfFrames)
    const pixelSpacingStr = dataSet.string('x00280030');
    console.log('pixelspacing', pixelSpacingStr)
    const spacing = pixelSpacingStr ? pixelSpacingStr.split('\\').map(parseFloat) : [1.0, 1.0]; 
    spacing.push(1.0);
    console.log('spacing', spacing)
    const pixelDataElement = dataSet.elements.x7fe00010;
    console.log('pixeldataelement', pixelDataElement)
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
    console.log('pixeldata', pixelData)
    return {
      pixel_array: pixelData,
      shape: [columns, rows, numberOfFrames],
      spacing: spacing,
      origin: [0, 0, 0], // Default origin
    };
  } catch (error) {
    console.error("Error parsing DICOM data:", error);
    return null;
  }
}

function createVTKImageData(parsedData) {
  console.log('Create VTK image');
  if (!parsedData || !parsedData.pixel_array || parsedData.pixel_array.length === 0) {
    console.error("Invalid pixel array: ", parsedData.pixel_array);
    return null;
  }
  const imageData = vtkImageData.newInstance();
  console.log(parsedData)
  const { pixel_array, shape, spacing, origin } = parsedData;

  console.log('shape', shape)

  imageData.setDimensions(shape[0], shape[1], shape[2]);
  console.log('dimensions', imageData.getDimensions())
  imageData.setSpacing(spacing[0], spacing[1], spacing[2]);
  console.log('spacing', imageData.getSpacing())
  imageData.setOrigin(origin[0], origin[1], origin[2]);
  console.log('origin', imageData.getOrigin())

  console.log('pixel_array.length', pixel_array.length)

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


function VTKVisualizer({ fileName }) {
  const vtkContainerRef = useRef(null);
  const controllerContainerRef = useRef(null);
  const context = useRef(null);
  const [parsedData, setParsedData] = useState(null);

  useEffect(() => {
    const fetchAndRenderData = async () => {
      const dicomData = await fetchData(fileName);
      if (dicomData) {
        const parsedData = parseDicom(dicomData); // Parse DICOM binary data
        setParsedData(parsedData); // Set the parsed data
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
      const { renderer, renderWindow } = context.current;

      renderer.removeAllViewProps();

      // Create new volume from loaded data
      const imageData = createVTKImageData(parsedData);

      const mapper = vtkVolumeMapper.newInstance();
      mapper.setInputData(imageData);

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
