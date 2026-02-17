from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(request: LoginRequest):
    # Hardcoded credentials for simple auth
    if request.username == "user@m37labs" and request.password == "2026@m37labs":
        return {"token": "fake-jwt-token", "message": "Login successful"}
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
    )
