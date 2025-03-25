from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import cv2
import io
import os
import json
import pydicom
import pyvista as pv
import panel as pn
import numpy as np
import vtk
from vtk.util import numpy_support
from PIL import Image
from threading import Thread

app = FastAPI()

# Allow frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to the DICOM files directory
DICOM_DIR = r"C:\Users\s149220\Documents\PhD\PhD\Datasets\Aneurisk\C0001_dicom\C0001"

# Function to load DICOM data
def load_dicom(file_path):
    try:
        dicom_data = pydicom.dcmread(file_path)
        return dicom_data
    except Exception as e:
        raise HTTPException(status_code=404, detail="DICOM file not found")

@app.get("/dicom-files")
def get_dicom_files():
    """Return a list of available DICOM files."""
    dicom_files = [f for f in os.listdir(DICOM_DIR) if f.endswith(".dcm")]
    return {"files": dicom_files}

@app.get("/view-dicom/{file_name}")
def view_dicom(file_name: str):
    dicom_path = os.path.join(DICOM_DIR, file_name)
    dicom_data = load_dicom(dicom_path)
    
    # Convert DICOM pixel data into a format suitable for rendering
    pixel_array = dicom_data.pixel_array
    vtk_data = numpy_support.numpy_to_vtk(pixel_array.ravel(), deep=True, array_type=vtk.VTK_FLOAT)

    # Create vtkImageData for rendering (3D Surface)
    image_data = vtk.vtkImageData()
    image_data.SetDimensions(pixel_array.shape)
    image_data.GetPointData().SetScalars(vtk_data)
    
    # Rendering code for vtk (using VTK for surface visualization)
    mapper = vtk.vtkDataSetMapper()
    mapper.SetInputData(image_data)
    actor = vtk.vtkActor()
    actor.SetMapper(mapper)

    # Initialize renderer
    renderer = vtk.vtkRenderer()
    renderer.AddActor(actor)
    renderer.SetBackground(0.1, 0.1, 0.1)  # Set background color

    # Setup vtk render window
    render_window = vtk.vtkRenderWindow()
    render_window.AddRenderer(renderer)
    render_window_interactor = vtk.vtkRenderWindowInteractor()
    render_window_interactor.SetRenderWindow(render_window)

    render_window.Render()
    render_window_interactor.Start()

    return {"status": "success", "message": "Rendering DICOM"}

@app.get("/view-dicom2/{file_name}")
def view_dicom2(file_name: str):
    dicom_path = os.path.join(DICOM_DIR, file_name)
    try:
        ds = pydicom.dcmread(dicom_path)
        
        pixel_array = ds.pixel_array

        print(f"Max {pixel_array.max()}\nMin {pixel_array.min()}\nShape {pixel_array.shape}")

        pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min()) * 255
        
        grid = pv.ImageData()
        grid.dimensions = np.array(pixel_array.shape)
        grid.point_data["values"] = pixel_array.flatten(order="F")

        plotter = pv.Plotter(off_screen=True)
        plotter.add_volume(grid, cmap="gray")
        plotter.screenshot("output.png")

        with open("output.png", "rb") as img_file:
            return Response(content=img_file.read(), media_type="image/png")
    
    except Exception as e:
        return {"error": str(e)}

@app.get("/get_3d_dicom/{file_name}")
async def get_3d_dicom(file_name: str):
    dicom_path = os.path.join(DICOM_DIR, file_name)
    try:
        ds = pydicom.dcmread(dicom_path)

        if not hasattr(ds, "pixel_array"):
            return {"error": "DICOM file does not contain pixel data."}

        pixel_array = ds.pixel_array
    
        volume = pv.wrap(pixel_array)
        threshold = np.percentile(pixel_array, 99.5)
        thresholded_volume = volume.threshold(threshold)
        print(threshold)
        surface = thresholded_volume.extract_geometry()

        folder = "tmp"
        os.makedirs(folder, exist_ok=True)
        stl_file = os.path.join(folder, "output_model.stl")

        surface.save(stl_file)
        return FileResponse(stl_file)
    except Exception as e:
        return {"error": str(e)}

# FastAPI route to view 3D DICOM data with Trame
@app.get("/view-dicom-trame/{file_name}")
def view_dicom_trame(file_name: str):
    dicom_path = os.path.join(DICOM_DIR, file_name)
    try:
        # Read the DICOM file
        ds = pydicom.dcmread(dicom_path)

        # Check if the DICOM has pixel data
        if not hasattr(ds, "PixelData"):
            return {"error": "No pixel data in DICOM"}

        # Get pixel array and normalize
        pixel_array = ds.pixel_array
        pixel_array = (pixel_array - np.min(pixel_array)) / (np.max(pixel_array) - np.min(pixel_array))

        # Launch the Trame viewer in a separate thread
        Thread(target=create_trame_view, args=(pixel_array,), daemon=True).start()

        return {"message": "Trame 3D viewer launched. Visit http://127.0.0.1:8001"}

    except Exception as e:
        return {"error": str(e)}
    
@app.post("/save-annotation")
def save_annotation(data: dict):
    """Save annotation for a DICOM file."""
    file_name = data.get("file_name")
    angle = data.get("angle")
    note = data.get("note")

    if not file_name:
        return {"error": "Missing file name"}

    # Load existing annotations
    annotations = {}
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            annotations = json.load(f)

    # Add new annotation
    if file_name not in annotations:
        annotations[file_name] = []
    annotations[file_name].append({"angle": angle, "note": note})

    # Save back to JSON
    with open("annotations.json", "w") as f:
        json.dump(annotations, f)

    return {"message": "Annotation saved"}

@app.get("/annotations/{file_name}")
def get_annotations(file_name: str):
    """Retrieve annotations for a specific DICOM file."""
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            annotations = json.load(f)
        return {"annotations": annotations.get(file_name, [])}
    return {"annotations": []}