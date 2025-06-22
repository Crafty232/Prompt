#!/usr/bin/env node
/**
 * Скрипт для удаления дубликатов из project-content.json
 * Оставляет только уникальные записи по полю Slug
 */

const fs = require('fs');
const path = require('path');

function removeDuplicates(inputFile = 'project-content.json', outputFile = null) {
    try {
        console.log(`Читаем файл: ${inputFile}`);
        
        // Читаем исходный JSON файл
        const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        console.log(`Загружено ${data.length} записей`);
        
        // Создаем Set для отслеживания уже встреченных слагов
        const seenSlugs = new Set();
        const uniqueItems = [];
        const duplicateItems = [];
        
        // Проходим по всем записям
        data.forEach((item, index) => {
            const slug = item.Slug;
            
            if (!slug) {
                console.warn(`⚠️  Запись с ID ${item.ID || index} не имеет слага`);
                uniqueItems.push(item);
                return;
            }
            
            if (seenSlugs.has(slug)) {
                // Это дубликат - добавляем в список дубликатов
                duplicateItems.push({
                    index: index,
                    id: item.ID,
                    slug: slug,
                    title: item.Title ? item.Title.substring(0, 50) + '...' : 'N/A'
                });
            } else {
                // Первое вхождение - добавляем в уникальные
                seenSlugs.add(slug);
                uniqueItems.push(item);
            }
        });
        
        // Выводим статистику
        console.log('\n' + '='.repeat(60));
        console.log('РЕЗУЛЬТАТЫ УДАЛЕНИЯ ДУБЛИКАТОВ');
        console.log('='.repeat(60));
        console.log(`Исходное количество записей: ${data.length}`);
        console.log(`Уникальных записей: ${uniqueItems.length}`);
        console.log(`Удалено дубликатов: ${duplicateItems.length}`);
        
        if (duplicateItems.length > 0) {
            console.log('\nУДАЛЕННЫЕ ДУБЛИКАТЫ:');
            console.log('-'.repeat(40));
            duplicateItems.forEach(item => {
                console.log(`ID: ${item.id}, Slug: "${item.slug}"`);
                console.log(`  Title: ${item.title}`);
            });
        }
        
        // Определяем имя выходного файла
        if (!outputFile) {
            const ext = path.extname(inputFile);
            const name = path.basename(inputFile, ext);
            const dir = path.dirname(inputFile);
            outputFile = path.join(dir, `${name}_unique${ext}`);
        }
        
        // Создаем резервную копию оригинального файла
        const backupFile = inputFile.replace('.json', '_backup.json');
        fs.copyFileSync(inputFile, backupFile);
        console.log(`\n✅ Создана резервная копия: ${backupFile}`);
        
        // Сохраняем очищенные данные
        fs.writeFileSync(outputFile, JSON.stringify(uniqueItems, null, 2), 'utf8');
        console.log(`✅ Очищенные данные сохранены в: ${outputFile}`);
        
        // Опционально: заменяем оригинальный файл
        console.log('\n' + '='.repeat(60));
        console.log('ВНИМАНИЕ: Хотите заменить оригинальный файл?');
        console.log('Для замены запустите скрипт с параметром --replace');
        console.log(`Пример: node remove_duplicates.js ${inputFile} --replace`);
        console.log('='.repeat(60));
        
        return {
            original: data.length,
            unique: uniqueItems.length,
            removed: duplicateItems.length,
            duplicates: duplicateItems
        };
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`❌ Ошибка: Файл '${inputFile}' не найден.`);
        } else if (error instanceof SyntaxError) {
            console.error(`❌ Ошибка при чтении JSON: ${error.message}`);
        } else {
            console.error(`❌ Неожиданная ошибка: ${error.message}`);
        }
        return null;
    }
}

function replaceOriginalFile(inputFile, uniqueFile) {
    try {
        // Создаем дополнительную резервную копию с временной меткой
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const timestampBackup = inputFile.replace('.json', `_backup_${timestamp}.json`);
        fs.copyFileSync(inputFile, timestampBackup);
        
        // Заменяем оригинальный файл
        fs.copyFileSync(uniqueFile, inputFile);
        
        console.log(`✅ Оригинальный файл заменен`);
        console.log(`✅ Дополнительная резервная копия: ${timestampBackup}`);
        
        // Удаляем временный файл с уникальными записями
        fs.unlinkSync(uniqueFile);
        console.log(`🗑️  Временный файл удален: ${uniqueFile}`);
        
    } catch (error) {
        console.error(`❌ Ошибка при замене файла: ${error.message}`);
    }
}

function main() {
    const args = process.argv.slice(2);
    const inputFile = args[0] || 'project-content.json';
    const shouldReplace = args.includes('--replace');
    
    console.log('🔧 СКРИПТ УДАЛЕНИЯ ДУБЛИКАТОВ СЛАГОВ');
    console.log('='.repeat(60));
    
    const result = removeDuplicates(inputFile);
    
    if (result && shouldReplace) {
        const ext = path.extname(inputFile);
        const name = path.basename(inputFile, ext);
        const dir = path.dirname(inputFile);
        const uniqueFile = path.join(dir, `${name}_unique${ext}`);
        
        console.log('\n🔄 Заменяем оригинальный файл...');
        replaceOriginalFile(inputFile, uniqueFile);
    }
    
    if (result) {
        console.log('\n✅ Операция завершена успешно!');
        if (result.removed > 0) {
            console.log(`📊 Удалено ${result.removed} дубликатов из ${result.original} записей`);
        } else {
            console.log('🎉 Дубликатов не найдено - файл уже чистый!');
        }
    }
}

// Запускаем скрипт
main();
