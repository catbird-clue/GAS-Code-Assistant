import React from 'react';
import { XIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpContent = `
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

## [1.0.0] - 2024-05-27

### Добавлено
- Первоначальный выпуск GAS Code Analyzer.
- Функции анализа, рефакторинга, пакетного применения исправлений и чата.
- Возможность тестирования на демонстрационном проекте.
- Добавлена документация и журнал изменений в модальном окне.
`;

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
          <h2 className="text-lg font-semibold text-white">Справка и информация о приложении</h2>
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
