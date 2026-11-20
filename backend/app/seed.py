from . import models
from .database import SessionLocal
from .security import hash_password


DEMO_PASSWORD = "demo1234"


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            return

        client = models.User(name="Александр", email="client@demo.ru",
                             password_hash=hash_password(DEMO_PASSWORD), role="client")
        partner = models.User(name="Мария", email="partner@demo.ru",
                              password_hash=hash_password(DEMO_PASSWORD), role="company")
        admin = models.User(name="Администратор", email="admin@demo.ru",
                            password_hash=hash_password(DEMO_PASSWORD), role="admin")
        db.add_all([client, partner, admin])
        db.flush()

        c1 = models.Company(owner_id=partner.id, name="КлинДом",
                            description="Небольшая команда специалистов. Работаем аккуратно, используем профессиональные средства и заранее согласуем детали уборки.",
                            phone="+7 (900) 123-45-67", is_active=True)
        c2 = models.Company(owner_id=None, name="Белый кот",
                            description="Клининговая компания для квартир и небольших офисов. Внимание к деталям и бережное отношение к вещам.",
                            phone="+7 (900) 234-56-78", is_active=True)
        c3 = models.Company(owner_id=None, name="Лёгкая уборка",
                            description="Помогаем поддерживать чистоту дома. Работаем по предварительной заявке.",
                            phone="+7 (900) 345-67-89", is_active=True)
        db.add_all([c1, c2, c3])
        db.flush()

        db.add_all([
            models.Service(company_id=c1.id, name="Поддерживающая уборка квартиры", type="maintenance",
                           description="Пылесосим и моем полы, протираем доступные поверхности, убираем кухню и санузел.",
                           rate_per_m2=50),
            models.Service(company_id=c1.id, name="Генеральная уборка квартиры", type="general",
                           description="Тщательная уборка комнат, кухни и санузла, удаление бытовых загрязнений и пыли.",
                           rate_per_m2=80),
            models.Service(company_id=c2.id, name="Поддерживающая уборка", type="maintenance",
                           description="Влажная уборка полов, протирка мебели, уборка кухни и санузла.",
                           rate_per_m2=55),
            models.Service(company_id=c2.id, name="Генеральная уборка", type="general",
                           description="Глубокая уборка всех помещений с вниманием к труднодоступным местам.",
                           rate_per_m2=85),
            models.Service(company_id=c3.id, name="Поддерживающая уборка дома", type="maintenance",
                           description="Регулярная уборка жилых помещений, кухни и санузла.",
                           rate_per_m2=48),
        ])
        db.commit()
        print("✅ Демо-данные созданы (пароль для всех: demo1234)")
    finally:
        db.close()