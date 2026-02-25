const fs = require('fs');
const path = require('path');

// 需要建立的目錄
const directories = [
    'data',
    'logs', 
    'uploads'
];

console.log('正在初始化系統目錄...');

directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ 建立目錄: ${dir}`);
    } else {
        console.log(`✓ 目錄已存在: ${dir}`);
    }
});

console.log('✅ 系統初始化完成！');
console.log('現在可以執行: npm start');