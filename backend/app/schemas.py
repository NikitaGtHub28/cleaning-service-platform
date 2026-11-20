from datetime import date as date_type, datetime, time as time_type
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer


Role = Literal["client", "company", "admin"]
ServiceType = Literal["maintenance", "general"]
OrderStatus = Literal["new", "accepted", "rejected", "cancelled", "completed"]


# ---------- Auth ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    role: Role
    company_id: Optional[int] = None


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["client", "company"] = "client"
    company_name: Optional[str] = Field(default=None, max_length=200)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Company ----------
class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    phone: str
    is_active: bool


class CompanyUpdate(BaseModel):
    name: str
    phone: str
    description: str = ""


# ---------- Service ----------
class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    name: str
    type: ServiceType
    description: str
    rate_per_m2: float


class ServiceCard(ServiceOut):
    company_name: str
    company_phone: str
    rating: Optional[float] = None
    reviews_count: int = 0


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: ServiceType
    description: str = Field(min_length=1)
    rate_per_m2: float = Field(gt=0)


# ---------- Review ----------
class ReviewPublic(BaseModel):
    id: int
    client_name: str
    rating: int
    text: str
    created_at: datetime


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=500)


class ReviewOut(BaseModel):
    id: int
    order_id: int
    client_id: int
    client_name: Optional[str] = None
    company_id: int
    rating: int
    text: str
    created_at: datetime


# ---------- Company detail (public) ----------
class CompanyDetail(BaseModel):
    id: int
    name: str
    description: str
    phone: str
    is_active: bool
    rating: Optional[float] = None
    reviews_count: int
    services: list[ServiceOut]
    reviews: list[ReviewPublic]


# ---------- Order ----------
class OrderCreate(BaseModel):
    service_id: int
    area: int = Field(ge=1, le=500)
    date: date_type
    time: time_type
    address: str = Field(min_length=1, max_length=500)
    phone: str = Field(min_length=1, max_length=40)
    comment: str = Field(default="", max_length=500)


class RejectPayload(BaseModel):
    reason: str = Field(min_length=1, max_length=300)


class OrderOut(BaseModel):
    id: int
    client_id: int
    company_id: int
    service_id: int
    service_name: str
    service_type: ServiceType
    work_description: str
    rate_per_m2: float
    area: int
    date: date_type
    time: time_type
    address: str
    phone: str
    comment: str
    total_price: float
    status: OrderStatus
    reject_reason: str
    created_at: datetime
    company_name: Optional[str] = None
    client_name: Optional[str] = None
    has_review: bool = False

    @field_serializer("time")
    def _ser_time(self, value: time_type) -> str:
        return value.strftime("%H:%M")


# ---------- Admin ----------
class AdminCompanyOut(BaseModel):
    id: int
    name: str
    description: str
    phone: str
    is_active: bool
    services_count: int
    owner_email: Optional[str] = None


class AdminServiceOut(BaseModel):
    id: int
    name: str
    type: ServiceType
    description: str
    rate_per_m2: float
    company_id: int
    company_name: str


class AdminReviewOut(BaseModel):
    id: int
    company_id: int
    company_name: str
    client_id: int
    client_name: str
    rating: int
    text: str
    created_at: datetime