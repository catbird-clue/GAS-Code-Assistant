import React from 'react';
import CodeBlock from './CodeBlock';
import { Analysis, FileAnalysis, Recommendation, SuggestedFix, AnalysisStats, ConversationTurn } from '../types';
import { AlertTriangleIcon, CheckIcon, LightbulbIcon, ShieldCheckIcon, FileTextIcon, UndoIcon, WandIcon, XIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import AnswerBlock from './AnswerBlock';


interface AnalysisResultProps {
  analysis: Analysis | null;
  isLoading: boolean;
  hasFiles: boolean;
  onApplyFix: (params: { fileName:string; recommendation: Recommendation; recIndex: number; suggestionIndex: number; }) => void;
  notification: string | null;
  onDismissNotification: () => void;
  analysisStats: AnalysisStats | null;
  onUndo: () => void;
  canUndo: boolean;
  selectedFixes: Record<string, any>;
  onToggleFixSelection: (key: string, fixDetails: {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}) => void;
  onApplySelectedFixes: () => void;
  isApplyingChanges: boolean;
}

const generateMarkdownReport = (analysis: Analysis): string => {
  let mdContent = '# Отчет по анализу кода\n\n';

  mdContent += '## Общий вывод\n\n';
  mdContent += `${analysis.overallSummary}\n\n`;
  mdContent += '---\n\n';

  const renderProjectSection = (title: string, files: FileAnalysis[]) => {
    if (files.length === 0) return;
    mdContent += `## ${title}\n\n`;
    files.forEach(file => {
      mdContent += `### Файл: \`${file.fileName}\`\n\n`;
      file.recommendations.forEach((rec, recIndex) => {
        mdContent += `#### Рекомендация ${recIndex + 1}${rec.appliedSuggestionIndex !== undefined ? ' (Применено)' : ''}\n\n`;
        mdContent += `${rec.description}\n\n`;
        if (rec.originalCodeSnippet) {
          mdContent += '##### Проблемный код:\n';
          mdContent += '```javascript\n';
          mdContent += `${rec.originalCodeSnippet}\n`;
          mdContent += '```\n\n';
        }
        rec.suggestions.forEach((sugg, suggIndex) => {
          mdContent += `##### Предложение ${suggIndex + 1}: ${sugg.title}\n`;
          mdContent += `> ${sugg.description}\n\n`;
          mdContent += '##### Предлагаемый код:\n';
          mdContent += '```javascript\n';
          mdContent += `${sugg.correctedCodeSnippet}\n`;
          mdContent += '```\n\n';
        });
        mdContent += '\n';
      });
    });
     mdContent += '---\n\n';
  };

  renderProjectSection('Основной проект (Библиотека)', analysis.libraryProject);
  renderProjectSection('Фронтенд-проект', analysis.frontendProject);

  return mdContent;
};

const AnalysisSummary: React.FC<{ analysis: Analysis }> = ({ analysis }) => {
  const stats = React.useMemo(() => {
    let totalRecommendations = 0;
    let appliedFixes = 0;

    const allFiles = [...analysis.libraryProject, ...analysis.frontendProject];
    
    for (const file of allFiles) {
      if(file.recommendations) {
        totalRecommendations += file.recommendations.length;
        for (const rec of file.recommendations) {
          if (rec.appliedSuggestionIndex !== undefined) {
            appliedFixes++;
          }
        }
      }
    }

    return { totalRecommendations, appliedFixes };
  }, [analysis]);
  
  const handleExport = () => {
    if (!analysis) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const filename = `analysis-report-${timestamp}.md`;

    const markdownContent = generateMarkdownReport(analysis);
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gray-900/50 border-t border-b border-gray-700 p-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex flex-col sm:flex-row gap-4 justify-around">
            <div className="flex items-center gap-3">
                <LightbulbIcon />
                <div>
                <div className="text-2xl font-bold text-white">{stats.totalRecommendations}</div>
                <div className="text-sm text-gray-400">Рекомендаций</div>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <ShieldCheckIcon />
                <div>
                <div className="text-2xl font-bold text-white">{stats.appliedFixes}</div>
                <div className="text-sm text-gray-400">Применено</div>
                </div>
            </div>
        </div>
        <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors"
            >
              <FileTextIcon />
              Экспорт отчета
          </button>
    </div>
  );
};

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || isNaN(seconds)) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  let result = '';
  if (minutes > 0) {
    result += `${minutes} мин `;
  }
  result += `${remainingSeconds} сек`;
  return result.trim();
};

const AnalysisMetrics: React.FC<{ stats: AnalysisStats }> = ({ stats }) => {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6 text-sm text-gray-400 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div title={`Всего строк: ${stats.totalLines?.toLocaleString('ru-RU') ?? 'N/A'}`}>
        <div className="font-semibold text-gray-200">Производительность</div>
        <div>{stats.analysisRate?.toLocaleString('ru-RU') ?? 'N/A'} строк/мин</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">Длительность</div>
        <div>{formatDuration(stats.duration)}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">Начало анализа</div>
        <div>{stats.startTime}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">Окончание анализа</div>
        <div>{stats.endTime}</div>
      </div>
    </div>
  );
};


const SuggestionCard: React.FC<{
    suggestion: SuggestedFix;
    isApplied: boolean;
    isAnyApplied: boolean;
    onApply: () => void;
    language: string;
    isSelected: boolean;
    onToggleSelection: () => void;
}> = ({ suggestion, isApplied, isAnyApplied, onApply, language, isSelected, onToggleSelection }) => {
    return (
        <div className={`mt-4 p-4 rounded-lg border relative ${isApplied ? 'border-green-700 bg-green-900/20' : isSelected ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-900/50'}`}>
            {!isAnyApplied && (
              <div className="absolute top-3 right-3">
                <input 
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelection}
                  className="w-5 h-5 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600 cursor-pointer"
                  aria-label="Select this fix"
                />
              </div>
            )}
            <h4 className="font-semibold text-indigo-300 pr-8">{suggestion.title}</h4>
            <div className="text-gray-400 mt-1 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(suggestion.description) as string) }} />
            <h5 className="text-xs text-green-400 font-semibold mb-1 uppercase">Предлагаемый код:</h5>
            <CodeBlock language={language}>{suggestion.correctedCodeSnippet}</CodeBlock>

            {isApplied ? (
                <div
                    className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 bg-green-900/50 text-green-400 font-semibold px-4 py-2 rounded-md text-sm cursor-default"
                >
                    <CheckIcon />
                    Применено
                </div>
            ) : (
                <button 
                    onClick={onApply}
                    disabled={isAnyApplied}
                    className="mt-3 w-full sm:w-auto bg-green-600 text-white font-semibold px-4 py-2 rounded-md text-sm transition-all hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                    Применить это исправление
                </button>
            )}
        </div>
    );
};


const RecommendationCard: React.FC<{ 
    fileName: string; 
    recommendation: Recommendation; 
    recIndex: number; 
    onApplyFix: AnalysisResultProps['onApplyFix'];
    selectedFixes: AnalysisResultProps['selectedFixes'];
    onToggleFixSelection: AnalysisResultProps['onToggleFixSelection'];
}> = ({ fileName, recommendation, recIndex, onApplyFix, selectedFixes, onToggleFixSelection }) => {
  
  const handleFix = (suggestionIndex: number) => {
    onApplyFix({
      fileName,
      recommendation,
      recIndex,
      suggestionIndex,
    });
  };

  const hasSuggestions = recommendation.suggestions && recommendation.suggestions.length > 0;
  const isAnySuggestionApplied = recommendation.appliedSuggestionIndex !== undefined;
  const language = fileName.split('.').pop() || 'javascript';

  return (
    <div className={`bg-gray-800/50 p-4 rounded-lg border ${isAnySuggestionApplied ? 'border-green-800/50' : 'border-gray-700'} mb-4`}>
       {isAnySuggestionApplied && (
          <div className="text-xs font-bold text-green-400 uppercase mb-2 flex items-center gap-2">
            <CheckIcon />
            Исправление применено
          </div>
        )}
      <div className="text-gray-300 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(recommendation.description) as string) }} />
      
      {recommendation.originalCodeSnippet && (
        <div>
          <h4 className="text-xs text-red-400 font-semibold mb-1 uppercase">Проблемный код:</h4>
          <CodeBlock language={language}>{recommendation.originalCodeSnippet}</CodeBlock>
        </div>
      )}

      {hasSuggestions && (
        <div className="mt-4">
            {recommendation.suggestions.map((suggestion, index) => {
                const key = `${fileName}|${recIndex}|${index}`;
                return (
                  <SuggestionCard 
                      key={index}
                      suggestion={suggestion}
                      isApplied={recommendation.appliedSuggestionIndex === index}
                      isAnyApplied={isAnySuggestionApplied}
                      onApply={() => handleFix(index)}
                      language={language}
                      isSelected={!!selectedFixes[key]}
                      onToggleSelection={() => onToggleFixSelection(key, {fileName, rec: recommendation, recIndex, suggestionIndex: index})}
                  />
                )
            })}
        </div>
      )}
    </div>
  );
};


const FileAnalysisCard: React.FC<{ 
    fileAnalysis: FileAnalysis; 
    onApplyFix: AnalysisResultProps['onApplyFix'];
    selectedFixes: AnalysisResultProps['selectedFixes'];
    onToggleFixSelection: AnalysisResultProps['onToggleFixSelection'];
}> = ({ fileAnalysis, onApplyFix, selectedFixes, onToggleFixSelection }) => (
  <div className="mb-6">
    <h3 className="text-lg font-semibold mt-6 mb-3 text-indigo-300 border-b border-gray-700 pb-2">{fileAnalysis.fileName}</h3>
    {fileAnalysis.recommendations.map((rec, index) => (
      <RecommendationCard 
        key={index} 
        fileName={fileAnalysis.fileName} 
        recommendation={rec} 
        recIndex={index} 
        onApplyFix={onApplyFix}
        selectedFixes={selectedFixes}
        onToggleFixSelection={onToggleFixSelection}
      />
    ))}
  </div>
);

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis, isLoading, hasFiles, onApplyFix, notification, onDismissNotification, analysisStats, onUndo, canUndo, selectedFixes, onToggleFixSelection, onApplySelectedFixes, isApplyingChanges }) => {
  const selectedCount = Object.keys(selectedFixes).length;

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div>Идет анализ вашего кода... Это может занять несколько секунд.</div>
      </div>
    );
  }
  
  if (analysis) {
    return (
      <>
        {notification && (
          <div className="p-4 mx-4 mt-4 bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 rounded-lg flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangleIcon />
              <span>{notification}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canUndo && (
                <button 
                  onClick={onUndo} 
                  className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold px-3 py-1.5 rounded-md text-sm transition-colors"
                >
                  <UndoIcon />
                  Отменить
                </button>
              )}
              <button onClick={onDismissNotification} className="text-yellow-200 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors" aria-label="Закрыть уведомление">
                  <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
        <AnalysisSummary analysis={analysis} />
        <div className="p-4 md:p-6 text-base max-w-none relative">
            {analysisStats && <AnalysisMetrics stats={analysisStats} />}
    
            {analysis.libraryProject.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-bold mt-4 mb-4 text-white">Основной проект (Библиотека)</h2>
                    {analysis.libraryProject.map(file => <FileAnalysisCard key={file.fileName} fileAnalysis={file} onApplyFix={onApplyFix} selectedFixes={selectedFixes} onToggleFixSelection={onToggleFixSelection} />)}
                </div>
            )}
            {analysis.frontendProject.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xl font-bold mt-8 mb-4 text-white">Фронтенд-проект</h2>
                    {analysis.frontendProject.map(file => <FileAnalysisCard key={file.fileName} fileAnalysis={file} onApplyFix={onApplyFix} selectedFixes={selectedFixes} onToggleFixSelection={onToggleFixSelection} />)}
                </div>
            )}
            <div>
                <h2 className="text-xl font-bold mt-8 mb-4 text-white">Общий вывод</h2>
                <div
                  className="text-gray-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(analysis.overallSummary) as string) }}
                />
            </div>
            {selectedCount > 0 && (
              <div className="sticky bottom-4 inset-x-4 mt-8 p-3 bg-gray-700/80 backdrop-blur-sm border border-gray-600 rounded-lg shadow-lg flex items-center justify-between gap-4">
                <span className="font-semibold text-white">{selectedCount} исправлений выбрано</span>
                <button 
                  onClick={onApplySelectedFixes}
                  disabled={isApplyingChanges}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md transition-all hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isApplyingChanges ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Применение...
                    </>
                  ) : (
                    <>
                      <WandIcon />
                      Применить выбранные
                    </>
                  )}
                </button>
              </div>
            )}
        </div>
      </>
    );
  }

  // Fallback placeholders
  if (!hasFiles) {
    return (
        <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
            <div>Загрузите файлы вашего проекта, чтобы начать анализ.</div>
        </div>
    );
  }
  return (
      <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
          <div>Нажмите "Анализ", чтобы увидеть результаты здесь.</div>
      </div>
  );
};

export default AnalysisResult;