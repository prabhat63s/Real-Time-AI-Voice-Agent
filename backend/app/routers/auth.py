from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(request: LoginRequest):
    # Hardcoded credentials for simple auth
    valid_users = {
        "demo@123": "123456"
    }

    if request.username in valid_users and valid_users[request.username] == request.password:
        return {"token": "fake-jwt-token", "message": "Login successful"}
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
    )
