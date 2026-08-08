import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function canManageCoupons(role) {
  return ["admin", "manager"].includes(role);
}

const escapeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
};

const escapeCSV = (str) => {
  if (typeof str !== 'string') return str;
  if (/^[=+\-@]/.test(str)) return `'${str}`;
  return str.replace(/"/g, '""');
};

function Coupons({
  currentUser: externalCurrentUser,
  setMails: externalSetMails = () => {},
  inputStyle = {},
  employees: externalEmployees = [],
  contacts: externalContacts = []
}) {
  const fullBleedStyle = useFullBleedStyle();
  const {
    token, apiUrl, apiRequest, coupons = [], setCoupons,
    employees: contextEmployees = [], contacts: contextContacts = [],
    currentUser: contextCurrentUser, socket
  } = useApp() || {};

  const [internalCoupons, setInternalCoupons] = useState([]);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [audience, setAudience] = useState("customers");
  const [expiry, setExpiry] = useState("");
  const [maxUsage, setMaxUsage] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [description, setDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [mailStatus, setMailStatus] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [copiedCode, setCopiedCode] = useState("");
  const [showStats, setShowStats] = useState(true);

  const currentUser = externalCurrentUser || contextCurrentUser || { role: "guest", name: "زائر" };
  const rawCoupons = coupons.length > 0 ? coupons : internalCoupons;
  const safeCoupons = rawCoupons || [];

  const updateCoupons = (newList) => {
    setInternalCoupons(newList);
    if (setCoupons && typeof setCoupons === "function") setCoupons(newList);
  };

  const finalEmployees = contextEmployees.length > 0 ? contextEmployees : externalEmployees;
  const finalContacts = contextContacts.length > 0 ? contextContacts : externalContacts;

  const fetchServerData = useCallback(async () => {
    if (!apiRequest) return;
    setIsLoading(true);
    try {
      const response = await apiRequest("/coupons", "GET");
      if (response) {
        const list = Array.isArray(response) ? response : (response.coupons || []);
        updateCoupons(list);
      }
    } catch (err) {
      console.error("Error fetching coupons:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => { fetchServerData(); }, [apiUrl, token]);

  useEffect(() => {
    if (!socket) return;
    const handleCouponsUpdate = (updatedCoupons) => {
      if (Array.isArray(updatedCoupons)) updateCoupons(updatedCoupons);
      else fetchServerData();
    };
    socket.on('COUPONS_UPDATED', handleCouponsUpdate);
    return () => { socket.off('COUPONS_UPDATED', handleCouponsUpdate); };
  }, [socket]);

  const isExpired = (expiryDate) => {
    if (!expiryDate) return false;
    const parsedDate = new Date(expiryDate);
    return isNaN(parsedDate.getTime()) ? false : new Date() > parsedDate;
  };

  const formatExpiryDate = (expiryDate) => {
    if (!expiryDate) return "غير محدد";
    const dateObj = new Date(expiryDate);
    return isNaN(dateObj.getTime()) ? expiryDate : dateObj.toLocaleDateString("ar-JO");
  };

  const getCouponStatus = (c) => {
    if (!c) return { label: "غير معروف", color: "#94a3b8" };
    if (isExpired(c.expiry)) return { label: "❌ منتهي", color: "#ef4444" };
    if ((c.usageCount || 0) >= (c.maxUsage || 1)) return { label: "⛔ وصل للحد", color: "#f59e0b" };
    return { label: "✅ صالح", color: "#10b981" };
  };

  const stats = useMemo(() => {
    const total = safeCoupons.length;
    const active = safeCoupons.filter(c => !isExpired(c?.expiry) && (c?.usageCount || 0) < (c?.maxUsage || 1)).length;
    const expired = safeCoupons.filter(c => isExpired(c?.expiry)).length;
    const exhausted = safeCoupons.filter(c => !isExpired(c?.expiry) && (c?.usageCount || 0) >= (c?.maxUsage || 1)).length;
    const totalUsages = safeCoupons.reduce((sum, c) => sum + (c?.usageCount || 0), 0);
    return { total, active, expired, exhausted, totalUsages };
  }, [safeCoupons]);

  const sendRealEmailNotification = async (recipientEmail, subject, htmlContent) => {
    if (!apiRequest || !recipientEmail) return;
    try {
      setMailStatus("جاري إرسال البريد...");
      const res = await apiRequest("/mails/send-real", "POST", { to: recipientEmail, subject, html: htmlContent });
      setMailStatus(res?.success ? "✅ تم إرسال الإيميل!" : "⚠️ تم الحفظ لكن تعذر الإرسال.");
    } catch (err) {
      setMailStatus("❌ فشل في إرسال الإيميل.");
    } finally {
      setTimeout(() => setMailStatus(""), 4000);
    }
  };

  const sendInternalMail = async (to, subject, body) => {
    if (!apiRequest) return;
    try {
      const response = await apiRequest("/mails", "POST", { sender: "نظام الكوبونات", recipient: to, subject, body, read: false });
      if (response && externalSetMails) externalSetMails(prev => [...(prev || []), response]);
    } catch (err) { console.error("Error sending internal mail", err); }
  };

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family:'Tajawal',sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:40px;direction:rtl;color:#f8fafc;">
      <div style="max-width:600px;margin:0 auto;background:rgba(255,255,255,0.05);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:30px;box-shadow:0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color:#facc15;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:15px;margin-top:0;">${title}</h2>
        <div style="font-size:15px;line-height:1.8;color:#cbd5e1;">${contentHtml}</div>
        <div style="margin-top:30px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:#64748b;text-align:center;">
          نظام إدارة الكوبونات &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  const handleAddCoupon = async (e) => {
    e.preventDefault();
    if (!canManageCoupons(currentUser?.role)) { alert("❌ لا تملك صلاحية."); return; }
    const trimmedCode = typeof code === 'string' ? code.trim().toUpperCase() : "";
    const parsedDiscount = parseFloat(discount);
    const trimmedExpiry = typeof expiry === 'string' ? expiry.trim() : "";
    const parsedMaxUsage = parseInt(maxUsage, 10);
    const parsedMinOrder = parseFloat(minOrder) || 0;

    if (!trimmedCode || isNaN(parsedDiscount) || parsedDiscount <= 0 || !trimmedExpiry || isNaN(parsedMaxUsage) || parsedMaxUsage <= 0 || !apiRequest) {
      alert("الرجاء التأكد من تعبئة كافة الحقول بشكل صحيح."); return;
    }
    if (safeCoupons.some(c => c?.code?.toUpperCase() === trimmedCode)) { alert("❌ الكود مستخدم مسبقاً."); return; }

    const newCouponObj = {
      id: 'coup_' + Date.now(), code: trimmedCode, discount: parsedDiscount, discountType,
      audience, expiry: new Date(trimmedExpiry).toISOString(), date: new Date().toLocaleString("ar-JO"),
      usageCount: 0, users: [], maxUsage: parsedMaxUsage, minOrder: parsedMinOrder,
      description: description.trim() || "", createdBy: currentUser?.name || "نظام"
    };

    try {
      const response = await apiRequest("/coupons", "POST", newCouponObj);
      const savedCoupon = response || newCouponObj;
      const updatedList = [...safeCoupons, savedCoupon];
      updateCoupons(updatedList);

      const message = `كود: ${trimmedCode} — ${discountType === 'percentage' ? 'خصم ' + parsedDiscount + '%' : 'خصم ثابت ' + parsedDiscount + ' دينار'} — صالح حتى ${trimmedExpiry}`;
      await sendInternalMail(`all-${audience}`, "🎟️ كوبون جديد", message);

      const emailHtmlBody = getGlassEmailTemplate("🎟️ كوبون خصم جديد", `
        <p>تم إصدار كوبون خصم جديد:</p>
        <ul style="list-style:none;padding:0;line-height:2;">
          <li>🏷️ <strong>الكود:</strong> <span style="color:#facc15;font-weight:bold;font-size:18px;">${trimmedCode}</span></li>
          <li>💸 <strong>الخصم:</strong> ${discountType === 'percentage' ? parsedDiscount + '%' : parsedDiscount + ' دينار'}</li>
          <li>🕒 <strong>صالح حتى:</strong> ${trimmedExpiry}</li>
          <li>👥 <strong>الفئة:</strong> ${audience}</li>
          ${parsedMinOrder > 0 ? `<li>🛒 <strong>الحد الأدنى:</strong> ${parsedMinOrder} دينار</li>` : ''}
          ${description ? `<li>📝 <strong>الوصف:</strong> ${description}</li>` : ''}
        </ul>
      `);

      if (audience === "customers" && finalContacts.length > 0) {
        for (let c of finalContacts) if (c?.email) await sendRealEmailNotification(c.email, "🎟️ كوبون خصم جديد", emailHtmlBody);
      } else if (audience === "employees" && finalEmployees.length > 0) {
        for (let emp of finalEmployees) if (emp?.email) await sendRealEmailNotification(emp.email, "🎟️ كوبون خصم للموظفين", emailHtmlBody);
      } else {
        await sendRealEmailNotification("manager@company.com", "🎟️ كوبون عام جديد", emailHtmlBody);
      }

      setCode(""); setDiscount(""); setDiscountType("percentage"); setExpiry(""); setMaxUsage(""); setMinOrder(""); setDescription("");
    } catch (err) {
      console.error("Error adding coupon:", err);
      alert("فشل في إضافة الكوبون.");
    }
  };

  const handleDeleteCoupon = async (id, couponCode) => {
    if (!canManageCoupons(currentUser?.role)) { alert("❌ لا تملك صلاحية."); return; }
    if (!apiRequest || !id) return;
    if (!window.confirm(`هل أنت متأكد من حذف الكوبون "${couponCode}"؟`)) return;
    try {
      await apiRequest(`/coupons/${id}`, "DELETE");
      const updatedList = safeCoupons.filter(c => c && c.id !== id);
      updateCoupons(updatedList);
      await sendInternalMail("manager@company.com", "🗑️ حذف كوبون", `تم حذف الكوبون ${couponCode || ''}`);
    } catch (err) { alert("فشل في حذف الكوبون."); }
  };

  const startEdit = (coupon) => {
    if (!canManageCoupons(currentUser?.role)) { alert("❌ لا تملك صلاحية."); return; }
    setEditingId(coupon.id); setEditData({ ...coupon });
  };

  const saveEdit = async () => {
    if (!apiRequest || !editingId) return;
    try {
      const updated = { ...editData, lastModified: new Date().toISOString() };
      await apiRequest(`/coupons/${editingId}`, "PUT", updated);
      const updatedList = safeCoupons.map(c => c?.id === editingId ? updated : c);
      updateCoupons(updatedList); setEditingId(null); setEditData({});
      await sendInternalMail("manager@company.com", "✏️ تعديل كوبون", `تم تعديل الكوبون ${updated.code}`);
    } catch (err) { alert("فشل في تحديث الكوبون."); }
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const handleUseCoupon = async (coupon, userName) => {
    if (!coupon?.id) return;
    if (isExpired(coupon.expiry)) { alert("❌ منتهي الصلاحية!"); return; }
    if ((coupon.usageCount || 0) >= (coupon.maxUsage || 1)) { alert("⛔ وصل للحد الأقصى!"); return; }
    if (!apiRequest) return;
    const sanitizedUserName = typeof userName === 'string' ? userName.trim() : "مستخدم";
    try {
      const updatedData = { ...coupon, usageCount: (coupon.usageCount || 0) + 1, users: [...(coupon.users || []), sanitizedUserName] };
      await apiRequest(`/coupons/${coupon.id}`, "PUT", updatedData);
      const updatedCoupons = safeCoupons.map(c => c?.id === coupon.id ? updatedData : c);
      updateCoupons(updatedCoupons);
      alert(`✅ تم استخدام الكوبون ${coupon.code} بنجاح`);
    } catch (err) { alert("فشل في تسجيل استخدام الكوبون."); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(text); setTimeout(() => setCopiedCode(""), 2000);
    }).catch(() => alert("فشل في النسخ"));
  };

  const exportCSV = () => {
    const header = "ID,Code,Discount,Type,Audience,Expiry,MaxUsage,UsageCount,Status,Description\n";
    const rows = safeCoupons.filter(c => c).map((c) => {
      const status = getCouponStatus(c).label;
      return `${escapeCSV(String(c.id || ''))},${escapeCSV(String(c.code || ''))},${c.discount || 0},${c.discountType || 'percentage'},${c.audience || ''},${formatExpiryDate(c.expiry)},${c.maxUsage || 0},${c.usageCount || 0},${status},${escapeCSV(String(c.description || ''))}`;
    }).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `coupons_export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const exportPDF = () => {
    const rows = safeCoupons.filter(c => c).map((c) => {
      const status = getCouponStatus(c);
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
        <td style="padding:10px;font-weight:bold;color:#38bdf8;">${escapeHTML(c.code)}</td>
        <td style="padding:10px;">${c.discount}${c.discountType === 'percentage' ? '%' : ' دينار'}</td>
        <td style="padding:10px;">${c.audience}</td>
        <td style="padding:10px;">${formatExpiryDate(c.expiry)}</td>
        <td style="padding:10px;">${c.usageCount || 0}/${c.maxUsage || 0}</td>
        <td style="padding:10px;color:${status.color};">${status.label}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl"><head><title>تقرير الكوبونات</title>
      <style>body{font-family:Tajawal,Arial,sans-serif;background:#0f172a;color:#fff;padding:20px;}
      table{width:100%;border-collapse:collapse;}th{background:rgba(30,64,175,0.6);padding:12px;}
      h1{color:#facc15;text-align:center;}</style></head><body>
      <h1>📊 تقرير الكوبونات</h1>
      <p style="text-align:center;color:#94a3b8;">${new Date().toLocaleString('ar-JO')}</p>
      <table><thead><tr><th>الكود</th><th>الخصم</th><th>الفئة</th><th>الانتهاء</th><th>الاستخدامات</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.print();</script></body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  const safeSearchTerm = typeof searchTerm === 'string' ? searchTerm.toLowerCase() : '';
  const filteredCoupons = safeCoupons.filter((c) => {
    if (!c) return false;
    const matchesSearch = (c.code || "").toLowerCase().includes(safeSearchTerm) ||
                          (c.description || "").toLowerCase().includes(safeSearchTerm) ||
                          (c.audience || "").toLowerCase().includes(safeSearchTerm);
    if (!matchesSearch) return false;
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return !isExpired(c.expiry) && (c.usageCount || 0) < (c.maxUsage || 1);
    if (filterStatus === "expired") return isExpired(c.expiry);
    if (filterStatus === "exhausted") return !isExpired(c.expiry) && (c.usageCount || 0) >= (c.maxUsage || 1);
    return true;
  });

  const glassContainerStyle = {
    ...fullBleedStyle,
    background: 'rgba(11, 15, 25, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    padding: '30px',
    color: '#f8fafc',
    fontFamily: 'Tajawal, sans-serif',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  };

  const headerStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px'
  };

  const glassCardStyle = {
    background: 'rgba(17, 24, 39, 0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '24px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'pointer'
  };

  const glassInputStyle = {
    background: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '11px 14px', borderRadius: '12px', color: '#fff', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box'
  };

  const statCardStyle = {
    background: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px', padding: '20px', textAlign: 'center', minWidth: '140px'
  };

  const btnPrimary = {
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#fff', border: 'none',
    padding: '10px 22px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
  };

  const btnSecondary = {
    background: 'rgba(59, 130, 246, 0.8)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.4)',
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  const btnDanger = {
    background: 'rgba(239, 68, 68, 0.8)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  const btnSuccess = {
    background: 'rgba(16, 185, 129, 0.8)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#facc15', fontSize: '22px', fontWeight: 'bold' }}>🎟️ إدارة الكوبونات والخصومات</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>إنشاء وتوزيع وإدارة أكواد الخصم مع الإحصائيات والتقارير المباشرة</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {mailStatus && (
            <span style={{ fontSize: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>{mailStatus}</span>
          )}
          <button type="button" onClick={fetchServerData} disabled={isLoading} style={{ ...btnSecondary, opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? 'جاري التحديث...' : '↻ تحديث'}
          </button>
        </div>
      </div>

      {showStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px', marginBottom: '10px' }}>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>إجمالي الكوبونات</span><h3 style={{ margin: '5px 0 0 0', color: '#38bdf8', fontSize: '22px' }}>{stats.total}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>✅ نشط</span><h3 style={{ margin: '5px 0 0 0', color: '#10b981', fontSize: '22px' }}>{stats.active}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>❌ منتهي</span><h3 style={{ margin: '5px 0 0 0', color: '#ef4444', fontSize: '22px' }}>{stats.expired}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>⛔ وصل للحد</span><h3 style={{ margin: '5px 0 0 0', color: '#f59e0b', fontSize: '22px' }}>{stats.exhausted}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '12px' }}>📊 إجمالي الاستخدامات</span><h3 style={{ margin: '5px 0 0 0', color: '#c084fc', fontSize: '22px' }}>{stats.totalUsages}</h3></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 ابحث بكود الكوبون، الوصف، أو الفئة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...glassInputStyle, flex: 1, minWidth: '200px' }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...glassInputStyle, width: '150px' }}>
          <option value="all" style={{ background: '#111827' }}>🌍 الكل</option>
          <option value="active" style={{ background: '#111827' }}>✅ نشط فقط</option>
          <option value="expired" style={{ background: '#111827' }}>❌ منتهي فقط</option>
          <option value="exhausted" style={{ background: '#111827' }}>⛔ وصل للحد</option>
        </select>
        <button type="button" onClick={() => setShowStats(!showStats)} style={btnSecondary}>{showStats ? 'إخفاء الإحصائيات' : 'إظهار الإحصائيات'}</button>
      </div>

      {canManageCoupons(currentUser?.role) ? (
        <form onSubmit={handleAddCoupon} style={{ ...glassCardStyle, cursor: 'default' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#f97316', fontSize: '16px' }}>➕ إنشاء كوبون خصم جديد</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <input type="text" placeholder="كود الكوبون *" value={code} onChange={(e) => setCode(e.target.value)} style={glassInputStyle} />
            <input type="number" placeholder="قيمة الخصم *" value={discount} onChange={(e) => setDiscount(e.target.value)} style={glassInputStyle} />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={glassInputStyle}>
              <option value="percentage" style={{ background: '#111827' }}>📊 نسبة مئوية (%)</option>
              <option value="fixed" style={{ background: '#111827' }}>💰 مبلغ ثابت (دينار)</option>
            </select>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} style={glassInputStyle} />
            <input type="number" placeholder="الحد الأقصى للاستخدام *" value={maxUsage} onChange={(e) => setMaxUsage(e.target.value)} style={glassInputStyle} />
            <input type="number" placeholder="الحد الأدنى للطلب (دينار)" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} style={glassInputStyle} />
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={glassInputStyle}>
              <option value="customers" style={{ background: '#111827' }}>🧑‍💼 العملاء</option>
              <option value="employees" style={{ background: '#111827' }}>👥 الموظفين</option>
              <option value="managers" style={{ background: '#111827' }}>📊 المدراء</option>
              <option value="all" style={{ background: '#111827' }}>🌍 الجميع</option>
            </select>
            <input type="text" placeholder="وصف الكوبون (اختياري)..." value={description} onChange={(e) => setDescription(e.target.value)} style={glassInputStyle} />
          </div>
          <button type="submit" style={{ ...btnPrimary, marginTop: '15px' }}>🚀 إنشاء الكوبون وإرسال الإشعارات</button>
        </form>
      ) : (
        <div style={{ ...glassCardStyle, cursor: 'default', background: 'rgba(51, 65, 85, 0.4)' }}>
          ℹ️ حسابك الحالي ({currentUser?.role || "زائر"}) يتيح لك عرض واستخدام الكوبونات المتاحة فقط.
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#38bdf8', textAlign: 'center', padding: '30px' }}>جاري مزامنة وتحميل الكوبونات...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filteredCoupons.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <p style={{ fontSize: '18px' }}>🎟️ لا توجد كوبونات مطابقة</p>
            </div>
          ) : (
            filteredCoupons.map((c) => {
              if (!c) return null;
              const status = getCouponStatus(c);
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} style={{ ...glassCardStyle, cursor: 'default', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: status.color, opacity: 0.8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>📅 {c.date || "غير متوفر"}</span>
                      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#facc15', fontFamily: 'monospace', letterSpacing: '1px' }}>{c.code}</span>
                        <button onClick={() => copyToClipboard(c.code)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
                          {copiedCode === c.code ? '✅ تم النسخ' : '📋 نسخ'}
                        </button>
                      </div>
                    </div>
                    <span style={{ background: 'rgba(15, 23, 42, 0.6)', color: status.color, padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', border: `1px solid ${status.color}40` }}>{status.label}</span>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input type="text" value={editData.code || ''} onChange={(e) => setEditData({ ...editData, code: e.target.value })} style={glassInputStyle} placeholder="الكود" />
                      <input type="number" value={editData.discount || ''} onChange={(e) => setEditData({ ...editData, discount: parseFloat(e.target.value) })} style={glassInputStyle} placeholder="الخصم" />
                      <select value={editData.discountType || 'percentage'} onChange={(e) => setEditData({ ...editData, discountType: e.target.value })} style={glassInputStyle}>
                        <option value="percentage" style={{ background: '#111827' }}>نسبة %</option>
                        <option value="fixed" style={{ background: '#111827' }}>مبلغ ثابت</option>
                      </select>
                      <input type="date" value={editData.expiry ? new Date(editData.expiry).toISOString().slice(0,10) : ''} onChange={(e) => setEditData({ ...editData, expiry: new Date(e.target.value).toISOString() })} style={glassInputStyle} />
                      <input type="number" value={editData.maxUsage || ''} onChange={(e) => setEditData({ ...editData, maxUsage: parseInt(e.target.value, 10) })} style={glassInputStyle} placeholder="الحد الأقصى" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={saveEdit} style={{ ...btnSuccess, flex: 1 }}>💾 حفظ</button>
                        <button onClick={cancelEdit} style={{ ...btnSecondary, flex: 1 }}>❌ إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '12px' }}>
                        <div style={{ color: '#94a3b8' }}>💸 الخصم:</div>
                        <div style={{ color: '#10b981', fontWeight: 'bold' }}>{c.discount}{c.discountType === 'percentage' ? '%' : ' دينار'}</div>
                        <div style={{ color: '#94a3b8' }}>👥 الفئة:</div>
                        <div style={{ color: '#38bdf8' }}>{c.audience}</div>
                        <div style={{ color: '#94a3b8' }}>🕒 ينتهي:</div>
                        <div>{formatExpiryDate(c.expiry)}</div>
                        <div style={{ color: '#94a3b8' }}>✅ الاستخدامات:</div>
                        <div>{c.usageCount || 0} / {c.maxUsage || 0}</div>
                        {c.minOrder > 0 && <><div style={{ color: '#94a3b8' }}>🛒 الحد الأدنى:</div><div>{c.minOrder} دينار</div></>}
                      </div>
                      {c.description && <p style={{ fontSize: '12px', color: '#cbd5e1', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', marginBottom: '10px' }}>📝 {c.description}</p>}
                      {c.users && c.users.length > 0 && <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>👤 المستخدمين: {c.users.join(", ")}</div>}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {canManageCoupons(currentUser?.role) && (
                          <>
                            <button onClick={() => startEdit(c)} style={{ ...btnSecondary, fontSize: '11px', padding: '5px 10px' }}>✏️ تعديل</button>
                            <button onClick={() => handleDeleteCoupon(c.id, c.code)} style={{ ...btnDanger, fontSize: '11px', padding: '5px 10px' }}>🗑️ حذف</button>
                          </>
                        )}
                        {!isExpired(c.expiry) && (c.usageCount || 0) < (c.maxUsage || 1) && (
                          <button onClick={() => handleUseCoupon(c, currentUser?.name || "مسؤول النظام")} style={{ ...btnSuccess, fontSize: '11px', padding: '5px 10px' }}>🎟️ استخدام</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
        <button type="button" onClick={exportCSV} style={btnSecondary}>📤 تصدير CSV</button>
        <button type="button" onClick={exportPDF} style={{ ...btnSecondary, background: 'rgba(16, 185, 129, 0.8)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>📄 تصدير PDF / طباعة</button>
      </div>
    </div>
  );
}

export default Coupons;