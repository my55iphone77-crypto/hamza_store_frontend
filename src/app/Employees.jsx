import React, { useState, useCallback } from "react";
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

// دالة حماية CSV
const escapeCSV = (str) => {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') str = String(str);
  if (/^[=+\-@]/.test(str)) return `'${str}`;
  return str.replace(/"/g, '""');
};

function Employees() {
  const fullBleedStyle = useFullBleedStyle();
  const { employees = [], hireEmployee, updateEmployee, fireEmployee, currentUser, apiRequest } = useApp();

  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showStats, setShowStats] = useState(true);

  // حقول الإضافة
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newNationalId, setNewNationalId] = useState('');
  const [newIdCardImage, setNewIdCardImage] = useState('');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newImage, setNewImage] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [newRole, setNewRole] = useState('stock');

  // حقول التعديل
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editNationalId, setEditNationalId] = useState('');
  const [editIdCardImage, setEditIdCardImage] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editRole, setEditRole] = useState('');

  const safeEmployees = Array.isArray(employees) ? employees : [];
  const empId = (e) => e?.id || e?._id;

  // ➕ إضافة موظف جديد
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      alert('الرجاء إدخال اسم الموظف والبريد الإلكتروني على الأقل!');
      return;
    }

    setIsSaving(true);
    try {
      await hireEmployee({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim() || 'غير متوفر',
        age: newAge.trim() || 'غير متوفر',
        nationalId: newNationalId.trim() || 'غير متوفر',
        idCardImage: newIdCardImage.trim() || '',
        bankAccount: newBankAccount.trim() || 'غير متوفر',
        image: newImage.trim() || '',
        salary: newSalary ? parseFloat(newSalary) : 0,
        role: newRole,
        status: 'نشط',
        hireDate: new Date().toISOString().split('T')[0]
      });

      setNewName(''); setNewEmail(''); setNewPhone(''); setNewAge('');
      setNewNationalId(''); setNewIdCardImage(''); setNewBankAccount('');
      setNewImage(''); setNewSalary(''); setNewRole('stock');
      setIsAddModalOpen(false);
      setStatusMsg('✅ تمت إضافة الموظف بنجاح!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      alert(err.message || 'فشل إضافة الموظف — ربما البريد مستخدم مسبقاً.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (emp) => {
    setSelectedEmployee(emp);
    setEditName(emp.name || '');
    setEditEmail(emp.email || '');
    setEditPhone(emp.phone === 'غير متوفر' ? '' : emp.phone);
    setEditAge(emp.age === 'غير متوفر' ? '' : emp.age);
    setEditNationalId(emp.nationalId === 'غير متوفر' ? '' : emp.nationalId);
    setEditIdCardImage(emp.idCardImage || '');
    setEditBankAccount(emp.bankAccount === 'غير متوفر' ? '' : emp.bankAccount);
    setEditImage(emp.image || '');
    setEditSalary(emp.salary !== undefined ? emp.salary : '');
    setEditRole(emp.role || 'stock');
    setIsEditing(true);
  };

  // 💾 حفظ التعديلات
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editEmail.trim()) {
      alert('الاسم والبريد الإلكتروني مطلوبان!');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateEmployee(empId(selectedEmployee), {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || 'غير متوفر',
        age: editAge.trim() || 'غير متوفر',
        nationalId: editNationalId.trim() || 'غير متوفر',
        idCardImage: editIdCardImage.trim() || '',
        bankAccount: editBankAccount.trim() || 'غير متوفر',
        image: editImage.trim() || '',
        salary: editSalary !== '' ? parseFloat(editSalary) : 0,
        role: editRole,
        lastModified: new Date().toISOString()
      });

      setSelectedEmployee(updated);
      setIsEditing(false);
      setStatusMsg('✅ تم تحديث بيانات الموظف بنجاح!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      alert(err.message || 'فشل تحديث بيانات الموظف.');
    } finally {
      setIsSaving(false);
    }
  };

  // 🗑️ حذف موظف
  const handleDeleteEmployee = async (id, name) => {
    if (!window.confirm(`هل أنت متأكد من حذف الموظف (${name || id}) بشكل نهائي من النظام؟`)) return;
    try {
      await fireEmployee(id);
      setSelectedEmployee(null);
      setIsEditing(false);
      setStatusMsg('🗑️ تم حذف الموظف بنجاح.');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      alert(err.message || 'فشل حذف الموظف.');
    }
  };

  // 📧 إرسال إشعار بريدي حقيقي
  const handleSendRealEmail = async (emp) => {
    if (!emp.email || emp.email === 'غير متوفر') {
      alert('لا يوجد بريد إلكتروني صالح لهذا الموظف.');
      return;
    }

    setIsSendingEmail(true);
    try {
      if (apiRequest) {
        const response = await apiRequest('/sendExternalMail', 'POST', {
          to: emp.email,
          subject: 'إشعار إداري من النظام الموحد',
          body: `مرحباً ${emp.name}، تم إرسال هذا الإشعار لك بصفتك (${emp.role}) عبر لوحة التحكم المركزية.`
        });
        if (response && response.success) {
          alert(`تم إرسال البريد الإلكتروني بنجاح إلى: ${emp.email} 📩`);
        } else {
          alert('⚠️ تم إرسال الإشعار لكن قد تكون هناك مشكلة في البريد الخارجي.');
        }
      } else {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emp.email,
            subject: 'إشعار إداري من النظام الموحد',
            message: `مرحباً ${emp.name}، تم إرسال هذا الإشعار لك بصفتك (${emp.role}) عبر لوحة التحكم المركزية.`
          })
        });
        if (!response.ok) throw new Error('فشل إرسال البريد الإلكتروني من السيرفر.');
        alert(`تم إرسال البريد الإلكتروني بنجاح إلى: ${emp.email} 📩`);
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء محاولة إرسال البريد.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // 📤 تصدير CSV
  const exportCSV = () => {
    const header = "ID,Name,Email,Phone,Role,Age,Salary,BankAccount,Status,HireDate\n";
    const rows = safeEmployees.map((emp) => {
      return `${escapeCSV(String(empId(emp) || ''))},${escapeCSV(String(emp.name || ''))},${escapeCSV(String(emp.email || ''))},${escapeCSV(String(emp.phone || ''))},${escapeCSV(String(emp.role || ''))},${escapeCSV(String(emp.age || ''))},${emp.salary || 0},${escapeCSV(String(emp.bankAccount || ''))},${escapeCSV(String(emp.status || 'نشط'))},${escapeCSV(String(emp.hireDate || ''))}`;
    }).join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `employees_export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  // 📄 تصدير PDF
  const exportPDF = () => {
    const rows = safeEmployees.map((emp) => {
      const roleLabel = emp.role === 'admin' ? '👑 مدير عام' : emp.role === 'manager' ? '🛡️ مشرف' : '📦 موظف مخزون';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
        <td style="padding:10px;">${emp.name || ''}</td>
        <td style="padding:10px;">${emp.email || ''}</td>
        <td style="padding:10px;">${emp.phone || ''}</td>
        <td style="padding:10px;">${roleLabel}</td>
        <td style="padding:10px;">${emp.salary ? emp.salary + ' $' : 'غير متوفر'}</td>
        <td style="padding:10px;">${emp.status || 'نشط'}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html dir="rtl"><head><title>تقرير الموظفين</title>
      <style>body{font-family:Tajawal,Arial,sans-serif;background:#0f172a;color:#fff;padding:20px;}
      table{width:100%;border-collapse:collapse;}th{background:rgba(30,64,175,0.6);padding:12px;}
      h1{color:#facc15;text-align:center;}</style></head><body>
      <h1>👥 تقرير طاقم العمل</h1>
      <p style="text-align:center;color:#94a3b8;">تاريخ التقرير: ${new Date().toLocaleString('ar-JO')}</p>
      <table><thead><tr><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>الرتبة</th><th>الراتب</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.print();</script></body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  const filteredEmployees = safeEmployees.filter((emp) => {
    if (!searchTerm) return true;
    return (emp.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           (emp.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           (emp.role || "").toLowerCase().includes(searchTerm.toLowerCase());
  });

  const stats = {
    total: safeEmployees.length,
    admins: safeEmployees.filter(e => e.role === 'admin').length,
    managers: safeEmployees.filter(e => e.role === 'manager').length,
    stock: safeEmployees.filter(e => e.role === 'stock').length,
    totalSalary: safeEmployees.reduce((sum, e) => sum + (Number(e.salary) || 0), 0)
  };

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
    flexDirection: 'column'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '25px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '15px',
    flexWrap: 'wrap',
    gap: '15px'
  };

  const cardsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '20px',
    flex: 1,
    alignContent: 'start'
  };

  const glassInputStyle = {
    background: 'rgba(17, 24, 39, 0.6)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '11px 14px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  };

  const badgeStyle = {
    background: 'rgba(30, 41, 59, 0.6)',
    backdropFilter: 'blur(8px)',
    color: '#facc15',
    padding: '10px 16px',
    borderRadius: '12px',
    fontSize: '13px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontWeight: 'bold'
  };

  const statCardStyle = {
    background: 'rgba(17, 24, 39, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    padding: '16px',
    textAlign: 'center',
    minWidth: '120px'
  };

  const addCardStyle = {
    background: 'rgba(17, 24, 39, 0.5)',
    backdropFilter: 'blur(12px)',
    border: '2px dashed rgba(16, 185, 129, 0.4)',
    borderRadius: '20px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
    cursor: 'pointer',
    minHeight: '200px',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  };

  const addIconStyle = {
    width: '80px', height: '80px', borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '36px', border: '3px solid #10b981',
    color: '#10b981', fontWeight: 'bold'
  };

  const employeeCardStyle = {
    background: 'rgba(17, 24, 39, 0.6)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
    cursor: 'pointer',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    transition: 'transform 0.2s ease'
  };

  const avatarStyle = {
    width: '80px', height: '80px', borderRadius: '50%',
    objectFit: 'cover', border: '3px solid #38bdf8'
  };

  const placeholderAvatarStyle = {
    width: '80px', height: '80px', borderRadius: '50%',
    background: 'rgba(31, 41, 55, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '32px', border: '3px solid rgba(255, 255, 255, 0.1)'
  };

  const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '20px', boxSizing: 'border-box', overflowY: 'auto'
  };

  const modalContentStyle = {
    background: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '24px',
    padding: '30px',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    position: 'relative',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
  };

  const closeButtonStyle = {
    position: 'absolute', top: '20px', left: '20px',
    background: 'rgba(255, 255, 255, 0.1)', color: '#fff',
    border: 'none', width: '32px', height: '32px', borderRadius: '50%',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  };

  const successButtonStyle = {
    background: '#10b981', color: '#fff', border: 'none',
    padding: '12px', borderRadius: '10px', fontWeight: 'bold',
    cursor: 'pointer', fontSize: '14px', marginTop: '10px'
  };

  const btnSecondary = {
    background: 'rgba(59, 130, 246, 0.8)', color: '#fff', border: '1px solid rgba(59, 130, 246, 0.4)',
    padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
    fontSize: '12px', backdropFilter: 'blur(4px)'
  };

  const btnDanger = {
    background: 'rgba(239, 68, 68, 0.8)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.4)',
    padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  };

  return (
    <div style={glassContainerStyle} dir="rtl">
      {/* ─── الرأس ─── */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#facc15', fontSize: '22px', fontWeight: 'bold' }}>
            👥 لوحة إدارة طاقم العمل والموظفين
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>
            مزامنة حية ومباشرة مع قاعدة البيانات المركزية وكافة الأقسام.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="🔍 ابحث عن اسم الموظف أو البريد..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...glassInputStyle, width: '220px' }} />
          <div style={badgeStyle}>الطاقم: {safeEmployees.length}</div>
          <button onClick={() => setShowStats(!showStats)} style={btnSecondary}>
            {showStats ? 'إخفاء' : 'إظهار'} الإحصائيات
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', color: '#34d399', marginBottom: '10px' }}>
          {statusMsg}
        </div>
      )}

      {/* ─── الإحصائيات ─── */}
      {showStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '10px' }}>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '11px' }}>👥 إجمالي</span><h3 style={{ margin: '4px 0 0 0', color: '#38bdf8', fontSize: '20px' }}>{stats.total}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '11px' }}>👑 مدراء</span><h3 style={{ margin: '4px 0 0 0', color: '#f59e0b', fontSize: '20px' }}>{stats.admins}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '11px' }}>🛡️ مشرفين</span><h3 style={{ margin: '4px 0 0 0', color: '#38bdf8', fontSize: '20px' }}>{stats.managers}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '11px' }}>📦 موظفين</span><h3 style={{ margin: '4px 0 0 0', color: '#10b981', fontSize: '20px' }}>{stats.stock}</h3></div>
          <div style={statCardStyle}><span style={{ color: '#94a3b8', fontSize: '11px' }}>💰 إجمالي الرواتب</span><h3 style={{ margin: '4px 0 0 0', color: '#facc15', fontSize: '20px' }}>${stats.totalSalary}</h3></div>
        </div>
      )}

      {/* ─── أزرار التصدير ─── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <button onClick={exportCSV} style={btnSecondary}>📤 تصدير CSV</button>
        <button onClick={exportPDF} style={{ ...btnSecondary, background: 'rgba(16, 185, 129, 0.8)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>📄 تصدير PDF</button>
      </div>

      {/* ─── شبكة الموظفين ─── */}
      <div style={cardsGridStyle}>
        {/* زر الإضافة */}
        <div onClick={() => { setIsAddModalOpen(true); setIsEditing(false); }} style={addCardStyle}>
          <div style={addIconStyle}>+</div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>توظيف موظف جديد</h4>
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold', display: 'inline-block', marginTop: '6px' }}>اضغط للإضافة 🚀</span>
          </div>
        </div>

        {/* بطاقات الموظفين */}
        {filteredEmployees.map((emp) => (
          <div key={empId(emp)} onClick={() => { setSelectedEmployee(emp); setIsEditing(false); }} style={employeeCardStyle}>
            {emp.image ? (
              <img src={emp.image} alt={emp.name} style={avatarStyle} />
            ) : (
              <div style={placeholderAvatarStyle}>👤</div>
            )}
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>{emp.name}</h4>
              <span style={{
                fontSize: '12px', color: emp.role === 'admin' ? '#f59e0b' : emp.role === 'manager' ? '#38bdf8' : '#10b981',
                fontWeight: 'bold', background: 'rgba(15, 23, 42, 0.6)', padding: '4px 10px',
                borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'inline-block', marginTop: '6px'
              }}>
                {emp.role === 'admin' ? '👑 مدير عام' : emp.role === 'manager' ? '🛡️ مشرف متجر' : '📦 موظف مخزون'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {emp.salary ? `${emp.salary} $ / شهر` : 'الراتب غير محدد'}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>انقر للعرض والتعديل 🔍</span>
          </div>
        ))}
      </div>

      {/* ─── نافذة الإضافة ─── */}
      {isAddModalOpen && (
        <div style={modalOverlayStyle} onClick={() => setIsAddModalOpen(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsAddModalOpen(false)} style={closeButtonStyle}>✕</button>
            <h3 style={{ margin: '0 0 5px 0', color: '#10b981', fontSize: '18px', fontWeight: 'bold' }}>+ توظيف وإضافة موظف جديد</h3>
            <p style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '12px' }}>سيتم حفظ البيانات فوراً وبثها لكل أقسام النظام.</p>

            <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="اسم الموظف... *" value={newName} onChange={(e) => setNewName(e.target.value)} style={glassInputStyle} />
              <input type="email" placeholder="البريد الإلكتروني... *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="رقم الهاتف..." value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={glassInputStyle} />
              <input type="number" placeholder="العمر..." value={newAge} onChange={(e) => setNewAge(e.target.value)} style={glassInputStyle} />
              <input type="number" placeholder="الراتب الشهري $..." value={newSalary} onChange={(e) => setNewSalary(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="رقم الهوية الوطنية..." value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="رابط صورة الهوية..." value={newIdCardImage} onChange={(e) => setNewIdCardImage(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="حساب البنك IBAN..." value={newBankAccount} onChange={(e) => setNewBankAccount(e.target.value)} style={glassInputStyle} />
              <input type="text" placeholder="رابط الصورة الشخصية..." value={newImage} onChange={(e) => setNewImage(e.target.value)} style={glassInputStyle} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', color: '#facc15' }}>الرتبة والوظيفة:</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ ...glassInputStyle, border: '1px solid #facc15' }}>
                  <option value="admin" style={{ background: '#111827' }}>مدير عام (Admin)</option>
                  <option value="manager" style={{ background: '#111827' }}>مشرف متجر (Manager)</option>
                  <option value="stock" style={{ background: '#111827' }}>موظف مخزون (Stock)</option>
                </select>
              </div>

              <button type="submit" disabled={isSaving} style={{ ...successButtonStyle, opacity: isSaving ? 0.7 : 1 }}>
                {isSaving ? 'جاري الحفظ...' : 'حفظ وتوظيف الموظف 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── نافذة تفاصيل الموظف / التعديل ─── */}
      {selectedEmployee && (
        <div style={modalOverlayStyle} onClick={() => { setSelectedEmployee(null); setIsEditing(false); }}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setSelectedEmployee(null); setIsEditing(false); }} style={closeButtonStyle}>✕</button>

            {!isEditing ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '15px' }}>
                  {selectedEmployee.image ? (
                    <img src={selectedEmployee.image} alt={selectedEmployee.name} style={{ width: '75px', height: '75px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #38bdf8' }} />
                  ) : (
                    <div style={{ width: '75px', height: '75px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>👤</div>
                  )}
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{selectedEmployee.name}</h3>
                    <span style={{ fontSize: '12px', color: '#38bdf8', display: 'block', marginBottom: '4px' }}>📧 {selectedEmployee.email}</span>
                    <span style={{ fontSize: '11px', color: '#facc15', fontWeight: 'bold' }}>
                      {selectedEmployee.role === 'admin' ? '👑 مدير عام' : selectedEmployee.role === 'manager' ? '🛡️ مشرف متجر' : '📦 موظف مخزون'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0, 0, 0, 0.3)', padding: '16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>رقم الهاتف:</span><span style={{ color: '#fff', fontWeight: 'bold' }}>{selectedEmployee.phone}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>العمر:</span><span style={{ color: '#fff', fontWeight: 'bold' }}>{selectedEmployee.age !== 'غير متوفر' ? `${selectedEmployee.age} سنة` : 'غير متوفر'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>الراتب الشهري:</span><span style={{ color: '#34d399', fontWeight: 'bold' }}>{selectedEmployee.salary ? `${selectedEmployee.salary} $` : 'غير متوفر'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>رقم الهوية:</span><span style={{ color: '#fff', fontWeight: 'bold' }}>{selectedEmployee.nationalId}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>حساب البنك:</span><span style={{ color: '#38bdf8', fontWeight: 'bold', fontFamily: 'monospace' }}>{selectedEmployee.bankAccount}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}><span>تاريخ التعيين:</span><span style={{ color: '#fff', fontWeight: 'bold' }}>{selectedEmployee.hireDate || 'غير متوفر'}</span></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button onClick={() => handleSendRealEmail(selectedEmployee)} disabled={isSendingEmail} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', opacity: isSendingEmail ? 0.7 : 1 }}>
                    {isSendingEmail ? 'جاري الإرسال...' : 'إرسال بريد إلكتروني حقيقي 📩'}
                  </button>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleStartEdit(selectedEmployee)} style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>تعديل المعلومات ✏️</button>
                    <button onClick={() => handleDeleteEmployee(empId(selectedEmployee), selectedEmployee.name)} style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>حذف 🗑️</button>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: '0 0 5px 0', color: '#38bdf8', fontSize: '18px', fontWeight: 'bold' }}>تعديل معلومات الموظف</h3>
                <input type="text" placeholder="اسم الموظف..." value={editName} onChange={(e) => setEditName(e.target.value)} style={glassInputStyle} />
                <input type="email" placeholder="البريد الإلكتروني..." value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={glassInputStyle} />
                <input type="text" placeholder="رقم الهاتف..." value={editPhone} onChange={(e) => setEditPhone(e.target.value)} style={glassInputStyle} />
                <input type="number" placeholder="العمر..." value={editAge} onChange={(e) => setEditAge(e.target.value)} style={glassInputStyle} />
                <input type="number" placeholder="الراتب الشهري $..." value={editSalary} onChange={(e) => setEditSalary(e.target.value)} style={glassInputStyle} />
                <input type="text" placeholder="رقم الهوية الوطنية..." value={editNationalId} onChange={(e) => setEditNationalId(e.target.value)} style={glassInputStyle} />
                <input type="text" placeholder="رابط صورة الهوية..." value={editIdCardImage} onChange={(e) => setEditIdCardImage(e.target.value)} style={glassInputStyle} />
                <input type="text" placeholder="حساب البنك IBAN..." value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} style={glassInputStyle} />
                <input type="text" placeholder="رابط الصورة الشخصية..." value={editImage} onChange={(e) => setEditImage(e.target.value)} style={glassInputStyle} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', color: '#facc15' }}>الرتبة والوظيفة:</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value)} style={{ ...glassInputStyle, border: '1px solid #facc15' }}>
                    <option value="admin" style={{ background: '#111827' }}>مدير عام (Admin)</option>
                    <option value="manager" style={{ background: '#111827' }}>مشرف متجر (Manager)</option>
                    <option value="stock" style={{ background: '#111827' }}>موظف مخزون (Stock)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" disabled={isSaving} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', opacity: isSaving ? 0.7 : 1 }}>
                    {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات ✅'}
                  </button>
                  <button type="button" onClick={() => setIsEditing(false)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>إلغاء</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Employees;