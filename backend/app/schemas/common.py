from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str = "ok"


class IdResponse(BaseModel):
    id: int = Field(..., ge=1)
