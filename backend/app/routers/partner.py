from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_role
from ..serializers import order_out


router = APIRouter(prefix="/api/partner", tags=["partner"])


def _company(user: models.User, db: Session) -> models.Company:
    company = db.query(models.Company).filter(models.Company.owner_id == user.id).first()
    if not company:
        raise HTTPException(404, "Компания не найдена")
    return company


# ---------- Профиль ----------
@router.get("/profile", response_model=schemas.CompanyOut)
def get_profile(user: models.User = Depends(require_role("company")), db: Session = Depends(get_db)):
    return _company(user, db)


@router.put("/profile", response_model=schemas.CompanyOut)
def update_profile(
    payload: schemas.CompanyUpdate,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    if not payload.name.strip() or not payload.phone.strip():
        raise HTTPException(400, "Название и телефон обязательны")
    company.name = payload.name.strip()
    company.phone = payload.phone.strip()
    company.description = (payload.description or "").strip()
    db.commit()
    db.refresh(company)
    return company


# ---------- Услуги ----------
@router.get("/services", response_model=list[schemas.ServiceOut])
def list_services(user: models.User = Depends(require_role("company")), db: Session = Depends(get_db)):
    company = _company(user, db)
    return (
        db.query(models.Service)
        .filter(models.Service.company_id == company.id, models.Service.is_deleted == False)  # noqa: E712
        .order_by(models.Service.id)
        .all()
    )


@router.post("/services", response_model=schemas.ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: schemas.ServiceCreate,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    service = models.Service(company_id=company.id, **payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/services/{service_id}", response_model=schemas.ServiceOut)
def update_service(
    service_id: int,
    payload: schemas.ServiceCreate,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    service = db.query(models.Service).filter(
        models.Service.id == service_id,
        models.Service.company_id == company.id,
        models.Service.is_deleted == False,  # noqa: E712
    ).first()
    if not service:
        raise HTTPException(404, "Услуга не найдена")
    service.name = payload.name
    service.type = payload.type
    service.description = payload.description
    service.rate_per_m2 = payload.rate_per_m2
    db.commit()
    db.refresh(service)
    return service


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    service = db.query(models.Service).filter(
        models.Service.id == service_id,
        models.Service.company_id == company.id,
        models.Service.is_deleted == False,  # noqa: E712
    ).first()
    if not service:
        raise HTTPException(404, "Услуга не найдена")
    service.is_deleted = True
    db.commit()


# ---------- Заказы ----------
@router.get("/orders", response_model=list[schemas.OrderOut])
def list_orders(user: models.User = Depends(require_role("company")), db: Session = Depends(get_db)):
    company = _company(user, db)
    orders = (
        db.query(models.Order)
        .filter(models.Order.company_id == company.id)
        .order_by(models.Order.created_at.desc())
        .all()
    )
    return [order_out(o, db) for o in orders]


def _own_order(order_id: int, company: models.Company, db: Session) -> models.Order:
    order = db.query(models.Order).filter(
        models.Order.id == order_id, models.Order.company_id == company.id,
    ).first()
    if not order:
        raise HTTPException(404, "Заказ не найден")
    return order


@router.post("/orders/{order_id}/accept", response_model=schemas.OrderOut)
def accept_order(
    order_id: int,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    order = _own_order(order_id, company, db)
    if order.status != "new":
        raise HTTPException(400, "Принять можно только новую заявку")
    order.status = "accepted"
    db.commit()
    db.refresh(order)
    return order_out(order, db)


@router.post("/orders/{order_id}/reject", response_model=schemas.OrderOut)
def reject_order(
    order_id: int,
    payload: schemas.RejectPayload,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    order = _own_order(order_id, company, db)
    if order.status != "new":
        raise HTTPException(400, "Отклонить можно только новую заявку")
    order.status = "rejected"
    order.reject_reason = payload.reason.strip()
    db.commit()
    db.refresh(order)
    return order_out(order, db)


@router.post("/orders/{order_id}/complete", response_model=schemas.OrderOut)
def complete_order(
    order_id: int,
    user: models.User = Depends(require_role("company")),
    db: Session = Depends(get_db),
):
    company = _company(user, db)
    order = _own_order(order_id, company, db)
    if order.status != "accepted":
        raise HTTPException(400, "Завершить можно только принятый заказ")
    order.status = "completed"
    db.commit()
    db.refresh(order)
    return order_out(order, db)