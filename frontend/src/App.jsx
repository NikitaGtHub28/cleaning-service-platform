import { useEffect, useMemo, useState } from 'react';
import {
  TYPE_LABELS, STATUS_LABELS, STATUS_HINTS, makeSeed, readDatabase,
  formatMoney, averageRating, todayDate, tomorrowDate, localDateTimeIsFuture,
} from './data.js';

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function App() {
  const [db, setDb] = useState(readDatabase);
  const [user, setUser] = useState(() => {
    try {
      const id = localStorage.getItem('chisto-demo-user');
      return id ? (readDatabase().users.find((item) => item.id === id) || null) : null;
    } catch { return null; }
  });
  const [page, setPage] = useState(() => {
    try {
      const id = localStorage.getItem('chisto-demo-user');
      const found = id ? readDatabase().users.find((item) => item.id === id) : null;
      if (found?.role === 'company') return 'partner-orders';
      if (found?.role === 'admin') return 'admin-companies';
      return 'catalog';
    } catch { return 'catalog'; }
  });
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [pendingServiceId, setPendingServiceId] = useState(null);

  useEffect(() => {
    localStorage.setItem('chisto-demo-db', JSON.stringify(db));
  }, [db]);

  useEffect(() => {
    const onOpenService = (event) => { setSelectedServiceId(event.detail); setPage('company'); };
    const onNavigate = (event) => setPage(event.detail);
    const onGoProfile = () => setPage('partner-profile');
    window.addEventListener('chisto-open-service', onOpenService);
    window.addEventListener('chisto-app-nav', onNavigate);
    window.addEventListener('chisto-go-profile', onGoProfile);
    return () => {
      window.removeEventListener('chisto-open-service', onOpenService);
      window.removeEventListener('chisto-app-nav', onNavigate);
      window.removeEventListener('chisto-go-profile', onGoProfile);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const updateDb = (updater) => {
    setDb((current) => typeof updater === 'function' ? updater(current) : updater);
  };

  const notify = (message) => setToast(message);

  const goToRoleHome = (account) => {
    if (account.role === 'company') setPage('partner-orders');
    else if (account.role === 'admin') setPage('admin-companies');
    else setPage('client-orders');
  };

  const login = (email, password) => {
    const account = db.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password);
    if (!account) {
      notify('Неверный email или пароль. Проверьте данные и попробуйте ещё раз.');
      return false;
    }
    setUser(account);
    localStorage.setItem('chisto-demo-user', account.id);
    if (pendingServiceId && account.role === 'client') {
      setSelectedServiceId(pendingServiceId);
      setPendingServiceId(null);
      setPage('checkout');
    } else {
      goToRoleHome(account);
    }
    notify(`Вы вошли как ${account.name}`);
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('chisto-demo-user');
    setPage('catalog');
    setSelectedServiceId(null);
    notify('Вы вышли из аккаунта');
  };

  const register = (values) => {
    const email = values.email.trim().toLowerCase();
    if (!values.name.trim() || !email || values.password.length < 8) {
      notify('Заполните имя и email. Пароль должен содержать минимум 8 символов.');
      return false;
    }
    if (db.users.some((item) => item.email.toLowerCase() === email)) {
      notify('Пользователь с таким email уже зарегистрирован.');
      return false;
    }
    if (values.role === 'company' && !values.companyName.trim()) {
      notify('Укажите название клининговой компании.');
      return false;
    }
    const userId = makeId('user');
    let companyId = null;
    const account = {
      id: userId, name: values.name.trim(), email, password: values.password,
      role: values.role,
    };
    if (values.role === 'company') {
      companyId = makeId('company');
      account.companyId = companyId;
    }
    updateDb((current) => ({
      ...current,
      users: [...current.users, account],
      companies: values.role === 'company' ? [...current.companies, {
        id: companyId, ownerId: userId, name: values.companyName.trim(), description: '', phone: '', isActive: false,
      }] : current.companies,
    }));
    setUser(account);
    localStorage.setItem('chisto-demo-user', account.id);
    setPage(values.role === 'company' ? 'partner-profile' : 'client-orders');
    notify(values.role === 'company'
      ? 'Аккаунт создан. Заполните профиль: компания появится в каталоге после включения администратором.'
      : 'Аккаунт клиента создан. Теперь можно оформить заказ.');
    return true;
  };

  const startOrder = (serviceId) => {
    const service = db.services.find((item) => item.id === serviceId && !item.isDeleted);
    const company = service && db.companies.find((item) => item.id === service.companyId && item.isActive);
    if (!service || !company) {
      notify('Предложение недоступно. Вернитесь в каталог и выберите другую услугу.');
      setPage('catalog');
      return;
    }
    if (!user) {
      setPendingServiceId(serviceId);
      setPage('login');
      notify('Войдите как клиент, чтобы оформить заказ.');
      return;
    }
    if (user.role !== 'client') {
      notify('Оформлять заказы может только клиент. Выйдите и войдите под клиентским аккаунтом.');
      return;
    }
    setSelectedServiceId(serviceId);
    setPage('checkout');
  };

  const createOrder = (values) => {
    const service = db.services.find((item) => item.id === selectedServiceId && !item.isDeleted);
    const company = service && db.companies.find((item) => item.id === service.companyId && item.isActive);
    if (!service || !company) {
      notify('Компания или услуга больше недоступна. Заказ не создан.');
      setPage('catalog');
      return false;
    }
    const area = Number(values.area);
    if (!Number.isInteger(area) || area < 1 || area > 500) {
      notify('Площадь должна быть целым числом от 1 до 500 м².');
      return false;
    }
    if (!localDateTimeIsFuture(values.date, values.time)) {
      notify('Выберите дату и время в будущем.');
      return false;
    }
    if (!values.address.trim() || !values.phone.trim()) {
      notify('Укажите адрес и телефон для связи.');
      return false;
    }
    const totalPrice = Number((area * Number(service.ratePerM2)).toFixed(2));
    const order = {
      id: makeId('order'), clientId: user.id, companyId: company.id, serviceId: service.id,
      serviceName: service.name, serviceType: service.type,
      workDescription: service.description, ratePerM2: Number(service.ratePerM2),
      area, date: values.date, time: values.time, address: values.address.trim(),
      phone: values.phone.trim(), comment: values.comment.trim(), totalPrice,
      status: 'new', rejectReason: '', createdAt: new Date().toISOString(),
    };
    updateDb((current) => ({ ...current, orders: [order, ...current.orders] }));
    setPage('client-orders');
    setSelectedServiceId(null);
    notify(`Заявка отправлена. Итоговая стоимость: ${formatMoney(totalPrice)}.`);
    return true;
  };

  const cancelOrder = (orderId) => {
    const order = db.orders.find((item) => item.id === orderId && item.clientId === user?.id);
    if (!order || order.status !== 'new') {
      notify('Отменить можно только собственную новую заявку.');
      return;
    }
    if (!window.confirm('Отменить эту заявку? Компания увидит новый статус.')) return;
    updateDb((current) => ({
      ...current,
      orders: current.orders.map((item) => item.id === orderId && item.status === 'new'
        ? { ...item, status: 'cancelled' } : item),
    }));
    notify('Заявка отменена.');
  };

  const acceptOrder = (orderId) => {
    const company = db.companies.find((item) => item.id === user?.companyId);
    const order = db.orders.find((item) => item.id === orderId && item.companyId === company?.id);
    if (!order || order.status !== 'new') return notify('Можно принять только новую заявку своей компании.');
    updateDb((current) => ({ ...current, orders: current.orders.map((item) => item.id === orderId && item.status === 'new' ? { ...item, status: 'accepted' } : item) }));
    notify('Заказ принят. Клиент увидит новый статус.');
  };

  const rejectOrder = (orderId, reason) => {
    const company = db.companies.find((item) => item.id === user?.companyId);
    const order = db.orders.find((item) => item.id === orderId && item.companyId === company?.id);
    if (!order || order.status !== 'new') return notify('Можно отклонить только новую заявку своей компании.');
    if (!reason.trim()) return notify('Укажите причину отказа.');
    updateDb((current) => ({ ...current, orders: current.orders.map((item) => item.id === orderId && item.status === 'new' ? { ...item, status: 'rejected', rejectReason: reason.trim() } : item) }));
    setModal(null);
    notify('Заявка отклонена. Причина будет видна клиенту.');
  };

  const completeOrder = (orderId) => {
    const company = db.companies.find((item) => item.id === user?.companyId);
    const order = db.orders.find((item) => item.id === orderId && item.companyId === company?.id);
    if (!order || order.status !== 'accepted') return notify('Завершить можно только принятый заказ своей компании.');
    if (!window.confirm('Подтвердить, что уборка выполнена? Клиент сможет оставить отзыв.')) return;
    updateDb((current) => ({ ...current, orders: current.orders.map((item) => item.id === orderId && item.status === 'accepted' ? { ...item, status: 'completed' } : item) }));
    notify('Заказ отмечен как выполненный.');
  };

  const submitReview = (orderId, rating, text) => {
    const order = db.orders.find((item) => item.id === orderId && item.clientId === user?.id);
    if (!order || order.status !== 'completed') return notify('Оставить отзыв можно только по своему выполненному заказу.');
    if (db.reviews.some((item) => item.orderId === orderId)) return notify('Для этого заказа отзыв уже существует.');
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5 || text.length > 500) return notify('Оценка должна быть от 1 до 5, текст — не более 500 символов.');
    updateDb((current) => ({ ...current, reviews: [...current.reviews, {
      id: makeId('review'), orderId, clientId: user.id, companyId: order.companyId,
      rating: score, text: text.trim(), createdAt: new Date().toISOString(), isDeleted: false,
    }] }));
    setModal(null);
    notify('Спасибо! Отзыв опубликован, рейтинг компании пересчитан.');
  };

  const saveCompanyProfile = (values) => {
    const company = db.companies.find((item) => item.id === user?.companyId);
    if (!company) return;
    if (!values.name.trim() || !values.phone.trim()) return notify('Название компании и телефон обязательны.');
    updateDb((current) => ({ ...current, companies: current.companies.map((item) => item.id === company.id
      ? { ...item, name: values.name.trim(), description: values.description.trim(), phone: values.phone.trim() }
      : item) }));
    notify('Профиль компании сохранён.');
  };

  const saveService = (values, serviceId = null) => {
    const company = db.companies.find((item) => item.id === user?.companyId);
    if (!company) return;
    const rate = Number(values.ratePerM2);
    if (!values.name.trim() || !values.description.trim() || !['maintenance', 'general'].includes(values.type) || !Number.isFinite(rate) || rate <= 0) {
      return notify('Заполните название, тип, описание и укажите положительный тариф за м².');
    }
    if (serviceId) {
      updateDb((current) => ({ ...current, services: current.services.map((item) => item.id === serviceId && item.companyId === company.id && !item.isDeleted
        ? { ...item, name: values.name.trim(), type: values.type, description: values.description.trim(), ratePerM2: rate }
        : item) }));
      notify('Услуга обновлена. Уже созданные заказы не изменились.');
    } else {
      updateDb((current) => ({ ...current, services: [...current.services, {
        id: makeId('service'), companyId: company.id, name: values.name.trim(), type: values.type,
        description: values.description.trim(), ratePerM2: rate, isDeleted: false,
      }] }));
      notify(company.isActive ? 'Услуга добавлена и опубликована в каталоге.' : 'Услуга сохранена. Она появится в каталоге после включения компании администратором.');
    }
    setModal(null);
  };

  const deleteOwnService = (serviceId) => {
    if (!window.confirm('Удалить услугу? Она исчезнет из каталога, но старые заказы сохранят свои данные.')) return;
    updateDb((current) => ({ ...current, services: current.services.map((item) => item.id === serviceId && item.companyId === user?.companyId ? { ...item, isDeleted: true } : item) }));
    notify('Услуга удалена из каталога. История заказов сохранена.');
  };

  const toggleCompany = (companyId) => {
    const company = db.companies.find((item) => item.id === companyId);
    if (!company) return;
    if (!company.isActive && (!company.name.trim() || !company.phone.trim())) {
      notify('Нельзя включить компанию: сначала заполните название и телефон.');
      return;
    }
    const nextState = !company.isActive;
    if (!window.confirm(nextState ? `Включить компанию «${company.name}» и показать её услуги в каталоге?` : `Отключить компанию «${company.name}»? Новые заказы станут недоступны, история сохранится.`)) return;
    updateDb((current) => ({ ...current, companies: current.companies.map((item) => item.id === companyId ? { ...item, isActive: nextState } : item) }));
    notify(nextState ? 'Компания включена и доступна в каталоге.' : 'Компания отключена. Старые заказы сохранены.');
  };

  const adminDeleteService = (serviceId) => {
    if (!window.confirm('Удалить эту услугу из публичного каталога? Сведения в старых заказах сохранятся.')) return;
    updateDb((current) => ({ ...current, services: current.services.map((item) => item.id === serviceId ? { ...item, isDeleted: true } : item) }));
    notify('Услуга удалена из каталога.');
  };

  const adminDeleteReview = (reviewId) => {
    if (!window.confirm('Удалить отзыв? Рейтинг компании будет пересчитан.')) return;
    updateDb((current) => ({ ...current, reviews: current.reviews.map((item) => item.id === reviewId ? { ...item, isDeleted: true } : item) }));
    notify('Отзыв удалён, рейтинг обновлён.');
  };

  const resetDemo = () => {
    if (!window.confirm('Сбросить все локальные изменения и вернуть начальные демонстрационные данные?')) return;
    const initial = makeSeed();
    updateDb(initial);
    setUser(null);
    localStorage.removeItem('chisto-demo-user');
    setPage('catalog');
    setModal(null);
    notify('Демонстрационные данные восстановлены.');
  };

  const common = { db, user, notify, setPage, setModal, logout, login, register };
  const selectedService = db.services.find((item) => item.id === selectedServiceId && !item.isDeleted);

  return (
    <div className="app-shell">
      <Header user={user} page={page} setPage={setPage} logout={logout} />
      <main className="main-wrap">
        {page === 'catalog' && <Catalog {...common} onOpenService={(id) => { setSelectedServiceId(id); setPage('company'); }} />}
        {page === 'company' && <CompanyDetails {...common} serviceId={selectedServiceId} onOrder={startOrder} />}
        {page === 'checkout' && selectedService && user?.role === 'client' && <Checkout {...common} service={selectedService} onSubmit={createOrder} />}
        {page === 'checkout' && (!selectedService || user?.role !== 'client') && <AccessMessage title="Для оформления заказа войдите как клиент" onClick={() => setPage('login')} />}
        {page === 'login' && <AuthPage mode="login" onLogin={login} onRegister={() => setPage('register')} />}
        {page === 'register' && <AuthPage mode="register" onRegister={register} onLogin={() => setPage('login')} />}
        {page === 'client-orders' && user?.role === 'client' && <ClientOrders {...common} onCancel={cancelOrder} onReview={(order) => setModal({ type: 'review', order })} />}
        {page === 'partner-orders' && user?.role === 'company' && <PartnerOrders {...common} onAccept={acceptOrder} onReject={(order) => setModal({ type: 'reject', order })} onComplete={completeOrder} />}
        {page === 'partner-services' && user?.role === 'company' && <PartnerServices {...common} onAdd={() => setModal({ type: 'service', service: null, onSave: saveService })} onEdit={(service) => setModal({ type: 'service', service, onSave: saveService })} onDelete={deleteOwnService} />}
        {page === 'partner-profile' && user?.role === 'company' && <PartnerProfile {...common} onSave={saveCompanyProfile} />}
        {page === 'admin-companies' && user?.role === 'admin' && <AdminCompanies {...common} onToggle={toggleCompany} />}
        {page === 'admin-content' && user?.role === 'admin' && <AdminContent {...common} onDeleteService={adminDeleteService} onDeleteReview={adminDeleteReview} />}
        {page === 'client-orders' && user?.role !== 'client' && <AccessMessage title="Войдите как клиент, чтобы посмотреть свои заказы" onClick={() => setPage('login')} />}
        {page.startsWith('partner-') && user?.role !== 'company' && <AccessMessage title="Этот раздел доступен представителю клининговой компании" onClick={() => setPage('login')} />}
        {page.startsWith('admin-') && user?.role !== 'admin' && <AccessMessage title="Этот раздел доступен администратору" onClick={() => setPage('login')} />}
      </main>
      <Footer onReset={resetDemo} />
      {toast && <div className="toast"><span className="toast-dot" />{toast}</div>}
      {modal?.type === 'review' && <ReviewModal order={modal.order} onClose={() => setModal(null)} onSubmit={submitReview} />}
      {modal?.type === 'reject' && <RejectModal order={modal.order} onClose={() => setModal(null)} onSubmit={rejectOrder} />}
      {modal?.type === 'service' && <ServiceModal service={modal.service} onClose={() => setModal(null)} onSave={modal.onSave} />}
    </div>
  );
}

function Header({ user, page, setPage, logout }) {
  const nav = user?.role === 'company'
    ? [{ id: 'partner-orders', label: 'Заказы' }, { id: 'partner-services', label: 'Услуги' }, { id: 'partner-profile', label: 'Профиль компании' }]
    : user?.role === 'admin'
      ? [{ id: 'admin-companies', label: 'Компании' }, { id: 'admin-content', label: 'Контент' }]
      : user?.role === 'client'
        ? [{ id: 'catalog', label: 'Каталог' }, { id: 'client-orders', label: 'Мои заказы' }]
        : [{ id: 'catalog', label: 'Каталог' }];

  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" onClick={() => setPage('catalog')} aria-label="На главную">
          <span className="brand-mark">ч</span>
          <span>чисто<span className="brand-period">.</span></span>
        </button>
        <nav className="main-nav">
          {nav.map((item) => <button key={item.id} className={page === item.id ? 'nav-link active' : 'nav-link'} onClick={() => setPage(item.id)}>{item.label}</button>)}
        </nav>
        <div className="header-actions">
          {!user ? <>
            <button className="btn btn-ghost btn-small" onClick={() => setPage('login')}>Войти</button>
            <button className="btn btn-primary btn-small" onClick={() => setPage('register')}>Создать аккаунт <span>↗</span></button>
          </> : <>
            <div className="user-chip"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="user-name">{user.name}</span><span className="role-mini">{user.role === 'client' ? 'Клиент' : user.role === 'company' ? 'Компания' : 'Админ'}</span></div>
            <button className="icon-button" title="Выйти" onClick={logout}>↪</button>
          </>}
        </div>
      </div>
    </header>
  );
}

function Catalog({ db, setPage, user, onOpenService }) {
  const [type, setType] = useState('all');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [sort, setSort] = useState('asc');
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    let list = db.services.filter((service) => {
      const company = db.companies.find((item) => item.id === service.companyId);
      return !service.isDeleted && company?.isActive;
    }).map((service) => ({ ...service, company: db.companies.find((item) => item.id === service.companyId), rating: averageRating(db.reviews, service.companyId) }));
    if (type !== 'all') list = list.filter((item) => item.type === type);
    if (minRate !== '') list = list.filter((item) => Number(item.ratePerM2) >= Number(minRate));
    if (maxRate !== '') list = list.filter((item) => Number(item.ratePerM2) <= Number(maxRate));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((item) => `${item.name} ${item.company.name} ${item.description}`.toLowerCase().includes(q));
    }
    list.sort((a, b) => sort === 'asc' ? a.ratePerM2 - b.ratePerM2 : b.ratePerM2 - a.ratePerM2);
    return list;
  }, [db, type, minRate, maxRate, sort, query]);

  return <>
    <section className="hero-section">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> КЛИНИНГ В ОДНОМ МЕСТЕ</div>
        <h1>Чистота дома.<br /><em>Без лишних поисков.</em></h1>
        <p>Сравните предложения клининговых компаний, выберите подходящую уборку и отправьте заявку напрямую исполнителю.</p>
        <div className="hero-points"><span><b>✓</b> Понятный тариф за м²</span><span><b>✓</b> Отзывы клиентов</span></div>
        <button className="btn btn-primary btn-large" onClick={() => document.getElementById('catalog-list')?.scrollIntoView({ behavior: 'smooth' })}>Выбрать уборку <span>↓</span></button>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="art-spark spark-one">✦</div><div className="art-spark spark-two">✧</div>
        <div className="art-card art-card-back"><span className="art-icon">✧</span><span>Свежесть в деталях</span><small>Дом, в который приятно возвращаться</small></div>
        <div className="art-card art-card-main"><div className="art-card-top"><span className="art-pill">ПОДДЕРЖИВАЮЩАЯ</span><span className="art-star">★ 4.9</span></div><div className="art-house">⌂</div><strong>Уборка под ваш ритм</strong><small>Проверенные предложения рядом</small><div className="art-progress"><i /></div></div>
        <div className="art-bubble"><span>✓</span><div><b>Заявка отправлена</b><small>Компания скоро ответит</small></div></div>
      </div>
    </section>

    <section className="catalog-section" id="catalog-list">
      <div className="section-heading"><div><div className="eyebrow">КАТАЛОГ УСЛУГ</div><h2>Найдите свою уборку</h2><p>Выбирайте по типу работ и стоимости за квадратный метр.</p></div><div className="result-count"><b>{items.length}</b><span>предложений</span></div></div>
      <div className="catalog-layout">
        <aside className="filter-panel">
          <div className="filter-title"><h3>Фильтры</h3><button className="text-button" onClick={() => { setType('all'); setMinRate(''); setMaxRate(''); setSort('asc'); setQuery(''); }}>Сбросить</button></div>
          <label className="field-label">Поиск</label>
          <div className="search-input"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Компания или услуга" /></div>
          <label className="field-label">Тип уборки</label>
          <div className="filter-options">
            {[['all', 'Все услуги'], ['maintenance', 'Поддерживающая'], ['general', 'Генеральная']].map(([value, label]) => <button key={value} className={type === value ? 'filter-option selected' : 'filter-option'} onClick={() => setType(value)}><span className="radio-dot" />{label}</button>)}
          </div>
          <label className="field-label">Тариф за м², ₽</label>
          <div className="range-inputs"><input type="number" min="0" value={minRate} onChange={(e) => setMinRate(e.target.value)} placeholder="От" /><span>—</span><input type="number" min="0" value={maxRate} onChange={(e) => setMaxRate(e.target.value)} placeholder="До" /></div>
          <div className="filter-note">Стоимость заказа рассчитывается по формуле: площадь × тариф.</div>
        </aside>
        <div className="catalog-results">
          <div className="results-toolbar"><span>Предложения компаний</span><label>Сортировка <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="asc">Сначала дешевле</option><option value="desc">Сначала дороже</option></select></label></div>
          {items.length ? <div className="service-grid">{items.map((item) => <ServiceCard key={item.id} item={item} onOpen={() => onOpenService(item.id)} />)}</div> : <div className="empty-state"><div className="empty-icon">⌕</div><h3>Ничего не нашлось</h3><p>Попробуйте изменить тип уборки или диапазон тарифа.</p><button className="btn btn-secondary" onClick={() => { setType('all'); setMinRate(''); setMaxRate(''); setSort('asc'); setQuery(''); }}>Сбросить фильтры</button></div>}
        </div>
      </div>
    </section>
    <section className="how-section"><div className="section-heading"><div><div className="eyebrow">ВСЁ ПРОСТО</div><h2>От выбора до чистоты — три шага</h2></div></div><div className="steps-grid"><Step number="01" title="Выберите услугу" text="Сравните тип уборки, состав работ, тариф и отзывы компании." /><Step number="02" title="Отправьте заявку" text="Укажите площадь, удобное время, адрес и телефон для связи." /><Step number="03" title="Согласуйте детали" text="Компания вручную подтвердит возможность уборки и свяжется с вами." /></div></section>
  </>;
}

function ServiceCard({ item, onOpen }) {
  const color = item.type === 'general' ? 'lavender' : 'mint';
  return <article className="service-card">
    <div className={`service-visual ${color}`}><div className="service-visual-shape">{item.type === 'general' ? '✧' : '⌂'}</div><span className="service-type-tag">{TYPE_LABELS[item.type]}</span><span className="service-rating">{item.rating ? `★ ${item.rating}` : 'Нет отзывов'}</span></div>
    <div className="service-card-body"><div className="company-line"><span className="company-avatar">{item.company.name.slice(0, 1)}</span><span>{item.company.name}</span><span className="verified-dot" title="Компания активна">✓</span></div><h3>{item.name}</h3><p>{item.description}</p><div className="service-card-bottom"><div><strong>{formatMoney(item.ratePerM2)}</strong><small>за м²</small></div><button className="btn btn-primary btn-card" onClick={onOpen}>Подробнее <span>↗</span></button></div></div>
  </article>;
}

function Step({ number, title, text }) {
  return <article className="step-card"><span className="step-number">{number}</span><div className="step-mark">✦</div><h3>{title}</h3><p>{text}</p></article>;
}

function CompanyDetails({ db, serviceId, onOrder, setPage }) {
  const service = db.services.find((item) => item.id === serviceId && !item.isDeleted);
  const company = service && db.companies.find((item) => item.id === service.companyId && item.isActive);
  if (!service || !company) return <AccessMessage title="Предложение недоступно" onClick={() => setPage('catalog')} buttonText="Вернуться в каталог" />;
  const rating = averageRating(db.reviews, company.id);
  const reviews = db.reviews.filter((item) => item.companyId === company.id && !item.isDeleted);
  const companyServices = db.services.filter((item) => item.companyId === company.id && !item.isDeleted);
  return <div className="detail-page">
    <button className="back-link" onClick={() => setPage('catalog')}>← Назад в каталог</button>
    <section className="company-hero-card"><div className="company-emblem">{company.name.slice(0, 1)}</div><div className="company-info"><div className="eyebrow"><span className="eyebrow-dot" /> АКТИВНАЯ КОМПАНИЯ</div><h1>{company.name}</h1><div className="company-meta"><span>{rating ? `★ ${rating}` : 'Нет отзывов'}</span><span>•</span><span>{reviews.length} отзывов</span><span>•</span><span>{company.phone}</span></div><p>{company.description || 'Компания пока не добавила описание.'}</p></div><div className="company-contact"><span>Телефон компании</span><b>{company.phone}</b><small>Связь по деталям заказа — напрямую с исполнителем.</small></div></section>
    <div className="detail-columns"><section className="detail-main"><div className="section-heading compact"><div><div className="eyebrow">ПРЕДЛОЖЕНИЕ</div><h2>{service.name}</h2></div><span className="type-badge">{TYPE_LABELS[service.type]}</span></div><div className="work-card"><h3>Что входит в уборку</h3><p>{service.description}</p><div className="work-price"><div><strong>{formatMoney(service.ratePerM2)}</strong><span>за 1 м²</span></div><button className="btn btn-primary" onClick={() => onOrder(service.id)}>Заказать эту услугу <span>↗</span></button></div></div><div className="section-heading compact review-heading"><div><div className="eyebrow">ОПЫТ КЛИЕНТОВ</div><h2>Отзывы</h2></div><div className="review-score">{rating ? `★ ${rating}` : 'Нет отзывов'}</div></div>{reviews.length ? <div className="reviews-list">{reviews.map((review) => { const client = db.users.find((item) => item.id === review.clientId); return <article className="review-card" key={review.id}><div className="review-top"><span className="avatar">{(client?.name || 'К').slice(0, 1)}</span><div><b>{client?.name || 'Клиент'}</b><small>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</small></div><span className="review-stars">{'★'.repeat(review.rating)}<i>{'★'.repeat(5 - review.rating)}</i></span></div><p>{review.text || 'Клиент оставил оценку без комментария.'}</p></article>; })}</div> : <div className="empty-inline"><span>✧</span><div><b>Нет отзывов</b><small>Отзывы появятся после выполнения заказов.</small></div></div>}</section>
      <aside className="detail-aside"><div className="aside-card"><div className="eyebrow">ДРУГИЕ УСЛУГИ</div>{companyServices.map((item) => <button key={item.id} className={item.id === service.id ? 'other-service active' : 'other-service'} onClick={() => { if (item.id !== service.id) window.dispatchEvent(new CustomEvent('chisto-open-service', { detail: item.id })); }}><span>{item.name}</span><b>{formatMoney(item.ratePerM2)}<small>/м²</small></b></button>)}</div><div className="aside-note"><span>i</span><p>Дата и время в заявке — ваше пожелание. Компания вручную проверит возможность уборки и подтвердит или отклонит заявку.</p></div></aside></div>
  </div>;
}

function Checkout({ db, user, service, onSubmit, setPage }) {
  const company = db.companies.find((item) => item.id === service.companyId);
  const [values, setValues] = useState({ area: '50', date: tomorrowDate(), time: '10:00', address: '', phone: '', comment: '' });
  const [errors, setErrors] = useState({});
  const total = Math.max(0, Number(values.area) || 0) * Number(service.ratePerM2);
  const change = (key, value) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!Number.isInteger(Number(values.area)) || Number(values.area) < 1 || Number(values.area) > 500) next.area = 'Введите целое число от 1 до 500.';
    if (!localDateTimeIsFuture(values.date, values.time)) next.date = 'Выберите дату и время в будущем.';
    if (!values.address.trim()) next.address = 'Укажите адрес уборки.';
    if (!values.phone.trim()) next.phone = 'Укажите телефон для связи.';
    setErrors(next);
    if (!Object.keys(next).length) onSubmit(values);
  };
  return <div className="checkout-page"><button className="back-link" onClick={() => setPage('company')}>← Назад к предложению</button><div className="checkout-title"><div><div className="eyebrow">ОФОРМЛЕНИЕ ЗАЯВКИ</div><h1>Расскажите, что нужно убрать</h1><p>Компания проверит дату и время вручную и ответит на заявку.</p></div><div className="checkout-step">ШАГ <b>1</b> / 1</div></div>
    <form className="checkout-layout" onSubmit={submit}><div className="form-card"><div className="form-section-head"><span className="section-icon">01</span><div><h3>Параметры уборки</h3><p>Укажите площадь и удобное время.</p></div></div><div className="selected-service-row"><div className="selected-service-icon">✦</div><div><b>{service.name}</b><small>{company?.name} · {TYPE_LABELS[service.type]}</small></div><strong>{formatMoney(service.ratePerM2)}<small>/м²</small></strong></div>
      <div className="form-grid"><Field label="Площадь помещения, м²" error={errors.area}><input type="number" min="1" max="500" step="1" value={values.area} onChange={(e) => change('area', e.target.value)} placeholder="Например, 50" /></Field><Field label="Желаемая дата" error={errors.date}><input type="date" min={todayDate()} value={values.date} onChange={(e) => change('date', e.target.value)} /></Field><Field label="Удобное время"><input type="time" value={values.time} onChange={(e) => change('time', e.target.value)} /></Field><Field label="Телефон для связи" error={errors.phone}><input value={values.phone} onChange={(e) => change('phone', e.target.value)} placeholder="+7 (___) ___-__-__" /></Field><Field label="Адрес уборки" wide error={errors.address}><input value={values.address} onChange={(e) => change('address', e.target.value)} placeholder="Город, улица, дом, квартира" /></Field><Field label="Комментарий для компании" wide><textarea rows="3" maxLength="500" value={values.comment} onChange={(e) => change('comment', e.target.value)} placeholder="Например: домофон не работает, позвонить за 10 минут" /></Field></div>
      <div className="form-footnote"><span>i</span><p>Дата и время — пожелание, а не забронированный слот. Компания подтвердит возможность уборки после получения заявки.</p></div>
    </div><aside className="order-summary"><div className="eyebrow">ВАША ЗАЯВКА</div><h3>Расчёт стоимости</h3><div className="summary-line"><span>Площадь</span><b>{Number(values.area) || 0} м²</b></div><div className="summary-line"><span>Тариф</span><b>{formatMoney(service.ratePerM2)} / м²</b></div><div className="summary-divider" /><div className="summary-total"><span>Предварительная стоимость</span><strong>{formatMoney(total)}</strong></div><p className="summary-formula">{Number(values.area) || 0} м² × {formatMoney(service.ratePerM2)}</p><button className="btn btn-primary btn-full btn-large" type="submit">Отправить заявку <span>↗</span></button><div className="payment-note"><span>↗</span><p>Оплата происходит напрямую клининговой компании вне сервиса. Онлайн-оплаты в учебной версии нет.</p></div><div className="summary-company"><span className="company-avatar">{company?.name?.slice(0, 1) || 'К'}</span><div><small>Исполнитель</small><b>{company?.name}</b></div></div></aside></form></div>;
}

function Field({ label, children, wide, error }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>;
}

function AuthPage({ mode, onLogin, onRegister }) {
  const isLogin = mode === 'login';
  const [values, setValues] = useState({ name: '', email: '', password: '', role: 'client', companyName: '' });
  const [error, setError] = useState('');
  const fillDemo = (email) => setValues((current) => ({ ...current, email, password: 'demo1234' }));
  const submit = (event) => {
    event.preventDefault();
    setError('');
    const ok = isLogin ? onLogin(values.email, values.password) : onRegister(values);
    if (ok === false) setError(isLogin ? 'Не удалось войти. Проверьте данные.' : 'Проверьте заполнение формы.');
  };
  return <div className="auth-layout"><div className="auth-story"><div className="eyebrow"><span className="eyebrow-dot" /> ЧИСТО · МАРКЕТПЛЕЙС КЛИНИНГА</div><h1>{isLogin ? 'Рады снова вас видеть.' : 'Начнём с чистого листа.'}</h1><p>{isLogin ? 'Войдите в свой кабинет, чтобы управлять заявками или посмотреть историю уборок.' : 'Создайте аккаунт клиента или представителя компании. Регистрация компании создаёт неактивный профиль, который включает администратор.'}</p><div className="auth-stamp"><span>✦</span><div><b>Простой путь к чистоте</b><small>Выбор · заявка · результат</small></div></div></div><div className="auth-card"><div className="auth-card-head"><span className="brand-mark">ч</span><div><h2>{isLogin ? 'Вход в аккаунт' : 'Регистрация'}</h2><p>{isLogin ? 'Введите email и пароль' : 'Заполните данные для создания аккаунта'}</p></div></div><form onSubmit={submit} className="auth-form">{!isLogin && <><Field label="Ваше имя"><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Как к вам обращаться" required /></Field><Field label="Кто вы?"><select value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value })}><option value="client">Клиент</option><option value="company">Представитель компании</option></select></Field>{values.role === 'company' && <Field label="Название компании"><input value={values.companyName} onChange={(e) => setValues({ ...values, companyName: e.target.value })} placeholder="Например, КлинДом" required /></Field>}</>}<Field label="Email"><input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="name@example.ru" required /></Field><Field label="Пароль"><input type="password" minLength="8" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder={isLogin ? 'Введите пароль' : 'Не менее 8 символов'} required /></Field>{error && <div className="inline-error">{error}</div>}<button className="btn btn-primary btn-full btn-large" type="submit">{isLogin ? 'Войти' : 'Создать аккаунт'} <span>↗</span></button></form>{isLogin && <div className="demo-logins"><span>Быстрый вход для проверки</span><div><button onClick={() => fillDemo('client@demo.ru')}>Клиент</button><button onClick={() => fillDemo('partner@demo.ru')}>Компания</button><button onClick={() => fillDemo('admin@demo.ru')}>Админ</button></div><small>Пароль для всех: <b>demo1234</b></small></div>}<div className="auth-switch">{isLogin ? <>Нет аккаунта? <button onClick={onRegister}>Зарегистрироваться</button></> : <>Уже есть аккаунт? <button onClick={onLogin}>Войти</button></>}</div></div></div>;
}

function ClientOrders({ db, user, onCancel, onReview }) {
  const orders = db.orders.filter((item) => item.clientId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return <DashboardLayout title="Мои заказы" eyebrow="КАБИНЕТ КЛИЕНТА" description="Заявки и актуальные статусы уборок." aside={<div className="dashboard-aside-note"><span>i</span><p>Если компания уже приняла заказ, изменение планов нужно согласовать с ней по телефону.</p></div>}>
    {orders.length ? <div className="orders-list">{orders.map((order) => <OrderCard key={order.id} order={order} company={db.companies.find((item) => item.id === order.companyId)} actions={<ClientOrderActions order={order} db={db} onCancel={onCancel} onReview={onReview} />} />)}</div> : <div className="empty-state large-empty"><div className="empty-icon">▤</div><h3>Заказов пока нет</h3><p>Когда вы отправите заявку на уборку, она появится здесь.</p><button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('chisto-go-catalog'))}>Перейти в каталог <span>↗</span></button></div>}
  </DashboardLayout>;
}

function ClientOrderActions({ order, db, onCancel, onReview }) {
  const reviewExists = db.reviews.some((item) => item.orderId === order.id);
  return <div className="order-actions">{order.status === 'new' && <button className="btn btn-danger-soft" onClick={() => onCancel(order.id)}>Отменить заявку</button>}{order.status === 'completed' && !reviewExists && <button className="btn btn-primary" onClick={() => onReview(order)}>Оставить отзыв <span>↗</span></button>}{order.status === 'completed' && reviewExists && <span className="review-sent">✓ Отзыв отправлен</span>}</div>;
}

function OrderCard({ order, company, actions }) {
  return <article className="order-card"><div className="order-card-head"><div><span className="order-id">ЗАЯВКА #{order.id.split('-').slice(-1)[0].toUpperCase()}</span><h3>{order.serviceName}</h3><p>{company?.name || 'Компания'} · {TYPE_LABELS[order.serviceType]}</p></div><StatusBadge status={order.status} /></div><div className="order-details-grid"><div><small>Дата и время</small><b>{new Date(`${order.date}T${order.time}`).toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}, {order.time}</b></div><div><small>Площадь</small><b>{order.area} м²</b></div><div><small>Стоимость</small><b>{formatMoney(order.totalPrice)}</b></div><div><small>Адрес</small><b>{order.address}</b></div><div><small>Телефон</small><b>{order.phone}</b></div></div>{order.status === 'rejected' && <div className="rejection-reason"><b>Причина отказа:</b> {order.rejectReason}</div>}{order.comment && <div className="order-comment"><b>Комментарий клиента:</b> {order.comment}</div>}<div className="order-status-hint">{STATUS_HINTS[order.status]}</div>{actions && <div className="order-card-footer">{actions}</div>}</article>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}><i />{STATUS_LABELS[status]}</span>;
}

function PartnerOrders({ db, user, onAccept, onReject, onComplete }) {
  const company = db.companies.find((item) => item.id === user.companyId);
  const orders = db.orders.filter((item) => item.companyId === company?.id).sort((a, b) => {
    const priority = { new: 0, accepted: 1, completed: 2, rejected: 3, cancelled: 4 };
    return priority[a.status] - priority[b.status] || new Date(b.createdAt) - new Date(a.createdAt);
  });
  return <DashboardLayout title="Заявки клиентов" eyebrow="КАБИНЕТ КОМПАНИИ" description={company?.isActive ? 'Проверяйте новые заявки, принимайте решение и отмечайте выполнение.' : 'Профиль компании пока не опубликован. Заполните сведения и дождитесь включения администратором.'}>
    {!company?.isActive && <div className="notice-banner warning"><span>!</span><div><b>Компания неактивна</b><p>Вы можете заполнить профиль и подготовить услуги. Клиенты не увидят предложения, пока администратор не включит компанию.</p></div></div>}
    <div className="dashboard-stats"><Stat label="Новые заявки" value={orders.filter((item) => item.status === 'new').length} tint="mint" /><Stat label="В работе" value={orders.filter((item) => item.status === 'accepted').length} tint="blue" /><Stat label="Завершено" value={orders.filter((item) => item.status === 'completed').length} tint="sand" /></div>
    {orders.length ? <div className="orders-list">{orders.map((order) => <OrderCard key={order.id} order={order} company={company} actions={<div className="order-actions">{order.status === 'new' && <><button className="btn btn-primary" onClick={() => onAccept(order.id)}>Принять</button><button className="btn btn-danger-soft" onClick={() => onReject(order)}>Отклонить</button></>}{order.status === 'accepted' && <button className="btn btn-primary" onClick={() => onComplete(order.id)}>Отметить выполненным</button>}</div>} />)}</div> : <div className="empty-state large-empty"><div className="empty-icon">▤</div><h3>Новых заявок пока нет</h3><p>Когда клиент выберет вашу услугу и отправит заявку, она появится здесь.</p><button className="btn btn-secondary" onClick={() => window.dispatchEvent(new CustomEvent('chisto-go-profile'))}>Проверить профиль компании</button></div>}
  </DashboardLayout>;
}

function PartnerServices({ db, user, onAdd, onEdit, onDelete }) {
  const company = db.companies.find((item) => item.id === user.companyId);
  const services = db.services.filter((item) => item.companyId === company?.id && !item.isDeleted);
  return <DashboardLayout title="Услуги компании" eyebrow="КАБИНЕТ КОМПАНИИ" description="Добавляйте предложения, указывайте состав работ и тариф за квадратный метр." action={<button className="btn btn-primary" onClick={onAdd}>＋ Добавить услугу</button>}>
    {!company?.isActive && <div className="notice-banner warning"><span>!</span><div><b>Компания ещё не включена</b><p>Сохранённые услуги появятся в публичном каталоге после включения профиля администратором.</p></div></div>}
    {services.length ? <div className="managed-services">{services.map((service) => <article className="managed-service" key={service.id}><div className={`managed-service-icon ${service.type === 'general' ? 'lavender' : 'mint'}`}>✦</div><div className="managed-service-info"><div className="eyebrow">{TYPE_LABELS[service.type]}</div><h3>{service.name}</h3><p>{service.description}</p></div><div className="managed-service-rate"><b>{formatMoney(service.ratePerM2)}</b><small>за м²</small></div><div className="managed-service-actions"><button className="btn btn-secondary btn-small" onClick={() => onEdit(service)}>Изменить</button><button className="icon-button danger-icon" onClick={() => onDelete(service.id)} title="Удалить услугу">×</button></div></article>)}</div> : <div className="empty-state large-empty"><div className="empty-icon">✦</div><h3>Пока нет услуг</h3><p>Добавьте первую услугу, чтобы подготовить предложение для каталога.</p><button className="btn btn-primary" onClick={onAdd}>Добавить услугу</button></div>}
  </DashboardLayout>;
}

function PartnerProfile({ db, user, onSave }) {
  const company = db.companies.find((item) => item.id === user.companyId);
  const [values, setValues] = useState({ name: company?.name || '', description: company?.description || '', phone: company?.phone || '' });
  useEffect(() => { setValues({ name: company?.name || '', description: company?.description || '', phone: company?.phone || '' }); }, [company?.id, company?.name, company?.description, company?.phone]);
  return <DashboardLayout title="Профиль компании" eyebrow="КАБИНЕТ КОМПАНИИ" description="Эти сведения увидят клиенты в карточке вашего предложения.">
    <div className="profile-edit-layout"><form className="form-card profile-form" onSubmit={(e) => { e.preventDefault(); onSave(values); }}><div className="form-section-head"><span className="section-icon">01</span><div><h3>Информация о компании</h3><p>Название и телефон обязательны для публикации.</p></div></div><div className="form-grid"><Field label="Название компании" wide><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required /></Field><Field label="Телефон компании" wide><input value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} required placeholder="+7 (900) 000-00-00" /></Field><Field label="Описание компании" wide><textarea rows="6" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Расскажите о вашей команде и подходе к уборке" /></Field></div><div className="profile-form-footer"><button className="btn btn-primary" type="submit">Сохранить изменения</button><StatusBadge status={company?.isActive ? 'accepted' : 'new'} /></div></form><aside className="profile-status-card"><div className="profile-status-illustration">✦</div><div className="eyebrow">СТАТУС ПРОФИЛЯ</div><h3>{company?.isActive ? 'Компания опубликована' : 'Ожидает включения'}</h3><p>{company?.isActive ? 'Ваши активные услуги доступны в каталоге. Новые клиенты могут отправлять заявки.' : 'После заполнения названия и телефона администратор сможет включить компанию. До этого услуги не показываются клиентам.'}</p><div className="status-check"><span className={values.name.trim() ? 'check done' : 'check'}>{values.name.trim() ? '✓' : '1'}</span><span>Название компании</span></div><div className="status-check"><span className={values.phone.trim() ? 'check done' : 'check'}>{values.phone.trim() ? '✓' : '2'}</span><span>Контактный телефон</span></div><div className="status-check"><span className={company?.isActive ? 'check done' : 'check'}>{company?.isActive ? '✓' : '3'}</span><span>Включение администратором</span></div></aside></div>
  </DashboardLayout>;
}

function AdminCompanies({ db, onToggle }) {
  const [query, setQuery] = useState('');
  const companies = db.companies.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(query.toLowerCase()));
  return <DashboardLayout title="Компании" eyebrow="АДМИНИСТРАТОР" description="Включайте подготовленные компании и скрывайте профили, которые больше не должны принимать новые заявки.">
    <div className="dashboard-stats"><Stat label="Всего компаний" value={db.companies.length} tint="mint" /><Stat label="Активные" value={db.companies.filter((item) => item.isActive).length} tint="blue" /><Stat label="Ожидают включения" value={db.companies.filter((item) => !item.isActive).length} tint="sand" /></div>
    <div className="table-toolbar"><div className="search-input"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск компании" /></div><span>{companies.length} записей</span></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Компания</th><th>Телефон</th><th>Услуги</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{companies.map((company) => { const owner = db.users.find((item) => item.id === company.ownerId); const count = db.services.filter((item) => item.companyId === company.id && !item.isDeleted).length; return <tr key={company.id}><td><div className="table-company"><span className="company-avatar">{company.name.slice(0, 1)}</span><div><b>{company.name}</b><small>{company.description || 'Описание не заполнено'}</small></div></div></td><td>{company.phone || 'Не указан'}</td><td>{count}</td><td><StatusBadge status={company.isActive ? 'accepted' : 'new'} /></td><td><button className={company.isActive ? 'btn btn-danger-soft btn-small' : 'btn btn-primary btn-small'} onClick={() => onToggle(company.id)}>{company.isActive ? 'Отключить' : 'Включить'}</button></td></tr>; })}</tbody></table>{!companies.length && <div className="table-empty">Компании не найдены.</div>}</div>
  </DashboardLayout>;
}

function AdminContent({ db, onDeleteService, onDeleteReview }) {
  const [tab, setTab] = useState('services');
  const services = db.services.filter((item) => !item.isDeleted);
  const reviews = db.reviews.filter((item) => !item.isDeleted);
  return <DashboardLayout title="Управление контентом" eyebrow="АДМИНИСТРАТОР" description="Удаляйте неподходящие услуги и отзывы. Связанные заказы и их сохранённые параметры не меняются.">
    <div className="segmented-tabs"><button className={tab === 'services' ? 'selected' : ''} onClick={() => setTab('services')}>Услуги <b>{services.length}</b></button><button className={tab === 'reviews' ? 'selected' : ''} onClick={() => setTab('reviews')}>Отзывы <b>{reviews.length}</b></button></div>
    {tab === 'services' ? <div className="admin-content-list">{services.map((service) => { const company = db.companies.find((item) => item.id === service.companyId); return <article className="admin-content-row" key={service.id}><div className="managed-service-icon mint">✦</div><div className="admin-content-main"><b>{service.name}</b><small>{company?.name || 'Компания'} · {TYPE_LABELS[service.type]} · {formatMoney(service.ratePerM2)} / м²</small><p>{service.description}</p></div><button className="btn btn-danger-soft btn-small" onClick={() => onDeleteService(service.id)}>Удалить</button></article>; })}{!services.length && <div className="empty-inline">Активных услуг нет.</div>}</div> : <div className="admin-content-list">{reviews.map((review) => { const company = db.companies.find((item) => item.id === review.companyId); const client = db.users.find((item) => item.id === review.clientId); return <article className="admin-content-row" key={review.id}><div className="review-score-mini">★ {review.rating}</div><div className="admin-content-main"><b>{company?.name || 'Компания'} · {client?.name || 'Клиент'}</b><small>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</small><p>{review.text || 'Оценка без комментария.'}</p></div><button className="btn btn-danger-soft btn-small" onClick={() => onDeleteReview(review.id)}>Удалить</button></article>; })}{!reviews.length && <div className="empty-inline">Опубликованных отзывов пока нет.</div>}</div>}
  </DashboardLayout>;
}

function DashboardLayout({ title, eyebrow, description, action, aside, children }) {
  return <div className="dashboard-page"><div className="dashboard-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>{aside && <div className="dashboard-aside-row">{aside}</div>}{children}</div>;
}

function Stat({ label, value, tint }) {
  return <div className="stat-card"><span className={`stat-icon ${tint}`}>✦</span><small>{label}</small><strong>{value}</strong></div>;
}

function ReviewModal({ order, onClose, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  return <Modal onClose={onClose}><div className="modal-head"><div><div className="eyebrow">ОТЗЫВ О ЗАКАЗЕ</div><h2>Как прошла уборка?</h2><p>{order.serviceName}</p></div><button className="modal-close" onClick={onClose}>×</button></div><div className="rating-picker">{[1,2,3,4,5].map((score) => <button key={score} className={score <= rating ? 'active' : ''} onClick={() => setRating(score)} aria-label={`${score} из 5`}>★</button>)}</div><label className="form-field"><span>Комментарий <small>необязательно</small></span><textarea rows="4" maxLength="500" value={text} onChange={(e) => setText(e.target.value)} placeholder="Расскажите о качестве уборки" /></label><div className="modal-foot"><span>{text.length}/500</span><button className="btn btn-primary" onClick={() => onSubmit(order.id, rating, text)}>Опубликовать отзыв</button></div></Modal>;
}

function RejectModal({ order, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return <Modal onClose={onClose}><div className="modal-head"><div><div className="eyebrow">ОТКАЗ ОТ ЗАЯВКИ</div><h2>Укажите причину</h2><p>Клиент увидит это сообщение в карточке заказа.</p></div><button className="modal-close" onClick={onClose}>×</button></div><label className="form-field"><span>Причина отказа</span><textarea rows="4" maxLength="300" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: нет свободной бригады на выбранное время" /></label><div className="modal-foot"><span>{reason.length}/300</span><button className="btn btn-danger" onClick={() => onSubmit(order.id, reason)} disabled={!reason.trim()}>Отклонить заявку</button></div></Modal>;
}

function ServiceModal({ service, onClose, onSave }) {
  const [values, setValues] = useState({ name: service?.name || '', type: service?.type || 'maintenance', description: service?.description || '', ratePerM2: service?.ratePerM2 ?? 50 });
  return <Modal onClose={onClose}><div className="modal-head"><div><div className="eyebrow">УСЛУГИ КОМПАНИИ</div><h2>{service ? 'Изменить услугу' : 'Новая услуга'}</h2><p>Тариф указывается за один квадратный метр.</p></div><button className="modal-close" onClick={onClose}>×</button></div><form onSubmit={(e) => { e.preventDefault(); onSave(values, service?.id || null); }} className="modal-form"><Field label="Название услуги"><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required placeholder="Например, Поддерживающая уборка" /></Field><Field label="Тип уборки"><select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option value="maintenance">Поддерживающая уборка</option><option value="general">Генеральная уборка</option></select></Field><Field label="Состав работ"><textarea rows="4" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} required placeholder="Перечислите работы, которые входят в услугу" /></Field><Field label="Тариф, ₽ за м²"><input type="number" min="0.01" step="0.01" value={values.ratePerM2} onChange={(e) => setValues({ ...values, ratePerM2: e.target.value })} required /></Field><div className="modal-foot"><span>Старые заказы сохранят прежнюю цену.</span><button className="btn btn-primary" type="submit">{service ? 'Сохранить' : 'Добавить услугу'}</button></div></form></Modal>;
}

function Modal({ children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-card">{children}</div></div>;
}

function AccessMessage({ title, onClick, buttonText = 'Войти в аккаунт' }) {
  return <div className="access-message"><div className="empty-icon">⌁</div><h2>{title}</h2><p>Для продолжения откройте нужный раздел или войдите под соответствующей ролью.</p><button className="btn btn-primary" onClick={onClick}>{buttonText} <span>↗</span></button></div>;
}

function Footer({ onReset }) {
  return <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><div className="brand"><span className="brand-mark">ч</span><span>чисто<span className="brand-period">.</span></span></div><p>Маркетплейс клининговых услуг.<br />Выбирайте уборку и отправляйте заявку напрямую компании.</p></div><div className="footer-links"><span>ПРОЕКТ</span><small>Учебный MVP</small><small>Один город</small><small>Две категории уборки</small></div><div className="footer-links"><span>ВАЖНО</span><small>Без онлайн-оплаты</small><small>Без календаря слотов</small><small>Подтверждение вручную</small></div><button className="footer-reset" onClick={onReset}>Сбросить демо-данные ↻</button></div><div className="footer-bottom"><span>© 2026 Чисто · Учебный проект</span><span>Сделано для демонстрации MVP</span></div></footer>;
}

export default App;

// Small navigation events are used by empty states and company cards to keep this demo router dependency-free.
if (typeof window !== 'undefined') {
  window.addEventListener('chisto-go-catalog', () => window.dispatchEvent(new CustomEvent('chisto-app-nav', { detail: 'catalog' })));
}
