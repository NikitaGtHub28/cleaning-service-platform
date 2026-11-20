from sqlalchemy.orm import Session

from . import models, schemas


def order_out(order: models.Order, db: Session) -> schemas.OrderOut:
    company = db.get(models.Company, order.company_id)
    client = db.get(models.User, order.client_id)
    has_review = db.query(models.Review).filter(models.Review.order_id == order.id).first() is not None
    return schemas.OrderOut(
        id=order.id,
        client_id=order.client_id,
        company_id=order.company_id,
        service_id=order.service_id,
        service_name=order.service_name,
        service_type=order.service_type,
        work_description=order.work_description,
        rate_per_m2=float(order.rate_per_m2),
        area=order.area,
        date=order.date,
        time=order.time,
        address=order.address,
        phone=order.phone,
        comment=order.comment or "",
        total_price=float(order.total_price),
        status=order.status,
        reject_reason=order.reject_reason or "",
        created_at=order.created_at,
        company_name=company.name if company else None,
        client_name=client.name if client else None,
        has_review=has_review,
    )