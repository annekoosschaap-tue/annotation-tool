from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from io import BytesIO
from dotenv import load_dotenv
from pydicom.filebase import DicomBytesIO
from supabase import create_client
from typing import Any, Dict
import os
import json
import pydicom
import requests
import uvicorn

# Set up middleware for the API endpoints
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://annekoosschaap-tue.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up connection to Supabase database
load_dotenv()

supabase_url = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
supabase_key = os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY")

supabase = create_client(supabase_url, supabase_key)

# Load default value
datasetId = os.getenv("DATASET_ID")
dwhUrl = os.getenv("DATAWAREHOUSE_URL")


async def verify_token(request: Request):
    """Check whether the provided token is a valid token."""
    token = request.cookies.get("Philips.CFI.AccessToken")

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    response = requests.get(
        f"{dwhUrl}/api/datasets", cookies={"Philips.CFI.AccessToken": token}
    )  # TODO: Change this to the usr

    if not response.ok:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


@app.post("/set-token")
async def set_token(request: Request, response: Response):
    """Receive a token from the frontend, verify it, and store it in cookies."""
    try:
        body = await request.json()
        token = body.get("token")

        if not token:
            raise HTTPException(status_code=400, detail="Token is required")

        verify_response = requests.get(
            f"{dwhUrl}/api/datasets", cookies={"Philips.CFI.AccessToken": token}
        )
        if not verify_response.ok:
            raise HTTPException(status_code=401, detail="Invalid token provided")

        response.set_cookie(
            key="Philips.CFI.AccessToken",
            value=token,
            httponly=True,
            samesite="None",
            secure=True,
        )
        return {"message": "Token set successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting token: {str(e)}")


@app.get("/dicom-files")
def get_dicom_files(token: str = Depends(verify_token)):
    """Return a list of available DICOM files."""
    response = requests.get(
        f"{dwhUrl}/api/datasets/{datasetId}/files",
        cookies={"Philips.CFI.AccessToken": token},
    )

    if response.ok:
        try:
            data = response.json()
            contents = data.get("Contents")
            patient_ids = [
                os.path.splitext(item["Key"])[0]
                for item in contents
                if item.get("Key") and item["Key"].endswith(".dcm")
            ]
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Error reading patient list: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=500, detail=f"Error in the request to dwh: {response}"
        )
    files = {"files": patient_ids}
    return files


@app.get("/dicom-files/{file_name}")
async def get_dicom(file_name: str, token: str = Depends(verify_token)):
    """Returns a dicom file from the datawarehouse."""
    file_name = file_name + ".dcm"

    response = requests.get(
        f"{dwhUrl}/api/datasets/{datasetId}/files/{file_name}",
        cookies={"Philips.CFI.AccessToken": token},
    )

    if response.ok:
        try:
            with BytesIO(response.content) as stream:
                dicom_data = pydicom.dcmread(stream, force=True)
                dicom_bytes = DicomBytesIO()
                dicom_data.save_as(dicom_bytes)
                dicom_bytes.seek(0)
            return Response(content=dicom_bytes.read(), media_type="application/dicom")
        except Exception as e:
            print(e)
            raise HTTPException(
                status_code=500, detail=f"Error reading DICOM file: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=500, detail=f"Error in the request to dwh: {response}"
        )


@app.get("/annotations")
def get_all_annotations(token: str = Depends(verify_token)):
    """Returns a list of annotations."""
    response = supabase.table("annotations").select("*").execute()

    if response.data:
        annotations = response.data
        return {"annotations": annotations}

    return {"annotations": []}


@app.get("/annotations/{file_name}")
def get_annotations_by_filename(file_name: str, token: str = Depends(verify_token)):
    """Retrieve annotations for a specific DICOM file."""
    if os.path.exists("annotations.json"):
        with open("annotations.json", "r") as f:
            annotations = json.load(f)
        return {"annotations": annotations.get(file_name, [])}
    return {"annotations": []}


@app.post("/annotations/{selected_file}")
def save_annotation(selected_file: str, data: dict, token: str = Depends(verify_token)):
    """Save an annotation for a DICOM file."""
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
