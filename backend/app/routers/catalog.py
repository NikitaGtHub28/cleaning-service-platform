from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db


router = APIRouter(prefix="/api", tags=["catalog"])


def _avg(reviews: list[models.Review]) -> Optional[float]:
    visible = [r for r in reviews if not r.is_deleted]
    if not visible:
        return None
    return round(sum(r.rating for r in visible) / len(visible), 1)


@router.get("/catalog/services", response_model=list[schemas.ServiceCard])
def list_services(
    type: Optional[str] = None,
    min_rate: Optional[float] = None,
    max_rate: Optional[float] = None,
    sort: str = "asc",
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Service)
        .join(models.Company, models.Service.company_id == models.Company.id)
        .filter(models.Service.is_deleted == False, models.Company.is_active == True)  # noqa: E712
    )
    if type in ("maintenance", "general"):
        query = query.filter(models.Service.type == type)
    if min_rate is not None:
        query = query.filter(models.Service.rate_per_m2 >= min_rate)
    if max_rate is not None:
        query = query.filter(models.Service.rate_per_m2 <= max_rate)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(or_(
            models.Service.name.ilike(like),
            models.Service.description.ilike(like),
            models.Company.name.ilike(like),
        ))

    order_by = models.Service.rate_per_m2.desc() if sort == "desc" else models.Service.rate_per_m2.asc()
    services = query.order_by(order_by).all()

    result: list[schemas.ServiceCard] = []
    for s in services:
        reviews = db.query(models.Review).filter(
            models.Review.company_id == s.company_id,
            models.Review.is_deleted == False,  # noqa: E712
        ).all()
        result.append(schemas.ServiceCard(
            id=s.id, company_id=s.company_id, name=s.name, type=s.type,
            description=s.description, rate_per_m2=float(s.rate_per_m2),
            company_name=s.company.name, company_phone=s.company.phone,
            rating=_avg(reviews), reviews_count=len(reviews),
        ))
    return result


@router.get("/services/{service_id}", response_model=schemas.ServiceCard)
def get_service(service_id: int, db: Session = Depends(get_db)):
    s = db.get(models.Service, service_id)
    if not s or s.is_deleted or not s.company.is_active:
        raise HTTPException(404, "Услуга не найдена")
    reviews = db.query(models.Review).filter(
        models.Review.company_id == s.company_id, models.Review.is_deleted == False  # noqa: E712
    ).all()
    return schemas.ServiceCard(
        id=s.id, company_id=s.company_id, name=s.name, type=s.type,
        description=s.description, rate_per_m2=float(s.rate_per_m2),
        company_name=s.company.name, company_phone=s.company.phone,
        rating=_avg(reviews), reviews_count=len(reviews),
    )


@router.get("/companies/{company_id}", response_model=schemas.CompanyDetail)
def get_company(company_id: int, db: Session = Depends(get_db)):
    company = db.get(models.Company, company_id)
    if not company or not company.is_active:
        raise HTTPException(404, "Компания не найдена")
    services = db.query(models.Service).filter(
        models.Service.company_id == company.id, models.Service.is_deleted == False  # noqa: E712
    ).all()
    reviews = db.query(models.Review).filter(
        models.Review.company_id == company.id, models.Review.is_deleted == False  # noqa: E712
    ).order_by(models.Review.created_at.desc()).all()
    return schemas.CompanyDetail(
        id=company.id, name=company.name, description=company.description or "",
        phone=company.phone or "", is_active=company.is_active,
        rating=_avg(reviews), reviews_count=len(reviews),
        services=[schemas.ServiceOut.model_validate(s) for s in services],
        reviews=[schemas.ReviewPublic(
            id=r.id, client_name=r.client.name if r.client else "Клиент",
            rating=r.rating, text=r.text, created_at=r.created_at,
        ) for r in reviews],
    )