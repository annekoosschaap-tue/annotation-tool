from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydicom.filebase import DicomBytesIO
import base64
import os
import json
import pydicom
import pyvista as pv
import numpy as np
import uvicorn

app = FastAPI()

# Allow frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://annekoosschaap-tue.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DICOM_DIR = r"C:\Users\s149220\Documents\PhD\PhD\Datasets\Aneurisk_dicoms"

async def verify_token(request: Request):
    token = request.cookies.get("Philips.CFI.AccessToken")
    if not token or token != "test":  # Replace with actual verification logic
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return token

# Function to load DICOM data
def load_dicom(file_path):
    try:
        dicom_data = pydicom.dcmread(file_path)
        return dicom_data
    except Exception as e:
        raise HTTPException(status_code=404, detail="DICOM file not found")
    
@app.post("/set-token")
async def set_token(request: Request, response: Response):
    """Receive a token from the frontend and store it in cookies."""
    try:
        body = await request.json()  # Read JSON body from request
        token = body.get("token")
        if not token:
            raise HTTPException(status_code=400, detail="Token is required")

        response.set_cookie(
            key="Philips.CFI.AccessToken",
            value=token,
            httponly=True,
            samesite="None",
            secure=True
        )
        return {"message": "Token set successfully"}
    
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=f"Error setting token: {str(e)}")

@app.get("/dicom-files")
def get_dicom_files(token: str = Depends(verify_token)):
    """Return a list of available DICOM files."""
    dicom_files = [f for f in os.listdir(DICOM_DIR) if f.endswith(".dcm")]
    return {"files": dicom_files}

@app.get("/get_dicom/{file_name}")
async def get_dicom(file_name: str, token: str = Depends(verify_token)):
    dicom_path = os.path.join(DICOM_DIR, file_name)

    if not os.path.exists(dicom_path):
        raise HTTPException(status_code=404, detail="DICOM file not found")

    try:
        dicom_data = pydicom.dcmread(dicom_path)
        dicom_bytes = DicomBytesIO()
        dicom_data.save_as(dicom_bytes)
        dicom_bytes.seek(0)
        return Response(content=dicom_bytes.read(), media_type="application/dicom")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading DICOM file: {str(e)}")

@app.get("/get_3d_dicom/{file_name}")
async def get_3d_dicom(file_name: str, token: str = Depends(verify_token)):
    """Retrieve the 3D STL file for a DICOM scan."""
    dicom_path = os.path.join(DICOM_DIR, file_name)

    try:
        ds = pydicom.dcmread(dicom_path)

        if not hasattr(ds, "pixel_array"):
            raise HTTPException(status_code=400, detail="DICOM file does not contain pixel data.")

        pixel_array = ds.pixel_array

        # Process the 3D data using PyVista
        volume = pv.wrap(pixel_array)
        threshold = np.percentile(pixel_array, 99.5)
        thresholded_volume = volume.threshold(threshold)
        surface = thresholded_volume.extract_geometry()

        # Save STL file
        folder = "tmp"
        os.makedirs(folder, exist_ok=True)
        stl_file = os.path.join(folder, f"output_model.stl")
        surface.save(stl_file)

        # Debug: Check if STL file is created
        if not os.path.exists(stl_file) or os.path.getsize(stl_file) == 0:
            raise HTTPException(status_code=500, detail="Generated STL file is empty.")

        print(f"Serving STL file: {stl_file}")

        return FileResponse(stl_file, media_type="application/octet-stream", filename=f"output_model.stl")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get_3d_array/{file_name}")
async def get_3d_array(file_name: str, token: str = Depends(verify_token)):
    """Retrieve and send the 3D pixel array data for a DICOM scan."""
    dicom_path = os.path.join(DICOM_DIR, file_name)

    try:
        ds = pydicom.dcmread(dicom_path)

        if not hasattr(ds, "pixel_array"):
            raise HTTPException(status_code=400, detail="DICOM file does not contain pixel data.")

        pixel_array = ds.pixel_array
        encoded_pixel_array = base64.b64encode(pixel_array.astype(np.uint16).tobytes(order='C')).decode("utf-8")

        return JSONResponse(content={"pixel_array": encoded_pixel_array, "shape": list(pixel_array.shape)})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-annotation")
def save_annotation(data: dict, token: str = Depends(verify_token)):
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
def get_annotations(file_name: str, token: str = Depends(verify_token)):
    """Retrieve annotations for a specific DICOM file."""
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            annotations = json.load(f)
        print(annotations)
        print(file_name)
        print(annotations.get(file_name, []))
        return {"annotations": annotations.get(file_name, [])}
    return {"annotations": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)