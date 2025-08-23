

import React from 'react';
import { XIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from '../I18nContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpContentEn = `
# GAS Code Analyzer

This tool is an intelligent assistant designed to analyze, refactor, and improve your Google Apps Script (GAS) projects. Using the power of the Gemini API, it helps identify potential issues, suggest improvements, and even automatically apply fixes.

## How to Use

1.  **Upload Files**: The application is divided into two upload sections:
    *   **Main Project (Library)**: Upload the files for your main script, which is intended to be used as a library.
    *   **Frontend Project**: Upload the project files that consume your library.
2.  **Click "Analyze"**: After uploading the files, start the analysis. The assistant will examine all the code, its structure, and interdependencies.
3.  **Review Recommendations**: You will receive a detailed report with recommendations for each file. These can relate to performance, security, code style, and best practices.
4.  **Apply Fixes**: For many recommendations, automatic fixes will be suggested. You can apply them one by one or select several to apply in a batch.
5.  **Ask a Question**: If you have a specific question about the code, use the chat feature. The assistant will answer it, considering the context of your entire project.

## Key Features

*   **Deep Code Analysis**: Understands the semantics and architecture of your GAS project.
*   **Context-Aware Refactoring**: Improvement suggestions are based on how the code is used throughout the project.
*   **Automatic Fix Application**: Save time by applying fixes with a single click. The system will automatically make changes not only to the main snippet but also to all related files.
*   **CHANGELOG.md Updates**: When applying fixes, the assistant can automatically update the \`CHANGELOG.md\` file if it exists in your project.
*   **Interactive Chat**: Get quick and accurate answers to questions about your code.

---

# Changelog

## [1.4.0] - 2025-05-31
### Fixed
- **Improved API error handling.** The analyzer now detects incomplete responses caused by API key rate limits (e.g., when using a free tier key) and displays a clear error message to the user, advising them to check their quotas. This prevents silent failures where users would receive a truncated analysis.

## [1.3.0] - 2025-05-30
### Changed
- **Solidified automatic CHANGELOG.md updates.** The system is now explicitly designed to automatically update a \`CHANGELOG.md\` file when fixes are applied. The AI assistant's instructions have been reinforced to correctly communicate this feature and prevent contradictory responses.

## [1.2.0] - 2025-05-29
### Added
- Implemented a language switcher (EN/RU) for the entire UI.
- All Gemini API prompts and outputs are now localized based on the selected language.

## [1.1.0] - 2025-05-28
### Added
- Gemini model selection (Flash/Pro) for analysis flexibility.
- Export functionality for analysis reports and chat history in Markdown format.
### Changed
- Improved the self-correction mechanism for refactoring to increase reliability.
- Updated the design of the refactoring modal window.

## [1.0.0] - 2025-05-27
### Added
- Initial release of GAS Code Analyzer.
- Features for analysis, refactoring, batch fix application, and chat.
- Ability to test with a demo project.
- Added documentation and changelog in the help modal.
`;

const helpContentRu = `
# GAS Code Analyzer

Этот инструмент представляет собой интеллектуального ассистента, разработанного для анализа, рефакторинга и улучшения ваших проектов Google Apps Script (GAS). Используя мощь Gemini API, он помогает выявлять потенциальные проблемы, предлагать улучшения и даже автоматически применять исправления.

## Как использовать

1.  **Загрузите файлы**: Приложение разделено на две секции для загрузки:
    *   **Основной проект (Библиотека)**: Загрузите сюда файлы вашего основного скрипта, который предполагается использовать как библиотеку.
    *   **Фронтенд-проект**: Загрузите сюда файлы проекта, который использует вашу библиотеку.
2.  **Нажмите "Анализ"**: После загрузки файлов запустите анализ. Ассистент изучит весь код, его структуру и взаимосвязи.
3.  **Изучите рекомендации**: Вы получите подробный отчет с рекомендациями для каждого файла. Рекомендации могут касаться производительности, безопасности, стиля кода и лучших практик.
4.  **Примените исправления**: Для многих рекомендаций будут предложены автоматические исправления. Вы можете применить их по одному или выбрать несколько и применить их пакетом.
5.  **Задайте вопрос**: Если у вас есть конкретный вопрос о коде, воспользуйтесь чатом. Ассистент ответит на него, учитывая контекст всего вашего проекта.

## Основные возможности

*   **Глубокий анализ кода**: Понимание семантики и архитектуры вашего GAS-проекта.
*   **Контекстно-зависимый рефакторинг**: Предложения по улучшению основаны на том, как код используется во всем проекте.
*   **Автоматическое применение исправлений**: Экономьте время, применяя исправления в один клик. Система автоматически внесет изменения не только в основной фрагмент, но и во все связанные файлы.
*   **Обновление CHANGELOG.md**: При применении исправлений ассистент может автоматически обновлять файл \`CHANGELOG.md\`, если он есть в проекте.
*   **Интерактивный чат**: Получайте быстрые и точные ответы на вопросы по вашему коду.

---

# Журнал изменений

## [1.4.0] - 2025-05-31
### Исправлено
- **Улучшена обработка ошибок API.** Анализатор теперь обнаруживает неполные ответы, вызванные лимитами API-ключа (например, при использовании бесплатного ключа), и выводит пользователю четкое сообщение об ошибке с советом проверить свои квоты. Это предотвращает "тихие" сбои, когда пользователи получали урезанный результат анализа.

## [1.3.0] - 2025-05-30
### Изменено
- **Закреплена функция автоматического обновления CHANGELOG.md.** Система теперь явным образом настроена на автоматическое обновление файла \`CHANGELOG.md\` при применении исправлений. Инструкции для ИИ-ассистента были усилены, чтобы он корректно сообщал об этой функции и не давал противоречивых ответов.

## [1.2.0] - 2025-05-29
### Добавлено
- Реализован переключатель языка (EN/RU) для всего интерфейса.
- Все запросы и ответы от Gemini API теперь локализованы в соответствии с выбранным языком.

## [1.1.0] - 2025-05-28
### Добавлено
- Выбор модели Gemini (Flash/Pro) для гибкости анализа.
- Экспорт отчета по анализу и истории чата в формате Markdown.

### Изменено
- Улучшен механизм самокоррекции при применении рефакторинга для повышения надежности.
- Обновлен дизайн модального окна для рефакторинга.

## [1.0.0] - 2025-05-27
### Добавлено
- Первоначальный выпуск GAS Code Analyzer.
- Функции анализа, рефакторинга, пакетного применения исправлений и чата.
- Возможность тестирования на демонстрационном проекте.
- Добавлена документация и журнал изменений в модальном окне.
`;

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const { t, language } = useTranslation();
  if (!isOpen) return null;

  const helpContent = language === 'ru' ? helpContentRu : helpContentEn;
  const sanitizedHtml = DOMPurify.sanitize(marked.parse(helpContent) as string);

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">{t('helpTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon />
          </button>
        </header>
        <main className="flex-grow p-6 overflow-y-auto prose prose-invert max-w-none prose-headings:text-indigo-300 prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-ul:list-disc prose-li:my-1">
          <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
        </main>
      </div>
    </div>
  );
};

export default HelpModal;