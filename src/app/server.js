require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const documentsRouter = require('./routes/documents');
const mailRouter = require('./routes/mail');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

// 🔌 الاتصال بقاعدة بيانات MongoDB بأمان ومعالجة كاملة للأخطاء
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sales-database';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// 📝 تعريف نموذج المبيعات (Sale Schema)
const saleSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true },
  product: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, default: 1, min: 1 },
  price: { type: Number, required: true, default: 0, min: 0 },
  total: { type: Number, required: true, default: 0, min: 0 },
  date: { type: String, required: true, trim: true }
}, { timestamps: true });

const Sale = mongoose.model('Sale', saleSchema);

// تقديم الملفات المرفوعة كملفات ثابتة (رابط تنزيل حقيقي)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 🌐 مسارات المبيعات (Sales API Endpoints)

// 1. جلب جميع المبيعات
app.get('/api/sales', async (req, res, next) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 });
    // تحويل _id إلى id لتتوافق مع مكون الواجهة الأمامية بأمان تام
    const formattedSales = sales.map(s => ({
      id: s._id ? s.id.toString() : '',
      customerName: s.customerName || '',
      product: s.product || '',
      quantity: s.quantity || 0,
      price: s.price || 0,
      total: s.total || 0,
      date: s.date || ''
    }));
    res.json(formattedSales);
  } catch (err) {
    next(err);
  }
});

// 2. إضافة عملية بيع جديدة
app.post('/api/sales', async (req, res, next) => {
  try {
    const { customerName, product, quantity, price, total, date } = req.body || {};
    
    if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
      const error = new Error('اسم العميل مطلوب وصالح');
      error.status = 400;
      throw error;
    }
    if (!product || typeof product !== 'string' || !product.trim()) {
      const error = new Error('اسم المنتج مطلوب وصالح');
      error.status = 400;
      throw error;
    }

    const qtyVal = parseInt(quantity, 10);
    const priceVal = parseFloat(price);
    const totalVal = parseFloat(total);

    if (isNaN(qtyVal) || qtyVal <= 0 || isNaN(priceVal) || priceVal < 0) {
      const error = new Error('الكمية أو السعر غير صالحين');
      error.status = 400;
      throw error;
    }

    const calculatedTotal = !isNaN(totalVal) ? totalVal : qtyVal * priceVal;

    const newSale = new Sale({
      customerName: customerName.trim(),
      product: product.trim(),
      quantity: qtyVal,
      price: priceVal,
      total: calculatedTotal,
      date: (date && typeof date === 'string' && date.trim()) ? date.trim() : new Date().toLocaleString('ar-JO')
    });

    const savedSale = await newSale.save();

    res.status(201).json({
      id: savedSale._id.toString(),
      customerName: savedSale.customerName,
      product: savedSale.product,
      quantity: savedSale.quantity,
      price: savedSale.price,
      total: savedSale.total,
      date: savedSale.date
    });
  } catch (err) {
    next(err);
  }
});

// 3. تحديث عملية بيع
app.put('/api/sales/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('معرف عملية البيع غير صالح');
      error.status = 400;
      throw error;
    }

    const { customerName, product, quantity, price, total } = req.body || {};

    const updateData = {};
    if (customerName !== undefined) {
      if (typeof customerName !== 'string' || !customerName.trim()) {
        const error = new Error('اسم العميل غير صالح');
        error.status = 400;
        throw error;
      }
      updateData.customerName = customerName.trim();
    }

    if (product !== undefined) {
      if (typeof product !== 'string' || !product.trim()) {
        const error = new Error('اسم المنتج غير صالح');
        error.status = 400;
        throw error;
      }
      updateData.product = product.trim();
    }

    if (quantity !== undefined) {
      const qtyVal = parseInt(quantity, 10);
      if (isNaN(qtyVal) || qtyVal <= 0) {
        const error = new Error('الكمية غير صالحة');
        error.status = 400;
        throw error;
      }
      updateData.quantity = qtyVal;
    }

    if (price !== undefined) {
      const priceVal = parseFloat(price);
      if (isNaN(priceVal) || priceVal < 0) {
        const error = new Error('السعر غير صالح');
        error.status = 400;
        throw error;
      }
      updateData.price = priceVal;
    }

    if (total !== undefined) {
      const totalVal = parseFloat(total);
      if (!isNaN(totalVal) && totalVal >= 0) {
        updateData.total = totalVal;
      }
    } else if (updateData.quantity !== undefined || updateData.price !== undefined) {
      // إعادة حساب الإجمالي تلقائياً في حال تعديل الكمية أو السعر ولم يتم إرسال الإجمالي
      const currentSale = await Sale.findById(id);
      if (currentSale) {
        const q = updateData.quantity !== undefined ? updateData.quantity : currentSale.quantity;
        const p = updateData.price !== undefined ? updateData.price : currentSale.price;
        updateData.total = q * p;
      }
    }

    const updatedSale = await Sale.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedSale) {
      const error = new Error('عملية البيع غير موجودة');
      error.status = 404;
      throw error;
    }

    res.json({
      id: updatedSale._id.toString(),
      customerName: updatedSale.customerName,
      product: updatedSale.product,
      quantity: updatedSale.quantity,
      price: updatedSale.price,
      total: updatedSale.total,
      date: updatedSale.date
    });
  } catch (err) {
    next(err);
  }
});

// 4. حذف عملية بيع
app.delete('/api/sales/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('معرف عملية البيع غير صالح');
      error.status = 400;
      throw error;
    }

    const deletedSale = await Sale.findByIdAndDelete(id);

    if (!deletedSale) {
      const error = new Error('عملية البيع غير موجودة');
      error.status = 404;
      throw error;
    }

    res.json({ message: 'تم حذف عملية البيع بنجاح', id });
  } catch (err) {
    next(err);
  }
});

// مسارات المستندات والبريد الإلكتروني الحالية
app.use('/api/documents', documentsRouter);
app.use('/api/mail', mailRouter);

// معالج أخطاء عام ومؤمن بالكامل
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message || err);
  const status = err.status && typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({ error: err.message || 'خطأ داخلي في الخادم' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Documents & Sales API running on http://localhost:${PORT}`);
});