from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from io import BytesIO
from dotenv import load_dotenv
from pydicom.filebase import DicomBytesIO
from supabase import create_client
from typing import Any, Dict
from uuid import UUID
import os
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
cfiUrl = os.getenv("CFILAB_URL")


async def verify_user(request: Request):
    """Check whether the provided token is a valid token."""
    token = request.cookies.get("Philips.CFI.AccessToken")

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    response = requests.get(f"{cfiUrl}/usr", cookies={"Philips.CFI.AccessToken": token})

    try:
        user_data = response.json()
        sub = user_data.get("sub")
        email = user_data.get("email")

        user_data = [{"sub": sub, "email": email}]

        response = supabase.table("users").upsert(user_data).execute()

    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {"token": token, "sub": sub}


@app.post("/set-token")
async def set_token(request: Request, response: Response):
    """Receive a token from the frontend, verify it, and store it in cookies."""
    try:
        body = await request.json()
        token = body.get("token")

        if not token:
            raise HTTPException(status_code=400, detail="Token is required")

        verify_response = requests.get(
            f"{cfiUrl}/usr", cookies={"Philips.CFI.AccessToken": token}
        )

        user_data = verify_response.json()
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token provided")

        response.set_cookie(
            key="Philips.CFI.AccessToken",
            value=token,
            httponly=True,
            samesite="None",
            secure=True,
        )

        response.set_cookie(
            key="sub",
            value=user_data.get("sub"),
            httponly=True,
            samesite="None",
            secure=True,
        )
        return {"message": "Token set successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting token: {str(e)}")


@app.get("/auth/verify")
def verify_auth_status(user_data: str = Depends(verify_user)):
    """Lightweight endpoint to verify authentication."""
    return {"message": "Token is valid"}


@app.get("/patients")
def get_patient_ids(user_data: str = Depends(verify_user)):
    """Return a list of patient IDs."""
    response = supabase.table("patients").select("id").execute()

    if response.data:
        patient_ids = [item["id"] for item in response.data]
        return {"patient_ids": patient_ids}

    return {"patient_ids": []}


@app.get("/dicom-files")
def get_dicom_files(user_data: str = Depends(verify_user)):
    """Return a list of available DICOM files."""
    response = requests.get(
        f"{dwhUrl}/api/datasets/{datasetId}/files",
        cookies={"Philips.CFI.AccessToken": user_data.get("token")},
    )

    if response.ok:
        try:
            data = response.json()
            contents = data.get("Contents")
            dcm_files = [
                item["Key"]
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
    files = {"files": dcm_files}
    return files


@app.get("/dicom-files/{patient_id}")
async def get_dicom(patient_id: str, user_data: str = Depends(verify_user)):
    """Returns a dicom file from the datawarehouse."""
    response = supabase.table("patients").select("*").eq("id", patient_id).execute()

    if len(response.data) == 0:
        raise HTTPException(status_code=400, detail=f"File not found")

    file_name = response.data[0].get("file_name")

    response = requests.get(
        f"{dwhUrl}/api/datasets/{datasetId}/files/{file_name}",
        cookies={"Philips.CFI.AccessToken": user_data.get("token")},
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
            raise HTTPException(
                status_code=500, detail=f"Error reading DICOM file: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=500, detail=f"Error in the request to dwh: {response}"
        )


@app.get("/annotations")
def get_all_annotations(user_data: str = Depends(verify_user)):
    """Returns a list of the user's annotations."""
    sub = user_data.get("sub")
    response = supabase.table("annotations").select("*").eq("user_sub", sub).execute()

    if response.data:
        annotations = response.data
        return {"annotations": annotations}

    return {"annotations": []}


@app.get("/annotations/{patient_id}")
def get_annotations_by_patient_id(patient_id: str, user_data: str = Depends(verify_user)):
    """Retrieve user's annotations for a specific patient."""
    sub = user_data.get("sub")
    response = (
        supabase.table("annotations")
        .select("*, patient:patient_id(id)")
        .eq("user_sub", sub)
        .eq("patient_id", patient_id)
        .execute()
    )
    
    if response.data:
        annotations = response.data
        return {"annotations": annotations}
    
    return {"annotations": []}


@app.post("/annotations/{patient_id}")
def save_annotation(
    patient_id: str,
    data: dict,
    request: Request,
    user_data: str = Depends(verify_user),
):
    """Save an annotation for a patient."""
    sub = user_data.get("sub")
    rao = data.get("rao")
    cran = data.get("cran")
    view_vector = data.get("viewVector")
    note = data.get("note")

    if not (rao and cran and view_vector):
        raise HTTPException(
            status_code=400, detail="Missing working projection in request body"
        )

    if not patient_id:
        raise HTTPException(status_code=400, detail="Missing file name")

    patient_data = (
        supabase.table("patients").select("id").eq("id", patient_id).execute()
    )
    if not patient_data.data:
        raise HTTPException(status_code=404, detail="Patient not found for this file")
    patient_id = patient_data.data[0]["id"]

    try:
        annotation_data = {
            "patient_id": patient_id,
            "user_sub": sub,
            "rao": rao,
            "cran": cran,
            "view_vector": view_vector,
            "note": note,
        }
        _ = supabase.table("annotations").insert(annotation_data).execute()

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save annotation: {str(e)}"
        )

    return {"message": "Annotation saved successfully"}


@app.put("/annotations/{annotation_id}")
def update_annotation(
    annotation_id: UUID,
    data: Dict[str, Any] = Body(...),
    user_data: str = Depends(verify_user),
):
    """Update a specific annotation for a patient."""
    print(data)
    rao = data.get("rao")
    cran = data.get("cran")
    view_vector = data.get("viewVector")
    note = data.get("note")

    if not (rao and cran and view_vector):
        raise HTTPException(
            status_code=400, detail="Missing working projection in request body"
        )

    response = (
        supabase.table("annotations")
        .select("*")
        .eq("id", annotation_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    try:
        update_data = {
            "patient_id": response.data[0].get("patient_id"),
            "id": response.data[0].get("id"),
            "rao": rao,
            "cran": cran,
            "view_vector": view_vector,
            "note": note,
            "user_sub": response.data[0].get("user_sub")
        }

        _ = (
            supabase.table("annotations")
            .update(update_data)
            .eq("id", annotation_id)
            .execute()
        )

    except Exception as e:
        print(e)
        raise HTTPException(
            status_code=500, detail=f"Failed to update annotation: {str(e)}"
        )

    return {"message": "Annotation updated successfully"}


@app.delete("/annotations/{annotation_id}")
def delete_annotation(
    annotation_id: UUID, user_data: str = Depends(verify_user)
):
    """Delete a specific annotation by UUID."""
    response = supabase \
        .table("annotations") \
        .delete() \
        .eq("id", annotation_id) \
        .execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    return {"message": "Annotation deleted successfully"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
