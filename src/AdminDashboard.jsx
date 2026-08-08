import React, { useState, useEffect, useCallback, Component } from 'react';

// استدعاء التطبيقات
import Accounting from './app/Accounting';
import Achievements from './app/Achievements';
import AIbot from './app/AIbot';
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
import StorageManagement from './app/StorageManagement';
import Storefront from './Storefront';

// مكون حماية لمنع انهيار الصفحة في حال فشل أي تطبيق فرعي
class SafeWidget extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Widget Error captured securely.");
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '15px', background: '#331a1a', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', margin: '10px 0' }}>
          ⚠️ حدث خطأ في تحميل هذا المكوّن، وتم عزله لضمان استقرار اللوحة.
        </div>
      );
    }
    return this.props.children;
  }
}

const API_BASE_URL = 'https://hamza-store-frontend.onrender.com/api';

// دوال مساعدة لإدارة الرموز (Tokens) بأمان
const getSecureToken = () => {
  return localStorage.getItem('hamza_token') || localStorage.getItem('token') || '';
};

const setSecureToken = (token) => {
  if (token && typeof token === 'string') {
    localStorage.setItem('hamza_token', token);
    localStorage.removeItem('token');
  }
};

// ==========================================
// مكونات المصادقة (Login & Auth Components)
// ==========================================

export function LoginForm({ authCart, inputStyle = {} }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const {
    showLoginPage, setShowLoginPage,
    loginSubmitting, loginError,
    handleLoginSubmit, handleSocialLogin, pendingTwoFactor,
    showForgotPassword, setShowRegisterPage,
  } = authCart;

  if (!showLoginPage) return null;

  if (pendingTwoFactor) {
    return <TwoFactorForm authCart={authCart} inputStyle={inputStyle} />;
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm authCart={authCart} inputStyle={inputStyle} />;
  }

  const submit = async (e) => {
    e.preventDefault();
    await handleLoginSubmit(email, password);
  };

  return (
    <form onSubmit={submit} style={{ background: '#111827', padding: '25px', borderRadius: '20px', border: '1px solid #334155', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px', width: '100%', margin: 'auto' }}>

      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '18px' }}>بوابة تسجيل الدخول</h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>اختر الطريقة الأنسب لك للوصول إلى حسابك</p>
      </div>

      <button
        type="button"
        onClick={() => handleSocialLogin('google')}
        style={{ background: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        🌐 المتابعة باستخدام Google (Gmail)
      </button>

      <button
        type="button"
        onClick={() => handleSocialLogin('apple')}
        style={{ background: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        🍎 المتابعة باستخدام Apple ID (iCloud)
      </button>

      <button
        type="button"
        onClick={() => handleSocialLogin('facebook')}
        style={{ background: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '10px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        📘 المتابعة باستخدام Facebook
      </button>

      <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', color: '#4b5563', margin: '5px 0', fontSize: '11px' }}>
        <hr style={{ flex: 1, borderColor: '#374151' }} />
        <span style={{ padding: '0 10px', color: '#94a3b8' }}>أو البريد الإلكتروني</span>
        <hr style={{ flex: 1, borderColor: '#374151' }} />
      </div>

      {loginError && (
        <div style={{ color: '#fca5a5', background: '#331a1a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
          {loginError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>البريد الإلكتروني</label>
        <input
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>كلمة المرور</label>
        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}
        />
      </div>

      <button
        type="button"
        onClick={() => authCart.setShowForgotPassword(true)}
        style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '12px', textAlign: 'left', cursor: 'pointer', padding: 0 }}
      >
        نسيت كلمة المرور؟
      </button>

      <button
        type="submit"
        disabled={loginSubmitting}
        style={{ background: loginSubmitting ? '#1d4ed8aa' : '#2563eb', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', cursor: loginSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
      >
        {loginSubmitting ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول ✨'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', fontSize: '12px' }}>
        <span style={{ color: '#94a3b8' }}>ليس لديك حساب؟</span>
        <button 
          type="button" 
          onClick={() => {
            setShowLoginPage(false);
            if (typeof setShowRegisterPage === 'function') setShowRegisterPage(true);
          }} 
          style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}
        >
          انضم إلينا بانشاء حساب جديد
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowLoginPage(false)}
        style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '5px', cursor: 'pointer', fontSize: '12px', textAlign: 'center', marginTop: '5px' }}
      >
        ← العودة إلى المتجر الرئيسي
      </button>
    </form>
  );
}

export function TwoFactorForm({ authCart, inputStyle = {} }) {
  const [code, setCode] = useState('');
  const { pendingTwoFactor, setPendingTwoFactor, twoFactorSubmitting, loginError, handleVerifyTwoFactorLogin } = authCart;

  if (!pendingTwoFactor) return null;

  const submit = async (e) => {
    e.preventDefault();
    await handleVerifyTwoFactorLogin(code);
  };

  return (
    <form onSubmit={submit} style={{ background: '#111827', padding: '20px', borderRadius: '16px', border: '1px solid #7c3aed', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', margin: 'auto' }}>
      <h3 style={{ margin: 0, color: '#c4b5fd', fontSize: '16px' }}>🔐 التحقق بخطوتين</h3>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
        أدخل الكود المكوّن من 6 أرقام من تطبيق المصادقة الخاص بحسابك ({pendingTwoFactor.email})
      </p>

      {loginError && (
        <div style={{ color: '#fca5a5', background: '#331a1a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
          {loginError}
        </div>
      )}

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        required
        autoComplete="one-time-code"
        style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '18px', letterSpacing: '6px', textAlign: 'center', ...inputStyle }}
      />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="submit"
          disabled={twoFactorSubmitting || code.length !== 6}
          style={{ flex: 1, background: twoFactorSubmitting ? '#6d28d9aa' : '#7c3aed', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
        >
          {twoFactorSubmitting ? 'جاري التحقق...' : 'تأكيد'}
        </button>
        <button
          type="button"
          onClick={() => setPendingTwoFactor(null)}
          style={{ background: '#4b5563', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
        >
          رجوع
        </button>
      </div>
    </form>
  );
}

export function ForgotPasswordForm({ authCart, inputStyle = {} }) {
  const [email, setEmail] = useState('');
  const {
    showForgotPassword, setShowForgotPassword,
    forgotPasswordSubmitting, forgotPasswordSent, setForgotPasswordSent,
    handleForgotPasswordRequest,
  } = authCart;

  if (!showForgotPassword) return null;

  const submit = async (e) => {
    e.preventDefault();
    await handleForgotPasswordRequest(email);
  };

  const close = () => {
    setShowForgotPassword(false);
    setForgotPasswordSent(false);
    setEmail('');
  };

  return (
    <div style={{ background: '#111827', padding: '25px', borderRadius: '20px', border: '1px solid #334155', marginBottom: '25px', maxWidth: '400px', width: '100%', margin: 'auto' }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8', fontSize: '18px', textAlign: 'center' }}>استعادة كلمة المرور</h3>

      {forgotPasswordSent ? (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <p style={{ color: '#a7f3d0', fontSize: '13px', lineHeight: '1.6' }}>
            ✅ إذا كان هذا البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إليه. تحقق من بريدك الوارد (الرئيسي أو مجلد Spam).
          </p>
          <button
            onClick={close}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            العودة إلى تسجيل الدخول 🔙
          </button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
            أدخل بريدك الإلكتروني المسجل وسنرسل لك تعليمات إعادة تعيين كلمة المرور.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: '#94a3b8' }}>البريد الإلكتروني</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}
            />
          </div>
          <button
            type="submit"
            disabled={forgotPasswordSubmitting}
            style={{ background: forgotPasswordSubmitting ? '#1d4ed8aa' : '#2563eb', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', cursor: forgotPasswordSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            {forgotPasswordSubmitting ? 'جاري إرسال الرابط...' : 'إرسال رابط التعيين 🚀'}
          </button>
          <button
            type="button"
            onClick={close}
            style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '5px', cursor: 'pointer', fontSize: '12px', textAlign: 'center' }}
          >
            ← العودة إلى تسجيل الدخول
          </button>
        </form>
      )}
    </div>
  );
}

export function ResetPasswordPage({ authCart, email, token, inputStyle = {} }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [done, setDone] = useState(false);
  const { handleResetPassword, resetPasswordSubmitting } = authCart;

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (newPassword.length < 8) {
      setLocalError('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('كلمتا المرور غير متطابقتين.');
      return;
    }
    const result = await handleResetPassword(email, token, newPassword);
    if (result.success) {
      setDone(true);
    } else {
      setLocalError(result.error);
    }
  };

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#111827', padding: '25px', borderRadius: '16px', border: '1px solid #334155', maxWidth: '380px', width: '100%' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '18px' }}>إعادة تعيين كلمة المرور</h3>

        {done ? (
          <div>
            <p style={{ color: '#a7f3d0', fontSize: '13px' }}>✅ تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
            <a href="/" style={{ color: '#38bdf8', fontSize: '13px' }}>العودة للصفحة الرئيسية</a>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {localError && (
              <div style={{ color: '#fca5a5', background: '#331a1a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                {localError}
              </div>
            )}
            <input
              type="password"
              placeholder="كلمة المرور الجديدة"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}
            />
            <input
              type="password"
              placeholder="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...inputStyle }}
            />
            <button
              type="submit"
              disabled={resetPasswordSubmitting}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
            >
              {resetPasswordSubmitting ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ==========================================
// لوحة التحكم الرئيسية (Admin Dashboard)
// ==========================================

function AdminDashboard() {
  const inputStyle = {
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#0b0f19',
    color: '#fff',
    marginTop: '5px',
    marginBottom: '10px',
    width: '100%'
  };

  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [mails, setMails] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // حالات إدارة المصادقة (Auth States)
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [showRegisterPage, setShowRegisterPage] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pendingTwoFactor, setPendingTwoFactor] = useState(null);
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordSubmitting, setForgotPasswordSubmitting] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);

  // دوال التعامل مع المصادقة (Auth Handlers)
  const handleLoginSubmit = async (email, password) => {
    setLoginSubmitting(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.requiresTwoFactor) {
          setPendingTwoFactor({ email });
        } else {
          const token = data.token || data.accessToken;
          if (token) setSecureToken(token);
          setShowLoginPage(false);
          fetchDashboardData();
        }
      } else {
        setLoginError(data.message || 'فشل تسجيل الدخول');
      }
    } catch (err) {
      setLoginError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSocialLogin = (provider) => {
    const allowedProviders = ['google', 'apple', 'facebook'];
    if (allowedProviders.includes(provider)) {
      window.location.href = `${API_BASE_URL}/auth/${provider}`;
    }
  };

  const handleVerifyTwoFactorLogin = async (code) => {
    setTwoFactorSubmitting(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingTwoFactor?.email, code })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const token = data.token || data.accessToken;
        if (token) setSecureToken(token);
        setPendingTwoFactor(null);
        setShowLoginPage(false);
        fetchDashboardData();
      } else {
        setLoginError(data.message || 'كود التحقق غير صحيح');
      }
    } catch (err) {
      setLoginError('حدث خطأ أثناء التحقق');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleForgotPasswordRequest = async (email) => {
    setForgotPasswordSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setForgotPasswordSent(true);
    } catch (err) {
      // تم كتم الخطأ لمنع كشف حالة البريد
    } finally {
      setForgotPasswordSubmitting(false);
    }
  };

  const handleResetPassword = async (email, token, newPassword) => {
    setResetPasswordSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.message || 'فشل إعادة التعيين' };
      }
    } catch (err) {
      return { success: false, error: 'حدث خطأ في الاتصال' };
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  // تجميع الـ authCart لتمريرها للمكونات الفرعية
  const authCart = {
    showLoginPage, setShowLoginPage,
    showRegisterPage, setShowRegisterPage,
    loginSubmitting, loginError,
    handleLoginSubmit, handleSocialLogin,
    pendingTwoFactor, setPendingTwoFactor,
    twoFactorSubmitting, handleVerifyTwoFactorLogin,
    showForgotPassword, setShowForgotPassword,
    forgotPasswordSubmitting, forgotPasswordSent, setForgotPasswordSent,
    handleForgotPasswordRequest,
    handleResetPassword, resetPasswordSubmitting
  };
  
  // حالات إضافية لشمولية ربط التطبيقات
  const [employees, setEmployees] = useState([]);
  const [tasksList, setTasksList] = useState([]);
  const [ticketsList, setTicketsList] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  const [salariesList, setSalariesList] = useState([]);
  const [couponsList, setCouponsList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [documentsList, setDocumentsList] = useState([]);
  const [announcementsList, setAnnouncementsList] = useState([]);
  const [workHoursList, setWorkHoursList] = useState([]);
  const [achievementsList, setAchievementsList] = useState([]);
  const [commissionsList, setCommissionsList] = useState([]);
  const [contactsList, setContactsList] = useState([]);
  const [performanceList, setPerformanceList] = useState([]);
  const [logsList, setLogsList] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);

  const getAuthHeaders = () => {
    const token = getSecureToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}`.replace('Bearer Bearer ', 'Bearer ') : ''
    };
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [prodRes, transRes, mailsRes, reqsRes, empRes] = await Promise.all([
        fetch(`${API_BASE_URL}/products`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/transactions`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/mails`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/requests`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/employees`, { headers }).catch(() => null)
      ]);

      if (prodRes && prodRes.ok) {
        const data = await prodRes.json().catch(() => []);
        if (Array.isArray(data)) setProducts(data);
      }
      if (transRes && transRes.ok) {
        const data = await transRes.json().catch(() => []);
        if (Array.isArray(data)) setTransactions(data);
      }
      if (mailsRes && mailsRes.ok) {
        const data = await mailsRes.json().catch(() => []);
        if (Array.isArray(data)) setMails(data);
      }
      if (reqsRes && reqsRes.ok) {
        const data = await reqsRes.json().catch(() => []);
        if (Array.isArray(data)) setRequests(data);
      }
      if (empRes && empRes.ok) {
        const data = await empRes.json().catch(() => []);
        if (Array.isArray(data)) setEmployees(data);
      }
    } catch (err) {
      // معالجة صامتة وآمنة للاستثناءات
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const updateProducts = async (newProducts) => {
    const updated = typeof newProducts === 'function' ? newProducts(products) : newProducts;
    setProducts(updated);
    try {
      await fetch(`${API_BASE_URL}/products`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updated) });
    } catch (err) {}
  };

  const updateTransactions = async (newTrans) => {
    const updated = typeof newTrans === 'function' ? newTrans(transactions) : newTrans;
    setTransactions(updated);
    try {
      await fetch(`${API_BASE_URL}/transactions`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updated) });
    } catch (err) {}
  };

  const updateMails = async (newMails) => {
    const updated = typeof newMails === 'function' ? newMails(mails) : newMails;
    setMails(updated);
    try {
      await fetch(`${API_BASE_URL}/mails`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updated) });
    } catch (err) {}
  };

  const updateRequests = async (newReqs) => {
    const updated = typeof newReqs === 'function' ? newReqs(requests) : newReqs;
    setRequests(updated);
    try {
      await fetch(`${API_BASE_URL}/requests`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updated) });
    } catch (err) {}
  };

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '20px', color: '#fff', fontFamily: 'Tajawal, sans-serif' }} dir="rtl">
      <h1 style={{ textAlign: 'center', color: '#f97316', marginBottom: '30px' }}>
        👑 لوحة تحكم المدير الشاملة (Admin Dashboard)
      </h1>

      {/* زر إظهار نافذة تسجيل الدخول للمدير إذا لم تكن ظاهرة */}
      {!showLoginPage && (
        <div style={{ textAlign: 'left', marginBottom: '20px' }}>
          <button
            onClick={() => setShowLoginPage(true)}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔑 تسجيل الدخول / حساب المدير
          </button>
        </div>
      )}

      {/* عرض نموذج تسجيل الدخول عند تفعيله */}
      <SafeWidget>
        <LoginForm authCart={authCart} inputStyle={inputStyle} />
      </SafeWidget>

      <SafeWidget>
        <div style={{ marginBottom: '40px', background: '#1e293b', padding: '20px', borderRadius: '16px', border: '1px solid #334155' }}>
          <StorageManagement />
        </div>
      </SafeWidget>

      <SafeWidget>
        <div style={{ marginBottom: '40px' }}>
          <Storefront 
            products={products}
            setProducts={updateProducts}
            transactions={transactions}
            setTransactions={updateTransactions}
            mails={mails}
            setMails={updateMails}
            requests={requests}
            setRequests={updateRequests}
            inputStyle={inputStyle} 
            isAdmin={true}
          />
        </div>
      </SafeWidget>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <SafeWidget><Settings inputStyle={inputStyle} /></SafeWidget>
        <SafeWidget><Tasks inputStyle={inputStyle} tasks={tasksList} setTasks={setTasksList} /></SafeWidget>
        <SafeWidget><Tickets inputStyle={inputStyle} role="manager" tickets={ticketsList} setTickets={setTicketsList} mails={mails} setMails={updateMails} /></SafeWidget>
        <SafeWidget><WorkHours inputStyle={inputStyle} role="manager" workHours={workHoursList} setWorkHours={setWorkHoursList} mails={mails} setMails={updateMails} /></SafeWidget>
        <SafeWidget><Accounting inputStyle={inputStyle} transactions={transactions} setTransactions={updateTransactions} /></SafeWidget>
        <SafeWidget><Achievements inputStyle={inputStyle} achievements={achievementsList} setAchievements={setAchievementsList} /></SafeWidget>
        <SafeWidget><AIbot inputStyle={inputStyle} transactions={transactions} products={products} employees={employees} /></SafeWidget>
        <SafeWidget><Analytics inputStyle={inputStyle} employees={employees} customers={customersList} products={products} transactions={transactions} /></SafeWidget>
        <SafeWidget><Announcements inputStyle={inputStyle} announcements={announcementsList} setAnnouncements={setAnnouncementsList} /></SafeWidget>
        <SafeWidget><Attendance inputStyle={inputStyle} attendance={attendanceList} setAttendance={setAttendanceList} /></SafeWidget>
        <SafeWidget><Commissions inputStyle={inputStyle} commissions={commissionsList} setCommissions={setCommissionsList} /></SafeWidget>
        <SafeWidget><Contacts inputStyle={inputStyle} contacts={contactsList} setContacts={setContactsList} /></SafeWidget>
        <SafeWidget><Coupons inputStyle={inputStyle} coupons={couponsList} setCoupons={setCouponsList} /></SafeWidget>
        <SafeWidget><Customers inputStyle={inputStyle} customers={customersList} setCustomers={setCustomersList} /></SafeWidget>
        <SafeWidget><CustomerService inputStyle={inputStyle} requests={requests} setRequests={updateRequests} /></SafeWidget>
        <SafeWidget><Documents inputStyle={inputStyle} documents={documentsList} setDocuments={setDocumentsList} /></SafeWidget>
        <SafeWidget><EmailCenter inputStyle={inputStyle} mails={mails} setMails={updateMails} /></SafeWidget>
        <SafeWidget><EmployeeChat inputStyle={inputStyle} messages={chatMessages} setMessages={setChatMessages} /></SafeWidget>
        <SafeWidget><Employees inputStyle={inputStyle} employees={employees} setEmployees={setEmployees} /></SafeWidget>
        <SafeWidget><Logs inputStyle={inputStyle} logs={logsList} setLogs={setLogsList} /></SafeWidget>
        <SafeWidget><ManagerMonitor inputStyle={inputStyle} employees={employees} setEmployees={setEmployees} /></SafeWidget>
        <SafeWidget><Performance inputStyle={inputStyle} performance={performanceList} setPerformance={setPerformanceList} /></SafeWidget>
        <SafeWidget><Products inputStyle={inputStyle} products={products} setProducts={updateProducts} /></SafeWidget>
        <SafeWidget><Salaries inputStyle={inputStyle} salaries={salariesList} setSalaries={setSalariesList} /></SafeWidget>
        <SafeWidget><SalesLog inputStyle={inputStyle} transactions={transactions} sales={transactions} /></SafeWidget>
      </div>
    </div>
  );
}

export default AdminDashboard;