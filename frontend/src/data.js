export const TYPE_LABELS = {
  maintenance: 'Поддерживающая уборка',
  general: 'Генеральная уборка',
};

export const STATUS_LABELS = {
  new: 'Новый',
  accepted: 'Принят',
  rejected: 'Отклонён',
  cancelled: 'Отменён',
  completed: 'Выполнен',
};

export const STATUS_HINTS = {
  new: 'Заявка отправлена. Компания проверит возможность уборки и ответит вам.',
  accepted: 'Компания подтвердила заказ. При изменении планов свяжитесь с ней по телефону.',
  rejected: 'Компания не сможет выполнить заказ. Причина указана ниже.',
  cancelled: 'Вы отменили заявку до того, как компания её приняла.',
  completed: 'Уборка завершена. Вы можете оставить отзыв о компании.',
};

export function makeSeed() {
  const users = [
    { id: 'user-client', name: 'Александр', email: 'client@demo.ru', password: 'demo1234', role: 'client' },
    { id: 'user-company', name: 'Мария', email: 'partner@demo.ru', password: 'demo1234', role: 'company', companyId: 'company-1' },
    { id: 'user-admin', name: 'Администратор', email: 'admin@demo.ru', password: 'demo1234', role: 'admin' },
  ];
  const companies = [
    {
      id: 'company-1', ownerId: 'user-company', name: 'КлинДом',
      description: 'Небольшая команда специалистов. Работаем аккуратно, используем профессиональные средства и заранее согласуем детали уборки.',
      phone: '+7 (900) 123-45-67', isActive: true,
    },
    {
      id: 'company-2', ownerId: null, name: 'Белый кот',
      description: 'Клининговая компания для квартир и небольших офисов. Внимание к деталям и бережное отношение к вещам.',
      phone: '+7 (900) 234-56-78', isActive: true,
    },
    {
      id: 'company-3', ownerId: null, name: 'Лёгкая уборка',
      description: 'Помогаем поддерживать чистоту дома. Работаем по предварительной заявке.',
      phone: '+7 (900) 345-67-89', isActive: true,
    },
  ];
  const services = [
    { id: 'service-1', companyId: 'company-1', name: 'Поддерживающая уборка квартиры', type: 'maintenance', description: 'Пылесосим и моем полы, протираем доступные поверхности, убираем кухню и санузел.', ratePerM2: 50, isDeleted: false },
    { id: 'service-2', companyId: 'company-1', name: 'Генеральная уборка квартиры', type: 'general', description: 'Тщательная уборка комнат, кухни и санузла, удаление бытовых загрязнений и пыли.', ratePerM2: 80, isDeleted: false },
    { id: 'service-3', companyId: 'company-2', name: 'Поддерживающая уборка', type: 'maintenance', description: 'Влажная уборка полов, протирка мебели, уборка кухни и санузла.', ratePerM2: 55, isDeleted: false },
    { id: 'service-4', companyId: 'company-2', name: 'Генеральная уборка', type: 'general', description: 'Глубокая уборка всех помещений с вниманием к труднодоступным местам.', ratePerM2: 85, isDeleted: false },
    { id: 'service-5', companyId: 'company-3', name: 'Поддерживающая уборка дома', type: 'maintenance', description: 'Регулярная уборка жилых помещений, кухни и санузла.', ratePerM2: 48, isDeleted: false },
  ];
  return { users, companies, services, orders: [], reviews: [] };
}

export function readDatabase() {
  try {
    const raw = localStorage.getItem('chisto-demo-db');
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn('Не удалось прочитать локальные данные', error);
  }
  return makeSeed();
}

export function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + ' ₽';
}

export function averageRating(reviews, companyId) {
  const visible = reviews.filter((review) => review.companyId === companyId && !review.isDeleted);
  if (!visible.length) return null;
  return (visible.reduce((sum, review) => sum + Number(review.rating), 0) / visible.length).toFixed(1).replace('.', ',');
}

export function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function localDateTimeIsFuture(date, time) {
  if (!date || !time) return false;
  return new Date(`${date}T${time}:00`).getTime() > Date.now();
}
