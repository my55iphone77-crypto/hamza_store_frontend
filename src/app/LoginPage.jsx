import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useApp } from './AppContext';

const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
  ? 'http://localhost:4000/api' 
  : 'https://hamza-store-frontend.onrender.com/api';

export default function LoginPage(props) {
  // 🔑 OAuth Redirect Handler — يقرأ التوكن من الرابط بعد تسجيل الدخول الاجتماعي
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('authToken');
    const authError = urlParams.get('authError');

    if (authError) {
      alert('فشل تسجيل الدخول عبر ' + authError);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (authToken) {
      localStorage.setItem('hamza_token', authToken);
      localStorage.setItem('token', authToken);

      axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      .then(res => {
        if (res.data?.success && res.data?.user) {
          localStorage.setItem('hamza_user', JSON.stringify(res.data.user));
          window.dispatchEvent(new Event('force_auth_sync'));
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        // نعيد تحميل الصفحة عشان الـ AppContext يقرأ التوكن الجديد
        window.location.reload();
      })
      .catch(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
  }, []);

  // تفعيل المزامنة اللحظية عبر BroadcastChannel
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const authSyncChannel = new BroadcastChannel('global_system_state_bus');

      authSyncChannel.onmessage = (event) => {
        if (event.data && (event.data.type === 'TRIGGER_AUTH_SYNC' || event.data.type === 'GLOBAL_STATE_UPDATE')) {
          window.dispatchEvent(new Event('force_auth_sync'));
        }
      };

      return () => {
        authSyncChannel.close();
      };
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <LoginPageOriginal {...props} />
    </div>
  );
}

function extractToken(responseData) {
  if (!responseData || typeof responseData !== 'object') return '';
  return (
    responseData.token ||
    responseData.accessToken ||
    responseData.jwt ||
    responseData.authToken ||
    (responseData.data && (responseData.data.token || responseData.data.accessToken)) ||
    ''
  );
}

function extractUser(responseData, fallbackEmail, fallbackName) {
  if (!responseData || typeof responseData !== 'object') return null;
  const user =
    responseData.user ||
    responseData.currentUser ||
    (responseData.data && responseData.data.user) ||
    null;

  if (user && typeof user === 'object') return user;

  if (responseData.email || responseData._id || responseData.id) {
    const { token, accessToken, jwt, authToken, ...rest } = responseData;
    return Object.keys(rest).length > 0 ? rest : null;
  }

  return null;
}

function LoginPageOriginal({ onLoginSuccess, authCart }) {
  const contextApp = useApp() || {};
  const { 
    setCurrentUser = () => {}, 
    setToken = () => {}, 
    loginError: contextLoginError = '', 
    setLoginError: setContextLoginError = () => {}, 
    handleSocialLogin: contextHandleSocialLogin,
    setGlobalBus
  } = contextApp;

  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const displayError = error || contextLoginError || '';

  const sanitizeInput = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '');
  };

  const broadcastGlobalChange = (payload = {}) => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('global_system_state_bus');
      channel.postMessage({ type: 'GLOBAL_STATE_UPDATE', ...payload });
      channel.close();
    }
    if (setGlobalBus && typeof setGlobalBus === 'function') {
      setGlobalBus(Date.now());
    }
  };

  useEffect(() => {
    if (contextLoginError) setError('');
  }, [contextLoginError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (typeof setContextLoginError === 'function') setContextLoginError('');
    setLoading(true);

    const trimmedEmail = sanitizeInput(String(email || '').trim());
    const trimmedPassword = String(password || '');
    const trimmedName = sanitizeInput(String(name || '').trim());

    if (isForgotPassword) {
      if (!trimmedEmail) {
        setError('الرجاء إدخال البريد الإلكتروني لإتمام الاستعادة.');
        setLoading(false);
        return;
      }
      try {
        await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email: trimmedEmail });
        setForgotSuccess(true);
        broadcastGlobalChange({ action: 'FORGOT_PASSWORD_SENT', email: trimmedEmail });
      } catch (err) {
        console.error("Forgot Password Error:", err);
        setError(err.response?.data?.error || err.message || 'تعذر إرسال رابط الاستعادة، تأكد من صحة البريد الإلكتروني.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedEmail || !trimmedPassword) {
      setError('الرجاء إدخال البريد الإلكتروني وكلمة المرور بشكل صحيح.');
      setLoading(false);
      return;
    }

    const endpoint = isRegister ? '/auth/register' : '/auth/login';

    try {
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, {
        email: trimmedEmail,
        password: trimmedPassword,
        name: isRegister ? trimmedName : undefined
      });

      const responseData = response?.data || {};

      const authToken = extractToken(responseData);
      const userData = extractUser(responseData, trimmedEmail, trimmedName);

      if (!authToken) {
        throw new Error('لم يستلم النظام رمز الدخول (Token) من الخادم. يرجى مراجعة استجابة الخادم لتسجيل الدخول.');
      }
      if (!userData) {
        throw new Error('لم يستلم النظام بيانات المستخدم من الخادم بعد تسجيل الدخول.');
      }

      setToken(authToken);
      localStorage.setItem('hamza_token', authToken);
      localStorage.setItem('token', authToken);
      localStorage.setItem('authToken', authToken);

      setCurrentUser(userData);
      localStorage.setItem('hamza_user', JSON.stringify(userData));
      localStorage.setItem('user', JSON.stringify(userData));

      if (isRegister) {
        try {
          const tokenHeader = authToken ? { Authorization: `Bearer ${authToken}` } : {};
          await axios.post(`${API_BASE_URL}/auth/welcome-email`, {
            email: trimmedEmail,
            name: trimmedName || trimmedEmail
          }, {
            headers: tokenHeader
          });
        } catch (welcomeErr) {
          console.warn("ملاحظة: تم إنشاء الحساب بنجاح لكن تعذر إرسال إيميل الترحيب:", welcomeErr);
        }
      }

      broadcastGlobalChange({ action: isRegister ? 'USER_REGISTERED' : 'USER_LOGGED_IN', user: userData });

      alert(isRegister ? '✨ أهلاً بك! تم إنشاء الحساب بنجاح' : '✨ أهلاً بك مجدداً! تم تسجيل الدخول بنجاح');

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(userData);
      } else if (authCart && typeof authCart.setShowLoginPage === 'function') {
        authCart.setShowLoginPage(false);
      }
    } catch (err) {
      console.error("Login Error:", err);
      const serverMsg = err.response?.data?.error;
      setError(serverMsg || err.message || 'تعذر الاتصال بالخادم، تأكد من صحة البريد الإلكتروني أو كلمة المرور.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    setError('');
    if (typeof setContextLoginError === 'function') setContextLoginError('');
    const safeProvider = sanitizeInput(String(provider || '').trim());
    if (!safeProvider) return;

    if (typeof contextHandleSocialLogin === 'function') {
      contextHandleSocialLogin(safeProvider);
    } else if (typeof window !== 'undefined') {
      window.location.href = `${API_BASE_URL}/auth/${safeProvider.toLowerCase()}`;
    }
  };

  const glassContainerStyle = {
    width: '100vw',
    minHeight: '100vh',
    background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    boxSizing: 'border-box',
    fontFamily: 'Tajawal, sans-serif',
    margin: '0',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 99999
  };

  const glassCardStyle = {
    background: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(25px)',
    WebkitBackdropFilter: 'blur(25px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    padding: '40px 35px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
    boxSizing: 'border-box'
  };

  const glassInputStyle = {
    width: '100%',
    background: 'rgba(30, 41, 59, 0.7)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    padding: '12px 16px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'all 0.3s ease'
  };

  const glassButtonStyle = {
    background: 'rgba(30, 41, 59, 0.8)',
    backdropFilter: 'blur(10px)',
    color: '#f3f4f6',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    padding: '12px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      <div style={glassCardStyle}>

        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px', textShadow: '0 0 15px rgba(56, 189, 248, 0.5)' }}>
            {isForgotPassword ? '🔑' : '🔐'}
          </div>
          <h1 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '24px', fontWeight: 'bold', textShadow: '0 0 10px rgba(56, 189, 248, 0.3)' }}>
            {isForgotPassword ? 'استعادة كلمة المرور' : (isRegister ? 'إنشاء حساب جديد' : 'بوابة تسجيل الدخول')}
          </h1>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>
            {isForgotPassword ? 'أدخل بريدك الإلكتروني لاستلام رابط الاستعادة الحقيقي' : (isRegister ? 'انضم إلينا اليوم واستمتع بنظام مزامنة الأقسام الكامل' : 'اختر الطريقة الأنسب لك للوصول إلى حسابك')}
          </p>
        </div>

        {displayError && (
          <div style={{ background: 'rgba(127, 29, 29, 0.75)', backdropFilter: 'blur(8px)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', textAlign: 'center' }}>
            {displayError}
          </div>
        )}

        {forgotSuccess ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <p style={{ color: '#34d399', fontSize: '14px', lineHeight: '1.6' }}>
              ✅ تم إرسال تعليمات إعادة تعيين كلمة المرور الحقيقية إلى بريدك الإلكتروني بنجاح. تحقق من صندوق الوارد.
            </p>
            <button
              type="button"
              onClick={() => { setIsForgotPassword(false); setForgotSuccess(false); setError(''); }}
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                color: '#fff',
                border: 'none',
                padding: '14px',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)'
              }}
            >
              العودة لتسجيل الدخول 🔙
            </button>
          </div>
        ) : (
          <>
            {!isForgotPassword && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px', width: '100%' }}>
                  <button type="button" onClick={() => handleSocialLogin('Google')} style={glassButtonStyle}>
                    <span>🌐</span> المتابعة باستخدام Google (Gmail)
                  </button>
                  <button type="button" onClick={() => handleSocialLogin('Apple')} style={glassButtonStyle}>
                    <span>🍎</span> المتابعة باستخدام Apple ID (iCloud)
                  </button>
                  <button type="button" onClick={() => handleSocialLogin('Facebook')} style={glassButtonStyle}>
                    <span>📘</span> المتابعة باستخدام Facebook
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', margin: '20px 0', color: '#64748b', fontSize: '12px' }}>
                  <div style={{ flex: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}></div>
                  <span style={{ padding: '0 12px', color: '#94a3b8', fontWeight: '500' }}>أو البريد الإلكتروني</span>
                  <div style={{ flex: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}></div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isRegister && !isForgotPassword && (
                <div>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>الاسم الكامل</label>
                  <input
                    type="text"
                    placeholder="أدخل اسمك الكريم..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={isRegister}
                    style={glassInputStyle}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={glassInputStyle}
                />
              </div>

              {!isForgotPassword && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: '500' }}>كلمة المرور</label>
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={glassInputStyle}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? '#1e40af' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '12px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  marginTop: '8px',
                  boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)'
                }}
              >
                {loading ? 'جارٍ التحقق...' : (isForgotPassword ? 'إرسال رابط الاستعادة الحقيقي 🚀' : (isRegister ? 'إنشاء الحساب الآن 🚀' : 'تسجيل الدخول ✨'))}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => { setIsForgotPassword(false); setError(''); }}
                  style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
                >
                  العودة لتسجيل الدخول
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setIsRegister(!isRegister); setError(''); }}
                  style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
                >
                  {isRegister ? 'لديك حساب بالفعل؟ سجل دخولك من هنا' : 'ليس لديك حساب؟ انضم إلينا بإنشاء حساب جديد'}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (authCart && typeof authCart.setShowLoginPage === 'function') {
                    authCart.setShowLoginPage(false);
                  }
                }}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}
              >
                ← العودة إلى المتجر الرئيسي
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}