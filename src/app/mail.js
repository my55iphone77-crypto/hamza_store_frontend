const express = require('express');
const nodemailer = require('nodemailer');
const authenticate = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// إعداد الناقل (Transporter) المربوط بإيميل قوقل الموثق
const transporter = nodemailer.createTransport({
  host: String(process.env.SMTP_HOST || 'smtp.gmail.com'),
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  auth: {
    user: String(process.env.SMTP_USER || ''),
    pass: String(process.env.SMTP_PASS || '')
  }
});

/**
 * دالة جلب الحد الأقصى للملفات ديناميكياً
 */
function getDynamicMaxUploadSize() {
  const limit = process.env.MAX_MAX_UPLOAD_MB || process.env.MAX_UPLOAD_MB || 20;
  return Number(limit);
}

// قالب إيميل رسمي، فخم، وآمن (Dark Mode) يحمل هويتك الرسمية
const wrapEmailTemplate = (department, title, accentColor, icon, contentHtml) => `
  <!DOCTYPE html>
  <html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <style>
      body { background-color: #0b0f19; margin: 0; padding: 0; font-family: 'Tajawal', Arial, sans-serif; color: #f8fafc; }
      .wrapper { width: 100%; background-color: #0b0f19; padding: 40px 0; }
      .card { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #111827 0%, #1e1b4b 100%); border: 1px solid ${accentColor}40; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
      .header { padding: 35px; text-align: center; background: radial-gradient(circle at center, ${accentColor}25 0%, transparent 70%); }
      .body { padding: 0 35px 30px 35px; }
      .box { background: rgba(30, 41, 59, 0.7); border: 1px solid ${accentColor}40; border-radius: 14px; padding: 20px; margin: 20px 0; }
      .badge { display: inline-block; background: ${accentColor}20; color: ${accentColor}; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 10px; }
      .footer { padding: 20px 35px; background: #0b0f19; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); font-size: 12px; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <span style="font-size: 40px;">${icon}</span>
          <div class="badge">قسم: ${department.toUpperCase()}</div>
          <h1 style="color: ${accentColor}; font-size: 20px; margin: 5px 0;">${title}</h1>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">نظام الإشعارات الآمن - Hamza Store</p>
        </div>
        <div class="body">${contentHtml}</div>
        <div class="footer"><p style="margin: 0;">هذا البريد مرسل بشكل آلي وموثق عبر نظام Hamza Store © 2026</p></div>
      </div>
    </div>
  </body>
  </html>
`;

// ==========================================
// 🚀 نقطة النهاية للأقسام (بإيميل قوقل الموثق والتصنيف الدقيق)
// ==========================================
router.post('/department-alert', async (req, res) => {
  try {
    const { department, title, subject, message, pdfBuffer, fileName } = req.body || {};

    if (!department) {
      return res.status(400).json({ error: 'اسم القسم مطلوب لتوجيه الإشعار' });
    }

    // إرسال الإيميل على الإيميل المعتمد لمتجرك (المربوط بـ قوقل) مع فصل التصنيف بالعنوان
    const officialInbox = process.env.MAIL_FROM || process.env.SMTP_USER;

    // فحص حجم الملف المرفق ديناميكياً
    let attachments = [];
    if (pdfBuffer) {
      const bufferObj = Buffer.from(pdfBuffer, 'base64');
      const fileSizeInMB = bufferObj.length / (1024 * 1024);
      const maxAllowedMB = getDynamicMaxUploadSize();

      if (fileSizeInMB > maxAllowedMB) {
        return res.status(400).json({ error: `حجم الملف المرفق (${fileSizeInMB.toFixed(2)}MB) يتجاوز الحد الأقصى (${maxAllowedMB}MB)` });
      }

      attachments.push({
        filename: fileName || `document-${Date.now()}.pdf`,
        content: bufferObj,
        contentType: 'application/pdf'
      });
    }

    const content = `
      <div class="box">
        <p style="color: #f8fafc; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-line;">${message || 'إشعار جديد صادر من النظام الآلي.'}</p>
      </div>
    `;

    const mailOptions = {
      from: `Hamza Store <${process.env.MAIL_FROM || process.env.SMTP_USER}>`, // اسم متجرك الرسمي الموثق
      to: officialInbox, // يصل لصندوق إيميلك الموثق مع تصنيف القسم
      subject: subject || `[${department.toUpperCase()}] - إشعار إداري جديد من Hamza Store`,
      html: wrapEmailTemplate(department, title || `إشعار تخص قسم ${department}`, '#38bdf8', '🛡️', content),
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);
    return res.json({ 
      success: true, 
      message: `تم إرسال إشعار قسم (${department}) بنجاح عبر إيميل قوقل الموثق` 
    });

  } catch (err) {
    console.error('Department Alert Error:', err);
    return res.status(502).json({ error: 'تعذر إرسال الإشعار، يرجى التحقق من إعدادات SMTP' });
  }
});

// الإيميل الخارجي الأصلي
router.post('/external', async (req, res) => {
  try {
    const { to, subject, body } = req.body || {};
    const trimmedTo = typeof to === 'string' ? to.trim() : '';
    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
    const trimmedBody = typeof body === 'string' ? body : (body !== undefined ? String(body) : '');

    if (!trimmedTo || !trimmedSubject) {
      return res.status(400).json({ error: 'الحقول المطلوبة ناقصة' });
    }

    await transporter.sendMail({
      from: `Hamza Store <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: trimmedTo,
      subject: trimmedSubject,
      text: trimmedBody
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('sendMail error:', err);
    return res.status(502).json({ error: 'تعذر إرسال البريد الإلكتروني' });
  }
});

module.exports = router;