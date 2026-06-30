from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client
import os

# Initialize Supabase client
# Make sure to set these in your environment variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

class CheckInRequest(BaseModel):
    court_id: int
    user_id: str
    user_lat: float
    user_lng: float
    occupancy_status: str

@app.post("/checkin")
async def check_in(request: CheckInRequest):
    # The PostGIS query: checks if the court location is within 50 meters 
    # of the user's provided coordinates.
    query = """
    SELECT id FROM courts 
    WHERE id = :court_id 
    AND ST_DWithin(location, ST_MakePoint(:user_lng, :user_lat)::geography, 50)
    """
    
    # Execute the query via Supabase
    response = supabase.rpc('check_court_proximity', {
        'court_id': request.court_id,
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