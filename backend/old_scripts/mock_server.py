"""
Mock Backend for Serendipity SNS
Returns test data without requiring PostgreSQL
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta

app = FastAPI(title="Serendipity SNS Mock API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test pins data
TEST_PINS = [
    {
        "id": 1,
        "content": "Found this amazing coffee shop in the area! ☕",
        "likes": 5,
        "dislikes": 0,
        "distance_meters": 45,
        "created_at": (datetime.now() - timedelta(hours=2)).isoformat(),
        "type": "text"
    },
    {
        "id": 2, 
        "content": "Beautiful sunset view from here 🌅",
        "likes": 12,
        "dislikes": 1,
        "distance_meters": 32,
        "created_at": (datetime.now() - timedelta(hours=5)).isoformat(),
        "type": "text"
    },
    {
        "id": 3,
        "content": "Hidden gem - old library with vintage books 📚",
        "likes": 8,
        "dislikes": 0,
        "distance_meters": 48,
        "created_at": (datetime.now() - timedelta(hours=1)).isoformat(),
        "type": "text"
    }
]

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "service": "Serendipity SNS API"}

@app.get("/discover")
async def discover(lat: float = None, lon: float = None, latitude: float = None, longitude: float = None, radius: int = 50):
    """Discover nearby pins within radius - accepts both lat/lon and latitude/longitude"""
    # Allow both parameter formats
    user_lat = latitude if latitude is not None else lat
    user_lon = longitude if longitude is not None else lon
    
    return {
        "pins": TEST_PINS,
        "user_location": {
            "latitude": user_lat,
            "longitude": user_lon
        },
        "radius_meters": radius,
        "total": len(TEST_PINS)
    }

@app.post("/pin")
async def create_pin(data: dict = {}):
    """Create a new pin"""
    new_pin = {
        "id": int(datetime.now().timestamp()),
        "content": data.get("content", "") if isinstance(data, dict) else "",
        "likes": 0,
        "dislikes": 0,
        "distance_meters": 0,
        "created_at": datetime.now().isoformat(),
        "type": "text"
    }
    TEST_PINS.insert(0, new_pin)
    return {"success": True, "pin": new_pin}

@app.post("/pin/{pin_id}/like")
async def like_pin(pin_id: int):
    """Like a pin"""
    for pin in TEST_PINS:
        if pin["id"] == pin_id:
            pin["likes"] += 1
            return {"success": True, "pin": pin}
    return {"success": False, "message": "Pin not found"}

@app.post("/pin/{pin_id}/dislike")
async def dislike_pin(pin_id: int):
    """Dislike a pin"""
    for pin in TEST_PINS:
        if pin["id"] == pin_id:
            pin["dislikes"] += 1
            return {"success": True, "pin": pin}
    return {"success": False, "message": "Pin not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
