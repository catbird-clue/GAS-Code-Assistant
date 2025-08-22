import React from 'react';
import CodeBlock from './CodeBlock';
import { Analysis, FileAnalysis, Recommendation, SuggestedFix, AnalysisStats, ConversationTurn } from '../types';
import { AlertTriangleIcon, CheckIcon, LightbulbIcon, ShieldCheckIcon, FileTextIcon, UndoIcon, WandIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import AnswerBlock from './AnswerBlock';


interface AnalysisResultProps {
  analysis: Analysis | null;
  isLoading: boolean;
  hasFiles: boolean;
  onApplyFix: (params: { fileName:string; recommendation: Recommendation; recIndex: number; suggestionIndex: number; }) => void;
  notification: string | null;
  analysisStats: AnalysisStats | null;
  conversationHistory: ConversationTurn[];
  isAnswering: boolean;
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

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6 flex flex-col sm:flex-row gap-4 justify-around">
      <div className="flex items-center gap-3">
        <LightbulbIcon />
        <div>
          <div className="text-2xl font-bold text-white">{stats.totalRecommendations}</div>
          <div className="text-sm text-gray-400">Рекомендаций найдено</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ShieldCheckIcon />
        <div>
          <div className="text-2xl font-bold text-white">{stats.appliedFixes}</div>
          <div className="text-sm text-gray-400">Исправлений применено</div>
        </div>
      </div>
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
            <p className="text-sm text-gray-400 mt-1 mb-3">{suggestion.description}</p>
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
      <p className="text-gray-300 mb-3">{recommendation.description}</p>
      
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

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis, isLoading, hasFiles, onApplyFix, notification, analysisStats, conversationHistory, isAnswering, onUndo, canUndo, selectedFixes, onToggleFixSelection, onApplySelectedFixes, isApplyingChanges }) => {
  const handleExport = () => {
    if (!analysis) return;
    const markdownContent = generateMarkdownReport(analysis);
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis-report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedCount = Object.keys(selectedFixes).length;

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>Идет анализ вашего кода... Это может занять несколько секунд.</p>
      </div>
    );
  }
  
  const renderContent = () => {
     if (notification) {
      return (
        <div className="p-6 h-full flex items-center justify-center">
          <div className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <AlertTriangleIcon />
              <span>{notification}</span>
            </div>
            {canUndo && (
              <button 
                onClick={onUndo} 
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold px-3 py-1.5 rounded-md text-sm transition-colors flex-shrink-0"
              >
                <UndoIcon />
                Отменить
              </button>
            )}
          </div>
        </div>
      );
    }
  
    if (conversationHistory.length > 0 && !analysis) {
      return (
         <div className="p-4 md:p-6 space-y-6">
            {conversationHistory.map((turn, index) => (
              <div key={index}>
                <div className="flex items-start gap-3">
                  <div className="bg-gray-700 p-2 rounded-full flex-shrink-0 text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3 text-gray-200">
                    {turn.question}
                  </div>
                </div>
                <div className="flex items-start gap-3 mt-4">
                  <div className="bg-indigo-600/30 p-2 rounded-full flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300"><path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path><path d="m5 12-2 2 9-9"></path><path d="M19 21h2"></path><path d="M4 3h2"></path><path d="M21 15h-2"></path><path d="M3 4v2"></path><path d="M21 20v-2"></path></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                     <AnswerBlock answer={turn.answer} />
                  </div>
                </div>
              </div>
            ))}
             {isAnswering && (
               <div className="flex items-start gap-3 mt-4">
                  <div className="bg-indigo-600/30 p-2 rounded-full flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300 animate-pulse"><path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path><path d="m5 12-2 2 9-9"></path><path d="M19 21h2"></path><path d="M4 3h2"></path><path d="M21 15h-2"></path><path d="M3 4v2"></path><path d="M21 20v-2"></path></svg>
                  </div>
                   <div className="text-gray-400 pt-1">Ассистент печатает...</div>
                </div>
            )}
         </div>
      );
    }

    if (!analysis) {
      if (!hasFiles) {
        return (
           <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
               <p>Загрузите файлы вашего проекта, чтобы начать анализ.</p>
           </div>
        );
      }
      return (
         <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
             <p>Нажмите "Проанализировать код" или задайте вопрос, чтобы увидеть результаты здесь.</p>
         </div>
      );
    }
  
    return (
      <div className="p-4 md:p-6 text-base max-w-none relative">
          <AnalysisSummary analysis={analysis} />
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
                className="prose prose-invert text-gray-300 max-w-none prose-ul:list-disc prose-ul:ml-5 prose-li:my-1 prose-strong:text-white leading-relaxed"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(analysis.overallSummary)) }}
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
    );
  }


  return (
    <>
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">
          {conversationHistory.length > 0 && !analysis ? 'Чат с ассистентом' : 'Результаты анализа'}
        </h2>
        {analysis && (
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors"
            >
              <FileTextIcon />
              Экспорт анализа
          </button>
        )}
      </div>
      <div className="flex-grow p-1 overflow-y-auto">
        {renderContent()}
      </div>
    </>
  );
};

export default AnalysisResult;