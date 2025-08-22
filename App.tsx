import React, { useState, useCallback, useEffect } from 'react';
import { UploadedFile, Analysis, Recommendation, RefactorResult, ConversationTurn, AnalysisStats, RefactorChange, FileAnalysis, BatchRefactorResult } from './types';
import FileUpload from './components/FileUpload';
import AnalysisResult from './components/AnalysisResult';
import { analyzeGasProject, refactorCode, updateChangelog, askQuestionAboutCode, batchRefactorCode } from './services/geminiService';
import { GithubIcon, FileCodeIcon, WandIcon, DownloadIcon, XIcon } from './components/icons';
import RefactorResultModal from './components/RefactorResultModal';
import { Chat } from '@google/genai';

interface Patch {
  index: number;
  originalLength: number;
  change: RefactorChange;
}

interface UndoState {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  analysisResult: Analysis | null;
}

const MAX_UNDO_STACK_SIZE = 10;

export default function App(): React.ReactNode {
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
  
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);

  const [autoReanalyze, setAutoReanalyze] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoState[]>([]);
  
  const [selectedFixes, setSelectedFixes] = useState<Record<string, {fileName: string, rec: Recommendation, recIndex: number, suggestionIndex: number}>>({});
  const [changelogLang, setChangelogLang] = useState('ru');


  useEffect(() => {
    try {
      const storedStack = localStorage.getItem('undoStack');
      if (storedStack) {
        setUndoStack(JSON.parse(storedStack));
      }
    } catch (e) {
      console.error("Failed to load undo history:", e);
      localStorage.removeItem('undoStack');
    }
  }, []);

  const updateUndoStack = (newStack: UndoState[]) => {
    setUndoStack(newStack);
    try {
      localStorage.setItem('undoStack', JSON.stringify(newStack));
    } catch (e) {
      console.error("Failed to save undo history:", e);
    }
  };

  const pushToUndoStack = (state: UndoState) => {
    const newStack = [...undoStack, state];
    if (newStack.length > MAX_UNDO_STACK_SIZE) {
      newStack.shift();
    }
    updateUndoStack(newStack);
  };
  

  const clearResults = () => {
    setAnalysisResult(null);
    setConversationHistory([]);
    setChatSession(null);
    setAnalysisStats(null);
    setError(null);
    updateUndoStack([]);
  };

  const confirmFileChange = () => {
    if (analysisResult || conversationHistory.length > 0) {
      return window.confirm("Изменение состава файлов приведет к сбросу текущего результата анализа и истории диалога. Продолжить?");
    }
    return true;
  };

  const handleLibraryFilesUploaded = (uploadedFiles: UploadedFile[]) => {
    if (!confirmFileChange()) return;
    setLibraryFiles(uploadedFiles);
    clearResults();
  };
  
  const handleFrontendFilesUploaded = (uploadedFiles: UploadedFile[]) => {
    if (!confirmFileChange()) return;
    setFrontendFiles(uploadedFiles);
    clearResults();
  };

  const handleClearLibraryFiles = () => {
    if (!confirmFileChange()) return;
    setLibraryFiles([]);
    clearResults();
  }
  
  const handleClearFrontendFiles = () => {
    if (!confirmFileChange()) return;
    setFrontendFiles([]);
    clearResults();
  }

  const handleRemoveLibraryFile = (indexToRemove: number) => {
    if (!confirmFileChange()) return;
    setLibraryFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    clearResults();
  };
  
  const handleRemoveFrontendFile = (indexToRemove: number) => {
    if (!confirmFileChange()) return;
    setFrontendFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    clearResults();
  };

  const handleAnalyze = useCallback(async () => {
    if (libraryFiles.length === 0 && frontendFiles.length === 0) {
      setError("Пожалуйста, сначала загрузите файлы.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setNotification(null);
    setAnalysisStats(null);
    setConversationHistory([]);
    setChatSession(null);
    updateUndoStack([]);

    const startTime = new Date();
    const totalLines = [...libraryFiles, ...frontendFiles].reduce((acc, file) => acc + (file.content ? file.content.split('\n').length : 0), 0);

    try {
      const result = await analyzeGasProject({ libraryFiles, frontendFiles });
      setAnalysisResult(result);
      
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000; // in seconds
      const analysisRate = duration > 0 ? Math.round((totalLines / duration) * 60) : 0;
      
      setAnalysisStats({
        startTime: startTime.toLocaleTimeString('ru-RU'),
        endTime: endTime.toLocaleTimeString('ru-RU'),
        duration,
        totalLines,
        analysisRate
      });

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Произошла неизвестная ошибка при анализе.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [libraryFiles, frontendFiles]);

   const handleAskQuestion = useCallback(async () => {
    if (!userQuestion.trim()) {
      setError("Пожалуйста, введите ваш вопрос.");
      return;
    }
    if (libraryFiles.length === 0 && frontendFiles.length === 0) {
      setError("Пожалуйста, сначала загрузите файлы.");
      return;
    }
    
    setIsAnswering(true);
    setError(null);
    setAnalysisResult(null); 
    setNotification(null);
    setAnalysisStats(null);
    updateUndoStack([]);

    if (!chatSession) {
        setConversationHistory([]);
    }

    try {
      const { answer, chatSession: newChatSession } = await askQuestionAboutCode({ 
        libraryFiles, 
        frontendFiles,
        question: userQuestion,
        chatSession: chatSession,
      });
      setConversationHistory(prev => [...prev, { question: userQuestion, answer }]);
      setChatSession(newChatSession);
      setUserQuestion('');
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Произошла неизвестная ошибка при обработке вопроса.");
    } finally {
      setIsAnswering(false);
    }
  }, [libraryFiles, frontendFiles, userQuestion, chatSession]);


  const handleApplyFix = useCallback(async ({ fileName, recommendation, recIndex, suggestionIndex }: { fileName: string; recommendation: Recommendation, recIndex: number, suggestionIndex: number }) => {
    const suggestion = recommendation.suggestions[suggestionIndex];
    if (!recommendation.originalCodeSnippet || !suggestion) return;
    
    setRefactoringRecommendation({fileName, recIndex, suggestionIndex});
    setIsRefactorModalOpen(true);
    setIsRefactoring(true);
    setCurrentRefactor(null);
    setNotification(null);
    setError(null);

    try {
       const instruction = `${recommendation.description}\n\nКонкретное предложение: ${suggestion.title} - ${suggestion.description}`;
       const result = await refactorCode({
        code: recommendation.originalCodeSnippet,
        instruction: instruction,
        fileName,
        libraryFiles,
        frontendFiles,
      });
      setCurrentRefactor(result);
    } catch (e) {
      console.error(e);
      const errorMessage = `Произошла ошибка при рефакторинге: ${e instanceof Error ? e.message : String(e)}`;
      setCurrentRefactor({
        mainChange: { fileName: '', originalCodeSnippet: 'Ошибка', correctedCodeSnippet: errorMessage},
        relatedChanges: [],
        manualSteps: []
      });
    } finally {
      setIsRefactoring(false);
    }
  }, [libraryFiles, frontendFiles]);

  const applyChangesToFiles = (allChanges: RefactorChange[]) => {
    const newLibraryFiles = JSON.parse(JSON.stringify(libraryFiles));
    const newFrontendFiles = JSON.parse(JSON.stringify(frontendFiles));
    
    const changesByFile = new Map<string, RefactorChange[]>();
    allChanges.forEach(change => {
        if (!changesByFile.has(change.fileName)) {
            changesByFile.set(change.fileName, []);
        }
        changesByFile.get(change.fileName)!.push(change);
    });

    let totalAppliedCount = 0;
    const failedFiles = new Set<string>();

    for (const [fileName, changes] of changesByFile.entries()) {
        const fileToUpdate = newLibraryFiles.find(f => f.name === fileName) || newFrontendFiles.find(f => f.name === fileName);

        if (!fileToUpdate) {
            console.error(`File ${fileName} not found for applying changes.`);
            failedFiles.add(fileName);
            continue;
        }

        let currentContent = fileToUpdate.content;
        
        let patches: Patch[] = changes
            .map(change => {
                if (!change.originalCodeSnippet) return null;
                const index = currentContent.indexOf(change.originalCodeSnippet);
                if (index === -1) {
                    console.warn(`Original code snippet not found in ${fileName}.`, { snippet: change.originalCodeSnippet });
                    failedFiles.add(fileName);
                    return null;
                }
                return { index, originalLength: change.originalCodeSnippet.length, change };
            })
            .filter((p): p is Patch => p !== null);

        patches.sort((a, b) => a.index - b.index); 
        
        let i = 0;
        while (i < patches.length - 1) {
            const currentPatch = patches[i];
            const nextPatch = patches[i+1];
            const currentEnd = currentPatch.index + currentPatch.originalLength;
            if (currentEnd > nextPatch.index) {
                patches.splice(i + 1, 1); 
                i = -1; 
            }
            i++;
        }

        patches.sort((a, b) => b.index - a.index);

        for (const patch of patches) {
            const { index, originalLength, change } = patch;
            currentContent = 
                currentContent.substring(0, index) + 
                change.correctedCodeSnippet + 
                currentContent.substring(index + originalLength);
            totalAppliedCount++;
        }

        fileToUpdate.content = currentContent;
    }

    if (totalAppliedCount === 0 && allChanges.length > 0) {
        setError("Ошибка: Ни одно из предложенных изменений не удалось применить. Оригинальный код для замены не был найден в файлах.");
        return { success: false };
    }
    
    if (failedFiles.size > 0) {
        setError(`Ошибка: Часть изменений не удалось применить в файлах: ${Array.from(failedFiles).join(', ')}.`);
    }

    const changedFileNames = new Set(allChanges.map(c => c.fileName).filter(name => !failedFiles.has(name)));
    
    newLibraryFiles.forEach(file => { if (changedFileNames.has(file.name)) file.changesCount = (file.changesCount || 0) + 1; });
    newFrontendFiles.forEach(file => { if (changedFileNames.has(file.name)) file.changesCount = (file.changesCount || 0) + 1; });
    
    setLibraryFiles(newLibraryFiles);
    setFrontendFiles(newFrontendFiles);

    return { success: true, newLibraryFiles, newFrontendFiles, failedFiles };
  };

  const handleConfirmRefactor = async (result: RefactorResult) => {
    setIsApplyingChanges(true);
    setError(null);

    if (!analysisResult || !refactoringRecommendation) {
        setError("Не удалось применить исправление: отсутствует контекст анализа. Пожалуйста, попробуйте снова.");
        setIsApplyingChanges(false);
        setIsRefactorModalOpen(false);
        return;
    }

    const fileAnalysis = analysisResult.libraryProject.find(f => f.fileName === refactoringRecommendation.fileName) 
                       || analysisResult.frontendProject.find(f => f.fileName === refactoringRecommendation.fileName);

    if (!fileAnalysis || !fileAnalysis.recommendations[refactoringRecommendation.recIndex]?.originalCodeSnippet) {
        setError(`Не удалось найти исходную рекомендацию для исправления в ${refactoringRecommendation.fileName}.`);
        setIsApplyingChanges(false);
        return;
    }
    
    pushToUndoStack({
      libraryFiles: JSON.parse(JSON.stringify(libraryFiles)),
      frontendFiles: JSON.parse(JSON.stringify(frontendFiles)),
      analysisResult: JSON.parse(JSON.stringify(analysisResult))
    });

    const originalRecommendation = fileAnalysis.recommendations[refactoringRecommendation.recIndex];
    
    const mainChange = {
        ...result.mainChange,
        originalCodeSnippet: originalRecommendation.originalCodeSnippet,
    };

    const allChanges = [mainChange, ...result.relatedChanges];
    const { success, newLibraryFiles, newFrontendFiles, failedFiles } = applyChangesToFiles(allChanges);
    
    if (!success) {
        updateUndoStack(undoStack.slice(0, -1)); // Revert undo push
        setIsApplyingChanges(false);
        return;
    }

    if (refactoringRecommendation) {
        const changelogFile = newLibraryFiles.find(f => f.name.toLowerCase() === 'changelog.md') || newFrontendFiles.find(f => f.name.toLowerCase() === 'changelog.md');
        if (changelogFile) {
            try {
                const changeDescription = `В файле \`${refactoringRecommendation.fileName}\`: ${fileAnalysis.recommendations[refactoringRecommendation.recIndex].suggestions[refactoringRecommendation.suggestionIndex].title}.`;
                changelogFile.content = await updateChangelog({ currentChangelog: changelogFile.content, changeDescription, language: changelogLang });
            } catch (e) {
                console.error("Failed to update changelog:", e);
                const currentError = error || "";
                setError(`${currentError}\nНе удалось обновить CHANGELOG.`);
            }
        }
    }
    
    const newAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
    const fileInAnalysis = newAnalysisResult.libraryProject.find((f: FileAnalysis) => f.fileName === refactoringRecommendation.fileName) 
                      || newAnalysisResult.frontendProject.find((f: FileAnalysis) => f.fileName === refactoringRecommendation.fileName);
    if (fileInAnalysis) {
        fileInAnalysis.recommendations[refactoringRecommendation.recIndex].appliedSuggestionIndex = refactoringRecommendation.suggestionIndex;
    }
    setAnalysisResult(newAnalysisResult);
    setConversationHistory([]);

    setNotification(`Изменения применены. Анализ может быть неактуальным.`);
    setIsApplyingChanges(false);
    setIsRefactorModalOpen(false);
    setCurrentRefactor(null);
    setRefactoringRecommendation(null);
    
    if (autoReanalyze) {
        handleAnalyze();
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
    setIsApplyingChanges(true);
    setError(null);
    setNotification(null);
    if (Object.keys(selectedFixes).length === 0) {
        setError("Не выбрано ни одного исправления.");
        setIsApplyingChanges(false);
        return;
    }

    const instructions = Object.values(selectedFixes).map(fix => ({
      fileName: fix.fileName,
      code: fix.rec.originalCodeSnippet,
      instruction: `${fix.rec.description}\n\nКонкретное предложение: ${fix.rec.suggestions[fix.suggestionIndex].title} - ${fix.rec.suggestions[fix.suggestionIndex].description}`
    }));

    try {
      const result: BatchRefactorResult = await batchRefactorCode({
        instructions,
        libraryFiles,
        frontendFiles,
      });

      pushToUndoStack({
        libraryFiles: JSON.parse(JSON.stringify(libraryFiles)),
        frontendFiles: JSON.parse(JSON.stringify(frontendFiles)),
        analysisResult: JSON.parse(JSON.stringify(analysisResult))
      });

      const { success } = applyChangesToFiles(result.changes);

      if (!success) {
          updateUndoStack(undoStack.slice(0, -1)); // Revert undo push
          setIsApplyingChanges(false);
          return;
      }
      
      const newAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
      Object.values(selectedFixes).forEach(fix => {
          const fileInAnalysis = newAnalysisResult.libraryProject.find((f: FileAnalysis) => f.fileName === fix.fileName) 
                            || newAnalysisResult.frontendProject.find((f: FileAnalysis) => f.fileName === fix.fileName);
          if (fileInAnalysis) {
              fileInAnalysis.recommendations[fix.recIndex].appliedSuggestionIndex = fix.suggestionIndex;
          }
      });
      setAnalysisResult(newAnalysisResult);
      setSelectedFixes({});
      setNotification(`${Object.keys(selectedFixes).length} исправлений применено.`);

    } catch(e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Произошла неизвестная ошибка при пакетном применении исправлений.");
    } finally {
      setIsApplyingChanges(false);
    }
  };


  const handleUndo = () => {
    if (undoStack.length > 0) {
        const newStack = [...undoStack];
        const lastState = newStack.pop();
        if (lastState) {
            setLibraryFiles(lastState.libraryFiles);
            setFrontendFiles(lastState.frontendFiles);
            setAnalysisResult(lastState.analysisResult);
            updateUndoStack(newStack);
            setNotification("Последнее изменение было отменено.");
        }
    }
  };

  const handleDownloadFile = (file: UploadedFile) => {
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

  const hasCodeFiles = libraryFiles.length > 0 || frontendFiles.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans flex flex-col">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <WandIcon />
          <span>GAS Code Analyzer</span>
        </h1>
        <a href="https://github.com/google/generative-ai-docs" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
          <GithubIcon />
        </a>
      </header>
      
      <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/3 flex flex-col gap-6">
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">1. Основной проект (Библиотека)</h2>
                {libraryFiles.length > 0 && (
                  <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {libraryFiles.length}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Загрузите файлы проекта, который используется как библиотека.
              </p>
            </div>
            {libraryFiles.length === 0 ? (
              <FileUpload onFilesUploaded={handleLibraryFilesUploaded} />
            ) : (
              <div className="flex flex-col gap-3">
                <ul className="space-y-2 max-h-40 overflow-y-auto bg-gray-900/50 p-3 rounded-md">
                  {libraryFiles.map((file, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 text-sm text-gray-300">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCodeIcon />
                        <span className={`truncate ${file.changesCount ? 'text-green-400' : ''}`}>{file.name}</span>
                        {file.changesCount ? (
                          <span className="ml-1 bg-green-800 text-green-300 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {file.changesCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white p-1" aria-label={`Download ${file.name}`}>
                          <DownloadIcon />
                        </button>
                        <button onClick={() => handleRemoveLibraryFile(index)} className="text-gray-400 hover:text-red-400 p-1" aria-label={`Remove ${file.name}`}>
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleClearLibraryFiles}
                  className="w-full bg-red-600/20 text-red-300 hover:bg-red-600/40 px-4 py-2 rounded-md text-sm transition-colors"
                >
                  Очистить файлы
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">2. Фронтенд-проект</h2>
                {frontendFiles.length > 0 && (
                  <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {frontendFiles.length}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Загрузите файлы проекта, который использует библиотеку.
              </p>
            </div>
             {frontendFiles.length === 0 ? (
              <FileUpload onFilesUploaded={handleFrontendFilesUploaded} />
            ) : (
              <div className="flex flex-col gap-3">
                <ul className="space-y-2 max-h-40 overflow-y-auto bg-gray-900/50 p-3 rounded-md">
                  {frontendFiles.map((file, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 text-sm text-gray-300">
                     <div className="flex items-center gap-2 min-w-0">
                        <FileCodeIcon />
                        <span className={`truncate ${file.changesCount ? 'text-green-400' : ''}`}>{file.name}</span>
                        {file.changesCount ? (
                          <span className="ml-1 bg-green-800 text-green-300 text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {file.changesCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white p-1" aria-label={`Download ${file.name}`}>
                          <DownloadIcon />
                        </button>
                        <button onClick={() => handleRemoveFrontendFile(index)} className="text-gray-400 hover:text-red-400 p-1" aria-label={`Remove ${file.name}`}>
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleClearFrontendFiles}
                  className="w-full bg-red-600/20 text-red-300 hover:bg-red-600/40 px-4 py-2 rounded-md text-sm transition-colors"
                >
                  Очистить файлы
                </button>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
             <h2 className="text-lg font-semibold text-white">3. Анализ и вопросы</h2>
              <div className="flex flex-col gap-4 mt-4">
                  <textarea
                      value={userQuestion}
                      onChange={(e) => setUserQuestion(e.target.value)}
                      placeholder="Задайте конкретный вопрос по коду..."
                      className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:ring-indigo-500 focus:border-indigo-500 transition"
                      rows={3}
                      aria-label="Поле для вопроса по коду"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || isAnswering || !hasCodeFiles}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-3 rounded-md transition-all hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        {isAnalyzing ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Анализ...
                          </>
                        ) : (
                           analysisResult ? "Повторить анализ" : "Проанализировать код"
                        )}
                      </button>
                      <button
                        onClick={handleAskQuestion}
                        disabled={isAnalyzing || isAnswering || !hasCodeFiles || !userQuestion.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white font-semibold px-4 py-3 rounded-md transition-all hover:bg-sky-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        {isAnswering ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Отвечаю...
                          </>
                        ) : (
                          "Задать вопрос"
                        )}
                      </button>
                  </div>
                   <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                          <input 
                              type="checkbox"
                              checked={autoReanalyze}
                              onChange={(e) => setAutoReanalyze(e.target.checked)}
                              className="w-4 h-4 bg-gray-700 border-gray-600 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          Автоматически запускать повторный анализ после применения исправлений
                      </label>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                          <label htmlFor="changelog-lang">Язык CHANGELOG:</label>
                          <select 
                            id="changelog-lang"
                            value={changelogLang}
                            onChange={(e) => setChangelogLang(e.target.value)}
                            className="bg-gray-700 border-gray-600 rounded text-white text-xs p-1 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="ru">Русский</option>
                            <option value="en">English</option>
                          </select>
                      </div>
                  </div>
              </div>
          </div>
        </div>

        <div className="lg:w-2/3 flex flex-col gap-8">
           <div className="bg-gray-800 rounded-lg border border-gray-700 flex-grow flex flex-col min-h-0">
            
            {error && (
              <div className="p-4 m-4 bg-red-900/50 border border-red-700 text-red-300 rounded-md whitespace-pre-wrap">
                <strong>Ошибка:</strong> {error}
              </div>
            )}
            <AnalysisResult 
              analysis={analysisResult} 
              isLoading={isAnalyzing} 
              hasFiles={hasCodeFiles}
              onApplyFix={handleApplyFix}
              notification={notification}
              analysisStats={analysisStats}
              conversationHistory={conversationHistory}
              isAnswering={isAnswering}
              onUndo={handleUndo}
              canUndo={undoStack.length > 0}
              selectedFixes={selectedFixes}
              onToggleFixSelection={handleToggleFixSelection}
              onApplySelectedFixes={handleApplySelectedFixes}
              isApplyingChanges={isApplyingChanges}
            />
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
    </div>
  );
}