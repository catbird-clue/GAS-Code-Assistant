
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadedFile, Analysis, Recommendation, RefactorResult, ConversationTurn, AnalysisStats, RefactorChange, FileAnalysis, BatchRefactorResult, FailedChange, ModelName } from './types';
import FileUpload from './components/FileUpload';
import AnalysisResult from './components/AnalysisResult';
import ChatView from './components/ChatView';
import { analyzeGasProject, refactorCode, updateChangelog, askQuestionAboutCode, batchRefactorCode, correctRefactorResult } from './services/geminiService';
import { GithubIcon, FileCodeIcon, WandIcon, DownloadIcon, XIcon, BeakerIcon, HelpIcon } from './components/icons';
import RefactorResultModal from './components/RefactorResultModal';
import { Chat } from '@google/genai';
import HelpModal from './components/HelpModal';
import { useTranslation } from './I18nContext';
import { demoLibraryFiles, demoFrontendFiles } from './demoProject';

interface UndoState {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  analysisResult: Analysis | null;
}

const MAX_UNDO_STACK_SIZE = 10;

export default function App(): React.ReactNode {
  const { language, setLanguage, t } = useTranslation();
  const [libraryFiles, setLibraryFiles] = useState<UploadedFile[]>([]);
  const [frontendFiles, setFrontendFiles] = useState<UploadedFile[]>([]);

  const [analysisResult, setAnalysisResult] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [analysisStats, setAnalysisStats] = useState<AnalysisStats | null>(null);

  const [isRefactorModalOpen, setIsRefactorModalOpen] = useState(false);
  const [currentRefactor, setCurrentRefactor] = useState<RefactorResult | null>(null);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [isApplyingChanges, setIsApplyingChanges] = useState<boolean>(false);
  const [refactoringRecommendation, setRefactoringRecommendation] = useState<{fileName: string, recIndex: number, suggestionIndex: number} | null>(null);
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);
  
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const chatSessionRef = useRef<Chat | null>(null);

  const [autoReanalyze, setAutoReanalyze] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);
  
  const [selectedFixes, setSelectedFixes] = useState<Record<string, {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}>>({});
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [modelName, setModelName] = useState<ModelName>('gemini-2.5-flash');

  const pushToUndoStack = (state: UndoState) => {
    const newStack = [...undoStack, state];
    if (newStack.length > MAX_UNDO_STACK_SIZE) {
      newStack.shift();
    }
    setUndoStack(newStack);
  };
  
  const clearAnalysisAndChat = () => {
    setAnalysisResult(null);
    setConversationHistory([]);
    chatSessionRef.current = null;
    setAnalysisStats(null);
    setError(null);
    setNotification(null);
    setUndoStack([]);
    setSelectedFixes({});
  };

  const handleLibraryFilesUploaded = (uploadedFiles: UploadedFile[]) => {
    if (libraryFiles.length > 0) {
       if (!window.confirm(t('replaceLibraryWarning'))) {
        return;
      }
    }
    setLibraryFiles(uploadedFiles);
    clearAnalysisAndChat();
  };
  
  const handleFrontendFilesUploaded = (uploadedFiles: UploadedFile[]) => {
     if (frontendFiles.length > 0) {
       if (!window.confirm(t('replaceFrontendWarning'))) {
        return;
      }
    }
    setFrontendFiles(uploadedFiles);
    clearAnalysisAndChat();
  };

  const handleRemoveLibraryFile = (indexToRemove: number) => {
    setLibraryFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    clearAnalysisAndChat();
  };
  
  const handleRemoveFrontendFile = (indexToRemove: number) => {
    setFrontendFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    clearAnalysisAndChat();
  };

  const handleTestProject = () => {
    if (libraryFiles.length > 0 || frontendFiles.length > 0) {
      if (!window.confirm(t('testResetWarning'))) {
        return;
      }
    }
    setLibraryFiles(demoLibraryFiles);
    setFrontendFiles(demoFrontendFiles);
    clearAnalysisAndChat();
    setNotification(t('demoProjectLoaded'));
  };

  const handleAnalyze = useCallback(async () => {
    if (libraryFiles.length === 0 && frontendFiles.length === 0) {
      setError(t('uploadFilesFirstError'));
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setNotification(null);
    setAnalysisStats(null);
    setConversationHistory([]);
    chatSessionRef.current = null;
    setActiveTab('analysis');
    setUndoStack([]);

    const startTime = new Date();
    const totalLines = [...libraryFiles, ...frontendFiles].reduce((acc, file) => acc + (file.content ? file.content.split('\n').length : 0), 0);

    try {
      const result = await analyzeGasProject({ libraryFiles, frontendFiles, modelName, language });
      setAnalysisResult(result);
      
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000; // in seconds
      const analysisRate = duration > 0 ? Math.round((totalLines / duration) * 60) : 0;
      
      setAnalysisStats({
        startTime: startTime.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US'),
        endTime: endTime.toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US'),
        duration,
        totalLines,
        analysisRate
      });

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : t('analysisUnknownError'));
    } finally {
      setIsAnalyzing(false);
    }
  }, [libraryFiles, frontendFiles, modelName, language, t]);

   const handleAskQuestion = useCallback(async () => {
    if (!userQuestion.trim()) {
      setError(t('enterQuestionError'));
      return;
    }
    if (libraryFiles.length === 0 && frontendFiles.length === 0) {
      setError(t('uploadFilesFirstError'));
      return;
    }
    
    setIsAnswering(true);
    setError(null);
    setNotification(null);
    setActiveTab('chat');

    try {
      const { answer, chatSession: newChatSession } = await askQuestionAboutCode({ 
        libraryFiles, 
        frontendFiles,
        question: userQuestion,
        chatSession: chatSessionRef.current,
        analysis: analysisResult,
        modelName,
        language,
      });
      setConversationHistory(prev => [...prev, { question: userQuestion, answer }]);
      chatSessionRef.current = newChatSession;
      setUserQuestion('');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : t('questionUnknownError'));
    } finally {
      setIsAnswering(false);
    }
  }, [libraryFiles, frontendFiles, userQuestion, analysisResult, modelName, language, t]);


  const handleApplyFix = useCallback(async ({ fileName, recommendation, recIndex, suggestionIndex }: { fileName: string; recommendation: Recommendation, recIndex: number, suggestionIndex: number }) => {
    const suggestion = recommendation.suggestions[suggestionIndex];
    if (!recommendation.originalCodeSnippet || !suggestion) return;
    
    setRefactoringRecommendation({fileName, recIndex, suggestionIndex});
    setIsRefactorModalOpen(true);
    setIsRefactoring(true);
    setCurrentRefactor(null);
    setNotification(null);
    setError(null);

    const instruction = `${recommendation.description}\n\n${t('specificSuggestion')}: ${suggestion.title} - ${suggestion.description}`;
    setCurrentInstruction(instruction); 
    try {
       const result = await refactorCode({
        code: recommendation.originalCodeSnippet,
        instruction: instruction,
        fileName,
        libraryFiles,
        frontendFiles,
        modelName,
        language
      });
      setCurrentRefactor(result);
    } catch (e) {
      console.error(e);
      const errorMessage = t('refactorError', { message: e instanceof Error ? e.message : String(e) });
      setCurrentRefactor({
        mainChange: { fileName: '', originalCodeSnippet: 'Error', correctedCodeSnippet: errorMessage},
        relatedChanges: [],
        manualSteps: []
      });
    } finally {
      setIsRefactoring(false);
    }
  }, [libraryFiles, frontendFiles, modelName, language, t]);

  const applyChangesToFiles = (allChanges: RefactorChange[], currentLibraryFiles: UploadedFile[], currentFrontendFiles: UploadedFile[]): { newLibraryFiles: UploadedFile[], newFrontendFiles: UploadedFile[], failedChanges: FailedChange[] } => {
    const newLibraryFiles: UploadedFile[] = JSON.parse(JSON.stringify(currentLibraryFiles));
    const newFrontendFiles: UploadedFile[] = JSON.parse(JSON.stringify(currentFrontendFiles));
    const failedChanges: FailedChange[] = [];
    const successfullyAppliedChanges: RefactorChange[] = [];

    const changesByFile = new Map<string, RefactorChange[]>();
    allChanges.forEach(change => {
        if (!changesByFile.has(change.fileName)) {
            changesByFile.set(change.fileName, []);
        }
        changesByFile.get(change.fileName)!.push(change);
    });

    changesByFile.forEach((changes, fileName) => {
        const isLibraryFile = newLibraryFiles.some(f => f.name === fileName);
        const fileList = isLibraryFile ? newLibraryFiles : newFrontendFiles;
        const fileIndex = fileList.findIndex(f => f.name === fileName);
        if (fileIndex === -1) {
            changes.forEach(change => failedChanges.push({ change, reason: 'SNIPPET_NOT_FOUND' }));
            return;
        }

        let currentContent = fileList[fileIndex].content;
        interface Patch {
          index: number;
          originalLength: number;
          change: RefactorChange;
        }
        const appliedPatches: Patch[] = [];

        changes.forEach(change => {
            let tempContent = currentContent;
            let offset = 0;
            
            appliedPatches.sort((a, b) => a.index - b.index);

            for (const patch of appliedPatches) {
                if (patch.index < tempContent.indexOf(change.originalCodeSnippet)) {
                    offset += (patch.change.correctedCodeSnippet.length - patch.originalLength);
                }
            }

            const searchStartIndex = Math.max(0, tempContent.indexOf(change.originalCodeSnippet) - offset);
            const index = tempContent.indexOf(change.originalCodeSnippet, searchStartIndex);

            if (index !== -1) {
                const before = tempContent.substring(0, index);
                const after = tempContent.substring(index + change.originalCodeSnippet.length);
                currentContent = before + change.correctedCodeSnippet + after;
                
                appliedPatches.push({ 
                    index: index, 
                    originalLength: change.originalCodeSnippet.length,
                    change: change
                });
                
                successfullyAppliedChanges.push(change);
            } else {
                failedChanges.push({ change, reason: 'SNIPPET_NOT_FOUND' });
            }
        });
        
        const changesCount = (fileList[fileIndex].changesCount || 0) + successfullyAppliedChanges.filter(c => c.fileName === fileName).length;
        fileList[fileIndex] = { ...fileList[fileIndex], content: currentContent, changesCount };
    });

    return { newLibraryFiles, newFrontendFiles, failedChanges };
};


  const handleConfirmRefactor = useCallback(async (result: RefactorResult, isCorrection = false, attempt = 1) => {
    const MAX_ATTEMPTS = 3;
    const allChanges = [result.mainChange, ...result.relatedChanges];
    setIsApplyingChanges(true);

    const { newLibraryFiles, newFrontendFiles, failedChanges } = applyChangesToFiles(allChanges, libraryFiles, frontendFiles);

    if (failedChanges.length > 0) {
      if (attempt >= MAX_ATTEMPTS) {
        setIsApplyingChanges(false);
        setIsRefactorModalOpen(false);
        const failedSnippets = failedChanges.map(f => `\n- ${f.change.fileName}`).join('');
        setError(t('maxAttemptsError', { maxAttempts: MAX_ATTEMPTS, failedSnippets }));
        return;
      }
      
      setNotification(t('selfCorrectionAttempt', { attempt: attempt + 1 }));
      
      try {
        const correctedResult = await correctRefactorResult({
            originalResult: result,
            failedChanges,
            libraryFiles,
            frontendFiles,
            instruction: currentInstruction!,
            modelName,
            language
        });
        setCurrentRefactor(correctedResult);
        await handleConfirmRefactor(correctedResult, true, attempt + 1);
      } catch (e) {
          setIsApplyingChanges(false);
          setIsRefactorModalOpen(false);
          setError(t('selfCorrectionError', { errorMsg: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    
    pushToUndoStack({
      libraryFiles: libraryFiles,
      frontendFiles: frontendFiles,
      analysisResult: analysisResult
    });

    setLibraryFiles(newLibraryFiles);
    setFrontendFiles(newFrontendFiles);

    if (refactoringRecommendation && analysisResult) {
      const newAnalysisResult: Analysis = JSON.parse(JSON.stringify(analysisResult));
      const { fileName, recIndex, suggestionIndex } = refactoringRecommendation;
      
      const fileAnalysis = 
        newAnalysisResult.libraryProject.find(f => f.fileName === fileName) ||
        newAnalysisResult.frontendProject.find(f => f.fileName === fileName);

      if (fileAnalysis && fileAnalysis.recommendations[recIndex]) {
        fileAnalysis.recommendations[recIndex].appliedSuggestionIndex = suggestionIndex;
        setAnalysisResult(newAnalysisResult);
      } else {
        setError(t('originalRecommendationError', {fileName}));
      }
    }
    
    setIsRefactorModalOpen(false);
    setIsApplyingChanges(false);
    setNotification(t('changesAppliedNotification'));
  
    // Update changelog
    const changelogFile = [...newLibraryFiles, ...newFrontendFiles].find(f => f.name.toUpperCase() === 'CHANGELOG.MD');
    if (changelogFile && result.mainChange) {
      try {
        const rec = refactoringRecommendation ? 
          (analysisResult?.libraryProject.find(f => f.fileName === refactoringRecommendation.fileName) || analysisResult?.frontendProject.find(f => f.fileName === refactoringRecommendation.fileName))?.recommendations[refactoringRecommendation.recIndex]
          : null;
        
        const title = rec?.suggestions[refactoringRecommendation!.suggestionIndex].title || 'Applied code refactoring';
        const changeDescription = t('changelogEntry', { fileName: refactoringRecommendation!.fileName, title });

        const updatedChangelogContent = await updateChangelog({
            currentChangelog: changelogFile.content,
            changeDescription: changeDescription,
            language,
            modelName
        });
        
        const isLibrary = newLibraryFiles.some(f => f.name === changelogFile.name);
        if (isLibrary) {
            setLibraryFiles(prev => prev.map(f => f.name === changelogFile.name ? { ...f, content: updatedChangelogContent } : f));
        } else {
            setFrontendFiles(prev => prev.map(f => f.name === changelogFile.name ? { ...f, content: updatedChangelogContent } : f));
        }

      } catch (e) {
        setNotification(`${t('changesAppliedNotification')} ${t('changelogUpdateFailed')}`);
      }
    }

    if (autoReanalyze) {
        handleAnalyze();
    }
  }, [libraryFiles, frontendFiles, analysisResult, refactoringRecommendation, autoReanalyze, currentInstruction, modelName, language, t, handleAnalyze]);
  
  const handleUndo = () => {
    const lastState = undoStack[undoStack.length - 1];
    if (lastState) {
      setLibraryFiles(lastState.libraryFiles);
      setFrontendFiles(lastState.frontendFiles);
      setAnalysisResult(lastState.analysisResult);
      setUndoStack(prev => prev.slice(0, -1));
      setNotification(t('undoNotification'));
    }
  };

  const handleToggleFixSelection = (key: string, fixDetails: {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}) => {
    setSelectedFixes(prev => {
      const newSelection = {...prev};
      if (newSelection[key]) {
        delete newSelection[key];
      } else {
        newSelection[key] = fixDetails;
      }
      return newSelection;
    });
  };

  const handleApplySelectedFixes = async () => {
    const fixesToApply = Object.values(selectedFixes);
    if (fixesToApply.length === 0) {
        setError(t('noFixesSelectedError'));
        return;
    }
    
    setIsApplyingChanges(true);
    setNotification(null);
    setError(null);
    
    const instructions = fixesToApply.map(fix => {
        const suggestion = fix.rec.suggestions[fix.suggestionIndex];
        return {
            fileName: fix.fileName,
            code: fix.rec.originalCodeSnippet!,
            instruction: `${fix.rec.description}\n\n${t('specificSuggestion')}: ${suggestion.title} - ${suggestion.description}`
        };
    });

    try {
        const result = await batchRefactorCode({
            instructions,
            libraryFiles,
            frontendFiles,
            modelName,
            language
        });

        const { newLibraryFiles, newFrontendFiles, failedChanges } = applyChangesToFiles(result.changes, libraryFiles, frontendFiles);
        
        if (failedChanges.length === result.changes.length) { // all failed
            const failedFiles = [...new Set(failedChanges.map(f => f.change.fileName))].join(', ');
            throw new Error(t('batchApplyFailedError', { failedFiles }));
        }
        
        pushToUndoStack({
            libraryFiles: libraryFiles,
            frontendFiles: frontendFiles,
            analysisResult: analysisResult
        });
        
        setLibraryFiles(newLibraryFiles);
        setFrontendFiles(newFrontendFiles);

        // Mark fixes as applied
        const newAnalysisResult: Analysis = JSON.parse(JSON.stringify(analysisResult));
        fixesToApply.forEach(fix => {
            const fileAnalysis = 
                newAnalysisResult.libraryProject.find(f => f.fileName === fix.fileName) ||
                newAnalysisResult.frontendProject.find(f => f.fileName === fix.fileName);
            if (fileAnalysis && fileAnalysis.recommendations[fix.recIndex]) {
                fileAnalysis.recommendations[fix.recIndex].appliedSuggestionIndex = fix.suggestionIndex;
            }
        });
        setAnalysisResult(newAnalysisResult);
        
        const appliedCount = result.changes.length - failedChanges.length;
        setNotification(t('fixesAppliedNotification', { count: appliedCount }));
        setSelectedFixes({});
        
        // Update changelog
        const changelogFile = [...newLibraryFiles, ...newFrontendFiles].find(f => f.name.toUpperCase() === 'CHANGELOG.MD');
        if (changelogFile) {
            let currentChangelogContent = changelogFile.content;
            for (const fix of fixesToApply) {
                try {
                    const title = fix.rec.suggestions[fix.suggestionIndex].title;
                    const changeDescription = t('changelogEntry', { fileName: fix.fileName, title });
                    currentChangelogContent = await updateChangelog({
                        currentChangelog: currentChangelogContent,
                        changeDescription,
                        language,
                        modelName
                    });
                } catch(e) {
                   console.error(`Failed to update changelog for ${fix.fileName}`, e);
                   setError(t('changelogUpdateError', { fileName: fix.fileName}));
                }
            }
            const isLibrary = newLibraryFiles.some(f => f.name === changelogFile.name);
            if (isLibrary) {
                setLibraryFiles(prev => prev.map(f => f.name === changelogFile.name ? { ...f, content: currentChangelogContent } : f));
            } else {
                setFrontendFiles(prev => prev.map(f => f.name === changelogFile.name ? { ...f, content: currentChangelogContent } : f));
            }
        }

    } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : t('batchApplyUnknownError'));
    } finally {
        setIsApplyingChanges(false);
    }
  };

  const downloadFile = (file: UploadedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const getFileCountText = (count: number): string => {
    if (count === 0) return '';
    
    if (language === 'ru') {
        const n = Math.abs(count) % 100;
        const n1 = n % 10;
        if (n > 10 && n < 20) return t('fileCount_many', { count });
        if (n1 > 1 && n1 < 5) return t('fileCount_few', { count });
        if (n1 === 1) return t('fileCount_one', { count });
        return t('fileCount_many', { count });
    }
    
    if (count === 1) {
        return t('fileCount_one', { count });
    }
    return t('fileCount_many', { count });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <WandIcon />
            <h1 className="text-xl font-semibold text-white">{t('appTitle')}</h1>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 rounded-md hover:bg-gray-700 transition-colors"
              title={t('help')}
              aria-label={t('help')}
            >
              <HelpIcon />
            </button>
            <div className="h-6 w-px bg-gray-600 mx-1"></div>
            <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-md">
                {(['en', 'ru'] as const).map(lang => (
                    <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${language === lang ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                    >
                        {lang.toUpperCase()}
                    </button>
                ))}
            </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Panel */}
        <div className="w-1/3 max-w-sm flex flex-col border-r border-gray-700">
          <div className="p-4 flex-grow overflow-y-auto">
              <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-2 text-indigo-300 flex items-center justify-between">
                    <span>{t('libraryProjectTitle')}</span>
                    {libraryFiles.length > 0 && <span className="text-sm font-normal text-gray-400">{getFileCountText(libraryFiles.length)}</span>}
                  </h2>
                  <p className="text-sm text-gray-400 mb-3">{t('libraryProjectDescription')}</p>
                  {libraryFiles.length === 0 ? (
                    <FileUpload onFilesUploaded={handleLibraryFilesUploaded} setError={setError} />
                  ) : (
                      <div className="mt-4 space-y-2">
                          {libraryFiles.map((file, index) => (
                              <div key={index} className="bg-gray-800/50 p-2 rounded-md flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2 truncate">
                                      <FileCodeIcon />
                                      <span className="truncate" title={file.name}>{file.name}</span>
                                      {file.changesCount && file.changesCount > 0 && <span className="ml-2 text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">{file.changesCount}</span>}
                                  </div>
                                  <div className="flex items-center flex-shrink-0">
                                      <button onClick={() => downloadFile(file)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md" title={t('download', {fileName: file.name})}><DownloadIcon /></button>
                                      <button onClick={() => handleRemoveLibraryFile(index)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md" title={t('remove', {fileName: file.name})}><XIcon className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
              <div>
                  <h2 className="text-lg font-semibold mb-2 text-indigo-300 flex items-center justify-between">
                    <span>{t('frontendProjectTitle')}</span>
                    {frontendFiles.length > 0 && <span className="text-sm font-normal text-gray-400">{getFileCountText(frontendFiles.length)}</span>}
                  </h2>
                  <p className="text-sm text-gray-400 mb-3">{t('frontendProjectDescription')}</p>
                  {frontendFiles.length === 0 ? (
                    <FileUpload onFilesUploaded={handleFrontendFilesUploaded} setError={setError} />
                  ) : (
                      <div className="mt-4 space-y-2">
                          {frontendFiles.map((file, index) => (
                             <div key={index} className="bg-gray-800/50 p-2 rounded-md flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2 truncate">
                                      <FileCodeIcon />
                                      <span className="truncate" title={file.name}>{file.name}</span>
                                       {file.changesCount && file.changesCount > 0 && <span className="ml-2 text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">{file.changesCount}</span>}
                                  </div>
                                  <div className="flex items-center flex-shrink-0">
                                      <button onClick={() => downloadFile(file)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md" title={t('download', {fileName: file.name})}><DownloadIcon /></button>
                                      <button onClick={() => handleRemoveFrontendFile(index)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md" title={t('remove', {fileName: file.name})}><XIcon className="w-4 h-4" /></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          </div>
          <div className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-900/50">
              <h2 className="text-lg font-semibold mb-2 text-indigo-300">{t('analysisTitle')}</h2>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="w-full flex-grow bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md transition-all hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isAnalyzing && (
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {analysisResult ? t('reanalyze') : t('analyze')}
                    </button>
                    <button
                        onClick={handleTestProject}
                        disabled={isAnalyzing}
                        className="w-full sm:w-auto bg-gray-700 text-white font-semibold px-4 py-2 rounded-md transition-all hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title={t('testWithDemo')}
                    >
                      <BeakerIcon />
                    </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <label htmlFor="model-select" className="text-gray-400">{t('geminiModel')}</label>
                    <select
                        id="model-select"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value as ModelName)}
                        className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-white text-xs focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="gemini-2.5-flash">{t('flashModel')}</option>
                        <option value="gemini-2.5-pro">{t('proModel')}</option>
                    </select>
                </div>
              </div>
          </div>
        </div>
        
        {/* Right Panel */}
        <div className="flex-1 flex flex-col bg-gray-800/20 min-w-0">
            <div className="border-b border-gray-700 flex-shrink-0">
                <div className="flex p-1">
                    <button 
                        onClick={() => setActiveTab('analysis')}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeTab === 'analysis' ? 'bg-gray-700/50 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}
                    >
                        {t('analysisTab')}
                    </button>
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeTab === 'chat' ? 'bg-gray-700/50 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}
                    >
                        {t('chatTab')}
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'analysis' ? (
                    <AnalysisResult 
                        analysis={analysisResult} 
                        isLoading={isAnalyzing} 
                        hasFiles={libraryFiles.length > 0 || frontendFiles.length > 0} 
                        onApplyFix={handleApplyFix}
                        notification={notification}
                        onDismissNotification={() => setNotification(null)}
                        analysisStats={analysisStats}
                        onUndo={handleUndo}
                        canUndo={undoStack.length > 0}
                        selectedFixes={selectedFixes}
                        onToggleFixSelection={handleToggleFixSelection}
                        onApplySelectedFixes={handleApplySelectedFixes}
                        isApplyingChanges={isApplyingChanges}
                    />
                ) : (
                    <ChatView 
                        conversationHistory={conversationHistory}
                        isAnswering={isAnswering}
                    />
                )}
            </div>
             {error && (
                <div className="p-4 m-4 bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg flex items-center justify-between gap-4">
                  <span><strong>{t('errorTitle')}</strong> {error}</span>
                  <button onClick={() => setError(null)} className="text-red-200 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors" aria-label={t('closeNotificationAria')}>
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
            )}
            {activeTab === 'chat' && (
                <div className="p-4 border-t border-gray-700">
                    <div className="flex gap-2">
                        <textarea
                            value={userQuestion}
                            onChange={(e) => setUserQuestion(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAskQuestion(); } }}
                            placeholder={t('questionPlaceholder')}
                            className="flex-grow bg-gray-700 border-gray-600 rounded-lg p-2 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                            rows={2}
                            disabled={isAnswering}
                        />
                        <button
                            onClick={handleAskQuestion}
                            disabled={isAnswering}
                            className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            {isAnswering ? t('answering') : t('ask')}
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      <RefactorResultModal 
        isOpen={isRefactorModalOpen} 
        onClose={() => setIsRefactorModalOpen(false)} 
        result={currentRefactor} 
        isLoading={isRefactoring}
        isApplyingChanges={isApplyingChanges}
        onConfirm={(result) => handleConfirmRefactor(result)}
      />
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
    </div>
  );
}
