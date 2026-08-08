import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const AppContext = createContext();

export function AppProvider({ children }) {
  // 🔐 حالة المصادقة والمستخدم
  const [token, setToken] = useState(() => localStorage.getItem('hamza_token') || localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('hamza_user') || localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : { id: 1, name: 'المدير العام', role: 'admin', email: 'admin@store.com' };
    } catch (e) { return { id: 1, name: 'المدير العام', role: 'admin', email: 'admin@store.com' }; }
  });

  // 📦 الحالة العامة الشاملة (Global State Bus)
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [workHours, setWorkHours] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [products, setProducts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [salesLog, setSalesLog] = useState([]);
  const [accountingTransactions, setAccountingTransactions] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerService, setCustomerService] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [mails, setMails] = useState([]);
  const [employeeChat, setEmployeeChat] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [aiBot, setAiBot] = useState([]);
  const [managerMonitor, setManagerMonitor] = useState([]);
  const [settings, setSettings] = useState({});
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // 🔌 حالة اتصال Socket.IO
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);

  // 🚌 نظام الناقل العالمي (Global Event Bus)
  const globalBusRef = useRef(new Map());

  const globalEventBus = {
    subscribe: (event, callback) => {
      if (!globalBusRef.current.has(event)) {
        globalBusRef.current.set(event, new Set());
      }
      globalBusRef.current.get(event).add(callback);
      return () => {
        const listeners = globalBusRef.current.get(event);
        if (listeners) listeners.delete(callback);
      };
    },
    publish: (event, data) => {
      const listeners = globalBusRef.current.get(event);
      if (listeners) {
        listeners.forEach(cb => {
          try { cb(data); } catch (e) { console.error('Global Bus Error:', e); }
        });
      }
    }
  };

  // 🎨 حالات واجهات المستخدم
  const [showLoginPage, setShowLoginPage] = useState(() => localStorage.getItem('hamza_show_login') === 'true');
  const [showRegisterPage, setShowRegisterPage] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordSubmitting, setForgotPasswordSubmitting] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState(() => localStorage.getItem('hamza_login_error') || '');
  const [pendingTwoFactor, setPendingTwoFactor] = useState(null);
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [globalBus, setGlobalBus] = useState({ type: null, payload: null });

  // 🌐 روابط الخادم
  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api'
    : 'https://hamza-store-frontend.onrender.com/api';

  const SOCKET_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : 'https://hamza-store-frontend.onrender.com';

  useEffect(() => {
    localStorage.setItem('hamza_show_login', showLoginPage ? 'true' : 'false');
  }, [showLoginPage]);

  useEffect(() => {
    if (loginError) {
      localStorage.setItem('hamza_login_error', loginError);
    } else {
      localStorage.removeItem('hamza_login_error');
    }
  }, [loginError]);

  // معالجة رموز التوثيق القادمة عبر روابط خارجية
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromURL = params.get('authToken') || params.get('token');
    const errorFromURL = params.get('authError');

    if (tokenFromURL) {
      setToken(tokenFromURL);
      localStorage.setItem('hamza_token', tokenFromURL);
      localStorage.setItem('token', tokenFromURL);
      setShowLoginPage(false);
      localStorage.setItem('hamza_show_login', 'false');
      setLoginError('');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorFromURL) {
      setLoginError(decodeURIComponent(errorFromURL));
      setShowLoginPage(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const getAuthHeaders = useCallback(() => {
    const currentToken = token || localStorage.getItem('hamza_token') || localStorage.getItem('token') || '';
    const cleanToken = currentToken.replace(/^Bearer\s+/i, '').trim();
    return {
      'Content-Type': 'application/json',
      ...(cleanToken ? { 'Authorization': `Bearer ${cleanToken}` } : {})
    };
  }, [token]);

  // 🔄 دالة طلبات الـ API الموحدة
  const apiRequest = useCallback(async (path, method = 'GET', body) => {
    let res;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: getAuthHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      const err = new Error('تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.');
      err.status = 0;
      throw err;
    }

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed: ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }, [API_BASE_URL, getAuthHeaders]);

  // 📧 إرسال إيميل حقيقي
  const handleForgotPasswordRequest = async (email) => {
    if (!email || typeof email !== 'string') {
      setLoginError('يرجى إدخال البريد الإلكتروني بشكل صحيح.');
      return;
    }
    setForgotPasswordSubmitting(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      let data = {};
      try { data = await response.json(); } catch (e) {}

      if (response.ok) {
        setForgotPasswordSent(true);
        globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'forgot-password', status: 'sent', email });
      } else {
        setLoginError(data.error || 'حدث خطأ أثناء إرسال البريد الإلكتروني.');
      }
    } catch (err) {
      setLoginError('تعذر الاتصال بالخادم لإرسال البريد.');
    } finally {
      setForgotPasswordSubmitting(false);
    }
  };

  const handleLoginSubmit = async (email, password) => {
    if (!email || !password) {
      setLoginError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    setLoginSubmitting(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      let data = {};
      try { data = await response.json(); } catch (e) {}

      if (response.ok) {
        if (data.requiresTwoFactor) {
          setPendingTwoFactor({ email: email.trim() });
        } else if (data.token) {
          setToken(data.token);
          localStorage.setItem('hamza_token', data.token);
          localStorage.setItem('token', data.token);
          if (data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('hamza_user', JSON.stringify(data.user));
            localStorage.setItem('user', JSON.stringify(data.user));
          }
          setShowLoginPage(false);
          localStorage.setItem('hamza_show_login', 'false');
          globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'auth-login', user: data.user });
        }
      } else {
        setLoginError(data.error || 'بيانات الدخول غير صحيحة.');
      }
    } catch (err) {
      setLoginError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleVerifyTwoFactorLogin = async (code) => {
    if (!code || !pendingTwoFactor?.email) {
      setLoginError('يرجى إدخال كود التحقق بشكل صحيح.');
      return;
    }
    setTwoFactorSubmitting(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingTwoFactor.email, code: code.trim() })
      });
      let data = {};
      try { data = await response.json(); } catch (e) {}

      if (response.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('hamza_token', data.token);
        localStorage.setItem('token', data.token);
        if (data.user) {
          setCurrentUser(data.user);
          localStorage.setItem('hamza_user', JSON.stringify(data.user));
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        setPendingTwoFactor(null);
        setShowLoginPage(false);
        localStorage.setItem('hamza_show_login', 'false');
        globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'auth-2fa', user: data.user });
      } else {
        setLoginError(data.error || 'كود التحقق غير صحيح.');
      }
    } catch (err) {
      setLoginError('حدث خطأ في الاتصال.');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleResetPassword = async (email, tokenVal, newPassword) => {
    if (!email || !tokenVal || !newPassword) {
      return { success: false, error: 'جميع الحقول مطلوبة لإعادة تعيين كلمة المرور.' };
    }
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: tokenVal, newPassword })
      });
      let data = {};
      try { data = await response.json(); } catch (e) {}
      return response.ok ? { success: true } : { success: false, error: data.error || 'فشل إعادة التعيين.' };
    } catch (err) {
      return { success: false, error: 'تعذر الاتصال بالخادم.' };
    }
  };

  // 📥 جلب البيانات الشاملة
  const fetchAllData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = getAuthHeaders();
      const endpoints = [
        'products', 'accounting/transactions', 'mails', 'requests', 'employees', 
        'orders', 'customers', 'tickets', 'sales', 'coupons', 'attendance', 
        'salaries', 'tasks', 'documents', 'settings', 'work-hours', 'attendance-logs', 'announcements'
      ];

      const responses = await Promise.all(
        endpoints.map(ep => fetch(`${API_BASE_URL}/${ep}`, { headers }).catch(() => null))
      );

      const [
        prodRes, transRes, mailsRes, reqsRes, empRes, ordersRes, 
        custRes, ticketsRes, salesRes, couponsRes, attendanceRes, 
        salariesRes, tasksRes, documentsRes, settingsRes,
        workHoursRes, attendanceLogsRes, announcementsRes
      ] = responses;

      if (prodRes?.ok) { const d = await prodRes.json().catch(() => []); setProducts(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'products', value: d }); }
      if (transRes?.ok) { const d = await transRes.json().catch(() => []); setAccountingTransactions(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'accountingTransactions', value: d }); }
      if (mailsRes?.ok) { const d = await mailsRes.json().catch(() => []); setMails(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'mails', value: d }); }
      if (reqsRes?.ok) { const d = await reqsRes.json().catch(() => []); setRequests(d); setCustomerService(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'requests', value: d }); }
      if (empRes?.ok) { const d = await empRes.json().catch(() => ({})); const empList = Array.isArray(d) ? d : (d.employees || []); setEmployees(empList); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'employees', value: empList }); }
      if (ordersRes?.ok) { const d = await ordersRes.json().catch(() => []); setOrders(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'orders', value: d }); }
      if (custRes?.ok) { const d = await custRes.json().catch(() => []); setCustomers(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'customers', value: d }); }
      if (ticketsRes?.ok) { const d = await ticketsRes.json().catch(() => []); setTickets(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'tickets', value: d }); }
      if (salesRes?.ok) { const d = await salesRes.json().catch(() => []); setSalesLog(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'salesLog', value: d }); }
      if (couponsRes?.ok) { const d = await couponsRes.json().catch(() => []); setCoupons(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'coupons', value: d }); }
      if (attendanceRes?.ok) { const d = await attendanceRes.json().catch(() => []); setAttendance(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'attendance', value: d }); }
      if (salariesRes?.ok) { const d = await salariesRes.json().catch(() => []); setSalaries(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'salaries', value: d }); }
      if (tasksRes?.ok) { const d = await tasksRes.json().catch(() => []); setTasks(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'tasks', value: d }); }
      if (documentsRes?.ok) { const d = await documentsRes.json().catch(() => []); setDocuments(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'documents', value: d }); }
      if (settingsRes?.ok) { const d = await settingsRes.json().catch(() => ({})); setSettings(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'settings', value: d }); }
      if (workHoursRes?.ok) { const d = await workHoursRes.json().catch(() => []); setWorkHours(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'workHours', value: d }); }
      if (attendanceLogsRes?.ok) { const d = await attendanceLogsRes.json().catch(() => []); setAttendanceLogs(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'attendanceLogs', value: d }); }
      if (announcementsRes?.ok) { const d = await announcementsRes.json().catch(() => []); setAnnouncements(d); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'announcements', value: d }); }

    } catch (err) {
      console.error('Global State Sync Error:', err?.message || err);
    }
  }, [token, getAuthHeaders, API_BASE_URL]);

  // ⚡ إعداد الـ Socket.IO
  useEffect(() => {
    if (!token) return;
    fetchAllData();

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('UPDATE_DATA', (data) => {
      if (!data) return;
      if (data.type === 'PRODUCTS') { setProducts(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'products', value: data.payload }); }
      if (data.type === 'ORDERS') { setOrders(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'orders', value: data.payload }); }
      if (data.type === 'EMPLOYEES') { setEmployees(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'employees', value: data.payload }); }
      if (data.type === 'TICKETS') { setTickets(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'tickets', value: data.payload }); }
      if (data.type === 'MAILS') { setMails(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'mails', value: data.payload }); }
      if (data.type === 'TRANSACTIONS') { setAccountingTransactions(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'accountingTransactions', value: data.payload }); }
      if (data.type === 'WORK_HOURS') { setWorkHours(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'workHours', value: data.payload }); }
      if (data.type === 'ATTENDANCE_LOGS') { setAttendanceLogs(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'attendanceLogs', value: data.payload }); }
      if (data.type === 'TASKS') { setTasks(data.payload); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'tasks', value: data.payload }); }
      if (data.type === 'NOTIFICATIONS') { setNotifications(prev => [data.payload, ...prev]); globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'notifications', value: data.payload }); }
      if (data.type === 'REFRESH_ALL') { fetchAllData(); }
    });

    const fallbackInterval = setInterval(() => {
      if (!socket.connected) fetchAllData();
    }, 20000);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      clearInterval(fallbackInterval);
    };
  }, [token, fetchAllData, SOCKET_URL]);

  // مزامنة Global Bus
  const triggerGlobalSync = useCallback((payload) => {
    setGlobalBus(payload);
    globalEventBus.publish('GLOBAL_SYNC_EVENT', payload);
  }, [globalEventBus]);

  // دوال CRUD للمنتجات
  const addProduct = useCallback(async (product) => {
    const created = await apiRequest('/products', 'POST', product);
    setProducts(prev => {
      const nextVal = [...(Array.isArray(prev) ? prev : []), created];
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'products', value: nextVal });
      return nextVal;
    });
    return created;
  }, [apiRequest, globalEventBus]);

  const updateProduct = useCallback(async (product) => {
    const idVal = product?.id || product?._id;
    if (!idVal) throw new Error('معرف المنتج غير موجود');
    const updated = await apiRequest(`/products/${idVal}`, 'PUT', product);
    setProducts(prev => {
      const nextVal = (Array.isArray(prev) ? prev : []).map(p => ((p.id || p._id) === idVal ? updated : p));
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'products', value: nextVal });
      return nextVal;
    });
    return updated;
  }, [apiRequest, globalEventBus]);

  const deleteProduct = useCallback(async (productId) => {
    if (!productId) throw new Error('معرف المنتج غير موجود');
    await apiRequest(`/products/${productId}`, 'DELETE');
    setProducts(prev => {
      const nextVal = (Array.isArray(prev) ? prev : []).filter(p => (p.id || p._id) !== productId);
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'products', value: nextVal });
      return nextVal;
    });
  }, [apiRequest, globalEventBus]);

  // دوال CRUD للموظفين
  const hireEmployee = useCallback(async (employee) => {
    const result = await apiRequest('/employees', 'POST', employee);
    const created = result.employee || result;
    setEmployees(prev => {
      const nextVal = [...(Array.isArray(prev) ? prev : []), created];
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'employees', value: nextVal });
      return nextVal;
    });
    return created;
  }, [apiRequest, globalEventBus]);

  const updateEmployee = useCallback(async (employeeId, updates) => {
    if (!employeeId) throw new Error('معرف الموظف غير موجود');
    const result = await apiRequest(`/employees/${employeeId}`, 'PUT', updates);
    const updated = result.employee || result;
    setEmployees(prev => {
      const nextVal = (Array.isArray(prev) ? prev : []).map(e => ((e.id || e._id) === employeeId ? updated : e));
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'employees', value: nextVal });
      return nextVal;
    });
    return updated;
  }, [apiRequest, globalEventBus]);

  const fireEmployee = useCallback(async (employeeId) => {
    if (!employeeId) throw new Error('معرف الموظف غير موجود');
    await apiRequest(`/employees/${employeeId}`, 'DELETE');
    setEmployees(prev => {
      const nextVal = (Array.isArray(prev) ? prev : []).filter(e => (e.id || e._id) !== employeeId);
      globalEventBus.publish('GLOBAL_SYNC_EVENT', { key: 'employees', value: nextVal });
      return nextVal;
    });
  }, [apiRequest, globalEventBus]);

  // مصفوفة الصلاحيات (RBAC)
  const PERMISSIONS_MATRIX = {
    admin: ['view_dashboard', 'manage_products', 'delete_product', 'manage_employees', 'fire_employee', 'hire_employee', 'manage_accounting', 'send_marketing', 'escalate_complaint', 'manage_coupons', 'manage_orders', 'manage_tickets'],
    manager: ['view_dashboard', 'manage_products', 'manage_employees', 'hire_employee', 'manage_accounting', 'send_marketing', 'escalate_complaint', 'manage_coupons', 'manage_orders', 'manage_tickets'],
    sales: ['view_dashboard', 'manage_products', 'view_orders', 'manage_coupons'],
    support: ['view_dashboard', 'customer_trouble', 'escalate_complaint', 'manage_tickets']
  };

  const hasPermission = useCallback((permissionKey) => {
    const role = currentUser?.role || 'sales';
    return (PERMISSIONS_MATRIX[role] || []).includes(permissionKey);
  }, [currentUser]);

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser,
      token, setToken,
      employees, setEmployees,
      attendance, setAttendance,
      salaries, setSalaries,
      workHours, setWorkHours,
      performance, setPerformance,
      achievements, setAchievements,
      products, setProducts,
      coupons, setCoupons,
      salesLog, setSalesLog,
      accountingTransactions, setAccountingTransactions,
      analytics, setAnalytics,
      customers, setCustomers,
      customerService, setCustomerService,
      tickets, setTickets,
      mails, setMails,
      employeeChat, setEmployeeChat,
      announcements, setAnnouncements,
      tasks, setTasks,
      documents, setDocuments,
      logs, setLogs,
      commissions, setCommissions,
      contacts, setContacts,
      aiBot, setAiBot,
      managerMonitor, setManagerMonitor,
      settings, setSettings,
      requests, setRequests,
      orders, setOrders,
      attendanceLogs, setAttendanceLogs,
      notifications, setNotifications,
      socketConnected,
      socket: socketRef.current,
      globalEventBus,
      globalBus,
      triggerGlobalSync,
      apiUrl: API_BASE_URL,
      apiRequest,
      loadingUser,
      fetchAllData,
      getAuthHeaders,
      addProduct, updateProduct, deleteProduct,
      hireEmployee, updateEmployee, fireEmployee,
      hasPermission,
      showLoginPage, setShowLoginPage,
      showRegisterPage, setShowRegisterPage,
      showForgotPassword, setShowForgotPassword,
      forgotPasswordSent, setForgotPasswordSent,
      forgotPasswordSubmitting,
      loginSubmitting, loginError, setLoginError,
      pendingTwoFactor, setPendingTwoFactor,
      twoFactorSubmitting,
      handleForgotPasswordRequest,
      handleLoginSubmit,
      handleVerifyTwoFactorLogin,
      handleResetPassword
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

export default AppProvider;