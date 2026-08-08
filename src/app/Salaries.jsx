import React, { useState, useEffect } from 'react';
import { useSyncedState } from './useSyncedState.jsx';

function Salaries({ mails, setMails }) {
  // 🌐 الربط الشامل مع كافة أقسام النظام الحالية والمستقبلية حرفياً
  const [employees, setEmployees] = useSyncedState('store_employees', []); // إدارة الموظفين
  const [salaries, setSalaries] = useSyncedState('store_salaries', []);     // الرواتب
  const [attendance] = useSyncedState('store_attendance', []);             // الحضور والانصراف
  const [workHours] = useSyncedState('store_work_hours', []);               // تتبع ساعات العمل
  const [dismissals] = useSyncedState('store_dismissals', []);             // قسم فصل وتسريح الموظفين
  const [contacts] = useSyncedState('store_contacts', []);                 // إيميلات وأرقام الموظفين
  const [tasks] = useSyncedState('store_tasks', []);                       // المهام والإنجازات
  const [accounting, setAccounting] = useSyncedState('store_accounting', []); // المحاسبة والمصروفات
  
  // 🔮 قسم مرن للمستقبل: أي بيانات لأي قسم جديد سيتم رصدها والتعامل معها تلقائياً
  const [futureModulesData, setFutureModulesData] = useState({});

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSalary, setSelectedSalary] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editBase, setEditBase] = useState('');
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [deductionAmt, setDeductionAmt] = useState('');
  const [deductionRes, setDeductionRes] = useState('');
  const [bonusAmt, setBonusAmt] = useState('');
  const [bonusRes, setBonusRes] = useState('');

  const inputStyle = { outline: 'none' };
  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 🔮 رصد تلقائي لأي مفتاح جديد يُضاف للمستقبل في الـ localStorage
  useEffect(() => {
    const handleGlobalSync = () => {
      const allKeys = Object.keys(localStorage);
      const dynamicData = {};
      allKeys.forEach(k => {
        if (k.startsWith('store_') && !['store_employees', 'store_salaries', 'store_attendance', 'store_work_hours', 'store_dismissals', 'store_contacts', 'store_tasks', 'store_accounting'].includes(k)) {
          try {
            dynamicData[k] = JSON.parse(localStorage.getItem(k));
          } catch (e) {
            // تجاهل البيانات غير القابلة للتحويل
          }
        }
      });
      setFutureModulesData(dynamicData);
    };

    handleGlobalSync();
    window.addEventListener('storage', handleGlobalSync);
    window.addEventListener('storage_updated', handleGlobalSync);
    return () => {
      window.removeEventListener('storage', handleGlobalSync);
      window.removeEventListener('storage_updated', handleGlobalSync);
    };
  }, []);

  // 📢 تسجيل الأحداث وإرسال الإيميلات الفورية عبر قسم (إيميلات وأرقام الموظفين)
  const logEventAndEmail = (text, employeeEmail = '') => {
    if (typeof setMails === 'function') {
      const currentMails = Array.isArray(mails) ? mails : [];
      setMails([text, ...currentMails]);
    }

    if (employeeEmail) {
      const subject = encodeURIComponent('إشعار مالي وإداري متكامل');
      const body = encodeURIComponent(text);
      window.open(`mailto:${employeeEmail}?subject=${subject}&body=${body}`, '_blank');
    }
  };

  // 🔄 التحليل الذكي والديناميكي المرتبط بجميع الأقسام فور فتح بطاقة الموظف
  const handleCardClick = (s) => {
    if (!s) return;

    // 1. فحص قسم (فصل وتسريح الموظفين): إذا مفصول، يتم تنبيه المدير تلقائياً
    const isDismissed = Array.isArray(dismissals) && dismissals.some(d => d.employeeId === s.id || d.name === s.name);
    if (isDismissed) {
      alert(`⚠️ تنبيه ذكي من نظام الفصل: الموظف (${s.name}) مدرج في قسم الفصل والتسريح! يرجى مراجعة وضعه.`);
    }

    // 2. فحص قسم (إيميلات وأرقام الموظفين): دمج البيانات المحدثة للاتصال
    const empContact = Array.isArray(contacts) ? contacts.find(c => c.employeeId === s.id || c.name === s.name) : {};
    const finalEmail = empContact.email || s.email || '';
    const finalPhone = empContact.phone || s.phone || '';

    // 3. الحساب التلقائي للخصومات من (الحضور والانصراف + ساعات العمل)
    const empAttendance = Array.isArray(attendance) ? attendance.filter(a => a.employeeId === s.id || a.name === s.name) : [];
    const absentDays = empAttendance.filter(a => a.status === 'غائب' || a.type === 'absence').length;
    
    const empWorkHours = Array.isArray(workHours) ? workHours.filter(w => w.employeeId === s.id || w.name === s.name) : [];
    const totalLoggedHours = empWorkHours.reduce((acc, curr) => acc + (parseFloat(curr.hours) || 0), 0);
    
    // احتساب تلقائي: خصم 20$ عن كل غياب
    const autoDeduction = absentDays * 20;

    // 4. الحساب التلقائي للمكافآت من (المهام والمشاريع)
    const empTasks = Array.isArray(tasks) ? tasks.filter(t => (t.assignedTo === s.name || t.employeeId === s.id) && (t.status === 'مكتملة' || t.completed)) : [];
    const autoBonus = empTasks.length * 45; // 45$ لكل مهمة منجزة

    setSelectedSalary({ ...s, email: finalEmail, phone: finalPhone, isDismissed });
    setEditBase(s.base ?? s.salary ?? 500);
    setIsEditingBase(false);

    setDeductionAmt(s.deduction !== undefined && s.deduction !== '' ? s.deduction : (autoDeduction > 0 ? autoDeduction : ''));
    setDeductionRes(s.deductionReason || (absentDays > 0 ? `خصم تلقائي لـ ${absentDays} أيام غياب مسجلة في الحضور` : ''));

    setBonusAmt(s.bonus !== undefined && s.bonus !== '' ? s.bonus : (autoBonus > 0 ? autoBonus : ''));
    setBonusRes(s.bonusReason || (empTasks.length > 0 ? `مكافأة لـ ${empTasks.length} مهام منجزة (إجمالي ساعات العمل المسجلة: ${totalLoggedHours}س)` : ''));

    setShowEditModal(true);
  };

  // 💾 الحفظ الشامل والمزامنة العكسية مع الموظفين والمحاسبة
  const handleEditEmployeeSubmit = (e) => {
    e.preventDefault();
    if (!selectedSalary || !selectedSalary.id) return;

    const baseVal = parseFloat(editBase) || 0;
    const dedVal = parseFloat(deductionAmt) || 0;
    const bonVal = parseFloat(bonusAmt) || 0;
    const netVal = baseVal + bonVal - dedVal;
    const currentEmpName = selectedSalary.name && typeof selectedSalary.name === 'string' ? selectedSalary.name.trim() : 'موظف';
    const empEmail = selectedSalary.email || '';

    // 1. تحديث جدول الرواتب
    setSalaries(prev => (Array.isArray(prev) ? prev.map(s => (
      s.id === selectedSalary.id
        ? {
            ...s,
            name: currentEmpName,
            base: baseVal,
            deduction: dedVal,
            deductionReason: deductionRes || '',
            bonus: bonVal,
            bonusReason: bonusRes || '',
            netSalary: netVal
          }
        : s
    )) : []));

    // 2. تحديث قسم الموظفين الأساسي (HR)
    setEmployees(prev => (Array.isArray(prev) ? prev.map(emp => (
      emp.id === selectedSalary.id
        ? { ...emp, name: currentEmpName, salary: baseVal }
        : emp
    )) : []));

    logEventAndEmail(`⚙️ تم تحديث بيانات الموظف (${currentEmpName}) ومرتبة الصافي ($${netVal}) بالتزامن مع كافة الأقسام.`, empEmail);

    setSelectedSalary(null);
    setShowEditModal(false);
  };

  // 💵 الصرف والربط التلقائي بقسم المحاسبة والمصروفات
  const togglePaid = (id) => {
    const safeSalaries = Array.isArray(salaries) ? salaries : [];
    const targetEmp = safeSalaries.find(s => s.id === id);
    if (!targetEmp) return;

    const isCurrentlyPaid = targetEmp.paid || targetEmp.status === 'مدفوع';

    if (!isCurrentlyPaid && targetEmp.lastPaidMonth === currentMonthYear) {
      alert('⚠️ تم صرف الراتب لهذا الموظف مسبقاً خلال الشهر الحالي.');
      return;
    }

    const newPaidStatus = !isCurrentlyPaid;
    const netVal = targetEmp.netSalary ?? targetEmp.base ?? 500;

    setSalaries(prev => (Array.isArray(prev) ? prev.map(s => (
      s.id === id
        ? {
            ...s,
            paid: newPaidStatus,
            status: newPaidStatus ? 'مدفوع' : 'مستحق',
            lastPaidMonth: newPaidStatus ? currentMonthYear : s.lastPaidMonth
          }
        : s
    )) : []));

    if (selectedSalary && selectedSalary.id === id) {
      setSelectedSalary(prev => prev ? ({
        ...prev,
        paid: newPaidStatus,
        status: newPaidStatus ? 'مدفوع' : 'مستحق',
        lastPaidMonth: newPaidStatus ? currentMonthYear : prev.lastPaidMonth
      }) : null);
    }

    // إرسال سند الصرف تلقائياً لقسم المحاسبة والمصروفات
    if (newPaidStatus) {
      const newAccountingEntry = {
        id: Date.now(),
        title: `صرف راتب شهر ${currentMonthYear}: ${targetEmp.name}`,
        amount: netVal,
        type: 'expense',
        category: 'رواتب وأجور',
        date: new Date().toISOString().split('T')[0]
      };
      setAccounting(prev => (Array.isArray(prev) ? [newAccountingEntry, ...prev] : [newAccountingEntry]));
    }

    const actionText = newPaidStatus
      ? `💵 تم صرف راتب الموظف (${targetEmp.name}) بقيمة $${netVal} وتسجيله في المحاسبة.`
      : `↩️ تم إلغاء صرف راتب الموظف (${targetEmp.name}).`;

    logEventAndEmail(actionText, targetEmp.email || '');
  };

  const safeSalariesList = Array.isArray(salaries) ? salaries : [];
  const safeEmployeesList = Array.isArray(employees) ? employees : [];

  const filteredSalaries = safeSalariesList.filter(s =>
    ((s && s.name) || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalNet = safeSalariesList.reduce((acc, s) => {
    const b = (s && (s.base ?? s.salary)) ? (s.base ?? s.salary) : 0;
    const n = (s && s.netSalary !== undefined) ? s.netSalary : b;
    return acc + (typeof n === 'number' ? n : parseFloat(n) || 0);
  }, 0);

  const paidCount = safeSalariesList.filter(s => s && (s.paid || s.status === 'مدفوع')).length;

  return (
    <div style={{ width: '100%', minHeight: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: '30px', borderRadius: '24px', color: '#f8fafc', fontFamily: 'Tajawal, sans-serif', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }} dir="rtl">

      {/* الرأس */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: '#22c55e', fontSize: '22px', fontWeight: 'bold' }}>
            🌐 النظام الشامل المتكامل (مزامنة فورية مع كافة الأقسام والمستقبلية)
          </h2>
          <p style={{ margin: '0', color: '#94a3b8', fontSize: '13px' }}>ارتباط مباشر وتلقائي مع الموظفين، الحضور، ساعات العمل، الفصل، الإيميلات، المهام، والمحاسبة.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن موظف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px 14px', borderRadius: '12px', color: '#fff', fontSize: '13px', width: '210px', ...inputStyle }}
          />
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', color: '#22c55e', padding: '10px 16px', borderRadius: '12px', fontSize: '13px', border: '1px solid rgba(255, 255, 255, 0.08)', fontWeight: 'bold' }}>
            إجمالي الموظفين: {safeSalariesList.length}
          </div>
        </div>
      </div>

      {/* لوحة المؤشرات */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', background: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '15px', borderRadius: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>إجمالي الرواتب الصافية</span>
          <span style={{ color: '#38bdf8', fontSize: '18px', fontWeight: 'bold' }}>{totalNet} $</span>
        </div>
        <div style={{ flex: 1, minWidth: '200px', background: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '15px', borderRadius: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block' }}>تم الصرف (مسجل بالمحاسبة)</span>
          <span style={{ color: '#34d399', fontSize: '18px', fontWeight: 'bold' }}>{paidCount} من {safeSalariesList.length}</span>
        </div>
      </div>

      {/* شبكة البطاقات */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', flex: 1, alignContent: 'start' }}>
        {filteredSalaries.map((s) => {
          if (!s) return null;
          const baseVal = s.base ?? 500;
          const netVal = s.netSalary ?? baseVal;
          const isPaid = s.paid || s.status === 'مدفوع';

          const currentEmp = safeEmployeesList.find(emp => emp && emp.id === s.id) || {};
          const displayName = currentEmp.name || s.name || 'موظف';
          const displayImage = currentEmp.image || s.image;
          const isDismissed = Array.isArray(dismissals) && dismissals.some(d => d.employeeId === s.id || d.name === s.name);

          return (
            <div
              key={s.id}
              onClick={() => handleCardClick(s)}
              style={{ background: 'rgba(17, 24, 39, 0.7)', backdropFilter: 'blur(12px)', border: `1px solid ${isDismissed ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.08)'}`, borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)', gap: '10px' }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = isDismissed ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.08)'; }}
            >
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#1f2937', border: '3px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {displayImage ? (
                  <img src={displayImage} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '32px' }}>👤</span>
                )}
              </div>

              <h4 style={{ color: '#fff', fontSize: '16px', margin: '0 0 2px 0', fontWeight: 'bold' }}>{displayName}</h4>
              <span style={{ color: '#34d399', fontSize: '13px', fontWeight: 'bold' }}>الصافي: {netVal} $</span>

              {isDismissed ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: '#f87171', fontWeight: 'bold' }}>
                  ⚠️ مدرج بقسم الفصل
                </div>
              ) : (
                <div style={{ background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: isPaid ? '#34d399' : '#facc15', fontWeight: 'bold' }}>
                  {isPaid ? '✅ تم التسديد شهرياً' : '⏳ مستحق الصرف'}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCardClick(s); }}
                style={{ width: '100%', background: '#2563eb', color: '#fff', border: 'none', padding: '6px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px' }}
              >
                تعديل ومراجعة شاملة ✏️
              </button>
            </div>
          );
        })}
      </div>

      {/* نافذة التعديل والربط الذكي الشامل */}
      {showEditModal && selectedSalary && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <div
            style={{ background: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '30px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)', position: 'relative', color: '#fff', display: 'flex', flexDirection: 'column', gap: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setSelectedSalary(null); setShowEditModal(false); }}
              style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>

            <div>
              <h3 style={{ color: '#22c55e', margin: '0 0 5px 0', fontSize: '18px', fontWeight: 'bold' }}>🌐 تفاصيل وراتب الموظف: {selectedSalary.name || ''}</h3>
              <p style={{ margin: '0', color: '#94a3b8', fontSize: '12px' }}>مزامنة تلقائية: الحضور، ساعات العمل، الإيميلات، أرقام الهواتف، وفصل الموظفين.</p>
            </div>

            <form onSubmit={handleEditEmployeeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

              <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '6px' }}>اسم الموظف والإيميل (من قسم الإيميلات والأرقام)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    value={selectedSalary.name || ''}
                    onChange={(e) => setSelectedSalary({ ...selectedSalary, name: e.target.value })}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 2, ...inputStyle }}
                  />
                  <input
                    type="text"
                    placeholder="الإيميل..."
                    value={selectedSalary.email || ''}
                    onChange={(e) => setSelectedSalary({ ...selectedSalary, email: e.target.value })}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 2, ...inputStyle }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>الراتب الأساسي</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingBase(!isEditingBase)}
                    style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    {isEditingBase ? 'إلغاء' : 'تعديل ✏️'}
                  </button>
                </div>
                {isEditingBase ? (
                  <input
                    type="number"
                    value={editBase}
                    onChange={(e) => setEditBase(e.target.value)}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', width: '100%', boxSizing: 'border-box', ...inputStyle }}
                  />
                ) : (
                  <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0', color: '#fff' }}>{editBase !== '' ? `${editBase} $` : '0 $'}</p>
                )}
              </div>

              {/* الخصومات (الحضور وساعات العمل) */}
              <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ef4444', display: 'block', marginBottom: '8px' }}>الخصومات (مستمدة من الحضور وساعات العمل)</span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    placeholder="المبلغ..."
                    value={deductionAmt}
                    onChange={(e) => setDeductionAmt(e.target.value)}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 1, minWidth: '100px', ...inputStyle }}
                  />
                  <input
                    type="text"
                    placeholder="السبب..."
                    value={deductionRes}
                    onChange={(e) => setDeductionRes(e.target.value)}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 2, minWidth: '130px', ...inputStyle }}
                  />
                </div>
              </div>

              {/* المكافآت (المهام وساعات العمل الإضافية) */}
              <div style={{ background: 'rgba(11, 15, 25, 0.6)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#34d399', display: 'block', marginBottom: '8px' }}>المكافآت (مستمدة من المهام)</span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    placeholder="المبلغ..."
                    value={bonusAmt}
                    onChange={(e) => setBonusAmt(e.target.value)}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 1, minWidth: '100px', ...inputStyle }}
                  />
                  <input
                    type="text"
                    placeholder="السبب..."
                    value={bonusRes}
                    onChange={(e) => setBonusRes(e.target.value)}
                    style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#fff', flex: 2, minWidth: '130px', ...inputStyle }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => togglePaid(selectedSalary.id)}
                  style={{
                    flex: 1,
                    minWidth: '130px',
                    background: (selectedSalary.paid || selectedSalary.status === 'مدفوع') ? '#facc15' : '#2563eb',
                    color: (selectedSalary.paid || selectedSalary.status === 'مدفوع') ? '#111827' : '#fff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  {(selectedSalary.paid || selectedSalary.status === 'مدفوع') ? 'إلغاء التسديد ↩️' : 'تسديد وإرسال للمحاسبة 💵'}
                </button>

                <button
                  type="submit"
                  style={{ flex: 2, minWidth: '140px', background: '#10b981', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                >
                  حفظ ومزامنة مع كافة الأقسام ✅
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Salaries;