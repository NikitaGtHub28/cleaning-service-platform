from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import create_access_token, get_current_user, hash_password, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(user: models.User) -> schemas.UserOut:
    return schemas.UserOut(
        id=user.id, name=user.name, email=user.email, role=user.role,
        company_id=user.company.id if user.company else None,
    )


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "Пользователь с таким email уже зарегистрирован")
    if payload.role == "company" and not (payload.company_name or "").strip():
        raise HTTPException(400, "Укажите название клининговой компании")

    user = models.User(
        name=payload.name.strip(), email=email,
        password_hash=hash_password(payload.password), role=payload.role,
    )
    db.add(user)
    db.flush()

    if payload.role == "company":
        db.add(models.Company(owner_id=user.id, name=payload.company_name.strip(), is_active=False))

    db.commit()
    db.refresh(user)
    return schemas.Token(access_token=create_access_token(user.id), user=_user_out(user))


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    return schemas.Token(access_token=create_access_token(user.id), user=_user_out(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return _user_out(user)