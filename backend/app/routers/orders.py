from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_role
from ..serializers import order_out


router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders", response_model=schemas.OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: schemas.OrderCreate,
    user: models.User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    service = db.get(models.Service, payload.service_id)
    if not service or service.is_deleted or not service.company.is_active:
        raise HTTPException(400, "Услуга больше недоступна")

    if datetime.combine(payload.date, payload.time) <= datetime.now():
        raise HTTPException(400, "Выберите дату и время в будущем")

    total_price = round(payload.area * float(service.rate_per_m2), 2)

    order = models.Order(
        client_id=user.id, company_id=service.company_id, service_id=service.id,
        service_name=service.name, service_type=service.type,
        work_description=service.description, rate_per_m2=service.rate_per_m2,
        area=payload.area, date=payload.date, time=payload.time,
        address=payload.address.strip(), phone=payload.phone.strip(),
        comment=(payload.comment or "").strip(),
        total_price=total_price, status="new",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order_out(order, db)


@router.get("/orders/my", response_model=list[schemas.OrderOut])
def my_orders(
    user: models.User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(models.Order)
        .filter(models.Order.client_id == user.id)
        .order_by(models.Order.created_at.desc())
        .all()
    )
    return [order_out(o, db) for o in orders]


@router.post("/orders/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_order(
    order_id: int,
    user: models.User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order or order.client_id != user.id:
        raise HTTPException(404, "Заказ не найден")
    if order.status != "new":
        raise HTTPException(400, "Отменить можно только новую заявку")
    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return order_out(order, db)


@router.post("/orders/{order_id}/review", response_model=schemas.ReviewOut,
             status_code=status.HTTP_201_CREATED)
def leave_review(
    order_id: int,
    payload: schemas.ReviewCreate,
    user: models.User = Depends(require_role("client")),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order or order.client_id != user.id:
        raise HTTPException(404, "Заказ не найден")
    if order.status != "completed":
        raise HTTPException(400, "Оставить отзыв можно только по выполненному заказу")
    if db.query(models.Review).filter(models.Review.order_id == order_id).first():
        raise HTTPException(400, "Отзыв по этому заказу уже оставлен")

    review = models.Review(
        order_id=order_id, client_id=user.id, company_id=order.company_id,
        rating=payload.rating, text=(payload.text or "").strip(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return schemas.ReviewOut(
        id=review.id, order_id=review.order_id, client_id=review.client_id,
        client_name=user.name, company_id=review.company_id,
        rating=review.rating, text=review.text, created_at=review.created_at,
    )