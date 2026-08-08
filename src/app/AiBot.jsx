import React, { useState, useEffect, useRef } from 'react';
import { useApp } from "./AppContext";
import { useFullBleedStyle } from "./useWindowSize";

function AiBot({ inputStyle = {} }) {
  const fullBleedStyle = useFullBleedStyle();
  const {
    products, customers, orders, employees, accountingTransactions,
    sessions, setSessions, currentSessionId, setCurrentSessionId,
    syncedChat, setSyncedChat, currentUser, setCurrentUser,
    addProduct, deleteProduct, hireEmployee, fireEmployee, hasPermission, apiRequest
  } = useApp();

  const [botMode, setBotMode] = useState('management');
  const [localInputText, setLocalInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const chatContainerRef = useRef(null);

  const BOT_PERSONA_NAME = "مساعد المتجر الذكي";

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [syncedChat, isThinking]);

  const getGlassEmailTemplate = (title, contentHtml) => `
    <div style="font-family: 'Tajawal', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 40px; direction: rtl; color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-top: 0;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.8; color: #cbd5e1;">${contentHtml}</div>
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b; text-align: center;">
          نظام إدارة المتجر الذكي المركزي &bull; ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    </div>
  `;

  const sendRealSmtpMail = async (to, subject, htmlBody) => {
    try {
      await apiRequest('/sendExternalMail', 'POST', {
        to, subject,
        body: getGlassEmailTemplate(subject, htmlBody)
      });
      return true;
    } catch (err) {
      console.error('فشل إرسال البريد:', err);
      return false;
    }
  };

  const humanTypingDelay = (text) => new Promise(res => setTimeout(res, Math.min(Math.max(text.length * 15, 600), 1800)));

  const pushBotReply = (replyText, targetChat = syncedChat) => {
    setSyncedChat([...(Array.isArray(targetChat) ? targetChat : []), { sender: 'bot', text: replyText }]);
  };

  const findClosestMatch = (text, list, key) => {
    if (!list || list.length === 0) return { match: null };
    const found = list.find(item => text.includes(item[key]));
    return { match: found || null };
  };

  const detectQuestionType = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('شكوى') && (lower.includes('كبيرة') || lower.includes('عاجل') || lower.includes('مدير'))) return 'escalate_complaint';
    if (lower.includes('مشكلة') || lower.includes('عميل')) return 'customer_trouble';
    if (lower.includes('طلب') || lower.includes('طلبات')) return 'view_orders';
    if (lower.includes('وظف') || lower.includes('تعيين')) return 'hire_employee';
    if (lower.includes('فصل') || lower.includes('اطرد')) return 'fire_employee';
    if (lower.includes('ضيف منتج') || lower.includes('منتج جديد')) return 'manage_products';
    if (lower.includes('حذف منتج')) return 'delete_product';
    if (lower.includes('مخزون') || lower.includes('بضاعة')) return 'view_dashboard';
    if (lower.includes('ربح') || lower.includes('مالي') || lower.includes('دخل')) return 'manage_accounting';
    if (lower.includes('تسويق') || lower.includes('حملة')) return 'send_marketing';
    return 'view_dashboard';
  };

  const createNewPrivateSession = () => {
    const newSession = { id: String(Date.now()), name: `محادثة جديدة #${sessions.length + 1}` };
    setSessions(prev => [...(Array.isArray(prev) ? prev : []), newSession]);
    setCurrentSessionId(newSession.id);
    setSyncedChat([]);
  };

  const handleAiSubmit = async () => {
    const textToSend = localInputText.trim();
    if (!textToSend) return;

    setLocalInputText('');
    const updatedChat = [...(Array.isArray(syncedChat) ? syncedChat : []), { sender: 'user', text: textToSend }];
    setSyncedChat(updatedChat);

    try {
      if (pendingAction) {
        if (textToSend.toLowerCase().includes('نعم') || textToSend === '1') {
          if (pendingAction.type === 'fire_employee') {
            await fireEmployee(pendingAction.payload.employee.id || pendingAction.payload.employee._id);
            pushBotReply(`تم فصل الموظف (${pendingAction.payload.employee.name}) بنجاح.`, updatedChat);
          } else if (pendingAction.type === 'delete_product') {
            await deleteProduct(pendingAction.payload.product.id || pendingAction.payload.product._id);
            pushBotReply(`تم حذف المنتج (${pendingAction.payload.product.name}) نهائياً.`, updatedChat);
          }
          setPendingAction(null);
          return;
        } else {
          setPendingAction(null);
          pushBotReply(`تم إلغاء العملية.`, updatedChat);
          return;
        }
      }

      const permissionKey = detectQuestionType(textToSend);
      if (!hasPermission(permissionKey)) {
        pushBotReply(`⛔ عذراً يا (${currentUser.name})، دورك (${currentUser.role}) لا يمتلك صلاحية لهذا الأمر.`, updatedChat);
        return;
      }

      let botReply = '';
      let typingAlreadyHandled = false;

      const totalProductsCount = products.length;
      const totalStockQty = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
      const totalIncome = accountingTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalExpense = accountingTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const netProfit = totalIncome - totalExpense;

      if (permissionKey === 'escalate_complaint') {
        const { match: matchedCust } = findClosestMatch(textToSend, customers, 'name');
        botReply = `تم رصد الشكوى وتصعيدها للإدارة العليا.`;
        typingAlreadyHandled = true;
        await sendRealSmtpMail('admin@store.com', `🚨 [تصعيد عاجل] شكوى عميل`, `<p><strong>العميل:</strong> ${matchedCust?.name || 'غير محدد'}</p><p>${textToSend}</p>`);
      } 
      else if (permissionKey === 'hire_employee') {
        const nameMatch = textToSend.match(/(?:اسمه|اسمها|الموظف)\s+([\u0600-\u06FF\s]{2,30})/);
        const empName = nameMatch ? nameMatch[1].trim() : 'موظف جديد';
        await hireEmployee({ name: empName, role: 'sales', email: `${Date.now()}@store.com` });
        botReply = `تم تعيين الموظف (${empName}) بنجاح.`;
      } 
      else if (permissionKey === 'fire_employee') {
        const { match: targetEmp } = findClosestMatch(textToSend, employees, 'name');
        if (!targetEmp) {
          botReply = `لم يتم العثور على الموظف.`;
        } else {
          setPendingAction({ type: 'fire_employee', payload: { employee: targetEmp } });
          botReply = `هل أنت متأكد من فصل (${targetEmp.name})؟ اكتب "نعم" للتأكيد.`;
        }
      } 
      else if (permissionKey === 'manage_products' && textToSend.includes('ضيف')) {
        const nameMatch = textToSend.match(/منتج\s+اسمه\s+([\u0600-\u06FF0-9\s]{2,40})/);
        const prodName = nameMatch ? nameMatch[1].trim() : 'منتج عام';
        await addProduct({ name: prodName, price: 100, stock: 20 });
        botReply = `تمت إضافة المنتج (${prodName}) للمخزون.`;
      } 
      else if (permissionKey === 'delete_product') {
        const { match: targetProduct } = findClosestMatch(textToSend, products, 'name');
        if (!targetProduct) {
          botReply = `لم أتمكن من العثور على المنتج.`;
        } else {
          setPendingAction({ type: 'delete_product', payload: { product: targetProduct } });
          botReply = `أنت على وشك حذف (${targetProduct.name}). اكتب "نعم" للتأكيد.`;
        }
      } 
      else if (permissionKey === 'send_marketing' || botMode === 'marketing') {
        pushBotReply(`جاري إرسال الحملة الإعلانية...`, updatedChat);
        let sentCount = 0;
        for (const cust of (Array.isArray(customers) ? customers : [])) {
          if (cust && cust.email) {
            await sendRealSmtpMail(cust.email, `🔥 أحدث عروض المتجر`, `<p>عزيزنا ${cust.name || ''}، تفضل بزيارة المتجر واستفد من العروض الحصرية.</p>`);
            sentCount++;
          }
        }
        setSyncedChat(prev => [...(Array.isArray(prev) ? prev : []), { sender: 'bot', text: `تم إرسال الحملة إلى (${sentCount}) عميل.` }]);
        return;
      } 
      else if (permissionKey === 'manage_accounting') {
        botReply = `تقرير الحسابات:\n- الدخل: ${totalIncome.toLocaleString()} دينار\n- المصاريف: ${totalExpense.toLocaleString()} دينار\n- صافي الأرباح: ${netProfit.toLocaleString()} دينار.`;
      } 
      else {
        setIsThinking(true);
        await humanTypingDelay(textToSend);
        setIsThinking(false);
        typingAlreadyHandled = true;
        botReply = `مرحباً بك ${currentUser.name}، أنا ${BOT_PERSONA_NAME}. يمكنك طلب:\n• عرض الأرباح\n• إضافة/حذف منتج\n• تعيين/فصل موظف\n• إرسال حملة تسويقية\n• تصعيد شكوى`;
      }

      if (!typingAlreadyHandled) {
        setIsThinking(true);
        await humanTypingDelay(botReply);
        setIsThinking(false);
      }
      pushBotReply(botReply, updatedChat);

    } catch (error) {
      setIsThinking(false);
      pushBotReply(`⚠️ خطأ: ${error.message}`, updatedChat);
    }
  };

  return (
    <div style={{ ...glassContainerStyle, ...fullBleedStyle }} dir="rtl">
      {/* شريط الصلاحيات */}
      <div style={{ background: '#1e293b', padding: '12px', borderRadius: '10px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #334155', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: '#38bdf8' }}>
          👤 المستخدم: <strong>{currentUser?.name}</strong> | الدور: <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{(currentUser?.role || 'sales').toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>تبديل الصلاحية:</span>
          <select 
            value={currentUser?.role || 'sales'} 
            onChange={(e) => {
              const role = e.target.value;
              const names = { admin: 'المدير العام', manager: 'المدير التنفيذي', sales: 'موظف مبيعات', support: 'دعم العملاء' };
              setCurrentUser({ id: 1, name: names[role], role, email: `${role}@store.com` });
            }}
            style={{ background: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '5px 10px', borderRadius: '6px', fontSize: '12px' }}
          >
            <option value="admin">مدير عام (Admin)</option>
            <option value="manager">مدير تنفيذي (Manager)</option>
            <option value="sales">موظف مبيعات (Sales)</option>
            <option value="support">خدمة عملاء (Support)</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '18px' }}>🤖 {BOT_PERSONA_NAME}</h3>
        <div style={{ display: 'flex', background: '#1e293b', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
          <button type="button" onClick={() => setBotMode('management')} style={{ background: botMode === 'management' ? '#2563eb' : 'transparent', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
            الإدارة والأوامر
          </button>
          <button type="button" onClick={() => setBotMode('marketing')} style={{ background: botMode === 'marketing' ? '#f59e0b' : 'transparent', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
            التسويق الفوري
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <select value={currentSessionId} onChange={(e) => setCurrentSessionId(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', padding: '8px 12px', borderRadius: '8px', color: '#fff', width: '220px' }}>
          {(Array.isArray(sessions) ? sessions : []).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <button type="button" onClick={createNewPrivateSession} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
          محادثة جديدة
        </button>
      </div>

      <div ref={chatContainerRef} style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', height: '350px', overflowY: 'auto', marginBottom: '15px', border: '1px solid #334155' }}>
        {(!syncedChat || syncedChat.length === 0) ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '70px 20px', fontSize: '14px' }}>
            🤖 أهلاً بك! جرب كتابة:\n• "عرض الأرباح"\n• "ضيف منتج اسمه X"\n• "وظف موظف اسمه Y"\n• "حملة تسويقية"
          </div>
        ) : (
          syncedChat.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
              <strong style={{ color: msg.sender === 'user' ? '#38bdf8' : '#10b981', fontSize: '13px' }}>
                {msg.sender === 'user' ? `${currentUser?.name || 'أنت'}:` : `${BOT_PERSONA_NAME}:`}
              </strong>
              <p style={{ margin: '5px 0', color: '#f1f5f9', whiteSpace: 'pre-line', lineHeight: '1.6', fontSize: '14px' }}>
                {msg.text}
              </p>
            </div>
          ))
        )}
        {isThinking && (<div style={{ color: '#94a3b8', fontSize: '13px' }}>⏳ {BOT_PERSONA_NAME} يفكر...</div>)}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <input type="text" placeholder="اكتب أمرك هنا..." value={localInputText} onChange={(e) => setLocalInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()} style={{ background: '#1e293b', border: '1px solid #334155', padding: '10px 14px', borderRadius: '8px', color: '#fff', flex: 1, fontSize: '13px' }} />
        <button type="button" onClick={handleAiSubmit} style={{ background: botMode === 'marketing' ? '#f59e0b' : '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
          {botMode === 'marketing' ? 'إرسال الحملة' : 'إرسال'}
        </button>
      </div>
    </div>
  );
}

const glassContainerStyle = {
  background: 'rgba(11, 15, 25, 0.85)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '30px',
  color: '#f8fafc',
  fontFamily: 'Tajawal, sans-serif',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
};

export default AiBot;