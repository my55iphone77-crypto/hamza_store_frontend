import React, { useState, useEffect, useRef } from 'react';

const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export function LoginForm({ authCart, inputStyle = {} }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const {
    showLoginPage = false,
    setShowLoginPage = () => {},
    loginSubmitting = false,
    loginError = '',
    handleLoginSubmit = () => {},
    handleSocialLogin = () => {},
    pendingTwoFactor = null,
    showForgotPassword = false,
    setShowRegisterPage = () => {},
    setShowForgotPassword = () => {}
  } = safeAuthCart;

  if (!showLoginPage) return null;

  if (pendingTwoFactor) {
    return <TwoFactorForm authCart={authCart} inputStyle={inputStyle} />;
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm authCart={authCart} inputStyle={inputStyle} />;
  }

  const submit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!isValidEmail(cleanEmail)) {
      return;
    }
    await handleLoginSubmit(cleanEmail, password);
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
          {String(loginError)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>البريد الإلكتروني</label>
        <input
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e && e.target ? e.target.value : '')}
          required
          autoComplete="email"
          style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: '#94a3b8' }}>كلمة المرور</label>
        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e && e.target ? e.target.value : '')}
          required
          autoComplete="current-password"
          style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowForgotPassword(true)}
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
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const {
    pendingTwoFactor = null,
    setPendingTwoFactor = () => {},
    twoFactorSubmitting = false,
    loginError = '',
    handleVerifyTwoFactorLogin = () => {}
  } = safeAuthCart;

  if (!pendingTwoFactor) return null;

  const submit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const cleanCode = typeof code === 'string' ? code.trim() : '';
    if (cleanCode.length !== 6) return;
    await handleVerifyTwoFactorLogin(cleanCode);
  };

  return (
    <form onSubmit={submit} style={{ background: '#111827', padding: '20px', borderRadius: '16px', border: '1px solid #7c3aed', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', margin: 'auto' }}>
      <h3 style={{ margin: 0, color: '#c4b5fd', fontSize: '16px' }}>🔐 التحقق بخطوتين</h3>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
        أدخل الكود المكوّن من 6 أرقام من تطبيق المصادقة الخاص بحسابك ({String(pendingTwoFactor?.email || '')})
      </p>

      {loginError && (
        <div style={{ color: '#fca5a5', background: '#331a1a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
          {String(loginError)}
        </div>
      )}

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e && e.target ? e.target.value.replace(/\D/g, '') : '')}
        required
        autoComplete="one-time-code"
        style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '18px', letterSpacing: '6px', textAlign: 'center', ...(inputStyle || {}) }}
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
  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const {
    showForgotPassword = false,
    setShowForgotPassword = () => {},
    forgotPasswordSubmitting = false,
    forgotPasswordSent = false,
    setForgotPasswordSent = () => {},
    handleForgotPasswordRequest = () => {}
  } = safeAuthCart;

  if (!showForgotPassword) return null;

  const submit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!isValidEmail(cleanEmail)) return;
    await handleForgotPasswordRequest(cleanEmail);
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
            type="button"
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
              onChange={(e) => setEmail(e && e.target ? e.target.value : '')}
              required
              autoComplete="email"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }}
            />
          </div>
          <button
            type="button"
            disabled={forgotPasswordSubmitting}
            onClick={submit}
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

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const safeAuthCart = authCart && typeof authCart === 'object' ? authCart : {};
  const { handleResetPassword = () => {}, resetPasswordSubmitting = false } = safeAuthCart;

  const submit = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (isMounted.current) setLocalError('');

    if (!newPassword || newPassword.length < 8) {
      if (isMounted.current) setLocalError('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      if (isMounted.current) setLocalError('كلمتا المرور غير متطابقتين.');
      return;
    }

    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanToken = typeof token === 'string' ? token.trim() : '';

    const result = await handleResetPassword(cleanEmail, cleanToken, newPassword);
    const resObj = result && typeof result === 'object' ? result : { success: false, error: 'حدث خطأ غير متوقع' };

    if (resObj.success && isMounted.current) {
      setDone(true);
    } else if (isMounted.current) {
      setLocalError(resObj.error || 'فشلت عملية إعادة التعيين.');
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
                {String(localError)}
              </div>
            )}
            <input
              type="password"
              placeholder="كلمة المرور الجديدة"
              value={newPassword}
              onChange={(e) => setNewPassword(e && e.target ? e.target.value : '')}
              required
              autoComplete="new-password"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }}
            />
            <input
              type="password"
              placeholder="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e && e.target ? e.target.value : '')}
              required
              autoComplete="new-password"
              style={{ background: '#0b0f19', border: '1px solid #334155', padding: '10px 14px', borderRadius: '10px', color: '#fff', fontSize: '13px', ...(inputStyle || {}) }}
            />
            <button
              type="submit"
              disabled={resetPasswordSubmitting}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: resetPasswordSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}
            >
              {resetPasswordSubmitting ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}