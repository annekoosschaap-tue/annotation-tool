from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydicom.filebase import DicomBytesIO
from typing import Any, Dict
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
            secure=True,
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
        raise HTTPException(
            status_code=500, detail=f"Error reading DICOM file: {str(e)}"
        )


@app.get("/get_3d_dicom/{file_name}")
async def get_3d_dicom(file_name: str, token: str = Depends(verify_token)):
    """Retrieve the 3D STL file for a DICOM scan."""
    dicom_path = os.path.join(DICOM_DIR, file_name)

    try:
        ds = pydicom.dcmread(dicom_path)

        if not hasattr(ds, "pixel_array"):
            raise HTTPException(
                status_code=400, detail="DICOM file does not contain pixel data."
            )

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

        return FileResponse(
            stl_file,
            media_type="application/octet-stream",
            filename=f"output_model.stl",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get_3d_array/{file_name}")
async def get_3d_array(file_name: str, token: str = Depends(verify_token)):
    """Retrieve and send the 3D pixel array data for a DICOM scan."""
    dicom_path = os.path.join(DICOM_DIR, file_name)

    try:
        ds = pydicom.dcmread(dicom_path)

        if not hasattr(ds, "pixel_array"):
            raise HTTPException(
                status_code=400, detail="DICOM file does not contain pixel data."
            )

        pixel_array = ds.pixel_array
        encoded_pixel_array = base64.b64encode(
            pixel_array.astype(np.uint16).tobytes(order="C")
        ).decode("utf-8")

        return JSONResponse(
            content={
                "pixel_array": encoded_pixel_array,
                "shape": list(pixel_array.shape),
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/annotations/{selected_file}")
def save_annotation(selected_file: str, data: dict, token: str = Depends(verify_token)):
    """Save annotation for a DICOM file."""
    angle = data.get("angle")
    note = data.get("note")

    if not selected_file:
        raise HTTPException(status_code=400, detail="Missing file name")

    if angle is None:
        raise HTTPException(status_code=400, detail="Missing angle in request body")

    annotations = {}
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            try:
                annotations = json.load(f)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=500, detail="Failed to parse annotations.json"
                )

    if selected_file not in annotations:
        annotations[selected_file] = []
    annotations[selected_file].append({"angle": angle, "note": note})

    try:
        with open("annotations.json", "w") as f:
            json.dump(annotations, f, indent=2)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save annotation: {str(e)}"
        )

    return {"message": "Annotation saved successfully"}


@app.put("/annotations/{selected_file}/{selected_annotation}")
def update_annotation(
    selected_file: str,
    selected_annotation: int,
    data: Dict[str, Any] = Body(...),
    token: str = Depends(verify_token),
):
    """Update a specific annotation for a DICOM file."""
    angle = data.get("angle")
    note = data.get("note")

    if not selected_file:
        raise HTTPException(status_code=400, detail="Missing file name")

    if angle is None:
        raise HTTPException(status_code=400, detail="Missing angle in request body")

    annotations = {}
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            try:
                annotations = json.load(f)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=500, detail="Failed to parse annotations.json"
                )

    if selected_file not in annotations:
        raise HTTPException(
            status_code=404, detail="Selected file not found in annotations"
        )

    file_annotations = annotations[selected_file]

    if not isinstance(file_annotations, list) or selected_annotation >= len(
        file_annotations
    ):
        raise HTTPException(
            status_code=404, detail="Selected annotation index out of range"
        )

    annotations[selected_file][selected_annotation] = {
        "angle": angle,
        "note": note,
    }

    try:
        with open("annotations.json", "w") as f:
            json.dump(annotations, f, indent=2)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save annotation: {str(e)}"
        )

    return {"message": "Annotation updated successfully"}


@app.delete("/annotations/{file_name}/{annotation_index}")
def delete_annotation(
    file_name: str, annotation_index: int, token: str = Depends(verify_token)
):
    """Delete a specific annotation for a DICOM file."""
    if not os.path.exists("annotations.json"):
        raise HTTPException(status_code=404, detail="No annotations found")

    try:
        with open("annotations.json", "r") as f:
            annotations = json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse annotations.json")

    if file_name not in annotations:
        raise HTTPException(status_code=404, detail="File not found in annotations")

    if annotation_index < 0 or annotation_index >= len(annotations[file_name]):
        raise HTTPException(status_code=404, detail="Annotation index out of range")

    # Remove the annotation
    del annotations[file_name][annotation_index]

    # If the list is now empty, optionally remove the file key entirely
    if not annotations[file_name]:
        del annotations[file_name]

    try:
        with open("annotations.json", "w") as f:
            json.dump(annotations, f, indent=2)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to update annotations.json: {str(e)}"
        )

    return {"message": "Annotation deleted successfully"}


@app.get("/annotations")
def get_all_annotations(token: str = Depends(verify_token)):
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            annotations = json.load(f)
        print(annotations)
        return {"annotations": annotations}
    return {"annotations": []}


@app.get("/annotations/{file_name}")
def get_annotations_by_filename(file_name: str, token: str = Depends(verify_token)):
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
