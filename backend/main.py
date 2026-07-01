import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client
from dotenv import load_dotenv

# 1. Load environment variables from .env file
load_dotenv()

# 2. Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Debugging: Uncomment the line below if you still get errors to see if values load
# print(f"DEBUG: URL is {SUPABASE_URL}")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Model for incoming check-in requests
class CheckInRequest(BaseModel):
    court_id: int
    user_id: str
    user_lat: float
    user_lng: float
    occupancy_status: str

@app.post("/checkin")
async def check_in(request: CheckInRequest):
    # Call the database function to validate proximity using PostGIS
    # This runs the RPC function we created in the SQL Editor
    response = supabase.rpc('check_court_proximity', {
        'court_id_input': request.court_id,
        'user_lat': request.user_lat,
        'user_lng': request.user_lng
    }).execute()

    # If the database returns no court, it means the user is > 50m away
    if not response.data:
        raise HTTPException(status_code=403, detail="You are not within 50 meters of the court.")

    # If successful, update the sessions table
    supabase.table("sessions").insert({
        "court_id": request.court_id,
        "user_id": request.user_id
    }).execute()
    
    return {"message": "Check-in successful!"}