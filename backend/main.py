import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
from dotenv import load_dotenv

# 1. Load environment variables from .env file
load_dotenv()

# 2. Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# The Next.js dev server runs on a different origin (different port), so
# without this the browser's own CORS preflight blocks every /checkin call
# before it ever reaches this process -- it fails as a generic network
# error client-side, not as a 403/validation error. Override with
# FRONTEND_URL in backend/.env for a non-default dev port or a deployed
# frontend origin.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

# Model for incoming check-in requests
class CheckInRequest(BaseModel):
    court_id: int
    user_id: str
    user_lat: float
    user_lng: float
    occupancy_status: str
    player_count: Optional[int] = None

@app.post("/checkin")
async def check_in(request: CheckInRequest):
    # Call the database function to validate proximity using PostGIS
    # This runs the RPC function we created in the SQL Editor
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

    # Reflect the reported status (and headcount, if given) on the court
    # itself so the feed/map realtime subscriptions pick it up. `updated_at`
    # doubles as the report's freshness timestamp: the frontend treats a
    # status/count older than 90 minutes as expired rather than showing it
    # forever.
    court_update = {
        "status": request.occupancy_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if request.player_count is not None:
        court_update["player_count"] = request.player_count

    supabase.table("courts").update(court_update).eq("id", request.court_id).execute()

    return {"message": "Check-in successful!"}