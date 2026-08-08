import React, { useState, useEffect } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function Accounting({ currentUser: currentUserProp, inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const context = useApp ? useApp() : {};
  const {
    apiUrl, getAuthHeaders,
    currentUser: contextUser,
    accountingTransactions: transactions = [],
    setAccountingTransactions: setTransactions,
    globalBus,
    triggerGlobalSync,
    hasPermission
  } = context;

  const currentUser = currentUserProp || contextUser || { name: 'المالك' };

  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('income');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [savingState, setSavingState] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // حالات نافذة الإيميل
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('تقرير النظام المحاسبي والمالي');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const flashSaving = (msg, syncType = 'ACCOUNTING_SYNC') => {
    setSavingState(msg);
    setTimeout(() => setSavingState(''), 3000);
    if (typeof triggerGlobalSync === 'function') {
      triggerGlobalSync({ type: syncType, timestamp: Date.now() });
    }
  };

  // ⚡ الاستماع للتحديثات الفورية
  useEffect(() => {
    if (globalBus && (globalBus.type === 'ACCOUNTING_SYNC' || globalBus.type === 'GENERAL_SYNC')) {
      fetchTransactions();
    }
  }, [globalBus]);

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `فشل الطلب (${res.status})`);
    return data;
  }

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/accounting/transactions');
      setTransactions(Array.isArray(data) ? data : data.transactions || []);
    } catch (error) {
      console.error('خطأ في الاتصال بالخادم:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMailApi = async (to, subject, body, attachment = null) => {
    try {
      await apiFetch('/mails', {
        method: 'POST',
        body: JSON.stringify({ sender: currentUser?.name || "نظام المحاسبة", recipient: to, subject, body, attachment, date: new Date().toISOString() }),
      });
    } catch (error) {
      console.error('خطأ أثناء إرسال البريد:', error);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!hasPermission || !hasPermission('manage_accounting')) {
      alert('⛔ لا تملك صلاحية إدارة المحاسبة.');
      return;
    }
    if (!amount || !description.trim()) {
      alert('⚠️ يرجى إدخال المبلغ ووصف العملية المالية.');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert('⚠️ يرجى إدخال مبلغ مالي صحيح أكبر من الصفر.');
      return;
    }

    try {
      const savedTransaction = await apiFetch('/accounting/transactions', {
        method: 'POST',
        body: JSON.stringify({ type, amount: numericAmount, description: description.trim() }),
      });

      setTransactions((prev) => [savedTransaction, ...(Array.isArray(prev) ? prev : [])]);

      const operationName = type === 'income' ? 'إيراد مالي' : 'مصروفات تشغيلية';
      await sendMailApi(
        "manager@company.com",
        `💰 عملية ${operationName} جديدة`,
        `تم تسجيل ${operationName} بقيمة ${numericAmount} دينار.\nالوصف: ${description.trim()}\nالمسؤول: ${currentUser?.name || 'مدير النظام'}`,
        "transaction_report.pdf"
      );

      flashSaving('✅ تم حفظ المعاملة ومزامنتها لحظياً!', 'ACCOUNTING_SYNC');
      setAmount('');
      setDescription('');
    } catch (error) {
      console.error('خطأ في الاتصال بالخادم:', error);
      alert(error.message || '❌ فشل حفظ المعاملة المالية.');
    }
  };

  const deleteTransaction = async (id) => {
    if (!hasPermission || !hasPermission('manage_accounting')) {
      alert('⛔ لا تملك صلاحية حذف المعاملات.');
      return;
    }
    const target = safeTransactions.find((t) => (t._id || t.id) === id);
    if (!target) return;
    const targetId = target._id || target.id;

    const confirmed = window.confirm(`هل أنت متأكد من حذف هذه العملية؟\n"${target.description}" — ${target.amount} دينار`);
    if (!confirmed) return;

    try {
      await apiFetch(`/accounting/transactions/${targetId}`, { method: 'DELETE' });
      setTransactions((prev) => (Array.isArray(prev) ? prev.filter((t) => (t._id || t.id) !== id) : []));

      const transTypeArabic = target.type === 'income' ? 'إيراد' : 'مصروف';
      await sendMailApi("manager@company.com", `🗑️ حذف عملية مالية (${transTypeArabic})`, `تم حذف عملية مالية (${transTypeArabic}): (${target.description}) بقيمة (${target.amount} دينار).`);

      flashSaving('🗑️ تم الحذف والمزامنة بنجاح!', 'ACCOUNTING_SYNC');
    } catch (error) {
      console.error('خطأ في الاتصال بالخادم:', error);
      alert(error.message || '❌ فشل حذف المعاملة.');
    }
  };

  const handleSendRealEmail = async (e) => {
    e.preventDefault();
    if (!emailRecipient) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم!');
      return;
    }
    setIsSendingEmail(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      const authHeaders = getAuthHeaders ? getAuthHeaders() : {};
      Object.assign(headers, authHeaders);

      const response = await fetch(`${apiUrl}/send-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: emailRecipient,
          subject: emailSubject,
          message: emailBody || `تقرير النظام المحاسبي:\n- إجمالي الإيرادات: ${totalIncome} دينار\n- إجمالي المصاريف: ${totalExpense} دينار\n- صافي الأرباح: ${netProfit} دينار`
        }),
      });

      if (!response.ok) throw new Error('فشل إرسال البريد الإلكتروني من السيرفر.');

      alert('📧 تم إرسال التقرير المالي عبر البريد الإلكتروني بنجاح!');
      setIsEmailModalOpen(false);
      setEmailRecipient('');
      setEmailBody('');
    } catch (err) {
      alert('فشل إرسال الإيميل: ' + err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const exportCSV = () => {
    const header = "ID,Type,Amount,Description,Date\n";
    const rows = filteredTransactions.map(t => `${t._id || t.id || ''},${t.type},${t.amount},"${(t.description || '').replace(/"/g, '""')}",${t.date || ''}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `accounting_report_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const filteredTransactions = safeTransactions.filter((t) => {
    if (!t) return false;
    const matchType = filterType === 'all' ? true : t.type === filterType;
    const matchSearch = (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    let matchDate = true;
    if (dateFrom && t.date) matchDate = new Date(t.date) >= new Date(dateFrom);
    if (dateTo && t.date) matchDate = matchDate && new Date(t.date) <= new Date(dateTo + 'T23:59:59');
    return matchType && matchSearch && matchDate;
  });

  const totalIncome = safeTransactions.filter((t) => t && t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpense = safeTransactions.filter((t) => t && t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  return (
    <div style={{ ...glassContainerStyle, ...fullBleedStyle }} dir="rtl">
      {/* رأس الصفحة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#f59e0b', fontSize: '22px', fontWeight: 'bold' }}>💼 النظام المحاسبي والمالي الموحد</h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>إدارة الإيرادات والمصروفات مع المزامنة اللحظية.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {savingState && <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 'bold' }}>{savingState}</span>}
          <button type="button" onClick={exportCSV} style={{ ...secondaryButtonStyle, background: '#3b82f6' }}>📥 تصدير CSV</button>
          <button type="button" onClick={() => setIsEmailModalOpen(true)} style={secondaryButtonStyle}>📨 إرسال تقرير إيميل</button>
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', color: '#38bdf8', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 'bold' }}>
            إجمالي العمليات: {safeTransactions.length}
          </div>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>إجمالي الإيرادات</span>
          <span style={{ color: '#10b981', fontSize: '18px', fontWeight: 'bold' }}>{totalIncome.toLocaleString()} دينار</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>إجمالي المصاريف</span>
          <span style={{ color: '#ef4444', fontSize: '18px', fontWeight: 'bold' }}>{totalExpense.toLocaleString()} دينار</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>صافي الأرباح</span>
          <span style={{ color: netProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '18px', fontWeight: 'bold' }}>{netProfit.toLocaleString()} دينار</span>
        </div>
      </div>

      <form onSubmit={handleAddTransaction} style={glassCardStyle}>
        <h4 style={{ margin: '0', color: '#38bdf8', fontSize: '15px' }}>➕ تسجيل معاملة مالية جديدة</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={glassInputStyle}>
            <option value="income" style={{ background: '#0b0f19' }}>💰 إيراد مالي</option>
            <option value="expense" style={{ background: '#0b0f19' }}>💸 مصاريف تشغيلية</option>
          </select>
          <input type="number" min="0" step="0.01" placeholder="المبلغ (دينار)..." value={amount} onChange={(e) => setAmount(e.target.value)} style={glassInputStyle} />
          <input type="text" placeholder="وصف العملية المالية..." value={description} onChange={(e) => setDescription(e.target.value)} style={glassInputStyle} />
        </div>
        <button type="submit" style={primaryButtonStyle}>
          إتمام العملية وتوثيقها ➕
        </button>
      </form>

      <div style={glassCardStyle}>
        <h4 style={{ margin: '0', color: '#facc15', fontSize: '14px' }}>🔍 بحث وفلترة المعاملات</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <input type="text" placeholder="ابحث في وصف العمليات..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={glassInputStyle} />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={glassInputStyle}>
            <option value="all" style={{ background: '#0b0f19' }}>كل الأنواع</option>
            <option value="income" style={{ background: '#0b0f19' }}>الإيرادات فقط 💰</option>
            <option value="expense" style={{ background: '#0b0f19' }}>المصاريف فقط 💸</option>
          </select>
          <input type="date" placeholder="من تاريخ" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={glassInputStyle} />
          <input type="date" placeholder="إلى تاريخ" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={glassInputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px' }}>
        {loading ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>جاري تحميل البيانات...</p>
        ) : filteredTransactions.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
            {safeTransactions.length === 0 ? 'لا توجد أي معاملات مالية مسجّلة بعد.' : 'لا توجد معاملات مطابقة'}
          </p>
        ) : (
          filteredTransactions.map((t) => {
            const transId = t._id || t.id;
            return (
              <div key={transId} style={recordCardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#94a3b8' }}>📅 {t.date ? new Date(t.date).toLocaleString('ar-JO') : 'وقت سابق'}</span>
                    <span style={{ background: 'rgba(30, 41, 59, 0.8)', color: t.type === 'income' ? '#34d399' : '#ef4444', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                      {t.type === 'income' ? '💰 إيراد' : '💸 مصروف'}
                    </span>
                    <span style={{ color: '#facc15', fontWeight: 'bold', fontSize: '15px' }}>{t.amount} دينار</span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#fff', fontSize: '14px' }}>📝 {t.description}</p>
                </div>
                <button type="button" onClick={() => deleteTransaction(transId)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  حذف 🗑️
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* نافذة الإيميل */}
      {isEmailModalOpen && (
        <div style={modalOverlayStyle} dir="rtl">
          <div style={modalContentStyle}>
            <button onClick={() => setIsEmailModalOpen(false)} style={closeBtnStyle}>✕</button>
            <h3 style={{ color: '#38bdf8', margin: '0 0 15px 0' }}>📨 إرسال التقرير المالي</h3>
            <form onSubmit={handleSendRealEmail} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="email" placeholder="البريد الإلكتروني للمستلم *" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} style={glassInputStyle} required />
              <input type="text" placeholder="عنوان الرسالة..." value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} style={glassInputStyle} />
              <textarea placeholder="محتوى التقرير..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={4} style={glassInputStyle} />
              <button type="submit" style={primaryButtonStyle} disabled={isSendingEmail}>
                {isSendingEmail ? '⏳ جاري الإرسال...' : 'إرسال التقرير 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.78)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '30px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)'
};

const glassCardStyle = {
  background: 'rgba(17, 24, 39, 0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  padding: '20px',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  marginBottom: '25px',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px'
};

const recordCardStyle = {
  background: 'rgba(17, 24, 39, 0.75)',
  backdropFilter: 'blur(10px)',
  padding: '16px',
  borderRadius: '14px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
  boxShadow: '0 8px 16px -4px rgba(0,0,0,0.3)'
};

const statBoxStyle = {
  background: 'rgba(11, 15, 25, 0.75)',
  backdropFilter: 'blur(10px)',
  padding: '15px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.08)'
};

const glassInputStyle = {
  background: 'rgba(11, 15, 25, 0.7)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  padding: '10px 14px',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  fontFamily: 'Tajawal, sans-serif',
  boxSizing: 'border-box'
};

const primaryButtonStyle = {
  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  color: '#fff',
  border: 'none',
  padding: '12px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px',
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
};

const secondaryButtonStyle = {
  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
};

const modalContentStyle = {
  background: 'rgba(30, 41, 59, 0.88)', backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '20px',
  padding: '25px', width: '100%', maxWidth: '480px', maxHeight: '90vh',
  overflowY: 'auto', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
  textAlign: 'right'
};

const closeBtnStyle = {
  position: 'absolute', top: '15px', left: '15px', background: 'rgba(255,255,255,0.1)',
  color: '#fff', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold'
};

export default Accounting;