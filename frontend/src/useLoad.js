import { useEffect, useState } from 'react';

export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loader()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: '' }); })
      .catch((err) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
```

## 4. `cleaning-frontend\frontend\src\App.jsx` (заменить весь файл)

```jsx
import { useEffect, useState } from 'react';
import {
  TYPE_LABELS, STATUS_LABELS, STATUS_HINTS,
  formatMoney, todayDate, tomorrowDate, localDateTimeIsFuture,
} from './data.js';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { useLoad } from './useLoad.js';

function Loading({ error }) {
  return <div className="empty-state"><div className="empty-icon">{error ? '!' : '…'}</div><h3>{error || 'Загрузка…'}</h3></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => !getToken());
  const [page, setPage] = useState('catalog');
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [pendingServiceId, setPendingServiceId] = useState(null);
  const [version, setVersion] = useState(0);

  const refresh = () => setVersion((v) => v + 1);
  const notify = (message) => setToast(message);

  // восстановление сессии по токену
  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then((account) => {
        setUser(account);
        if (account.role === 'company') setPage('partner-orders');
        else if (account.role === 'admin') setPage('admin-companies');
      })
      .catch((e) => { if (e.status !== 401) setToast(e.message); })
      .finally(() => setAuthReady(true));
  }, []);

  // токен протух / недействителен
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setPage('login');
      setToast('Сессия истекла. Войдите снова.');
    });
  }, []);

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

  // универсальная обёртка: выполнить запрос, показать сообщение, обновить данные
  const run = async (fn, successMessage) => {
    try {
      await fn();
      if (successMessage) notify(successMessage);
      refresh();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  };

  const goToRoleHome = (account) => {
    if (account.role === 'company') setPage('partner-orders');
    else if (account.role === 'admin') setPage('admin-companies');
    else setPage('client-orders');
  };

  const login = async (email, password) => {
    try {
      const data = await api.login(email.trim(), password);
      setToken(data.accessToken);
      setUser(data.user);
      if (pendingServiceId && data.user.role === 'client') {
        setSelectedServiceId(pendingServiceId);
        setPendingServiceId(null);
        setPage('checkout');
      } else {
        goToRoleHome(data.user);
      }
      notify(`Вы вошли как ${data.user.name}`);
      refresh();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPage('catalog');
    setSelectedServiceId(null);
    notify('Вы вышли из аккаунта');
  };

  const register = async (values) => {
    const email = values.email.trim().toLowerCase();
    if (!values.name.trim() || !email || values.password.length < 8) {
      notify('Заполните имя и email. Пароль должен содержать минимум 8 символов.');
      return false;
    }
    if (values.role === 'company' && !values.companyName.trim()) {
      notify('Укажите название клининговой компании.');
      return false;
    }
    try {
      const data = await api.register({
        name: values.name.trim(),
        email,
        password: values.password,
        role: values.role,
        companyName: values.role === 'company' ? values.companyName.trim() : null,
      });
      setToken(data.accessToken);
      setUser(data.user);
      setPage(values.role === 'company' ? 'partner-profile' : 'client-orders');
      notify(values.role === 'company'
        ? 'Аккаунт создан. Заполните профиль: компания появится в каталоге после включения администратором.'
        : 'Аккаунт клиента создан. Теперь можно оформить заказ.');
      refresh();
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  };

  const startOrder = (serviceId) => {
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

  const createOrder = async (values) => {
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
    try {
      const order = await api.createOrder({
        serviceId: selectedServiceId,
        area,
        date: values.date,
        time: values.time,
        address: values.address.trim(),
        phone: values.phone.trim(),
        comment: values.comment.trim(),
      });
      setPage('client-orders');
      setSelectedServiceId(null);
      refresh();
      notify(`Заявка отправлена. Итоговая стоимость: ${formatMoney(order.totalPrice)}.`);
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  };

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Отменить эту заявку? Компания увидит новый статус.')) return;
    await run(() => api.cancelOrder(orderId), 'Заявка отменена.');
  };

  const acceptOrder = (orderId) =>
    run(() => api.acceptOrder(orderId), 'Заказ принят. Клиент увидит новый статус.');

  const rejectOrder = async (orderId, reason) => {
    if (!reason.trim()) return notify('Укажите причину отказа.');
    const ok = await run(() => api.rejectOrder(orderId, reason.trim()), 'Заявка отклонена. Причина будет видна клиенту.');
    if (ok) setModal(null);
  };

  const completeOrder = async (orderId) => {
    if (!window.confirm('Подтвердить, что уборка выполнена? Клиент сможет оставить отзыв.')) return;
    await run(() => api.completeOrder(orderId), 'Заказ отмечен как выполненный.');
  };

  const submitReview = async (orderId, rating, text) => {
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5 || text.length > 500) {
      return notify('Оценка должна быть от 1 до 5, текст — не более 500 символов.');
    }
    const ok = await run(() => api.leaveReview(orderId, { rating: score, text: text.trim() }),
      'Спасибо! Отзыв опубликован, рейтинг компании пересчитан.');
    if (ok) setModal(null);
  };

  const saveCompanyProfile = async (values) => {
    if (!values.name.trim() || !values.phone.trim()) return notify('Название компании и телефон обязательны.');
    await run(() => api.updateProfile({
      name: values.name.trim(), phone: values.phone.trim(), description: values.description.trim(),
    }), 'Профиль компании сохранён.');
  };

  const saveService = async (values, serviceId = null) => {
    const rate = Number(values.ratePerM2);
    if (!values.name.trim() || !values.description.trim() || !['maintenance', 'general'].includes(values.type) || !Number.isFinite(rate) || rate <= 0) {
      return notify('Заполните название, тип, описание и укажите положительный тариф за м².');
    }
    const payload = { name: values.name.trim(), type: values.type, description: values.description.trim(), ratePerM2: rate };
    const ok = await run(
      () => (serviceId ? api.updateService(serviceId, payload) : api.createService(payload)),
      serviceId
        ? 'Услуга обновлена. Уже созданные заказы не изменились.'
        : 'Услуга добавлена. Она видна в каталоге, если компания включена администратором.',
    );
    if (ok) setModal(null);
  };

  const deleteOwnService = async (serviceId) => {
    if (!window.confirm('Удалить услугу? Она исчезнет из каталога, но старые заказы сохранят свои данные.')) return;
    await run(() => api.deleteService(serviceId), 'Услуга удалена из каталога. История заказов сохранена.');
  };

  const toggleCompany = async (company) => {
    const nextState = !company.isActive;
    if (!window.confirm(nextState
      ? `Включить компанию «${company.name}» и показать её услуги в каталоге?`
      : `Отключить компанию «${company.name}»? Новые заказы станут недоступны, история сохранится.`)) return;
    await run(() => api.toggleCompany(company.id),
      nextState ? 'Компания включена и доступна в каталоге.' : 'Компания отключена. Старые заказы сохранены.');
  };

  const adminDeleteService = async (serviceId) => {
    if (!window.confirm('Удалить эту услугу из публичного каталога? Сведения в старых заказах сохранятся.')) return;
    await run(() => api.adminDeleteService(serviceId), 'Услуга удалена из каталога.');
  };

  const adminDeleteReview = async (reviewId) => {
    if (!window.confirm('Удалить отзыв? Рейтинг компании будет пересчитан.')) return;
    await run(() => api.adminDeleteReview(reviewId), 'Отзыв удалён, рейтинг обновлён.');
  };

  const common = { user, notify, setPage, setModal, version };

  if (!authReady) {
    return <div className="app-shell"><main className="main-wrap"><Loading /></main></div>;
  }

  return (
    <div className="app-shell">
      <Header user={user} page={page} setPage={setPage} logout={logout} />
      <main className="main-wrap">
        {page === 'catalog' && <Catalog {...common} onOpenService={(id) => { setSelectedServiceId(id); setPage('company'); }} />}
        {page === 'company' && <CompanyDetails {...common} serviceId={selectedServiceId} onOrder={startOrder} />}
        {page === 'checkout' && selectedServiceId && user?.role === 'client' && <Checkout {...common} serviceId={selectedServiceId} onSubmit={createOrder} />}
        {page === 'checkout' && (!selectedServiceId || user?.role !== 'client') && <AccessMessage title="Для оформления заказа войдите как клиент" onClick={() => setPage('login')} />}
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
      <Footer />
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


function Catalog({ onOpenService, version }) {
  const [type, setType] = useState('all');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [sort, setSort] = useState('asc');
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState({ type, minRate, maxRate, sort, q: query });

  // небольшая задержка, чтобы не слать запрос на каждую букву
  useEffect(() => {
    const t = setTimeout(() => setApplied({ type, minRate, maxRate, sort, q: query }), 300);
    return () => clearTimeout(t);
  }, [type, minRate, maxRate, sort, query]);

  const { data, error } = useLoad(() => api.catalog(applied), [applied, version]);
  const items = data || [];

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
          {!data ? <Loading error={error} /> : items.length ? <div className="service-grid">{items.map((item) => <ServiceCard key={item.id} item={item} onOpen={() => onOpenService(item.id)} />)}</div> : <div className="empty-state"><div className="empty-icon">⌕</div><h3>Ничего не нашлось</h3><p>Попробуйте изменить тип уборки или диапазон тарифа.</p><button className="btn btn-secondary" onClick={() => { setType('all'); setMinRate(''); setMaxRate(''); setSort('asc'); setQuery(''); }}>Сбросить фильтры</button></div>}
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
    <div className="service-card-body"><div className="company-line"><span className="company-avatar">{item.companyName.slice(0, 1)}</span><span>{item.companyName}</span><span className="verified-dot" title="Компания активна">✓</span></div><h3>{item.name}</h3><p>{item.description}</p><div className="service-card-bottom"><div><strong>{formatMoney(item.ratePerM2)}</strong><small>за м²</small></div><button className="btn btn-primary btn-card" onClick={onOpen}>Подробнее <span>↗</span></button></div></div>
  </article>;
}


function Step({ number, title, text }) {
  return <article className="step-card"><span className="step-number">{number}</span><div className="step-mark">✦</div><h3>{title}</h3><p>{text}</p></article>;
}


function CompanyDetails({ serviceId, onOrder, setPage, version }) {
  const { data, error } = useLoad(async () => {
    if (!serviceId) throw new Error('Предложение недоступно');
    const service = await api.service(serviceId);
    const company = await api.company(service.companyId);
    return { service, company };
  }, [serviceId, version]);

  if (!data) {
    return error
      ? <AccessMessage title={error} onClick={() => setPage('catalog')} buttonText="Вернуться в каталог" />
      : <Loading />;
  }
  const { service, company } = data;
  const rating = company.rating;
  const reviews = company.reviews;
  const companyServices = company.services;

  return <div className="detail-page">
    <button className="back-link" onClick={() => setPage('catalog')}>← Назад в каталог</button>
    <section className="company-hero-card"><div className="company-emblem">{company.name.slice(0, 1)}</div><div className="company-info"><div className="eyebrow"><span className="eyebrow-dot" /> АКТИВНАЯ КОМПАНИЯ</div><h1>{company.name}</h1><div className="company-meta"><span>{rating ? `★ ${rating}` : 'Нет отзывов'}</span><span>•</span><span>{reviews.length} отзывов</span><span>•</span><span>{company.phone}</span></div><p>{company.description || 'Компания пока не добавила описание.'}</p></div><div className="company-contact"><span>Телефон компании</span><b>{company.phone}</b><small>Связь по деталям заказа — напрямую с исполнителем.</small></div></section>
    <div className="detail-columns"><section className="detail-main"><div className="section-heading compact"><div><div className="eyebrow">ПРЕДЛОЖЕНИЕ</div><h2>{service.name}</h2></div><span className="type-badge">{TYPE_LABELS[service.type]}</span></div><div className="work-card"><h3>Что входит в уборку</h3><p>{service.description}</p><div className="work-price"><div><strong>{formatMoney(service.ratePerM2)}</strong><span>за 1 м²</span></div><button className="btn btn-primary" onClick={() => onOrder(service.id)}>Заказать эту услугу <span>↗</span></button></div></div><div className="section-heading compact review-heading"><div><div className="eyebrow">ОПЫТ КЛИЕНТОВ</div><h2>Отзывы</h2></div><div className="review-score">{rating ? `★ ${rating}` : 'Нет отзывов'}</div></div>{reviews.length ? <div className="reviews-list">{reviews.map((review) => <article className="review-card" key={review.id}><div className="review-top"><span className="avatar">{(review.clientName || 'К').slice(0, 1)}</span><div><b>{review.clientName || 'Клиент'}</b><small>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</small></div><span className="review-stars">{'★'.repeat(review.rating)}<i>{'★'.repeat(5 - review.rating)}</i></span></div><p>{review.text || 'Клиент оставил оценку без комментария.'}</p></article>)}</div> : <div className="empty-inline"><span>✧</span><div><b>Нет отзывов</b><small>Отзывы появятся после выполнения заказов.</small></div></div>}</section>
      <aside className="detail-aside"><div className="aside-card"><div className="eyebrow">ДРУГИЕ УСЛУГИ</div>{companyServices.map((item) => <button key={item.id} className={item.id === service.id ? 'other-service active' : 'other-service'} onClick={() => { if (item.id !== service.id) window.dispatchEvent(new CustomEvent('chisto-open-service', { detail: item.id })); }}><span>{item.name}</span><b>{formatMoney(item.ratePerM2)}<small>/м²</small></b></button>)}</div><div className="aside-note"><span>i</span><p>Дата и время в заявке — ваше пожелание. Компания вручную проверит возможность уборки и подтвердит или отклонит заявку.</p></div></aside></div>
  </div>;
}


function Checkout({ serviceId, onSubmit, setPage, version }) {
  const { data: service, error } = useLoad(() => api.service(serviceId), [serviceId, version]);
  if (!service) return <Loading error={error} />;
  return <CheckoutForm service={service} onSubmit={onSubmit} setPage={setPage} />;
}


function CheckoutForm({ service, onSubmit, setPage }) {
  const company = { name: service.companyName };
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
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const ok = await (isLogin ? onLogin(values.email, values.password) : onRegister(values));
    if (ok === false) setError(isLogin ? 'Не удалось войти. Проверьте данные.' : 'Проверьте заполнение формы.');
  };
  return <div className="auth-layout"><div className="auth-story"><div className="eyebrow"><span className="eyebrow-dot" /> ЧИСТО · МАРКЕТПЛЕЙС КЛИНИНГА</div><h1>{isLogin ? 'Рады снова вас видеть.' : 'Начнём с чистого листа.'}</h1><p>{isLogin ? 'Войдите в свой кабинет, чтобы управлять заявками или посмотреть историю уборок.' : 'Создайте аккаунт клиента или представителя компании. Регистрация компании создаёт неактивный профиль, который включает администратор.'}</p><div className="auth-stamp"><span>✦</span><div><b>Простой путь к чистоте</b><small>Выбор · заявка · результат</small></div></div></div><div className="auth-card"><div className="auth-card-head"><span className="brand-mark">ч</span><div><h2>{isLogin ? 'Вход в аккаунт' : 'Регистрация'}</h2><p>{isLogin ? 'Введите email и пароль' : 'Заполните данные для создания аккаунта'}</p></div></div><form onSubmit={submit} className="auth-form">{!isLogin && <><Field label="Ваше имя"><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Как к вам обращаться" required /></Field><Field label="Кто вы?"><select value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value })}><option value="client">Клиент</option><option value="company">Представитель компании</option></select></Field>{values.role === 'company' && <Field label="Название компании"><input value={values.companyName} onChange={(e) => setValues({ ...values, companyName: e.target.value })} placeholder="Например, КлинДом" required /></Field>}</>}<Field label="Email"><input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="name@example.ru" required /></Field><Field label="Пароль"><input type="password" minLength="8" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder={isLogin ? 'Введите пароль' : 'Не менее 8 символов'} required /></Field>{error && <div className="inline-error">{error}</div>}<button className="btn btn-primary btn-full btn-large" type="submit">{isLogin ? 'Войти' : 'Создать аккаунт'} <span>↗</span></button></form>{isLogin && <div className="demo-logins"><span>Быстрый вход для проверки</span><div><button onClick={() => fillDemo('client@demo.ru')}>Клиент</button><button onClick={() => fillDemo('partner@demo.ru')}>Компания</button><button onClick={() => fillDemo('admin@demo.ru')}>Админ</button></div><small>Пароль для всех: <b>demo1234</b></small></div>}<div className="auth-switch">{isLogin ? <>Нет аккаунта? <button onClick={onRegister}>Зарегистрироваться</button></> : <>Уже есть аккаунт? <button onClick={onLogin}>Войти</button></>}</div></div></div>;
}


function ClientOrders({ onCancel, onReview, version }) {
  const { data: orders, error } = useLoad(() => api.myOrders(), [version]);
  return <DashboardLayout title="Мои заказы" eyebrow="КАБИНЕТ КЛИЕНТА" description="Заявки и актуальные статусы уборок." aside={<div className="dashboard-aside-note"><span>i</span><p>Если компания уже приняла заказ, изменение планов нужно согласовать с ней по телефону.</p></div>}>
    {!orders ? <Loading error={error} />
      : orders.length ? <div className="orders-list">{orders.map((order) => <OrderCard key={order.id} order={order} company={{ name: order.companyName }} actions={<ClientOrderActions order={order} onCancel={onCancel} onReview={onReview} />} />)}</div>
      : <div className="empty-state large-empty"><div className="empty-icon">▤</div><h3>Заказов пока нет</h3><p>Когда вы отправите заявку на уборку, она появится здесь.</p><button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('chisto-go-catalog'))}>Перейти в каталог <span>↗</span></button></div>}
  </DashboardLayout>;
}


function ClientOrderActions({ order, onCancel, onReview }) {
  const reviewExists = order.hasReview;
  return <div className="order-actions">{order.status === 'new' && <button className="btn btn-danger-soft" onClick={() => onCancel(order.id)}>Отменить заявку</button>}{order.status === 'completed' && !reviewExists && <button className="btn btn-primary" onClick={() => onReview(order)}>Оставить отзыв <span>↗</span></button>}{order.status === 'completed' && reviewExists && <span className="review-sent">✓ Отзыв отправлен</span>}</div>;
}


function OrderCard({ order, company, actions }) {
  return <article className="order-card"><div className="order-card-head"><div><span className="order-id">ЗАЯВКА #{String(order.id).padStart(4, '0')}</span><h3>{order.serviceName}</h3><p>{company?.name || 'Компания'} · {TYPE_LABELS[order.serviceType]}</p></div><StatusBadge status={order.status} /></div><div className="order-details-grid"><div><small>Дата и время</small><b>{new Date(`${order.date}T${order.time}`).toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}, {order.time}</b></div><div><small>Площадь</small><b>{order.area} м²</b></div><div><small>Стоимость</small><b>{formatMoney(order.totalPrice)}</b></div><div><small>Адрес</small><b>{order.address}</b></div><div><small>Телефон</small><b>{order.phone}</b></div></div>{order.status === 'rejected' && <div className="rejection-reason"><b>Причина отказа:</b> {order.rejectReason}</div>}{order.comment && <div className="order-comment"><b>Комментарий клиента:</b> {order.comment}</div>}<div className="order-status-hint">{STATUS_HINTS[order.status]}</div>{actions && <div className="order-card-footer">{actions}</div>}</article>;
}


function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}><i />{STATUS_LABELS[status]}</span>;
}


function PartnerOrders({ onAccept, onReject, onComplete, version }) {
  const { data, error } = useLoad(async () => {
    const [company, orders] = await Promise.all([api.partnerProfile(), api.partnerOrders()]);
    return { company, orders };
  }, [version]);
  if (!data) return <DashboardLayout title="Заявки клиентов" eyebrow="КАБИНЕТ КОМПАНИИ" description=""><Loading error={error} /></DashboardLayout>;
  const { company } = data;
  const priority = { new: 0, accepted: 1, completed: 2, rejected: 3, cancelled: 4 };
  const orders = [...data.orders].sort((a, b) => priority[a.status] - priority[b.status] || new Date(b.createdAt) - new Date(a.createdAt));
  return <DashboardLayout title="Заявки клиентов" eyebrow="КАБИНЕТ КОМПАНИИ" description={company?.isActive ? 'Проверяйте новые заявки, принимайте решение и отмечайте выполнение.' : 'Профиль компании пока не опубликован. Заполните сведения и дождитесь включения администратором.'}>
    {!company?.isActive && <div className="notice-banner warning"><span>!</span><div><b>Компания неактивна</b><p>Вы можете заполнить профиль и подготовить услуги. Клиенты не увидят предложения, пока администратор не включит компанию.</p></div></div>}
    <div className="dashboard-stats"><Stat label="Новые заявки" value={orders.filter((item) => item.status === 'new').length} tint="mint" /><Stat label="В работе" value={orders.filter((item) => item.status === 'accepted').length} tint="blue" /><Stat label="Завершено" value={orders.filter((item) => item.status === 'completed').length} tint="sand" /></div>
    {orders.length ? <div className="orders-list">{orders.map((order) => <OrderCard key={order.id} order={order} company={company} actions={<div className="order-actions">{order.status === 'new' && <><button className="btn btn-primary" onClick={() => onAccept(order.id)}>Принять</button><button className="btn btn-danger-soft" onClick={() => onReject(order)}>Отклонить</button></>}{order.status === 'accepted' && <button className="btn btn-primary" onClick={() => onComplete(order.id)}>Отметить выполненным</button>}</div>} />)}</div> : <div className="empty-state large-empty"><div className="empty-icon">▤</div><h3>Новых заявок пока нет</h3><p>Когда клиент выберет вашу услугу и отправит заявку, она появится здесь.</p><button className="btn btn-secondary" onClick={() => window.dispatchEvent(new CustomEvent('chisto-go-profile'))}>Проверить профиль компании</button></div>}
  </DashboardLayout>;
}


function PartnerServices({ onAdd, onEdit, onDelete, version }) {
  const { data, error } = useLoad(async () => {
    const [company, services] = await Promise.all([api.partnerProfile(), api.partnerServices()]);
    return { company, services };
  }, [version]);
  if (!data) return <DashboardLayout title="Услуги компании" eyebrow="КАБИНЕТ КОМПАНИИ" description=""><Loading error={error} /></DashboardLayout>;
  const { company, services } = data;
  return <DashboardLayout title="Услуги компании" eyebrow="КАБИНЕТ КОМПАНИИ" description="Добавляйте предложения, указывайте состав работ и тариф за квадратный метр." action={<button className="btn btn-primary" onClick={onAdd}>＋ Добавить услугу</button>}>
    {!company?.isActive && <div className="notice-banner warning"><span>!</span><div><b>Компания ещё не включена</b><p>Сохранённые услуги появятся в публичном каталоге после включения профиля администратором.</p></div></div>}
    {services.length ? <div className="managed-services">{services.map((service) => <article className="managed-service" key={service.id}><div className={`managed-service-icon ${service.type === 'general' ? 'lavender' : 'mint'}`}>✦</div><div className="managed-service-info"><div className="eyebrow">{TYPE_LABELS[service.type]}</div><h3>{service.name}</h3><p>{service.description}</p></div><div className="managed-service-rate"><b>{formatMoney(service.ratePerM2)}</b><small>за м²</small></div><div className="managed-service-actions"><button className="btn btn-secondary btn-small" onClick={() => onEdit(service)}>Изменить</button><button className="icon-button danger-icon" onClick={() => onDelete(service.id)} title="Удалить услугу">×</button></div></article>)}</div> : <div className="empty-state large-empty"><div className="empty-icon">✦</div><h3>Пока нет услуг</h3><p>Добавьте первую услугу, чтобы подготовить предложение для каталога.</p><button className="btn btn-primary" onClick={onAdd}>Добавить услугу</button></div>}
  </DashboardLayout>;
}


function PartnerProfile({ onSave, version }) {
  const { data: company, error } = useLoad(() => api.partnerProfile(), [version]);
  const [values, setValues] = useState({ name: '', description: '', phone: '' });
  useEffect(() => {
    if (company) setValues({ name: company.name || '', description: company.description || '', phone: company.phone || '' });
  }, [company?.id, company?.name, company?.description, company?.phone]);
  if (!company) return <DashboardLayout title="Профиль компании" eyebrow="КАБИНЕТ КОМПАНИИ" description=""><Loading error={error} /></DashboardLayout>;
  return <DashboardLayout title="Профиль компании" eyebrow="КАБИНЕТ КОМПАНИИ" description="Эти сведения увидят клиенты в карточке вашего предложения.">
    <div className="profile-edit-layout"><form className="form-card profile-form" onSubmit={(e) => { e.preventDefault(); onSave(values); }}><div className="form-section-head"><span className="section-icon">01</span><div><h3>Информация о компании</h3><p>Название и телефон обязательны для публикации.</p></div></div><div className="form-grid"><Field label="Название компании" wide><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required /></Field><Field label="Телефон компании" wide><input value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} required placeholder="+7 (900) 000-00-00" /></Field><Field label="Описание компании" wide><textarea rows="6" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Расскажите о вашей команде и подходе к уборке" /></Field></div><div className="profile-form-footer"><button className="btn btn-primary" type="submit">Сохранить изменения</button><StatusBadge status={company?.isActive ? 'accepted' : 'new'} /></div></form><aside className="profile-status-card"><div className="profile-status-illustration">✦</div><div className="eyebrow">СТАТУС ПРОФИЛЯ</div><h3>{company?.isActive ? 'Компания опубликована' : 'Ожидает включения'}</h3><p>{company?.isActive ? 'Ваши активные услуги доступны в каталоге. Новые клиенты могут отправлять заявки.' : 'После заполнения названия и телефона администратор сможет включить компанию. До этого услуги не показываются клиентам.'}</p><div className="status-check"><span className={values.name.trim() ? 'check done' : 'check'}>{values.name.trim() ? '✓' : '1'}</span><span>Название компании</span></div><div className="status-check"><span className={values.phone.trim() ? 'check done' : 'check'}>{values.phone.trim() ? '✓' : '2'}</span><span>Контактный телефон</span></div><div className="status-check"><span className={company?.isActive ? 'check done' : 'check'}>{company?.isActive ? '✓' : '3'}</span><span>Включение администратором</span></div></aside></div>
  </DashboardLayout>;
}


function AdminCompanies({ onToggle, version }) {
  const [query, setQuery] = useState('');
  const { data, error } = useLoad(() => api.adminCompanies(), [version]);
  const all = data || [];
  const companies = all.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(query.toLowerCase()));
  return <DashboardLayout title="Компании" eyebrow="АДМИНИСТРАТОР" description="Включайте подготовленные компании и скрывайте профили, которые больше не должны принимать новые заявки.">
    {!data ? <Loading error={error} /> : <>
      <div className="dashboard-stats"><Stat label="Всего компаний" value={all.length} tint="mint" /><Stat label="Активные" value={all.filter((item) => item.isActive).length} tint="blue" /><Stat label="Ожидают включения" value={all.filter((item) => !item.isActive).length} tint="sand" /></div>
      <div className="table-toolbar"><div className="search-input"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск компании" /></div><span>{companies.length} записей</span></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Компания</th><th>Телефон</th><th>Услуги</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><div className="table-company"><span className="company-avatar">{company.name.slice(0, 1)}</span><div><b>{company.name}</b><small>{company.ownerEmail ? `${company.ownerEmail} · ` : ''}{company.description || 'Описание не заполнено'}</small></div></div></td><td>{company.phone || 'Не указан'}</td><td>{company.servicesCount}</td><td><StatusBadge status={company.isActive ? 'accepted' : 'new'} /></td><td><button className={company.isActive ? 'btn btn-danger-soft btn-small' : 'btn btn-primary btn-small'} onClick={() => onToggle(company)}>{company.isActive ? 'Отключить' : 'Включить'}</button></td></tr>)}</tbody></table>{!companies.length && <div className="table-empty">Компании не найдены.</div>}</div>
    </>}
  </DashboardLayout>;
}


function AdminContent({ onDeleteService, onDeleteReview, version }) {
  const [tab, setTab] = useState('services');
  const { data, error } = useLoad(async () => {
    const [services, reviews] = await Promise.all([api.adminServices(), api.adminReviews()]);
    return { services, reviews };
  }, [version]);
  if (!data) return <DashboardLayout title="Управление контентом" eyebrow="АДМИНИСТРАТОР" description=""><Loading error={error} /></DashboardLayout>;
  const { services, reviews } = data;
  return <DashboardLayout title="Управление контентом" eyebrow="АДМИНИСТРАТОР" description="Удаляйте неподходящие услуги и отзывы. Связанные заказы и их сохранённые параметры не меняются.">
    <div className="segmented-tabs"><button className={tab === 'services' ? 'selected' : ''} onClick={() => setTab('services')}>Услуги <b>{services.length}</b></button><button className={tab === 'reviews' ? 'selected' : ''} onClick={() => setTab('reviews')}>Отзывы <b>{reviews.length}</b></button></div>
    {tab === 'services' ? <div className="admin-content-list">{services.map((service) => <article className="admin-content-row" key={service.id}><div className="managed-service-icon mint">✦</div><div className="admin-content-main"><b>{service.name}</b><small>{service.companyName} · {TYPE_LABELS[service.type]} · {formatMoney(service.ratePerM2)} / м²</small><p>{service.description}</p></div><button className="btn btn-danger-soft btn-small" onClick={() => onDeleteService(service.id)}>Удалить</button></article>)}{!services.length && <div className="empty-inline">Активных услуг нет.</div>}</div>
    : <div className="admin-content-list">{reviews.map((review) => <article className="admin-content-row" key={review.id}><div className="review-score-mini">★ {review.rating}</div><div className="admin-content-main"><b>{review.companyName || 'Компания'} · {review.clientName || 'Клиент'}</b><small>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</small><p>{review.text || 'Оценка без комментария.'}</p></div><button className="btn btn-danger-soft btn-small" onClick={() => onDeleteReview(review.id)}>Удалить</button></article>)}{!reviews.length && <div className="empty-inline">Опубликованных отзывов пока нет.</div>}</div>}
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


function Footer() {
  return <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><div className="brand"><span className="brand-mark">ч</span><span>чисто<span className="brand-period">.</span></span></div><p>Маркетплейс клининговых услуг.<br />Выбирайте уборку и отправляйте заявку напрямую компании.</p></div><div className="footer-links"><span>ПРОЕКТ</span><small>Учебный MVP</small><small>Один город</small><small>Две категории уборки</small></div><div className="footer-links"><span>ВАЖНО</span><small>Без онлайн-оплаты</small><small>Без календаря слотов</small><small>Подтверждение вручную</small></div></div><div className="footer-bottom"><span>© 2026 Чисто · Учебный проект</span><span>Сделано для демонстрации MVP</span></div></footer>;
}


export default App;


// Small navigation events are used by empty states and company cards to keep this demo router dependency-free.
if (typeof window !== 'undefined') {
  window.addEventListener('chisto-go-catalog', () => window.dispatchEvent(new CustomEvent('chisto-app-nav', { detail: 'catalog' })));
}