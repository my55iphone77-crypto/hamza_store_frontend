import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { AppProvider, useApp } from './app/AppContext';

import Storefront from './Storefront';
import Accounting from './app/Accounting';
import Achievements from './app/Achievements';
import AiBot from './app/AiBot';
import Analytics from './app/Analytics';
import Announcements from './app/Announcements';
import Attendance from './app/Attendance';
import Commissions from './app/Commissions';
import Contacts from './app/Contacts';
import Coupons from './app/Coupons';
import Customers from './app/Customers';
import CustomerService from './app/CustomerService';
import Documents from './app/Documents';
import EmailCenter from './app/EmailCenter';
import EmployeeChat from './app/EmployeeChat';
import Employees from './app/Employees';
import Logs from './app/Logs';
import ManagerMonitor from './app/ManagerMonitor';
import Performance from './app/Performance';
import Products from './app/Products';
import Salaries from './app/Salaries';
import SalesLog from './app/SalesLog';
import Settings from './app/Settings';
import Tasks from './app/Tasks';
import Tickets from './app/Tickets';
import WorkHours from './app/WorkHours';

const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4000/api'
  : 'https://hamza-store-frontend.onrender.com/api';

const GLASS_STYLE = `
  .hz-atmosphere {
    background:
      radial-gradient(ellipse 800px 500px at 10% -5%, rgba(249,115,22,0.38), transparent 55%),
      radial-gradient(ellipse 700px 500px at 95% 0%, rgba(56,189,248,0.35), transparent 55%),
      radial-gradient(ellipse 900px 600px at 50% 105%, rgba(168,85,247,0.30), transparent 55%),
      radial-gradient(ellipse 500px 350px at 25% 55%, rgba(16,185,129,0.20), transparent 60%),
      #05060a;
    min-height: 100vh;
    width: 100%;
    box-sizing: border-box;
  }

  .hz-glass-card {
    --glow: #38bdf8;
    position: relative;
    background:
      radial-gradient(130% 65% at 12% 0%, rgba(255,255,255,0.38), transparent 55%),
      linear-gradient(155deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 55%);
    backdrop-filter: blur(26px) saturate(200%);
    -webkit-backdrop-filter: blur(26px) saturate(200%);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 24px;
    padding: 22px;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.35s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.35s ease, border-color 0.3s ease;
    box-shadow: 0 12px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.3);
  }
  .hz-glass-card::before {
    content: '';
    position: absolute; inset: -50% -50% auto -50%; height: 220%;
    background: linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.16) 50%, transparent 58%);
    transform: translateX(-65%);
    transition: transform 0.7s ease;
    pointer-events: none;
  }
  .hz-glass-card:hover::before { transform: translateX(65%); }
  .hz-glass-card::after {
    content: '';
    position: absolute; left: 10%; right: 10%; bottom: -26px; height: 26px;
    background: radial-gradient(ellipse at center, var(--glow), transparent 72%);
    filter: blur(14px);
    opacity: 0.5;
    border-radius: 50%;
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: none;
  }
  .hz-glass-card:hover {
    transform: translateY(-10px) scale(1.015);
    border-color: var(--glow);
    box-shadow: 0 30px 60px rgba(0,0,0,0.55), 0 0 45px color-mix(in srgb, var(--glow) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.4);
  }
  .hz-glass-card:hover::after { opacity: 0.9; transform: scale(1.3); }
  .hz-glass-card:active { transform: translateY(-5px) scale(0.98); }

  .hz-app-full-container {
    width: 100% !important;
    min-height: calc(100vh - 120px);
    margin: 0 !important;
    border-radius: 20px;
    box-sizing: border-box;
    cursor: default !important;
    overflow: visible !important;
  }

  .hz-glass-icon {
    width: 48px; height: 48px; border-radius: 15px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
    background: linear-gradient(145deg, color-mix(in srgb, var(--glow) 65%, transparent), color-mix(in srgb, var(--glow) 25%, transparent));
    border: 1px solid color-mix(in srgb, var(--glow) 80%, white 15%);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--glow) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.45);
  }

  @keyframes hzPulseDot {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
    70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .hz-unread-dot {
    position: absolute; top: 14px; left: 14px;
    width: 11px; height: 11px; border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 10px rgba(239,68,68,0.8);
    animation: hzPulseDot 1.8s infinite;
  }

  .hz-glass-btn {
    background:
      radial-gradient(120% 100% at 20% 0%, rgba(255,255,255,0.18), transparent 60%),
      rgba(17,24,39,0.5);
    backdrop-filter: blur(22px) saturate(190%);
    -webkit-backdrop-filter: blur(22px) saturate(190%);
    border: 1px solid rgba(255,255,255,0.2);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
    transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .hz-glass-btn:hover {
    transform: translateY(-2px);
    border-color: rgba(255,255,255,0.4);
    box-shadow: 0 10px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25);
  }
`;

function MainContent() {
  const [activeApp, setActiveApp] = useState(null);
  const [showStorefront, setShowStorefront] = useState(true);

  const appContext = useApp();
  const safeContext = appContext && typeof appContext === 'object' ? appContext : {};

  const {
    employees = [], setEmployees = () => {},
    attendance = [], setAttendance = () => {},
    salaries = [], setSalaries = () => {},
    workHours = [], setWorkHours = () => {},
    performance = [], setPerformance = () => {},
    achievements = [], setAchievements = () => {},
    products = [], setProducts = () => {},
    coupons = [], setCoupons = () => {},
    salesLog = [], setSalesLog = () => {},
    accountingTransactions = [], setAccountingTransactions = () => {},
    customers = [], setCustomers = () => {},
    customerService = [], setCustomerService = () => {},
    tickets = [], setTickets = () => {},
    mails = [], setMails = () => {},
    employeeChat = [], setEmployeeChat = () => {},
    announcements = [], setAnnouncements = () => {},
    tasks = [], setTasks = () => {},
    documents = [], setDocuments = () => {},
    logs = [], setLogs = () => {},
    commissions = [], setCommissions = () => {},
    contacts = [], setContacts = () => {},
    currentUser = null,
    setCurrentUser = () => {},
    setToken = () => {},
    setLoginError = () => {},
    socket = null
  } = safeContext;

  // 🔑 OAuth Redirect Handler — يقرأ التوكن من الرابط بعد تسجيل الدخول الاجتماعي
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('authToken');
    const authError = urlParams.get('authError');

    if (authError) {
      setLoginError('فشل تسجيل الدخول عبر ' + authError);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (authToken) {
      localStorage.setItem('hamza_token', authToken);
      localStorage.setItem('token', authToken);
      setToken(authToken);

      axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      .then(res => {
        if (res.data?.success && res.data?.user) {
          setCurrentUser(res.data.user);
          localStorage.setItem('hamza_user', JSON.stringify(res.data.user));
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      })
      .catch(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
  }, [setCurrentUser, setToken, setLoginError]);

  useEffect(() => {
    if (!socket) return;

    const handleUpdateData = (event) => {
      if (!event) return;

      if (event.type === 'PRODUCTS' && Array.isArray(event.payload)) {
        setProducts(event.payload);
      } else if (event.type === 'ORDERS' && Array.isArray(event.payload)) {
        setSalesLog(event.payload);
      } else if (event.type === 'EMPLOYEES' && Array.isArray(event.payload)) {
        setEmployees(event.payload);
      } else if (event.type === 'REFRESH_ALL') {
        if (typeof safeContext.refreshAllData === 'function') {
          safeContext.refreshAllData();
        }
      }
    };

    socket.on('UPDATE_DATA', handleUpdateData);

    return () => {
      socket.off('UPDATE_DATA', handleUpdateData);
    };
  }, [socket, setProducts, setSalesLog, setEmployees, safeContext]);

  const inputStyle = useMemo(() => ({ background: '#0b0f19', color: '#fff', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px' }), []);

  const [sessions, setSessions] = useState([{ id: '1', name: 'الجلسة العامة للتحليل والإدارة' }]);
  const [currentSessionId, setCurrentSessionId] = useState('1');
  const [chatHistories, setChatHistories] = useState({});
  const [aiInputText, setAiInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const createNewPrivateSession = () => {
    const newId = String(Date.now());
    setSessions(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return [...safePrev, { id: newId, name: `جلسة خاصة ${safePrev.length + 1}` }];
    });
    setCurrentSessionId(newId);
  };

  const appsList = useMemo(() => [
    { id: 'AiBot', name: 'روبوت الذكاء والتقارير', icon: '🤖', borderColor: '#3b82f6', component: <AiBot currentUser={currentUser} sessions={sessions} currentSessionId={currentSessionId} setCurrentSessionId={setCurrentSessionId} createNewPrivateSession={createNewPrivateSession} chatHistories={chatHistories} setChatHistories={setChatHistories} aiInputText={aiInputText} setAiInputText={setAiInputText} inputStyle={inputStyle} transactions={accountingTransactions} products={products} employees={employees} /> },
    { id: 'Products', name: 'إدارة المنتجات والمخزون', icon: '📦', borderColor: '#10b981', component: <Products products={products} setProducts={setProducts} inputStyle={inputStyle} currentUser={currentUser} /> },
    { id: 'Employees', name: 'إدارة الموظفين (HR)', icon: '👥', borderColor: '#8b5cf6', component: <Employees employees={employees} setEmployees={setEmployees} searchTerm={searchTerm} setSearchTerm={setSearchTerm} /> },
    { id: 'Salaries', name: 'الرواتب والمكافآت', icon: '💵', borderColor: '#f59e0b', component: <Salaries salaries={salaries} setSalaries={setSalaries} inputStyle={inputStyle} currentUser={currentUser} /> },
    { id: 'Contacts', name: 'إيميلات وأرقام الموظفين', icon: '📇', borderColor: '#06b6d4', component: <Contacts contacts={contacts} setContacts={setContacts} /> },
    { id: 'EmailCenter', name: 'مركز البريد (Gmail)', icon: '✉️', borderColor: '#3b82f6', component: <EmailCenter emails={mails} setEmails={setMails} messages={mails} inputStyle={inputStyle} /> },
    { id: 'EmployeeChat', name: 'دردشة الموظفين الداخلية', icon: '💬', borderColor: '#ec4899', component: <EmployeeChat messages={employeeChat} setMessages={setEmployeeChat} currentUser={currentUser} /> },
    { id: 'Accounting', name: 'المحاسبة والأرباح', icon: '💰', borderColor: '#10b981', component: <Accounting transactions={accountingTransactions} setTransactions={setAccountingTransactions} mails={mails} setMails={setMails} currentUser={currentUser} inputStyle={inputStyle} /> },
    { id: 'SalesLog', name: 'سجل المبيعات والطلبات', icon: '📊', borderColor: '#6366f1', component: <SalesLog transactions={salesLog} sales={salesLog} /> },
    { id: 'ManagerMonitor', name: 'قسم فصل الموظفين', icon: '⚠️', borderColor: '#ef4444', component: <ManagerMonitor employees={employees} setEmployees={setEmployees} /> },
    { id: 'Coupons', name: 'كوبونات الخصم', icon: '🎟️', borderColor: '#f43f5e', component: <Coupons coupons={coupons} setCoupons={setCoupons} inputStyle={inputStyle} /> },
    { id: 'Tickets', name: 'تذاكر الدعم الفني', icon: '🎫', borderColor: '#14b8a6', component: <Tickets tickets={tickets} setTickets={setTickets} /> },
    { id: 'Announcements', name: 'إعلانات المتجر', icon: '📢', borderColor: '#f97316', component: <Announcements announcements={announcements} setAnnouncements={setAnnouncements} /> },
    { id: 'Tasks', name: 'إدارة مهام الكوادر', icon: '📝', borderColor: '#84cc16', component: <Tasks tasks={tasks} setTasks={setTasks} /> },
    { id: 'Logs', name: 'سجل النشاطات والأمان', icon: '🛡️', borderColor: '#3b82f6', component: <Logs logs={logs} setLogs={setLogs} /> },
    { id: 'Settings', name: 'إعدادات المتجر العامة', icon: '⚙️', borderColor: '#64748b', component: <Settings /> },
    { id: 'Analytics', name: 'الإحصائيات المتقدمة', icon: '📈', borderColor: '#0ea5e9', component: <Analytics employees={employees} customers={customers} products={products} transactions={accountingTransactions} /> },
    { id: 'Performance', name: 'مراقبة الأداء والإنذارات', icon: '🔍', borderColor: '#eab308', component: <Performance performance={performance} setPerformance={setPerformance} /> },
    { id: 'WorkHours', name: 'تتبع ساعات العمل', icon: '⏱️', borderColor: '#a855f7', component: <WorkHours workHours={workHours} setWorkHours={setWorkHours} /> },
    { id: 'Achievements', name: 'قياس الإنجازات', icon: '🏆', borderColor: '#10b981', component: <Achievements achievements={achievements} setAchievements={setAchievements} mails={mails} setMails={setMails} currentUser={currentUser} inputStyle={inputStyle} /> },
    { id: 'Customers', name: 'إدارة العملاء', icon: '🤝', borderColor: '#3b82f6', component: <Customers customers={customers} setCustomers={setCustomers} /> },
    { id: 'CustomerService', name: 'خدمة العملاء', icon: '🎧', borderColor: '#f59e0b', component: <CustomerService tickets={customerService} setTickets={setCustomerService} /> },
    { id: 'Documents', name: 'المستندات والأوراق', icon: '📁', borderColor: '#6366f1', component: <Documents documents={documents} setDocuments={setDocuments} /> },
    { id: 'Attendance', name: 'الحضور والانصراف', icon: '📅', borderColor: '#10b981', component: <Attendance attendance={attendance} setAttendance={setAttendance} /> },
    { id: 'Commissions', name: 'العمولات والمبيعات', icon: '💎', borderColor: '#ec4899', component: <Commissions commissions={commissions} setCommissions={setCommissions} /> },
  ], [currentUser, sessions, currentSessionId, chatHistories, aiInputText, inputStyle, accountingTransactions, products, employees, searchTerm, salaries, contacts, mails, employeeChat, salesLog, coupons, tickets, announcements, tasks, logs, performance, workHours, achievements, customers, customerService, documents, attendance, commissions]);

  const currentApp = useMemo(() => {
    const safeList = Array.isArray(appsList) ? appsList : [];
    return safeList.find(app => app && app.id === activeApp);
  }, [appsList, activeApp]);

  const isManagerOrEmployee = useMemo(() => {
    if (!currentUser || typeof currentUser !== 'object') return false;
    const role = typeof currentUser.role === 'string' ? currentUser.role : '';
    return ['owner', 'admin', 'employee'].includes(role) || currentUser.isOwner === true;
  }, [currentUser]);

  return (
    <div className="hz-atmosphere" style={{ color: '#f8fafc', width: '100%', fontFamily: 'Tajawal, sans-serif', direction: 'rtl', boxSizing: 'border-box' }}>
      <style>{GLASS_STYLE}</style>

      {!showStorefront && (
        <header style={{ padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => { setShowStorefront(true); setActiveApp(null); }} className="hz-glass-btn" style={{ color: '#fff', padding: '8px 14px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>🛍️ واجهة المتجر</button>
            {isManagerOrEmployee && (
              <button onClick={() => setShowStorefront(false)} className="hz-glass-btn" style={{ '--glow': '#7c3aed', color: '#c4b5fd', padding: '8px 14px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>⚙️ لوحة التحكم</button>
            )}
          </div>
        </header>
      )}

      <main style={{ padding: showStorefront ? '0' : '20px 40px', width: '100%', boxSizing: 'border-box' }}>
        {showStorefront || !isManagerOrEmployee ? (
          <Storefront inputStyle={inputStyle} onOpenDashboard={() => setShowStorefront(false)} />
        ) : (
          <div style={{ width: '100%' }}>
            {!activeApp ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '20px', width: '100%' }}>
                {appsList.map((app, index) => {
                  if (!app) return null;
                  const glow = app.borderColor || '#38bdf8';
                  return (
                    <div
                      key={app.id || index}
                      onClick={() => setActiveApp(app.id)}
                      className="hz-glass-card"
                      style={{ '--glow': glow, textAlign: 'center' }}
                    >
                      <div className="hz-glass-icon" style={{ margin: '0 auto 12px auto' }}>
                        {app.icon || '📌'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>{index + 1}. {app.name || 'تطبيق'}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="hz-glass-card hz-app-full-container">
                <button onClick={() => setActiveApp(null)} className="hz-glass-btn" style={{ color: '#fff', padding: '6px 12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '15px' }}>← العودة للقائمة</button>
                {currentApp && currentApp.component ? currentApp.component : <div>التطبيق غير موجود</div>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}