
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadedFile, Analysis, Recommendation, RefactorResult, ConversationTurn, AnalysisStats, RefactorChange, FileAnalysis, BatchRefactorResult, FailedChange, ModelName, ProgressUpdate } from './types';
import FileUpload from './components/FileUpload';
import AnalysisResult from './components/AnalysisResult';
import ChatView from './components/ChatView';
import { analyzeGasProject, refactorCode, updateChangelog, askQuestionAboutCode, batchRefactorCode, correctRefactorResult } from './services/geminiService';
import { GithubIcon, FileCodeIcon, WandIcon, DownloadIcon, XIcon, BeakerIcon, HelpIcon, EyeIcon } from './components/icons';
import RefactorResultModal from './components/RefactorResultModal';
import { Chat } from '@google/genai';
import HelpModal from './components/HelpModal';
import { useTranslation } from './I18nContext';
import { demoLibraryFiles, demoFrontendFiles } from './demoProject';
import FileViewerModal from './components/FileViewerModal';

interface UndoState {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  analysisResult: Analysis | null;
}

interface AnalysisProgress {
  completed: number;
  total: number;
  currentFile: string;
  isGeneratingSummary: boolean;
}

const MAX_UNDO_STACK_SIZE = 10;

export default function App(): React.ReactNode {
  const { language, setLanguage, t } = useTranslation();
  const [libraryFiles, setLibraryFiles] = useState<UploadedFile[]>([]);
  const [frontendFiles, setFrontendFiles] = useState<UploadedFile[]>([]);

  const [analysisResult, setAnalysisResult] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [autoReanalyze, setAutoReanalyze] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);
  
  const [selectedFixes, setSelectedFixes] = useState<Record<string, {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}>>({});
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [modelName] = useState<ModelName>('gemini-2.5-flash');
  
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
  const [currentFileToView, setCurrentFileToView] = useState<UploadedFile | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userQuestion]);

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
    setAnalysisProgress(null);
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
  
  const handleViewFile = (file: UploadedFile) => {
    setCurrentFileToView(file);
    setIsFileViewerOpen(true);
  };

  const handleAnalyze = useCallback(async () => {
    if (libraryFiles.length === 0 && frontendFiles.length === 0) {
      setError(t('uploadFilesFirstError'));
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    if (conversationHistory.length > 0) {
        setNotification(t('reanalyzingWithContext'));
    } else {
        setNotification(null);
    }
    setAnalysisStats(null);
    // Do not clear conversation history on re-analyze
    if (undoStack.length === 0) { // Only clear chat if it's a fresh analysis
        setConversationHistory([]);
        chatSessionRef.current = null;
    }
    setActiveTab('analysis');
    setUndoStack([]);

    const startTime = new Date();
    const allFiles = [...libraryFiles, ...frontendFiles];
    const totalLines = allFiles.reduce((acc, file) => acc + (file.content ? file.content.split('\n').length : 0), 0);

    const handleProgress = (update: ProgressUpdate) => {
      if (update.progress) {
        setAnalysisProgress(prev => ({ ...prev, ...update.progress, isGeneratingSummary: false }));
      }
      // Do not update analysis results progressively anymore.
      // The full result will be set once the entire analysis is complete.
      if (update.summary) {
        setAnalysisProgress(prev => ({ ...prev!, isGeneratingSummary: true }));
      }
    };

    try {
      setAnalysisProgress({
        completed: 0,
        total: allFiles.length,
        currentFile: allFiles[0]?.name || '',
        isGeneratingSummary: false,
      });

      const result = await analyzeGasProject({
        libraryFiles,
        frontendFiles,
        modelName,
        language,
        onProgress: handleProgress,
        conversationHistory: conversationHistory,
      });
      setAnalysisResult(result);
      
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
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
      setAnalysisProgress(null);
    }
  }, [libraryFiles, frontendFiles, modelName, language, t, conversationHistory, undoStack.length]);

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
    
    const currentQuestion = userQuestion;
    setUserQuestion('');
    const currentConversation = [...conversationHistory, { question: currentQuestion, answer: '' }];
    setConversationHistory(currentConversation);


    try {
      const { answer, chatSession: newChatSession } = await askQuestionAboutCode({ 
        libraryFiles, 
        frontendFiles,
        question: currentQuestion,
        chatSession: chatSessionRef.current,
        analysis: analysisResult,
        modelName,
        language,
        conversationHistory
      });
      setConversationHistory(prev => prev.map((turn, index) => index === prev.length - 1 ? { ...turn, answer } : turn));
      chatSessionRef.current = newChatSession;
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : t('questionUnknownError');
      setError(errorMessage);
      setConversationHistory(prev => prev.slice(0, -1));
    } finally {
      setIsAnswering(false);
    }
  }, [libraryFiles, frontendFiles, userQuestion, analysisResult, modelName, language, conversationHistory, t]);


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

  const maybeUpdateChangelog = useCallback(async (changes: { title: string, fileName: string }[]) => {
    if (changes.length === 0) return;

    const allFiles = [...libraryFiles, ...frontendFiles];
    const changelogFile = allFiles.find(f => f.name.toUpperCase() === 'CHANGELOG.MD');
    if (!changelogFile) return;

    try {
      const changeDescriptions = changes.map(c => t('changelogEntry', { fileName: c.fileName, title: c.title })).join('\n- ');
      const newChangelogContent = await updateChangelog({
        currentChangelog: changelogFile.content,
        changeDescription: changeDescriptions,
        modelName,
        language
      });

      const isLibFile = libraryFiles.some(f => f.name.toUpperCase() === 'CHANGELOG.MD');
      if (isLibFile) {
        setLibraryFiles(prev => prev.map(f => f.name.toUpperCase() === 'CHANGELOG.MD' ? { ...f, content: newChangelogContent } : f));
      } else {
        setFrontendFiles(prev => prev.map(f => f.name.toUpperCase() === 'CHANGELOG.MD' ? { ...f, content: newChangelogContent } : f));
      }
    } catch (e) {
      console.error(e);
      setError(t('changelogUpdateFailed'));
    }
  }, [libraryFiles, frontendFiles, modelName, language, t]);

  const handleConfirmRefactor = useCallback(async (result: RefactorResult, isCorrection = false, attempt = 1) => {
    const MAX_ATTEMPTS = 3;
    const allChanges = [result.mainChange, ...result.relatedChanges];
    setIsApplyingChanges(true);

    const { newLibraryFiles, newFrontendFiles, failedChanges } = applyChangesToFiles(allChanges, libraryFiles, frontendFiles);
    
    if (failedChanges.length > 0) {
        if (attempt >= MAX_ATTEMPTS) {
            const failedSnippets = failedChanges.map(f => `\n- \`${f.change.fileName}\``).join('');
            setError(t('maxAttemptsError', { maxAttempts: MAX_ATTEMPTS, failedSnippets }));
            setIsApplyingChanges(false);
            setIsRefactorModalOpen(false);
            return;
        }
        setNotification(t('selfCorrectionAttempt', { attempt: attempt + 1 }));
        try {
            const correctedResult = await correctRefactorResult({
                originalResult: result,
                failedChanges,
                instruction: currentInstruction!,
                libraryFiles,
                frontendFiles,
                modelName,
                language
            });
            await handleConfirmRefactor(correctedResult, true, attempt + 1);
        } catch (e) {
            console.error(e);
            setError(t('selfCorrectionError', { errorMsg: e instanceof Error ? e.message : String(e) }));
            setIsApplyingChanges(false);
            setIsRefactorModalOpen(false);
        }
    } else {
        pushToUndoStack({ libraryFiles, frontendFiles, analysisResult });
        setLibraryFiles(newLibraryFiles);
        setFrontendFiles(newFrontendFiles);

        let newAnalysis = JSON.parse(JSON.stringify(analysisResult)) as Analysis;
        if (newAnalysis && refactoringRecommendation) {
            const { fileName, recIndex, suggestionIndex } = refactoringRecommendation;
            const isLibFile = newAnalysis.libraryProject.some(p => p.fileName === fileName);
            const project = isLibFile ? newAnalysis.libraryProject : newAnalysis.frontendProject;
            const fileAnalysis = project.find(p => p.fileName === fileName);
            if (fileAnalysis && fileAnalysis.recommendations[recIndex]) {
                fileAnalysis.recommendations[recIndex].appliedSuggestionIndex = suggestionIndex;
                fileAnalysis.recommendations[recIndex].appliedRefactorResult = result;
            }
            setAnalysisResult(newAnalysis);
        }

        if (refactoringRecommendation) {
            const allProjectFiles = analysisResult ? [...analysisResult.libraryProject, ...analysisResult.frontendProject] : [];
            const fileWithRec = allProjectFiles.find(f => f.fileName === refactoringRecommendation.fileName);
            const recommendation = fileWithRec?.recommendations[refactoringRecommendation.recIndex];
            const suggestion = recommendation?.suggestions[refactoringRecommendation.suggestionIndex];
            
            if (suggestion) {
                await maybeUpdateChangelog([{title: suggestion.title, fileName: refactoringRecommendation.fileName}]);
            }
        }
        
        setIsApplyingChanges(false);
        setIsRefactorModalOpen(false);
        setNotification(t('changesAppliedNotification'));

        if (autoReanalyze && !isCorrection) {
            setTimeout(() => handleAnalyze(), 500);
        }
    }
  }, [libraryFiles, frontendFiles, analysisResult, refactoringRecommendation, currentInstruction, modelName, language, autoReanalyze, t, handleAnalyze, maybeUpdateChangelog]);

  const handleToggleFixSelection = (key: string, fixDetails: {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}) => {
    setSelectedFixes(prev => {
      const newSelected = { ...prev };
      if (newSelected[key]) {
        delete newSelected[key];
      } else {
        newSelected[key] = fixDetails;
      }
      return newSelected;
    });
  };

  const handleBatchApply = useCallback(async () => {
    const fixesToApply = Object.values(selectedFixes);
    if (fixesToApply.length === 0) {
      setError(t('noFixesSelectedError'));
      return;
    }

    pushToUndoStack({
      libraryFiles,
      frontendFiles,
      analysisResult
    });

    setIsApplyingChanges(true);
    setNotification(null);
    setError(null);

    const instructions = fixesToApply.map(fix => {
      const suggestion = fix.rec.suggestions[fix.suggestionIndex];
      return {
        fileName: fix.fileName,
        code: fix.rec.originalCodeSnippet,
        instruction: `${fix.rec.description}\n\n${t('specificSuggestion')}: ${suggestion.title} - ${suggestion.description}`
      };
    });

    try {
      const result: BatchRefactorResult = await batchRefactorCode({
        instructions,
        libraryFiles,
        frontendFiles,
        modelName,
        language
      });
      
      const { newLibraryFiles, newFrontendFiles, failedChanges } = applyChangesToFiles(result.changes, libraryFiles, frontendFiles);

      if (failedChanges.length === result.changes.length && result.changes.length > 0) {
        const failedFiles = [...new Set(failedChanges.map(f => `\`${f.change.fileName}\``))].join(', ');
        setError(t('batchApplyFailedError', { failedFiles }));
        setIsApplyingChanges(false);
        return;
      }
      
      setLibraryFiles(newLibraryFiles);
      setFrontendFiles(newFrontendFiles);

      let newAnalysis = JSON.parse(JSON.stringify(analysisResult)) as Analysis;
      if (newAnalysis) {
        fixesToApply.forEach(fix => {
          const isLibFile = newAnalysis.libraryProject.some(p => p.fileName === fix.fileName);
          const project = isLibFile ? newAnalysis.libraryProject : newAnalysis.frontendProject;
          const fileAnalysis = project.find(p => p.fileName === fix.fileName);
          if (fileAnalysis && fileAnalysis.recommendations[fix.recIndex]) {
            fileAnalysis.recommendations[fix.recIndex].appliedSuggestionIndex = fix.suggestionIndex;
          }
        });
        setAnalysisResult(newAnalysis);
      }

      await maybeUpdateChangelog(fixesToApply.map(fix => {
        const suggestion = fix.rec.suggestions[fix.suggestionIndex];
        return {
          fileName: fix.fileName,
          title: suggestion.title,
        }
      }));
      
      setNotification(t('fixesAppliedNotification', { count: fixesToApply.length - failedChanges.length }));
      setSelectedFixes({});

      if (autoReanalyze) {
        setTimeout(() => handleAnalyze(), 500);
      }

    } catch(e) {
      console.error(e);
      setError(e instanceof Error ? e.message : t('batchApplyUnknownError'));
    } finally {
      setIsApplyingChanges(false);
    }

  }, [selectedFixes, libraryFiles, frontendFiles, modelName, language, analysisResult, t, autoReanalyze, handleAnalyze, maybeUpdateChangelog]);
  
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const lastState = undoStack[undoStack.length - 1];
    setLibraryFiles(lastState.libraryFiles);
    setFrontendFiles(lastState.frontendFiles);
    setAnalysisResult(lastState.analysisResult);

    setUndoStack(prev => prev.slice(0, -1));
    setNotification(t('undoNotification'));
    setError(null);
  }, [undoStack, t]);

  const handleUndoFix = useCallback((fileName: string, recIndex: number) => {
    pushToUndoStack({
      libraryFiles,
      frontendFiles,
      analysisResult
    });

    const analysis = analysisResult!;
    const isLibFile = analysis.libraryProject.some(f => f.fileName === fileName);
    const project = isLibFile ? analysis.libraryProject : analysis.frontendProject;
    const fileAnalysis = project.find(f => f.fileName === fileName)!;
    const recommendation = fileAnalysis.recommendations[recIndex];
    
    if (!recommendation.appliedRefactorResult) {
      setError(t('undoFailedError'));
      return;
    }
    
    const { mainChange, relatedChanges } = recommendation.appliedRefactorResult;
    const allChangesToUndo = [mainChange, ...relatedChanges];
    
    const changesToApply = allChangesToUndo.map(change => ({
      ...change,
      originalCodeSnippet: change.correctedCodeSnippet,
      correctedCodeSnippet: change.originalCodeSnippet
    }));

    const { newLibraryFiles, newFrontendFiles } = applyChangesToFiles(changesToApply, libraryFiles, frontendFiles);

    setLibraryFiles(newLibraryFiles);
    setFrontendFiles(newFrontendFiles);

    const newAnalysisResult = JSON.parse(JSON.stringify(analysisResult)) as Analysis;
    const projectToUpdate = (isLibFile ? newAnalysisResult.libraryProject : newAnalysisResult.frontendProject);
    const fileToUpdate = projectToUpdate.find(f => f.fileName === fileName);
    if (fileToUpdate) {
        const recToUpdate = fileToUpdate.recommendations[recIndex];
        delete recToUpdate.appliedSuggestionIndex;
        delete recToUpdate.appliedRefactorResult;
    }
    setAnalysisResult(newAnalysisResult);
    setNotification(t('specificUndoSuccess'));

  }, [analysisResult, libraryFiles, frontendFiles, t]);

  const handleDownloadFile = (file: UploadedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAskQuestion();
    }
  };

  const handleClearChat = () => {
    if (conversationHistory.length === 0) return;
    if (window.confirm(t('clearChatWarning'))) {
      setConversationHistory([]);
      chatSessionRef.current = null;
      setNotification(t('chatClearedNotification'));
      setError(null);
    }
  };
  
  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <WandIcon />
          <h1 className="text-xl font-bold">{t('appTitle')}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className={language === 'en' ? 'font-bold text-white' : 'cursor-pointer text-gray-400 hover:text-white'} onClick={() => setLanguage('en')}>EN</span>
            <span className="text-gray-500">|</span>
            <span className={language === 'ru' ? 'font-bold text-white' : 'cursor-pointer text-gray-400 hover:text-white'} onClick={() => setLanguage('ru')}>RU</span>
          </div>
          <button onClick={() => setIsHelpModalOpen(true)} className="text-gray-400 hover:text-white" aria-label={t('help')}>
            <HelpIcon />
          </button>
          <a href="https://github.com/google/generative-ai-docs/tree/main/apps/gas-code-analyzer" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
            <GithubIcon />
          </a>
        </div>
      </header>

      <main className="flex-grow flex flex-col md:flex-row gap-6 p-6 overflow-hidden">
        <div className="md:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          <section>
            <h2 className="text-lg font-semibold mb-2">{t('libraryProjectTitle')}</h2>
            <p className="text-sm text-gray-400 mb-3">{t('libraryProjectDescription')}</p>
            <FileUpload onFilesUploaded={handleLibraryFilesUploaded} setError={setError} />
            {libraryFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {libraryFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-800/50 p-2 rounded-md text-sm">
                    <span className="flex items-center gap-2 truncate" title={file.name}><FileCodeIcon /> <span className="truncate">{file.name}</span> {file.changesCount > 0 && <span className="text-yellow-400 text-xs font-bold">({file.changesCount})</span>}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => handleViewFile(file)} className="text-gray-400 hover:text-white" title={t('viewFile', { fileName: file.name })}><EyeIcon /></button>
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white" title={t('download', { fileName: file.name })}><DownloadIcon /></button>
                        <button onClick={() => handleRemoveLibraryFile(index)} className="text-gray-400 hover:text-white" title={t('remove', { fileName: file.name })}><XIcon className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">{t('frontendProjectTitle')}</h2>
            <p className="text-sm text-gray-400 mb-3">{t('frontendProjectDescription')}</p>
            <FileUpload onFilesUploaded={handleFrontendFilesUploaded} setError={setError} />
             {frontendFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {frontendFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-gray-800/50 p-2 rounded-md text-sm">
                    <span className="flex items-center gap-2 truncate" title={file.name}><FileCodeIcon /> <span className="truncate">{file.name}</span> {file.changesCount > 0 && <span className="text-yellow-400 text-xs font-bold">({file.changesCount})</span>}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => handleViewFile(file)} className="text-gray-400 hover:text-white" title={t('viewFile', { fileName: file.name })}><EyeIcon /></button>
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white" title={t('download', { fileName: file.name })}><DownloadIcon /></button>
                        <button onClick={() => handleRemoveFrontendFile(index)} className="text-gray-400 hover:text-white" title={t('remove', { fileName: file.name })}><XIcon className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          
          <div className="flex-grow"></div>

          <button onClick={handleTestProject} className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors">
            <BeakerIcon /> {t('testWithDemo')}
          </button>
        </div>

        <div className="md:w-2/3 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex-shrink-0">
            <h2 className="text-lg font-semibold mb-3">{t('analysisTitle')}</h2>
            <div className="flex flex-wrap gap-4 items-center">
              <button onClick={handleAnalyze} disabled={isAnalyzing || (libraryFiles.length === 0 && frontendFiles.length === 0)} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md transition-colors hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]">
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('analyzing')}
                  </>
                ) : (analysisResult ? t('reanalyze') : t('analyze'))}
              </button>
              
               <div className="flex items-center gap-2">
                    <input type="checkbox" id="autoReanalyze" checked={autoReanalyze} onChange={(e) => setAutoReanalyze(e.target.checked)} className="w-4 h-4 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-indigo-600 cursor-pointer" />
                    <label htmlFor="autoReanalyze" className="text-sm text-gray-400 cursor-pointer">{t('autoReanalyze')}</label>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-400 border-l border-gray-700 pl-4">
                  <div className="relative flex h-3 w-3" title="Active Model">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </div>
                  <span>{t('geminiModel')} <code className="font-mono bg-gray-700 text-indigo-300 px-1.5 py-1 rounded-md">{modelName}</code></span>
                </div>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg text-sm flex items-center justify-between">
                <span><span className="font-bold">{t('errorTitle')}</span> {error}</span>
                <button onClick={() => setError(null)} className="text-red-300 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"><XIcon className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          
          <div className="flex-grow flex flex-col overflow-hidden">
            <div className="border-b border-gray-700 px-6 flex-shrink-0">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('analysis')} className={`${activeTab === 'analysis' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                        {t('analysisTab')}
                    </button>
                    <button onClick={() => setActiveTab('chat')} className={`${activeTab === 'chat' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                        {t('chatTab')}
                    </button>
                </nav>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar">
              {activeTab === 'analysis' ? (
                <AnalysisResult
                  analysis={analysisResult}
                  isLoading={isAnalyzing}
                  analysisProgress={analysisProgress}
                  hasFiles={libraryFiles.length > 0 || frontendFiles.length > 0}
                  onApplyFix={handleApplyFix}
                  notification={notification}
                  onDismissNotification={() => setNotification(null)}
                  analysisStats={analysisStats}
                  onUndo={handleUndo}
                  onUndoFix={handleUndoFix}
                  canUndo={undoStack.length > 0}
                  selectedFixes={selectedFixes}
                  onToggleFixSelection={handleToggleFixSelection}
                  onApplySelectedFixes={handleBatchApply}
                  isApplyingChanges={isApplyingChanges}
                />
              ) : (
                <ChatView conversationHistory={conversationHistory} isAnswering={isAnswering} />
              )}
            </div>

             <div className="p-4 border-t border-gray-700 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder={t('questionPlaceholder')}
                    className="flex-grow bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-y-hidden"
                  />
                  <button
                    onClick={handleClearChat}
                    disabled={isAnswering || conversationHistory.length === 0}
                    className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    title={t('clearChatTitle')}
                  >
                     <XIcon className="w-5 h-5" />
                  </button>
                  <button onClick={handleAskQuestion} disabled={isAnswering || !userQuestion.trim()} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md transition-colors hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]">
                     {isAnswering ? t('answering') : t('ask')}
                  </button>
                </div>
            </div>
          </div>
        </div>
      </main>

      <RefactorResultModal 
        isOpen={isRefactorModalOpen}
        onClose={() => setIsRefactorModalOpen(false)}
        result={currentRefactor}
        isLoading={isRefactoring}
        isApplyingChanges={isApplyingChanges}
        onConfirm={handleConfirmRefactor}
      />
      <HelpModal 
        isOpen={isHelpModalOpen} 
        onClose={() => setIsHelpModalOpen(false)} 
      />
      <FileViewerModal
        isOpen={isFileViewerOpen}
        onClose={() => setIsFileViewerOpen(false)}
        file={currentFileToView}
      />
    </div>
  );
}
