import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import { arrayMax, arrayMin, arrayRange} from '@kitware/vtk.js/Common/Core/Math'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkVolumeProperty from '@kitware/vtk.js/Rendering/Core/VolumeProperty';

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

  console.log(decodedData);
  console.log(arrayMax(decodedData));
  console.log(arrayMin(decodedData));
  console.log(arrayRange(decodedData));

  imageData.getPointData().setScalars(scalars);
  return imageData;
}

function App() {
  const vtkContainerRef = useRef(null);
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

      const imageActor = vtkImageSlice.newInstance();

      renderer.addActor(imageActor);

      const imageMapper = vtkImageMapper.newInstance();
      imageMapper.setInputData(imageData);
      imageMapper.setISlice(30);
      imageActor.setMapper(imageMapper);
      
      renderer.resetCamera();
      renderWindow.render();
    }
  }, [loadedData]);

  return <div ref={vtkContainerRef} style={{ width: '100vw', height: '100vh' }} />;
}

export default App;