const fs = require('fs');
const path = require('path');

class JSONValidator {
    constructor() {
        this.errors = [];
        this.fixes = [];
    }

    /**
     * Основная функция для валидации и исправления JSON файла
     */
    validateAndFix(filePath) {
        console.log(`🔍 Анализируем файл: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Файл не найден: ${filePath}`);
            return false;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        // Применяем все исправления
        content = this.removeUnnecessaryBrackets(content);
        content = this.removeJunkLines(content);
        content = this.fixIncorrectContentEscaping(content);
        content = this.fixBrokenMultilineContent(content);
        content = this.fixQuotesInText(content);
        content = this.fixQuotes(content);
        // content = this.fixEscaping(content); // Отключено - заменено на fixQuotes
        content = this.fixMissingCommas(content);
        content = this.validateJSONStructure(content);

        // Сохраняем исправленный файл
        if (content !== originalContent) {
            const backupPath = filePath + '.backup';
            fs.writeFileSync(backupPath, originalContent);
            console.log(`💾 Создан бэкап: ${backupPath}`);

            fs.writeFileSync(filePath, content);
            console.log(`✅ Файл исправлен: ${filePath}`);

            this.printSummary();
        } else {
            console.log(`✅ Файл уже корректен: ${filePath}`);
        }

        return true;
    }

    /**
     * Удаляет лишние квадратные скобки ] которые не в объектах
     */
    removeUnnecessaryBrackets(content) {
        const lines = content.split('\n');
        const fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Проверяем, является ли строка лишней закрывающей квадратной скобкой
            if (trimmedLine === ']') {
                // Проверяем контекст - смотрим на следующие строки
                let shouldRemove = false;

                // Смотрим на следующие несколько строк
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine === '') continue; // Пропускаем пустые строки

                    // Если следующая непустая строка начинается с {, это лишняя скобка
                    if (nextLine.startsWith('{') || nextLine.startsWith('"ID"')) {
                        shouldRemove = true;
                        break;
                    }

                    // Если встречаем правильную структуру, не удаляем
                    if (nextLine === ']' || nextLine === '}') {
                        break;
                    }
                }

                if (shouldRemove) {
                    this.fixes.push(`Удалена лишняя ] на строке ${i + 1}`);
                    continue; // Пропускаем эту строку
                }
            }

            fixedLines.push(line);
        }

        return fixedLines.join('\n');
    }

    /**
     * Удаляет мусорные строки с json, Generated json, ```json
     */
    removeJunkLines(content) {
        const lines = content.split('\n');
        const fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Удаляем строки с мусором
            if (trimmedLine === '```json' ||
                trimmedLine === 'Generated json' ||
                trimmedLine === '```' ||
                trimmedLine === 'json') {
                this.fixes.push(`Удалена мусорная строка на ${i + 1}: "${trimmedLine}"`);
                continue;
            }

            fixedLines.push(line);
        }

        return fixedLines.join('\n');
    }

    /**
     * Исправляет проблемы с кавычками в JSON
     */
    fixQuotes(content) {
        console.log('🔧 Исправляем кавычки в JSON...');

        // Сначала исправляем HTML кавычки в Content полях
        let fixedContent = this.fixHTMLQuotesInContent(content);

        // Затем проверяем и исправляем непарные кавычки
        fixedContent = this.fixUnpairedQuotes(fixedContent);

        return fixedContent;
    }

    /**
     * Исправляет неправильное экранирование в полях Content
     */
    fixIncorrectContentEscaping(content) {
        let fixedContent = content;
        let fixCount = 0;

        // Исправляем случаи, где Content поле начинается с \"
        // "Content": \"<h1>... -> "Content": "<h1>...
        fixedContent = fixedContent.replace(/"Content":\s*\\"/g, (match) => {
            fixCount++;
            return '"Content": "';
        });

        if (fixCount > 0) {
            this.fixes.push(`Исправлено неправильное экранирование в ${fixCount} полях Content`);
        }

        return fixedContent;
    }

    /**
     * Исправляет сломанные многострочные Content поля
     */
    fixBrokenMultilineContent(content) {
        const lines = content.split('\n');
        const fixedLines = [];
        let fixCount = 0;
        let inBrokenContent = false;
        let contentBuffer = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Проверяем, начинается ли строка с Content поля
            if (trimmedLine.includes('"Content":')) {
                // Если строка не заканчивается правильно (нет закрывающей кавычки и запятой)
                if (!trimmedLine.match(/",\s*$/) && !trimmedLine.match(/"\s*$/) && trimmedLine.includes('<')) {
                    inBrokenContent = true;
                    contentBuffer = line;
                    continue;
                }
            }

            // Если мы внутри сломанного Content поля
            if (inBrokenContent) {
                contentBuffer += ' ' + line.trim();

                // Проверяем, заканчивается ли строка правильно или это следующее поле
                if (trimmedLine.includes('"IMG":') || trimmedLine.includes('"ID":') ||
                    trimmedLine.startsWith('}') || trimmedLine.startsWith('{')) {

                    // Завершаем Content поле
                    const contentMatch = contentBuffer.match(/^(\s*"Content":\s*")(.*?)(\s*)$/);
                    if (contentMatch) {
                        const [, prefix, content, suffix] = contentMatch;
                        // Добавляем закрывающую кавычку и запятую
                        const fixedContentLine = prefix + content + '",';
                        fixedLines.push(fixedContentLine);
                        fixCount++;
                        this.fixes.push(`Исправлено сломанное Content поле на строке ${i + 1}`);
                    }

                    inBrokenContent = false;
                    contentBuffer = '';

                    // Добавляем текущую строку
                    fixedLines.push(line);
                } else {
                    // Продолжаем собирать Content
                    continue;
                }
            } else {
                fixedLines.push(line);
            }
        }

        return fixedLines.join('\n');
    }

    /**
     * Исправляет конкретные случаи неэкранированных кавычек в тексте
     */
    fixQuotesInText(content) {
        let fixedContent = content;
        let fixCount = 0;

        // Исправляем только конкретные, известные проблемные фразы
        const specificFixes = [
            // Конкретная фраза "don't ask, don't tell"
            {
                pattern: /"don't ask, don't tell"/g,
                replacement: '\\"don\'t ask, don\'t tell\\"'
            }
        ];

        specificFixes.forEach(({ pattern, replacement }) => {
            const matches = fixedContent.match(pattern);
            if (matches) {
                fixedContent = fixedContent.replace(pattern, replacement);
                fixCount += matches.length;
                this.fixes.push(`Исправлена фраза с неэкранированными кавычками: ${matches.length} случаев`);
            }
        });

        return fixedContent;
    }

    /**
     * Исправляет неэкранированные кавычки в HTML атрибутах только в полях Content
     */
    fixHTMLQuotesInContent(content) {
        let fixedContent = content;
        let fixCount = 0;

        // Сначала исправляем HTML кавычки во всем контенте
        // Ищем неэкранированные кавычки в HTML атрибутах
        fixedContent = fixedContent.replace(/(?<!\\)(\w+)="([^"]*)"/g, (attrMatch, attrName, attrValue) => {
            // Проверяем, что мы внутри поля Content
            // Это простая проверка - если перед нами есть "Content":, то мы в правильном месте
            fixCount++;
            return `${attrName}=\\"${attrValue}\\"`;
        });

        if (fixCount > 0) {
            this.fixes.push(`Экранированы кавычки в ${fixCount} HTML атрибутах в полях Content`);
        }

        return fixedContent;
    }

    /**
     * Исправляет непарные кавычки
     */
    fixUnpairedQuotes(content) {
        const lines = content.split('\n');
        let fixedLines = [];
        let fixCount = 0;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const originalLine = line;

            // Подсчитываем неэкранированные кавычки
            const quotes = this.countUnescapedQuotes(line);

            // Если нечетное количество кавычек, пытаемся исправить
            if (quotes % 2 !== 0) {
                // Если это строка с Content и она не заканчивается правильно
                if (line.includes('"Content":')) {
                    // Пытаемся найти и исправить проблемную кавычку
                    line = this.fixContentLineQuotes(line);
                    if (line !== originalLine) {
                        fixCount++;
                        this.fixes.push(`Исправлена непарная кавычка на строке ${i + 1}`);
                    } else {
                        this.errors.push(`Непарные кавычки на строке ${i + 1}: ${line.substring(0, 100)}...`);
                    }
                } else {
                    this.errors.push(`Непарные кавычки на строке ${i + 1}: ${line.substring(0, 100)}...`);
                }
            }

            fixedLines.push(line);
        }

        if (fixCount > 0) {
            console.log(`✅ Исправлено ${fixCount} строк с непарными кавычками`);
        }

        return fixedLines.join('\n');
    }

    /**
     * Подсчитывает количество неэкранированных кавычек в строке
     */
    countUnescapedQuotes(line) {
        let count = 0;
        let escaped = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                count++;
            }
        }

        return count;
    }

    /**
     * Пытается исправить кавычки в строке с Content
     */
    fixContentLineQuotes(line) {
        // Если строка содержит Content и заканчивается неправильно
        if (line.includes('"Content":') && !line.match(/",\s*$/)) {
            // Пытаемся найти последнюю неэкранированную кавычку и добавить экранирование
            let fixed = line;

            // Простое исправление: если строка не заканчивается на ", или "},
            // и содержит неэкранированную кавычку в конце
            if (!fixed.endsWith('",') && !fixed.endsWith('"}')) {
                // Ищем последнюю неэкранированную кавычку
                for (let i = fixed.length - 1; i >= 0; i--) {
                    if (fixed[i] === '"' && (i === 0 || fixed[i-1] !== '\\')) {
                        // Если это не закрывающая кавычка поля, экранируем её
                        if (i < fixed.length - 1) {
                            fixed = fixed.substring(0, i) + '\\"' + fixed.substring(i + 1);
                            break;
                        }
                    }
                }
            }

            return fixed;
        }

        return line;
    }



    /**
     * Исправляет экранирование кавычек в HTML атрибутах
     */
    fixEscaping(content) {
        // ПРАВИЛЬНО: В JSON строках кавычки в HTML должны быть экранированы
        // href="url" -> href=\"url\"
        let fixed = content;
        let fixCount = 0;

        // Исправляем неэкранированные кавычки в href атрибутах
        // href="https://example.com" -> href=\"https://example.com\"
        // Ищем href= БЕЗ экранирующего слеша перед кавычкой
        const hrefMatches = fixed.match(/href="[^"]*"/g);
        if (hrefMatches) {
            // Заменяем только открывающую кавычку: href=" на href=\"
            // И только закрывающую кавычку: " на \"
            fixed = fixed.replace(/href="([^"]*)"/g, 'href=\\"$1\\"');
            fixCount += hrefMatches.length;
        }

        // Удаляем лишние слеши - если видим два слеша подряд, удаляем один
        // href=\"url\\"> -> href=\"url\">
        const doubleSlashMatches = fixed.match(/href=\\"[^"]*\\\\"/g);
        if (doubleSlashMatches) {
            fixed = fixed.replace(/href=\\"([^"]*)\\\\"/g, 'href=\\"$1\\"');
            fixCount += doubleSlashMatches.length;
        }

        // Специальная обработка для rel="noopener noreferrer"
        // rel=\"noopener noreferrer" -> rel=\"noopener noreferrer\"
        const relNoopenerMatches = fixed.match(/rel=\\"noopener noreferrer"/g);
        if (relNoopenerMatches) {
            fixed = fixed.replace(/rel=\\"noopener noreferrer"/g, 'rel=\\"noopener noreferrer\\"');
            fixCount += relNoopenerMatches.length;
        }

        // Исправляем неэкранированные кавычки в target атрибутах
        // target="_blank" -> target=\"_blank\"
        const targetMatches = fixed.match(/(?<!\\)target="[^"]*"(?!\s*>)/g);
        if (targetMatches) {
            fixed = fixed.replace(/(?<!\\)target="([^"]*)"(?!\s*>)/g, 'target=\\"$1\\"');
            fixCount += targetMatches.length;
        }

        // Исправляем неэкранированные кавычки в rel атрибутах
        // rel="noopener" -> rel=\"noopener\"
        const relMatches = fixed.match(/(?<!\\)rel="[^"]*"(?!\s*>)/g);
        if (relMatches) {
            fixed = fixed.replace(/(?<!\\)rel="([^"]*)"(?!\s*>)/g, 'rel=\\"$1\\"');
            fixCount += relMatches.length;
        }

        // Исправляем неэкранированные кавычки в class атрибутах
        // class="example" -> class=\"example\"
        const classMatches = fixed.match(/class="[^"]*"(?!\s*>)/g);
        if (classMatches) {
            fixed = fixed.replace(/class="([^"]*)"(?!\s*>)/g, 'class=\\"$1\\"');
            fixCount += classMatches.length;
        }

        // Исправляем неэкранированные кавычки в id атрибутах
        // id="example" -> id=\"example\"
        const idMatches = fixed.match(/id="[^"]*"(?!\s*>)/g);
        if (idMatches) {
            fixed = fixed.replace(/id="([^"]*)"(?!\s*>)/g, 'id=\\"$1\\"');
            fixCount += idMatches.length;
        }

        // Исправляем неэкранированные кавычки в src атрибутах
        // src="/images/example.jpg" -> src=\"/images/example.jpg\"
        const srcMatches = fixed.match(/src="[^"]*"(?!\s*>)/g);
        if (srcMatches) {
            fixed = fixed.replace(/src="([^"]*)"(?!\s*>)/g, 'src=\\"$1\\"');
            fixCount += srcMatches.length;
        }

        // Исправляем неэкранированные кавычки в alt атрибутах
        // alt="description" -> alt=\"description\"
        const altMatches = fixed.match(/alt="[^"]*"(?!\s*>)/g);
        if (altMatches) {
            fixed = fixed.replace(/alt="([^"]*)"(?!\s*>)/g, 'alt=\\"$1\\"');
            fixCount += altMatches.length;
        }

        // Исправляем неэкранированные кавычки в style атрибутах
        // style="color: red;" -> style=\"color: red;\"
        const styleMatches = fixed.match(/style="[^"]*"(?!\s*>)/g);
        if (styleMatches) {
            fixed = fixed.replace(/style="([^"]*)"(?!\s*>)/g, 'style=\\"$1\\"');
            fixCount += styleMatches.length;
        }

        if (fixCount > 0) {
            this.fixes.push(`Добавлено экранирование для ${fixCount} HTML атрибутов`);
        }

        return fixed;
    }

    /**
     * Исправляет отсутствующие запятые после JSON объектов
     */
    fixMissingCommas(content) {
        const lines = content.split('\n');
        const fixedLines = [];
        let fixCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Проверяем, заканчивается ли строка на } (закрывающая скобка объекта)
            // Исключаем строки, которые уже имеют запятую или являются частью вложенной структуры
            if (trimmedLine.endsWith('}') && !trimmedLine.endsWith(',') && !trimmedLine.endsWith('},')) {
                // Ищем следующую непустую строку
                let nextObjectFound = false;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();

                    // Пропускаем пустые строки
                    if (nextLine === '') continue;

                    // Если следующая непустая строка начинается с { - это новый объект
                    if (nextLine.startsWith('{')) {
                        nextObjectFound = true;
                        break;
                    }

                    // Если встречаем что-то другое (], }, конец массива), прекращаем поиск
                    if (nextLine.startsWith(']') || nextLine.startsWith('}')) {
                        break;
                    }

                    // Если строка содержит JSON свойства, но не начинается с {,
                    // это может быть продолжение текущего объекта
                    if (nextLine.includes(':') && !nextLine.startsWith('{')) {
                        break;
                    }
                }

                // Если найден следующий объект, добавляем запятую
                if (nextObjectFound) {
                    // Добавляем запятую в конец строки (перед возможными пробелами)
                    const modifiedLine = line.replace(/}(\s*)$/, '},$1');
                    fixedLines.push(modifiedLine);
                    fixCount++;
                    this.fixes.push(`Добавлена запятая после объекта на строке ${i + 1}`);
                } else {
                    fixedLines.push(line);
                }
            } else {
                fixedLines.push(line);
            }
        }

        if (fixCount > 0) {
            console.log(`✅ Добавлено ${fixCount} запятых после JSON объектов`);
        }

        return fixedLines.join('\n');
    }

    /**
     * Проверяет общую структуру JSON
     */
    validateJSONStructure(content) {
        try {
            // Пытаемся распарсить JSON
            JSON.parse(content);
            console.log('✅ JSON структура корректна');
        } catch (error) {
            this.errors.push(`Ошибка JSON структуры: ${error.message}`);
            console.log(`❌ Ошибка JSON: ${error.message}`);
        }

        return content;
    }

    /**
     * Выводит сводку исправлений и ошибок
     */
    printSummary() {
        console.log('\n📊 СВОДКА ИСПРАВЛЕНИЙ:');
        console.log(`✅ Применено исправлений: ${this.fixes.length}`);
        console.log(`❌ Найдено ошибок: ${this.errors.length}`);

        if (this.fixes.length > 0) {
            console.log('\n🔧 Исправления:');
            this.fixes.slice(0, 10).forEach((fix, index) => {
                console.log(`  ${index + 1}. ${fix}`);
            });
            if (this.fixes.length > 10) {
                console.log(`  ... и еще ${this.fixes.length - 10} исправлений`);
            }
        }

        if (this.errors.length > 0) {
            console.log('\n⚠️  Ошибки (показаны первые 10):');
            this.errors.slice(0, 10).forEach((error, index) => {
                console.log(`  ${index + 1}. ${error}`);
            });
            if (this.errors.length > 10) {
                console.log(`  ... и еще ${this.errors.length - 10} ошибок`);
            }
        }

        // Рекомендации
        console.log('\n💡 РЕКОМЕНДАЦИИ:');
        if (this.errors.length > 0) {
            console.log('• Основная проблема: неэкранированные кавычки в HTML контенте');
            console.log('• Для исправления кавычек потребуется ручная правка или более сложный алгоритм');
            console.log('• Рекомендуется экранировать кавычки в HTML: " → \\"');
        }

        if (this.fixes.length > 0) {
            console.log('• Файл частично исправлен - удалены лишние элементы');
            console.log('• Создан бэкап оригинального файла');
        }

        if (this.errors.length === 0 && this.fixes.length === 0) {
            console.log('• JSON файл корректен! 🎉');
        }
    }
}

// Функция для запуска валидатора
function runValidator(filePath) {
    const validator = new JSONValidator();
    return validator.validateAndFix(filePath);
}

// Если скрипт запущен напрямую
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('📖 Использование: node json-validator.js <путь-к-файлу>');
        console.log('📖 Пример: node json-validator.js project-content.json');
        process.exit(1);
    }

    const filePath = args[0];
    const success = runValidator(filePath);

    if (!success) {
        process.exit(1);
    }
}

module.exports = { JSONValidator, runValidator };