

import React from 'react';
import CodeBlock from './CodeBlock';
import { Analysis, FileAnalysis, Recommendation, SuggestedFix, AnalysisStats } from '../types';
import { AlertTriangleIcon, CheckIcon, LightbulbIcon, ShieldCheckIcon, FileTextIcon, UndoIcon, WandIcon, XIcon } from './icons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useTranslation } from '../I18nContext';


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

const AnalysisSummary: React.FC<{ analysis: Analysis }> = ({ analysis }) => {
  const { t } = useTranslation();
  const stats = {
    totalRecommendations: 0,
    appliedFixes: 0
  };

  const allFiles = [...analysis.libraryProject, ...analysis.frontendProject];
  
  for (const file of allFiles) {
    if(file.recommendations) {
      stats.totalRecommendations += file.recommendations.length;
      for (const rec of file.recommendations) {
        if (rec.appliedSuggestionIndex !== undefined) {
          stats.appliedFixes++;
        }
      }
    }
  }
  
   const generateMarkdownReport = (analysis: Analysis): string => {
    let mdContent = `# ${t('reportTitle_md')}\n\n`;

    mdContent += `## ${t('overallSummary_md')}\n\n`;
    mdContent += `${analysis.overallSummary}\n\n`;
    mdContent += '---\n\n';

    const renderProjectSection = (title: string, files: FileAnalysis[]) => {
      if (files.length === 0) return;
      mdContent += `## ${title}\n\n`;
      files.forEach(file => {
        mdContent += `### ${t('file_md')}: \`${file.fileName}\`\n\n`;
        file.recommendations.forEach((rec, recIndex) => {
          mdContent += `#### ${t('recommendation_md')} ${recIndex + 1}${rec.appliedSuggestionIndex !== undefined ? ` (${t('applied_md')})` : ''}\n\n`;
          mdContent += `${rec.description}\n\n`;
          if (rec.originalCodeSnippet) {
            mdContent += `##### ${t('problemCode_md')}:\n`;
            mdContent += '```javascript\n';
            mdContent += `${rec.originalCodeSnippet}\n`;
            mdContent += '```\n\n';
          }
          rec.suggestions.forEach((sugg, suggIndex) => {
            mdContent += `##### ${t('suggestion_md')} ${suggIndex + 1}: ${sugg.title}\n`;
            mdContent += `> ${sugg.description}\n\n`;
            mdContent += `##### ${t('suggestedCode_md')}:\n`;
            mdContent += '```javascript\n';
            mdContent += `${sugg.correctedCodeSnippet}\n`;
            mdContent += '```\n\n';
          });
          mdContent += '\n';
        });
      });
      mdContent += '---\n\n';
    };

    renderProjectSection(t('libraryProjectTitle_md'), analysis.libraryProject);
    renderProjectSection(t('frontendProjectTitle_md'), analysis.frontendProject);

    return mdContent;
  };

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
    <div className="bg-gray-900/50 border-t border-b border-gray-700 p-4 mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div className="flex flex-col sm:flex-row gap-4 justify-around">
            <div className="flex items-center gap-3">
                <LightbulbIcon />
                <div>
                <div className="text-2xl font-bold text-white">{stats.totalRecommendations}</div>
                <div className="text-sm text-gray-400">{t('recommendations')}</div>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <ShieldCheckIcon />
                <div>
                <div className="text-2xl font-bold text-white">{stats.appliedFixes}</div>
                <div className="text-sm text-gray-400">{t('applied')}</div>
                </div>
            </div>
        </div>
        <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors"
            >
              <FileTextIcon />
              {t('exportReport')}
          </button>
    </div>
  );
};

const formatDuration = (seconds: number | null, t: (key: string, params?: any) => string): string => {
  if (seconds === null || isNaN(seconds)) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  let result = '';
  if (minutes > 0) {
    result += `${minutes} ${t('minutes')} `;
  }
  result += `${remainingSeconds} ${t('seconds')}`;
  return result.trim();
};

const AnalysisMetrics: React.FC<{ stats: AnalysisStats }> = ({ stats }) => {
  const { t, language } = useTranslation();
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6 text-sm text-gray-400 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div title={`${t('totalLines')}: ${stats.totalLines?.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US') ?? 'N/A'}`}>
        <div className="font-semibold text-gray-200">{t('performance')}</div>
        <div>{stats.analysisRate?.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US') ?? 'N/A'} {t('linesPerMin')}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">{t('duration')}</div>
        <div>{formatDuration(stats.duration, t)}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">{t('analysisStart')}</div>
        <div>{stats.startTime}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-200">{t('analysisEnd')}</div>
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
    const { t } = useTranslation();
    return (
        <div className={`mt-4 p-4 rounded-lg border relative ${isApplied ? 'border-green-700 bg-green-900/20' : isSelected ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-900/50'}`}>
            {!isAnyApplied && (
              <div className="absolute top-3 right-3">
                <input 
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelection}
                  className="w-5 h-5 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600 cursor-pointer"
                  aria-label={t('selectFixAria')}
                />
              </div>
            )}
            <h4 className="font-semibold text-indigo-300 pr-8">{suggestion.title}</h4>
            <div className="text-gray-400 mt-1 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(suggestion.description) as string) }} />
            <h5 className="text-xs text-green-400 font-semibold mb-1 uppercase">{t('suggestedCode')}:</h5>
            <CodeBlock language={language}>{suggestion.correctedCodeSnippet}</CodeBlock>

            {isApplied ? (
                <div
                    className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 bg-green-900/50 text-green-400 font-semibold px-4 py-2 rounded-md text-sm cursor-default"
                >
                    <CheckIcon />
                    {t('appliedStatus')}
                </div>
            ) : (
                <button 
                    onClick={onApply}
                    disabled={isAnyApplied}
                    className="mt-3 w-full sm:w-auto bg-green-600 text-white font-semibold px-4 py-2 rounded-md text-sm transition-all hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                    {t('applyThisFix')}
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
  const { t } = useTranslation();
  
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
  const language = fileName.endsWith('.html') ? 'html' : 'javascript';

  return (
    <div className={`bg-gray-800/50 p-4 rounded-lg border ${isAnySuggestionApplied ? 'border-green-800/50' : 'border-gray-700'} mb-4`}>
       <div className="flex justify-between items-center mb-2">
            {isAnySuggestionApplied ? (
              <div className="text-xs font-bold text-green-400 uppercase flex items-center gap-2">
                <CheckIcon />
                {t('fixApplied')}
              </div>
            ) : (
                <div></div>
            )}
       </div>

      <div className="text-gray-300 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(recommendation.description) as string) }} />
      
      {recommendation.originalCodeSnippet && (
        <div>
          <h4 className="text-xs text-red-400 font-semibold mb-1 uppercase">{t('problemCode')}:</h4>
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
  const { t } = useTranslation();
  const selectedCount = Object.keys(selectedFixes).length;

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div>{t('analysisInProgress')}</div>
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
                  {t('undo')}
                </button>
              )}
              <button onClick={onDismissNotification} className="text-yellow-200 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors" aria-label={t('closeNotificationAria')}>
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
                    <h2 className="text-xl font-bold mt-4 mb-4 text-white">{t('libraryProjectTitle')}</h2>
                    {analysis.libraryProject.map(file => <FileAnalysisCard key={file.fileName} fileAnalysis={file} onApplyFix={onApplyFix} selectedFixes={selectedFixes} onToggleFixSelection={onToggleFixSelection} />)}
                </div>
            )}
            {analysis.frontendProject.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xl font-bold mt-8 mb-4 text-white">{t('frontendProjectTitle')}</h2>
                    {analysis.frontendProject.map(file => <FileAnalysisCard key={file.fileName} fileAnalysis={file} onApplyFix={onApplyFix} selectedFixes={selectedFixes} onToggleFixSelection={onToggleFixSelection} />)}
                </div>
            )}
            <div>
                <h2 className="text-xl font-bold mt-8 mb-4 text-white">{t('overallSummary')}</h2>
                <div
                  className="text-gray-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(analysis.overallSummary) as string) }}
                />
            </div>
            {selectedCount > 0 && (
              <div className="sticky bottom-4 inset-x-4 mt-8 p-3 bg-gray-700/80 backdrop-blur-sm border border-gray-600 rounded-lg shadow-lg flex items-center justify-between gap-4">
                <span className="font-semibold text-white">{t('fixesSelected', { count: selectedCount })}</span>
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
                      {t('applying')}...
                    </>
                  ) : (
                    <>
                      <WandIcon />
                      {t('applySelected')}
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
            <div>{t('startAnalysisPlaceholder')}</div>
        </div>
    );
  }
  return (
      <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
          <div>{t('runAnalysisPlaceholder')}</div>
      </div>
  );
};

export default AnalysisResult;