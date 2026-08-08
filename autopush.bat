@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo تهيئة مستودع جديد نظيف...
if exist .git rmdir /s /q .git
git init

echo إنشاء ملف التغاضي .gitignore وحماية الملفات...
echo .env > .gitignore
echo node_modules/ >> .gitignore

echo جاري تجهيز وإضافة الملفات الآمنة...
git add .

echo حفظ التعديلات...
git commit -m "Fresh auto update: %date% %time%"

echo ربط المستودع بالرابط الأساسي...
git branch -M main
git remote add origin https://github.com/my55iphone77-crypto/hamza_store_frontend.git

echo جاري الرفع الإجباري للمستودع النظيف...
git push -u origin main --force

echo ========================================
echo تم الرفع بنجاح وبدون أي أخطاء!
echo ========================================
timeout /t 5 > nul