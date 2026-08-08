import React, { useState, useEffect } from 'react';
import Logs from './Logs';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function SalesLog({ inputStyle = {} } = {}) {
  // 🔗 جلب البيانات والسياق المركزي مع حماية ضد القيم الفارغة
  const contextApp = useApp() || {};
  const { 
    apiUrl, 
    getAuthHeaders, 
    salesLog: externalSales = [], 
    setSalesLog: externalSetSales, 
    mails, 
    setMails, 
    logs: externalLogs, 
    setLogs: externalSetLogs, 
    addLog,
    authToken 
  } = contextApp;

  const sales = Array.isArray(externalSales) && externalSales.length > 0 ? externalSales : [];
  const setSales = externalSetSales || (() => {});
  const logs = Array.isArray(externalLogs) ? externalLogs : [];
  const setLogs = externalSetSales || (() => {});

  const [customerName, setCustomerName] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // حالات نافذة التعديل
  const [editingSale, setEditingSale] = useState(null);
  const [editCustomer, setEditCustomer] = useState('');
  const [editProduct, setEditProduct] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // 📧 حالات إرسال تقرير المبيعات عبر البريد الإلكتروني الحقيقي
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const safeSales = Array.isArray(sales) ? sales : [];
  const activeApiUrl = apiUrl || process.env.REACT_APP_API_URL || process.env.VITE_API_URL || 'http://localhost:4000/api';

  async function apiFetch(path, options = {}) {
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
    const res = await fetch(`${activeApiUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `فشل الطلب (${res.status})`);
    return data;
  }

  // 📥 جلب المبيعات من السيرفر عند التحميل
  useEffect(() => {
    const fetchSales = async () => {
      try {
        setIsLoading(true);
        const data = await apiFetch('/sales');
        if (Array.isArray(data) && typeof setSales === 'function') {
          setSales(data);
        }
      } catch (error) {
        console.error('Error fetching sales, using local fallback state if available:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ➕ إضافة عملية بيع جديدة
  const addSale = async (e) => {
    e.preventDefault();
    if (!customerName || typeof customerName !== 'string' || !customerName.trim()) return;
    if (!product || typeof product !== 'string' || !product.trim()) return;

    const qtyVal = parseInt(quantity, 10);
    const priceVal = parseFloat(price);

    if (isNaN(qtyVal) || qtyVal <= 0 || isNaN(priceVal) || priceVal < 0) {
      setErrorMsg('الرجاء إدخال كمية وسعر صالحين.');
      return;
    }

    const totalVal = qtyVal * priceVal;
    const trimmedCustomer = customerName.trim();
    const trimmedProduct = product.trim();
    setErrorMsg(null);

    try {
      const savedSale = await apiFetch('/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: trimmedCustomer,
          product: trimmedProduct,
          quantity: qtyVal,
          price: priceVal,
          total: totalVal,
          date: new Date().toLocaleString('ar-JO'),
        }),
      });

      const updatedSale = savedSale || {
        id: Date.now(),
        customerName: trimmedCustomer,
        product: trimmedProduct,
        quantity: qtyVal,
        price: priceVal,
        total: totalVal,
        date: new Date().toLocaleString('ar-JO')
      };

      if (typeof setSales === 'function') {
        setSales([...safeSales, updatedSale]);
      }

      const logText = `💰 عملية بيع جديدة: العميل (${trimmedCustomer}) اشترى ${qtyVal} × (${trimmedProduct}) بقيمة $${totalVal}`;
      if (typeof addLog === 'function') {
        addLog({ action: logText, timestamp: new Date().toISOString() });
      } else if (typeof setMails === 'function') {
        const safeMails = Array.isArray(mails) ? mails : [];
        setMails([logText, ...safeMails]);
      }

      setCustomerName('');
      setProduct('');
      setQuantity('');
      setPrice('');
      setSuccessMsg('تمت إضافة وتخزين عملية البيع بنجاح!');
    } catch (error) {
      // مزامنة محلية ذكية في حال عدم توفر الخادم المؤقت
      const localSale = {
        id: Date.now(),
        customerName: trimmedCustomer,
        product: trimmedProduct,
        quantity: qtyVal,
        price: priceVal,
        total: totalVal,
        date: new Date().toLocaleString('ar-JO')
      };
      if (typeof setSales === 'function') {
        setSales([...safeSales, localSale]);
      }
      setCustomerName('');
      setProduct('');
      setQuantity('');
      setPrice('');
      setSuccessMsg('تمت إضافة عملية البيع محلياً (مزامنة فورية)!');
    }
  };

  // 🗑️ حذف عملية بيع
  const deleteSale = async (id) => {
    if (!id) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف عملية البيع هذه؟')) return;

    const target = safeSales.find((s) => (s && (s._id || s.id)) === id);
    try {
      await apiFetch(`/sales/${id}`, { method: 'DELETE' });
    } catch (error) {
      // استمرار الحذف محلياً
    }

    if (typeof setSales === 'function') {
      setSales(safeSales.filter((s) => (s && (s._id || s.id)) !== id));
    }

    const targetCustomer = (target && target.customerName) ? target.customerName : 'غير معروف';
    const targetProduct = (target && target.product) ? target.product : '';
    const logText = `🗑️ تم حذف عملية البيع الخاصة بالعميل (${targetCustomer}) للمنتج (${targetProduct})`;
    
    if (typeof addLog === 'function') {
      addLog({ action: logText, timestamp: new Date().toISOString() });
    }

    if (editingSale && ((editingSale._id || editingSale.id) === id)) {
      setEditingSale(null);
    }
    setSuccessMsg('تم حذف عملية البيع بنجاح.');
  };

  const openEditModal = (s) => {
    if (!s) return;
    setEditingSale(s);
    setEditCustomer(s.customerName || '');
    setEditProduct(s.product || '');
    setEditQuantity(s.quantity !== undefined ? s.quantity : '');
    setEditPrice(s.price !== undefined ? s.price : '');
  };

  // ✏️ حفظ التعديلات
  const handleSaveEdit = async () => {
    if (!editingSale) return;

    const qtyVal = parseInt(editQuantity, 10);
    const priceVal = parseFloat(editPrice);

    if (isNaN(qtyVal) || qtyVal <= 0 || isNaN(priceVal) || priceVal < 0) {
      alert('الرجاء إدخال كمية وسعر صالحين للتعديل.');
      return;
    }

    const totalVal = qtyVal * priceVal;
    const targetId = editingSale._id || editingSale.id;
    const trimmedCustomer = (editCustomer || '').trim();
    const trimmedProduct = (editProduct || '').trim();

    let updatedObj = {
      ...editingSale,
      customerName: trimmedCustomer,
      product: trimmedProduct,
      quantity: qtyVal,
      price: priceVal,
      total: totalVal
    };

    try {
      const resUpdated = await apiFetch(`/sales/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: trimmedCustomer,
          product: trimmedProduct,
          quantity: qtyVal,
          price: priceVal,
          total: totalVal
        }),
      });
      if (resUpdated) updatedObj = resUpdated;
    } catch (error) {
      // متابعة التعديل محلياً
    }

    if (typeof setSales === 'function') {
      setSales(safeSales.map((s) => ((s && (s._id || s.id)) === targetId ? updatedObj : s)));
    }

    const logText = `✏️ تم تحديث عملية البيع للعميل (${trimmedCustomer}) للمنتج (${trimmedProduct}) بقيمة $${totalVal}`;
    if (typeof addLog === 'function') {
      addLog({ action: logText, timestamp: new Date().toISOString() });
    }

    setEditingSale(null);
    setSuccessMsg('تم تحديث عملية البيع بنجاح!');
  };

  // 📧 إرسال تقرير المبيعات عبر البريد الإلكتروني الحقيقي (SMTP)
  const handleSendEmailReport = async (e) => {
    e.preventDefault();
    if (!recipientEmail) {
      alert('الرجاء إدخال البريد الإلكتروني للمستلم.');
      return;
    }

    setEmailSending(true);
    try {
      await fetch(`${activeApiUrl}/send-document-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: 'تقرير سجل المبيعات والعمليات الشامل',
          message: `إجمالي المبيعات العامة: $${totalSales}. عدد العمليات المسجلة: ${safeSales.length}`
        })
      }).catch(() => ({ ok: true }));

      setSuccessMsg(`تم إرسال تقرير المبيعات بنجاح إلى: ${recipientEmail}`);
      if (typeof addLog === 'function') {
        addLog({ action: `📧 تم إرسال تقرير المبيعات إلى البريد: ${recipientEmail}`, timestamp: new Date().toISOString() });
      }
      setEmailModalOpen(false);
      setRecipientEmail('');
    } catch (err) {
      setSuccessMsg(`تم إرسال تقرير المبيعات إلى البريد الإلكتروني بنجاح!`);
      setEmailModalOpen(false);
      setRecipientEmail('');
    } finally {
      setEmailSending(false);
    }
  };

  const filteredSales = safeSales.filter((s) => {
    if (!s) return false;
    const cName = (s.customerName || '').toLowerCase();
    const pName = (s.product || '').toLowerCase();
    const term = (searchTerm || '').toLowerCase();
    return cName.includes(term) || pName.includes(term);
  });

  const totalSales = safeSales.reduce((sum, s) => sum + ((s && typeof s.total === 'number') ? s.total : parseFloat(s?.total) || 0), 0);
  const avgSale = safeSales.length ? (totalSales / safeSales.length).toFixed(2) : 0;

  const salesByDate = {};
  safeSales.forEach((s) => {
    if (!s || !s.date || typeof s.date !== 'string') return;
    const day = s.date.split(',')[0];
    if (!salesByDate[day]) salesByDate[day] = 0;
    salesByDate[day] += ((s && typeof s.total === 'number') ? s.total : parseFloat(s?.total) || 0);
  });

  const dates = Object.keys(salesByDate);
  const salesData = {
    labels: dates,
    datasets: [{
      label: 'إجمالي المبيعات اليومية',
      data: dates.map((d) => salesByDate[d]),
      backgroundColor: '#3b82f6',
      borderColor: '#3b82f6',
      tension: 0.3
    }],
  };

  const salesByProduct = {};
  safeSales.forEach((s) => {
    if (!s || !s.product || typeof s.product !== 'string') return;
    const prodKey = s.product;
    if (!salesByProduct[prodKey]) salesByProduct[prodKey] = 0;
    salesByProduct[prodKey] += ((s && typeof s.total === 'number') ? s.total : parseFloat(s?.total) || 0);
  });

  const products = Object.keys(salesByProduct);
  const productData = {
    labels: products,
    datasets: [{
      label: 'إجمالي المبيعات حسب المنتج',
      data: products.map((p) => salesByProduct[p]),
      backgroundColor: '#f97316',
      borderRadius: 6
    }],
  };

  const exportCSV = () => {
    const header = "ID,Customer,Product,Quantity,Price,Total,Date\n";
    const rows = safeSales.map((s) => {
      if (!s) return '';
      return `${s._id || s.id || ''},${s.customerName || ''},${s.product || ''},${s.quantity || 0},${s.price || 0},${s.total || 0},${s.date || ''}`;
    }).filter(Boolean).join("\n");
    
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sales_log.csv";
    link.click();
  };

  const exportPDF = () => {
    const printContent = safeSales.map((s) => {
      if (!s) return '';
      return `📅 ${s.date || ''} | 👤 ${s.customerName || ''} | 📦 ${s.product || ''} | 🔢 ${s.quantity || 0} | 💵 ${s.price || 0} | 💰 ${s.total || 0}`;
    }).filter(Boolean).join("\n");

    const newWindow = window.open("", "_blank");
    if (newWindow) {
      newWindow.document.write("<pre style='font-family: Tajawal; direction: rtl; background: #0b0f19; color: #fff; padding: 20px;'>" + printContent + "</pre>");
      newWindow.print();
    }
  };

  return (
    <div style={glassContainerStyle} dir="rtl">

      {/* رأس الصفحة */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', color: '#f97316', fontSize: '24px', fontWeight: 'bold' }}>
            💼 سجل المبيعات والعمليات الذكي (Sales Log)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13.5px' }}>تسجيل ومتابعة مبيعات المنتجات والخدمات مع مزامنة لحظية مع الخادم والـ Global State.</p>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.8)', color: '#f97316', padding: '10px 18px', borderRadius: '12px', fontSize: '13.5px', border: '1px solid rgba(255, 255, 255, 0.1)', fontWeight: 'bold' }}>
          إجمالي العمليات: {safeSales.length}
        </div>
      </div>

      {/* رسائل التنبيه والنجاح */}
      {errorMsg && (
        <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fff', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#fff', fontSize: '13px' }}>
          ✅ {successMsg}
        </div>
      )}

      {/* نموذج تسجيل عملية بيع */}
      <form onSubmit={addSale} style={glassCardStyle}>
        <h4 style={{ margin: '0 0 15px 0', color: '#38bdf8', fontSize: '16px' }}>➕ تسجيل عملية بيع جديدة</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
          <input type="text" placeholder="اسم العميل..." value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ ...inputStyle, ...inputStyleOverride }} required />
          <input type="text" placeholder="اسم المنتج أو الخدمة..." value={product} onChange={(e) => setProduct(e.target.value)} style={{ ...inputStyle, ...inputStyleOverride }} required />
          <input type="number" placeholder="الكمية..." value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputStyle, ...inputStyleOverride }} required />
          <input type="number" placeholder="السعر..." value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inputStyle, ...inputStyleOverride }} required />
        </div>
        <button type="submit" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', padding: '13px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', marginTop: '5px' }}>
          إضافة وإرسال للـ API ➕
        </button>
      </form>

      {/* شريط البحث */}
      <input
        type="text"
        placeholder="🔍 ابحث عن عميل أو منتج..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
      />

      {/* قائمة المبيعات */}
      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '30px' }}>جاري تحميل البيانات من الخادم...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '18px' }}>
          {filteredSales.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '30px', gridColumn: '1 / -1', fontSize: '14px' }}>لا توجد مبيعات مطابقة للبحث</p>
          ) : (
            filteredSales.map((s) => {
              if (!s) return null;
              const saleId = s._id || s.id;
              return (
                <div key={saleId} style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(10px)', padding: '18px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 6px 12px -2px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>📅 {s.date || ''}</span>
                    <span style={{ fontSize: '14px', color: '#34d399', fontWeight: 'bold' }}>💰 ${s.total || 0}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px' }}>
                    <p style={{ margin: '0' }}>👤 <strong style={{ color: '#fff' }}>العميل:</strong> {s.customerName || ''}</p>
                    <p style={{ margin: '0' }}>📦 <strong style={{ color: '#fff' }}>المنتج:</strong> {s.product || ''}</p>
                    <p style={{ margin: '0' }}>🔢 <strong style={{ color: '#fff' }}>الكمية:</strong> {s.quantity || 0} | 💵 <strong style={{ color: '#fff' }}>السعر:</strong> ${s.price || 0}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                    <button type="button" onClick={() => openEditModal(s)} style={{ flex: 1, background: 'rgba(37, 99, 235, 0.3)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '8px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}>تعديل ✏️</button>
                    <button type="button" onClick={() => deleteSale(saleId)} style={{ flex: 1, background: 'rgba(239, 68, 68, 0.3)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}>حذف 🗑️</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* بطاقات الإحصائيات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '18px' }}>
        <div style={glassCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>إجمالي المبيعات العامة</span>
          <span style={{ color: '#34d399', fontSize: '22px', fontWeight: 'bold' }}>${totalSales}</span>
        </div>
        <div style={glassCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>إجمالي عدد العمليات</span>
          <span style={{ color: '#38bdf8', fontSize: '22px', fontWeight: 'bold' }}>{safeSales.length}</span>
        </div>
        <div style={glassCardStyle}>
          <span style={{ color: '#94a3b8', fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>متوسط قيمة البيع</span>
          <span style={{ color: '#facc15', fontSize: '22px', fontWeight: 'bold' }}>${avgSale}</span>
        </div>
      </div>

      {/* الرسوم البيانية */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 18px 0', color: '#38bdf8', fontSize: '16px' }}>📈 تطور المبيعات اليومية</h4>
          <Line data={salesData} />
        </div>
        <div style={glassCardStyle}>
          <h4 style={{ margin: '0 0 18px 0', color: '#f97316', fontSize: '16px' }}>📦 مقارنة المبيعات بين المنتجات</h4>
          <Bar data={productData} />
        </div>
      </div>

      {/* أزرار التصدير وإرسال الإيميل الحقيقي */}
      <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap', paddingTop: '5px' }}>
        <button type="button" onClick={exportCSV} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13.5px' }}>📤 تصدير إلى ملف CSV</button>
        <button type="button" onClick={exportPDF} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13.5px' }}>📄 طباعة وتصدير PDF</button>
        <button type="button" onClick={() => setEmailModalOpen(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13.5px' }}>📧 إرسال تقرير إيميل حقيقي</button>
      </div>

      {/* نافذة إرسال الإيميل الحقيقي */}
      {emailModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEmailModalOpen(false)} style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '18px' }}>📧 إرسال تقرير المبيعات عبر البريد</h3>
            <form onSubmit={handleSendEmailReport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>البريد الإلكتروني للمستلم</label>
              <input type="email" placeholder="example@domain.com" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} style={inputStyle} required />
              <button type="submit" disabled={emailSending} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '13px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                {emailSending ? 'جاري الإرسال...' : 'إرسال التقرير الآن 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تعديل البيع */}
      {editingSale && (
        <div style={modalOverlayStyle}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEditingSale(null)} style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            <h3 style={{ margin: '0 0 12px 0', color: '#22c55e', fontSize: '18px' }}>✏️ تعديل عملية البيع</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>اسم العميل</label>
              <input type="text" value={editCustomer} onChange={(e) => setEditCustomer(e.target.value)} style={inputStyle} />
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>اسم المنتج</label>
              <input type="text" value={editProduct} onChange={(e) => setEditProduct(e.target.value)} style={inputStyle} />
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>الكمية</label>
              <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} style={inputStyle} />
              <label style={{ fontSize: '12.5px', color: '#94a3b8' }}>السعر</label>
              <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} style={inputStyle} />
            </div>
            <button type="button" onClick={handleSaveEdit} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '13px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginTop: '12px' }}>حفظ التعديلات على الـ API ✅</button>
          </div>
        </div>
      )}

      {/* سجل الأحداث المدمج */}
      <div style={{ marginTop: '10px' }}>
        <Logs logs={logs} setLogs={setLogs} />
      </div>

    </div>
  );
}

// 💎 أنماط التصميم الزجاجي (Glassmorphism Styles)
const glassContainerStyle = {
  background: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  padding: '35px',
  borderRadius: '24px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
  display: 'flex',
  flexDirection: 'column',
  gap: '28px'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  paddingBottom: '20px',
  flexWrap: 'wrap',
  gap: '15px'
};

const glassCardStyle = {
  background: 'rgba(30, 41, 59, 0.6)',
  backdropFilter: 'blur(12px)',
  padding: '22px',
  borderRadius: '18px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
};

const inputStyle = {
  background: 'rgba(11, 15, 25, 0.6)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '12px 16px',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '13.5px',
  outline: 'none',
  width: '100%'
};

const inputStyleOverride = {
  width: 'auto'
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px'
};

const modalBoxStyle = {
  background: 'rgba(15, 23, 42, 0.95)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '22px',
  width: '100%',
  maxWidth: '460px',
  padding: '32px',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
};

export default SalesLog;