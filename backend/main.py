# For closing warnings
import transformers
import warnings
import logging

warnings.filterwarnings("ignore")
transformers.utils.logging.set_verbosity_error()
logging.getLogger("transformers").setLevel(logging.ERROR)

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional
from enum import Enum
import shutil
import math
import os

from sentence_transformers import SentenceTransformer, util
from PIL import Image

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

# Configuration
DATABASE_URL = "sqlite:///./trashunter.db"
UPLOAD_DIR = "uploads"
BASE_URL = "https://192.168.1.113:8000"

# Database Setup
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

model = SentenceTransformer('clip-ViT-B-16', device="mps")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[INFO] trasHunter API başlatılıyor...")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    yield
    print("[INFO] trasHunter API kapatılıyor...")

app = FastAPI(
    title="trasHunter API", 
    description="Backend for Environmental Cleanup Hackathon",
    lifespan=lifespan
)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

class MarkerStatus(str, Enum):
    DIRTY = "dirty"
    CLEANED = "cleaned"

class Marker(Base):
    __tablename__ = "markers"

    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    status = Column(String, default=MarkerStatus.DIRTY.value)
    image_url = Column(String, nullable=False)
    clean_image_url = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    cleaned_at = Column(DateTime, nullable=True)

class MarkerResponse(BaseModel):
    id: int
    lat: float
    lng: float
    status: str
    image_url: str
    clean_image_url: Optional[str] = None
    note: str
    created_at: datetime
    cleaned_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# Utility functions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def save_upload_file(upload_file: UploadFile) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}_{upload_file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
        
    return f"{BASE_URL}/uploads/{filename}", filename

def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Radius of Earth in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c

# AI part
async def analyze_trash_image(filename):
    file_path = os.path.join(UPLOAD_DIR, filename)

    img_emb = model.encode(Image.open(file_path))

    text_emb = model.encode([
        "environmental pollution",
        "clean natural environment",
        "not related to environment"
    ])
    
    cos_scores = util.cos_sim(img_emb, text_emb)

    dirty_score = float(cos_scores[0][0])
    clean_score = float(cos_scores[0][1])
    unrelated_score = float(cos_scores[0][2])

    max_score = max(dirty_score, clean_score, unrelated_score)

    print(f"dirty: {cos_scores[0][0]}, clean: {cos_scores[0][1]}, unrelated: {cos_scores[0][2]}")

    if max_score == dirty_score:
        return True
    elif max_score == clean_score:
        return False
    else:
        return None

# API endpoints
@app.get("/api/markers", response_model=List[MarkerResponse])
def get_markers(db: Session = Depends(get_db)):
    return db.query(Marker).all()

@app.post("/api/markers", response_model=MarkerResponse)
async def report_pollution(
    lat: float = Form(...),
    lng: float = Form(...),
    note: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    image_url, filename = save_upload_file(file)
    
    is_trash = await analyze_trash_image(filename)
    if is_trash == False or is_trash == None:
        raise HTTPException(status_code=400, detail="Yapay Zeka bu alanda çevre kirliliği tespit edemedi.")

    new_marker = Marker(
        lat=lat,
        lng=lng,
        note=note,
        image_url=image_url,
        status=MarkerStatus.DIRTY.value,
    )
    db.add(new_marker)
    db.commit()
    db.refresh(new_marker)
    
    return new_marker

@app.put("/api/markers/{id}/clean", response_model=MarkerResponse)
async def report_cleanup(
    id: int,
    user_lat: float = Form(...),
    user_lng: float = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    marker = db.query(Marker).filter(Marker.id == id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Alan bulunamadı.")

    if marker.status == MarkerStatus.CLEANED.value:
        raise HTTPException(status_code=400, detail="Bu alan zaten temizlendi")

    distance = calculate_distance(user_lat, user_lng, marker.lat, marker.lng)
    
    if distance > 275: 
        raise HTTPException(
            status_code=400, 
            detail=f"You are too far away ({int(distance)}m). You must be within 200m to clean this spot."
        )

    clean_image_url, filename = save_upload_file(file)

    is_clean = await analyze_trash_image(filename)
    if is_clean == True or is_clean == None:
        raise HTTPException(status_code=400, detail="Yapay Zeka temizliği teyit edemedi.")

    marker.status = MarkerStatus.CLEANED.value
    marker.clean_image_url = clean_image_url
    marker.cleaned_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(marker)
    
    return marker

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)