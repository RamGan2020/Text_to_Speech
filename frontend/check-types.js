// Простая проверка TypeScript файлов
import fs from 'fs';
import path from 'path';

const srcDir = path.join(__dirname, 'src');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Простые проверки на очевидные ошибки
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Проверка на 'any' типы (предупреждение)
    if (line.includes(': any') && !line.includes('//')) {
      console.log(`⚠️  ${filePath}:${i+1} - Используется тип 'any'`);
    }
    // Проверка на отсутствие типов в функциях
    if ((line.includes('function ') || line.includes('const ') || line.includes('export ')) && 
        line.includes(' = ') && line.includes('(') && line.includes(')') &&
        !line.includes(':') && 
        line.trim().length > 10) {
      // Пропускаем строки с комментариями или простые присваивания
      if (!line.includes('//') && !line.match(/=\s*\d+/) && !line.match(/=\s*['"]/)) {
        console.log(`⚠️  ${filePath}:${i+1} - Возможно отсутствие типов`);
      }
    }
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      checkFile(filePath);
    }
  }
}

console.log('Проверка TypeScript файлов...');
walkDir(srcDir);
console.log('Проверка завершена.');