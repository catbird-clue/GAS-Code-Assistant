import React from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { XIcon, DownloadIcon, AlertTriangleIcon } from './icons';
import { RefactorResult } from '../types';

interface RefactorResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: RefactorResult | null;
  isLoading: boolean;
  isApplyingChanges: boolean;
  onConfirm: (result: RefactorResult) => void;
}

const RefactorResultModal: React.FC<RefactorResultModalProps> = ({ isOpen, onClose, result, isLoading, isApplyingChanges, onConfirm }) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (result) {
      onConfirm(result);
    }
  };

  const handleDownloadMemo = () => {
    if (!result || !result.manualSteps || result.manualSteps.length === 0) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const filename = `refactoring-memo-${timestamp}.txt`;

    let memoContent = "Памятка: Ручные действия после рефакторинга\n";
    memoContent += "===========================================\n\n";
    memoContent += "После применения автоматических исправлений кода, выполните следующие действия, чтобы обеспечить корректную работу приложения:\n\n";

    result.manualSteps.forEach((step, index) => {
        memoContent += `${index + 1}. ${step.title}\n`;
        if (step.fileName) {
           memoContent += `   (Файл: ${step.fileName})\n`;
        }
        memoContent += `   - ${step.description.replace(/\n/g, '\n   - ')}\n\n`;
    });

    memoContent += "===========================================\n";

    const blob = new Blob([memoContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const diffStyles = {
    variables: {
      dark: {
        color: '#d1d5db',
        background: '#111827',
        addedBackground: '#043615',
        removedBackground: '#420a13',
        wordAddedBackground: '#065d23',
        wordRemovedBackground: '#63101e',
        addedColor: '#22c55e',
        removedColor: '#f43f5e',
        gutterBackground: '#1f2937',
        gutterColor: '#6b7280'
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">План рефакторинга</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon />
          </button>
        </header>
        <main className="flex-grow p-6 overflow-y-auto">
          {isLoading && !result ? (
             <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                    <svg className="animate-spin mx-auto h-8 w-8 text-white mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Анализирую зависимости и готовлю исправления...
                </div>
            </div>
          ) : result ? (
            <div>
              <div className="mb-6">
                <h3 className="text-xl font-bold mt-2 mb-3 text-indigo-300">Основное изменение</h3>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-sm text-gray-400 mb-2">Файл: <span className="font-semibold text-gray-200">{result.mainChange.fileName}</span></div>
                  <div className="text-sm rounded-lg overflow-hidden">
                     <ReactDiffViewer
                        oldValue={result.mainChange.originalCodeSnippet}
                        newValue={result.mainChange.correctedCodeSnippet}
                        splitView={true}
                        hideLineNumbers={false}
                        leftTitle="Старый код"
                        rightTitle="Новый код"
                        useDarkTheme={true}
                        styles={diffStyles}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold mt-8 mb-3 text-indigo-300">Связанные изменения</h3>
                {result.relatedChanges.length > 0 ? (
                  <div className="space-y-4">
                    {result.relatedChanges.map((change, index) => (
                      <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        <div className="text-sm text-gray-400 mb-2">Файл: <span className="font-semibold text-gray-200">{change.fileName}</span></div>
                        <div className="text-gray-300 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(change.description || '') as string) }} />
                         <div className="text-sm rounded-lg overflow-hidden">
                            <ReactDiffViewer
                                oldValue={change.originalCodeSnippet}
                                newValue={change.correctedCodeSnippet}
                                splitView={true}
                                hideLineNumbers={false}
                                leftTitle="Старый код"
                                rightTitle="Новый код"
                                useDarkTheme={true}
                                styles={diffStyles}
                            />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400">Дополнительных изменений в других файлах не требуется.</div>
                )}
              </div>
              
              {result.manualSteps && result.manualSteps.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-bold mb-3 text-yellow-300 flex items-center gap-2">
                    <AlertTriangleIcon />
                    Важные ручные действия
                  </h3>
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                      <div className="text-yellow-200 text-sm max-w-prose">
                        После применения этих изменений кода вам необходимо будет выполнить следующие действия вручную, чтобы обеспечить полную работоспособность приложения.
                      </div>
                      <button 
                        onClick={handleDownloadMemo}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors flex-shrink-0"
                      >
                        <DownloadIcon />
                        Скачать памятку
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {result.manualSteps.map((step, index) => (
                        <li key={index} className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                          <div className="font-semibold text-gray-200">{step.title}</div>
                          {step.fileName && <div className="text-xs text-gray-500 mt-1">Файл: <code className="bg-gray-700 px-1 py-0.5 rounded">{step.fileName}</code></div>}
                          <div className="text-sm text-gray-400 mt-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(step.description || '') as string) }} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

            </div>
          ) : null}
        </main>
        <footer className="p-4 border-t border-gray-700 flex-shrink-0 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 transition-colors text-white font-semibold">
                Отмена
            </button>
            <button
                onClick={handleConfirm}
                disabled={isLoading || !result || isApplyingChanges}
                className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center min-w-[200px]"
            >
              {isApplyingChanges ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Применение...
                </>
              ) : (
                "Применить все изменения"
              )}
            </button>
        </footer>
      </div>
    </div>
  );
};

export default RefactorResultModal;
