from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_role


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/companies", response_model=list[schemas.AdminCompanyOut])
def list_companies(user: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    result = []
    for c in db.query(models.Company).order_by(models.Company.id).all():
        count = db.query(models.Service).filter(
            models.Service.company_id == c.id, models.Service.is_deleted == False  # noqa: E712
        ).count()
        result.append(schemas.AdminCompanyOut(
            id=c.id, name=c.name, description=c.description or "", phone=c.phone or "",
            is_active=c.is_active, services_count=count,
            owner_email=c.owner.email if c.owner else None,
        ))
    return result


@router.post("/companies/{company_id}/toggle", response_model=schemas.CompanyOut)
def toggle_company(
    company_id: int,
    user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    company = db.get(models.Company, company_id)
    if not company:
        raise HTTPException(404, "Компания не найдена")
    if not company.is_active and (not company.name.strip() or not company.phone.strip()):
        raise HTTPException(400, "Сначала заполните название и телефон компании")
    company.is_active = not company.is_active
    db.commit()
    db.refresh(company)
    return company


@router.get("/services", response_model=list[schemas.AdminServiceOut])
def list_services(user: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    services = db.query(models.Service).filter(models.Service.is_deleted == False).all()  # noqa: E712
    return [schemas.AdminServiceOut(
        id=s.id, name=s.name, type=s.type, description=s.description,
        rate_per_m2=float(s.rate_per_m2),
        company_id=s.company_id, company_name=s.company.name,
    ) for s in services]


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    service = db.get(models.Service, service_id)
    if not service:
        raise HTTPException(404, "Услуга не найдена")
    service.is_deleted = True
    db.commit()


@router.get("/reviews", response_model=list[schemas.AdminReviewOut])
def list_reviews(user: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    reviews = db.query(models.Review).filter(models.Review.is_deleted == False).all()  # noqa: E712
    return [schemas.AdminReviewOut(
        id=r.id, company_id=r.company_id,
        company_name=r.company.name if r.company else "",
        client_id=r.client_id, client_name=r.client.name if r.client else "",
        rating=r.rating, text=r.text, created_at=r.created_at,
    ) for r in reviews]


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    review = db.get(models.Review, review_id)
    if not review:
        raise HTTPException(404, "Отзыв не найден")
    review.is_deleted = True
    db.commit()