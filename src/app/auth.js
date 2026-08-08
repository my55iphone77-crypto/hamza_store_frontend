const jwt = require('jsonwebtoken');

// يتحقق من التوكن الحقيقي المرسل بالـ header: Authorization: Bearer <token>
// شكل الـ payload المتوقع بالتوكن: { id, name, role, email }
module.exports = function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  }

  // التحقق من وجود مفتاح سسرى للـ JWT لمنع الثغرات الحرجة في المصادقة
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('CRITICAL ERROR: JWT_SECRET is not defined in environment variables.');
    return res.status(500).json({ error: 'خطأ داخلي في الخادم، يرجى مراجعة المسؤول' });
  }

  try {
    // التحقق الصارم من التوكن مع منع ثغرات خوارزميات التوقيع الضعيفة أو الوهمية (None/Insecure algorithms)
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256', 'HS384', 'HS512'] });
    
    if (!decoded || typeof decoded !== 'object') {
      return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول من جديد' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول من جديد' });
  }
};