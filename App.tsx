
import React, from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
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

interface AppState {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  analysisResult: Analysis | null;
}

const MAX_UNDO_STACK_SIZE = 10;

const getInitialState = (): AppState => {
  try {
    const savedState = localStorage.getItem('gasCodeAnalyzerState');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      return {
        libraryFiles: parsed.libraryFiles || [],
        frontendFiles: parsed.frontendFiles || [],
        analysisResult: parsed.analysisResult || null,
      };
    }
  } catch (e) {
    console.error("Failed to load saved state:", e);
    localStorage.removeItem('gasCodeAnalyzerState');
  }
  return {
    libraryFiles: [],
    frontendFiles: [],
    analysisResult: null,
  };
};


export default function App(): React.ReactNode {
  const { language, setLanguage, t } = useTranslation();
  const [libraryFiles, setLibraryFiles] = useState<UploadedFile[]>(getInitialState().libraryFiles);
  const [frontendFiles, setFrontendFiles] = useState<UploadedFile[]>(getInitialState().frontendFiles);

  const [analysisResult, setAnalysisResult] = useState<Analysis | null>(getInitialState().analysisResult);
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
  const [isTestRunPending, setIsTestRunPending] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [modelName, setModelName] = useState<ModelName>('gemini-2.5-flash');

  // Save state to localStorage on change
  useEffect(() => {
    try {
      const stateToSave: AppState = {
        libraryFiles,
        frontendFiles,
        analysisResult
      };
      localStorage.setItem('gasCodeAnalyzerState', JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Failed to save state:", e);
    }
  }, [libraryFiles, frontendFiles, analysisResult]);


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
    if (libraryFiles.length > 0 && analysisResult) {
       if (!window.confirm(t('replaceLibraryWarning'))) {
        return;
      }
    }
    setLibraryFiles(uploadedFiles);
    if(analysisResult) clearAnalysisAndChat();
  };
  
  const handleFrontendFilesUploaded = (uploadedFiles: UploadedFile[]) => {
     if (frontendFiles.length > 0 && analysisResult) {
       if (!window.confirm(t('replaceFrontendWarning'))) {
        return;
      }
    }
    setFrontendFiles(uploadedFiles);
    if(analysisResult) clearAnalysisAndChat();
  };

  const handleClearLibraryFiles = () => {
    if (window.confirm(t('clearLibraryWarning'))) {
        setLibraryFiles([]);
        clearAnalysisAndChat();
    }
  }
  
  const handleClearFrontendFiles = () => {
    if (window.confirm(t('clearFrontendWarning'))) {
        setFrontendFiles([]);
        clearAnalysisAndChat();
    }
  }

  const handleRemoveLibraryFile = (indexToRemove: number) => {
    setLibraryFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    if(analysisResult) clearAnalysisAndChat();
  };
  
  const handleRemoveFrontendFile = (indexToRemove: number) => {
    setFrontendFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    if(analysisResult) clearAnalysisAndChat();
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

    for (const [fileName, changes] of changesByFile.entries()) {
        const fileToUpdate = newLibraryFiles.find(f => f.name === fileName) || newFrontendFiles.find(f => f.name === fileName);
        if (!fileToUpdate) {
            console.error(`File ${fileName} not found.`);
            changes.forEach(c => failedChanges.push({ change: c, reason: 'SNIPPET_NOT_FOUND' }));
            continue;
        }

        let currentContent = fileToUpdate.content;
        
        const patches: Patch[] = changes.map(change => {
            if (!change.originalCodeSnippet) {
                return null;
            }
            const index = currentContent.indexOf(change.originalCodeSnippet);
            if (index === -1) {
                console.warn(`Original code snippet not found in ${fileName}.`, { snippet: change.originalCodeSnippet });
                failedChanges.push({ change, reason: 'SNIPPET_NOT_FOUND' });
                return null;
            }
            return { index, originalLength: change.originalCodeSnippet.length, change };
        }).filter((p): p is Patch => p !== null);

        patches.sort((a, b) => a.index - b.index);

        for (let i = 0; i < patches.length - 1; ) {
            const currentEnd = patches[i].index + patches[i].originalLength;
            if (currentEnd > patches[i+1].index) {
                console.warn('Overlapping patch detected, discarding the latter.');
                const removed = patches.splice(i + 1, 1);
                failedChanges.push({ change: removed[0].change, reason: 'SNIPPET_NOT_FOUND' });
            } else {
                i++;
            }
        }
        
        patches.sort((a, b) => b.index - a.index);

        for (const patch of patches) {
            currentContent = currentContent.substring(0, patch.index) + patch.change.correctedCodeSnippet + currentContent.substring(patch.index + patch.originalLength);
            successfullyAppliedChanges.push(patch.change);
        }

        fileToUpdate.content = currentContent;
    }

    const changedFileNames = new Set(successfullyAppliedChanges.map(c => c.fileName));
    newLibraryFiles.forEach(file => { if (changedFileNames.has(file.name)) file.changesCount = (file.changesCount || 0) + 1; });
    newFrontendFiles.forEach(file => { if (changedFileNames.has(file.name)) file.changesCount = (file.changesCount || 0) + 1; });
    
    return { newLibraryFiles, newFrontendFiles, failedChanges };
  };

  const handleConfirmRefactor = async (result: RefactorResult) => {
      setIsApplyingChanges(true);
      setError(null);
      setNotification(null);

      if (!analysisResult || !refactoringRecommendation || !currentInstruction) {
          setError(t('refactorContextError'));
          setIsApplyingChanges(false);
          setIsRefactorModalOpen(false);
          return;
      }
      
      const fileAnalysis = analysisResult.libraryProject.find(f => f.fileName === refactoringRecommendation.fileName) 
                        || analysisResult.frontendProject.find(f => f.fileName === refactoringRecommendation.fileName);

      if (!fileAnalysis || !fileAnalysis.recommendations[refactoringRecommendation.recIndex]?.originalCodeSnippet) {
          setError(t('originalRecommendationError', {fileName: refactoringRecommendation.fileName}));
          setIsApplyingChanges(false);
          return;
      }

      pushToUndoStack({
          libraryFiles: JSON.parse(JSON.stringify(libraryFiles)),
          frontendFiles: JSON.parse(JSON.stringify(frontendFiles)),
          analysisResult: JSON.parse(JSON.stringify(analysisResult))
      });

      let lastResult = result;
      const MAX_ATTEMPTS = 2;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          let allChanges;
          if (attempt === 1) {
              const originalRecommendation = fileAnalysis.recommendations[refactoringRecommendation.recIndex];
              const mainChange = {
                  ...lastResult.mainChange,
                  originalCodeSnippet: originalRecommendation.originalCodeSnippet!,
              };
              allChanges = [mainChange, ...lastResult.relatedChanges];
          } else {
              allChanges = [lastResult.mainChange, ...lastResult.relatedChanges];
          }
          
          const { newLibraryFiles, newFrontendFiles, failedChanges } = applyChangesToFiles(allChanges, libraryFiles, frontendFiles);
          
          const snippetNotFoundFailures = failedChanges.filter(f => f.reason === 'SNIPPET_NOT_FOUND');

          if (snippetNotFoundFailures.length === 0) {
              // SUCCESS
              const changelogFile = newLibraryFiles.find(f => f.name.toLowerCase() === 'changelog.md') || newFrontendFiles.find(f => f.name.toLowerCase() === 'changelog.md');
              if (changelogFile) {
                  try {
                      const changeDescription = t('changelogEntry', {
                        fileName: refactoringRecommendation.fileName,
                        title: fileAnalysis.recommendations[refactoringRecommendation.recIndex].suggestions[refactoringRecommendation.suggestionIndex].title
                      });
                      changelogFile.content = await updateChangelog({ currentChangelog: changelogFile.content, changeDescription, language, modelName });
                      changelogFile.changesCount = (changelogFile.changesCount || 0) + 1;
                  } catch (e) {
                      console.error("Failed to update changelog:", e);
                      setError((prevError) => `${prevError || ''}\n${t('changelogUpdateFailed')}`);
                  }
              }
              
              setLibraryFiles(newLibraryFiles);
              setFrontendFiles(newFrontendFiles);
              
              const newAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
              const fileInAnalysis = newAnalysisResult.libraryProject.find((f: FileAnalysis) => f.fileName === refactoringRecommendation.fileName) || newAnalysisResult.frontendProject.find((f: FileAnalysis) => f.fileName === refactoringRecommendation.fileName);
              if (fileInAnalysis) {
                  fileInAnalysis.recommendations[refactoringRecommendation.recIndex].appliedSuggestionIndex = refactoringRecommendation.suggestionIndex;
              }
              setAnalysisResult(newAnalysisResult);
              
              setNotification(t('changesAppliedNotification'));
              chatSessionRef.current = null;
              setIsApplyingChanges(false);
              setIsRefactorModalOpen(false);
              setCurrentRefactor(null);
              setRefactoringRecommendation(null);
              
              if (autoReanalyze) {
                  handleAnalyze();
              }

              return; 
          }

          if (attempt < MAX_ATTEMPTS) {
              setNotification(t('selfCorrectionAttempt', { attempt: attempt + 1 }));
              try {
                  const correctedResult = await correctRefactorResult({
                      originalResult: lastResult,
                      failedChanges: snippetNotFoundFailures,
                      libraryFiles: libraryFiles,
                      frontendFiles: frontendFiles,
                      instruction: currentInstruction,
                      modelName,
                      language,
                  });
                  lastResult = correctedResult;
                  setCurrentRefactor(correctedResult);
              } catch (e) {
                  const errorMsg = t('selfCorrectionError', { message: e instanceof Error ? e.message : String(e) });
                  setError(errorMsg);
                  setUndoStack(undoStack.slice(0, -1));
                  setIsApplyingChanges(false);
                  return;
              }
          } else {
              const failedSnippetsText = snippetNotFoundFailures.map(f => `\n- In file '${f.change.fileName}'`).join('');
              const errorMsg = t('maxAttemptsError', { maxAttempts: MAX_ATTEMPTS, failedSnippets: failedSnippetsText});
              setError(errorMsg);
              setUndoStack(undoStack.slice(0, -1));
              setIsApplyingChanges(false);
              return;
          }
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
    const fixesToApply = Object.values(selectedFixes);
    if (fixesToApply.length === 0) {
        setError(t('noFixesSelectedError'));
        setIsApplyingChanges(false);
        return;
    }

    const instructions = fixesToApply.map(fix => ({
      fileName: fix.fileName,
      code: fix.rec.originalCodeSnippet,
      instruction: `${fix.rec.description}\n\n${t('specificSuggestion')}: ${fix.rec.suggestions[fix.suggestionIndex].title} - ${fix.rec.suggestions[fix.suggestionIndex].description}`
    }));

    try {
      const result: BatchRefactorResult = await batchRefactorCode({
        instructions,
        libraryFiles,
        frontendFiles,
        modelName,
        language,
      });

      pushToUndoStack({
        libraryFiles: JSON.parse(JSON.stringify(libraryFiles)),
        frontendFiles: JSON.parse(JSON.stringify(frontendFiles)),
        analysisResult: JSON.parse(JSON.stringify(analysisResult))
      });

      // Note: Self-correction is not yet implemented for batch refactoring
      const { failedChanges, newLibraryFiles: tempNewLibraryFiles, newFrontendFiles: tempNewFrontendFiles } = applyChangesToFiles(result.changes, libraryFiles, frontendFiles);

      if (failedChanges.length === result.changes.length && result.changes.length > 0) {
          setUndoStack(undoStack.slice(0, -1));
          const failedFiles = Array.from(new Set(failedChanges.map(f => f.change.fileName))).join(', ');
          const errorMsg = t('batchApplyFailedError', { failedFiles: failedFiles });
          setError(errorMsg);
          setIsApplyingChanges(false);
          return;
      }
      
      const changelogFile = tempNewLibraryFiles.find(f => f.name.toLowerCase() === 'changelog.md') || tempNewFrontendFiles.find(f => f.name.toLowerCase() === 'changelog.md');
      if (changelogFile) {
        let currentChangelogContent = changelogFile.content;
        let changesApplied = 0;
        for (const fix of fixesToApply) {
          try {
            const changeDescription = t('changelogEntry', { 
              fileName: fix.fileName, 
              title: fix.rec.suggestions[fix.suggestionIndex].title 
            });
            currentChangelogContent = await updateChangelog({ currentChangelog: currentChangelogContent, changeDescription, language, modelName });
            changesApplied++;
          } catch(e) {
            console.error("Failed to update changelog for a fix:", e);
            setError((prevError) => `${prevError || ''}\n${t('changelogUpdateError', { fileName: fix.fileName })}`);
          }
        }
        changelogFile.content = currentChangelogContent;
        if (changesApplied > 0) {
          changelogFile.changesCount = (changelogFile.changesCount || 0) + changesApplied;
        }
      }
      
      setLibraryFiles(tempNewLibraryFiles);
      setFrontendFiles(tempNewFrontendFiles);
      
      const newAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
      fixesToApply.forEach(fix => {
          const fileInAnalysis = newAnalysisResult.libraryProject.find((f: FileAnalysis) => f.fileName === fix.fileName) 
                            || newAnalysisResult.frontendProject.find((f: FileAnalysis) => f.fileName === fix.fileName);
          if (fileInAnalysis) {
              fileInAnalysis.recommendations[fix.recIndex].appliedSuggestionIndex = fix.suggestionIndex;
          }
      });
      setAnalysisResult(newAnalysisResult);
      chatSessionRef.current = null;
      setSelectedFixes({});
      setNotification(t('fixesAppliedNotification', { count: fixesToApply.length }));

    } catch(e) {
      console.error(e);
      setError(e instanceof Error ? e.message : t('batchApplyUnknownError'));
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
            setUndoStack(newStack);
            setNotification(t('undoNotification'));
            chatSessionRef.current = null; // Reset chat context
        }
    }
  };
  
  const handleDismissNotification = () => {
    setNotification(null);
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
  
  const handleTest = () => {
    if ((libraryFiles.length > 0 || frontendFiles.length > 0) && !window.confirm(t('testResetWarning'))) {
      return;
    }

    const testLibraryFiles: UploadedFile[] = [{
        name: 'Code.gs',
        content: `/**
 * @OnlyCurrentDoc
 */

/**
 * A library function to process data from a sheet.
 * This function has a performance issue.
 * @param {string} sheetName The name of the sheet to process.
 * @return {number} The sum of values in column A.
 */
function processDataFromSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const lastRow = sheet.getLastRow();
  let sum = 0;
  
  // Inefficient loop: calls getValue() repeatedly
  for (let i = 1; i <= lastRow; i++) {
    sum += sheet.getRange("A" + i).getValue();
  }
  
  return sum;
}`
    }, {
      name: 'CHANGELOG.md',
      content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`
    }];

    const testFrontendFiles: UploadedFile[] = [{
        name: 'Main.gs',
        content: `/**
 * Main function to call the library.
 * This function must use the library with the default identifier "MyLibrary".
 */
function main() {
  const result = MyLibrary.processDataFromSheet("Sales Data");
  Logger.log("The result is: " + result);
}`
    }];
    
    clearAnalysisAndChat();
    setLibraryFiles(testLibraryFiles);
    setFrontendFiles(testFrontendFiles);
    setIsTestRunPending(true);
  };
  
  useEffect(() => {
      if (isTestRunPending && (libraryFiles.length > 0 || frontendFiles.length > 0)) {
          handleAnalyze();
          setIsTestRunPending(false);
      }
  }, [isTestRunPending, libraryFiles, frontendFiles, handleAnalyze]);

  const hasCodeFiles = libraryFiles.length > 0 || frontendFiles.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans flex flex-col">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <WandIcon />
          <span>{t('appTitle')}</span>
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-md">
            <button onClick={() => setLanguage('en')} className={`px-2 py-1 text-xs font-bold rounded transition-colors ${language === 'en' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>EN</button>
            <button onClick={() => setLanguage('ru')} className={`px-2 py-1 text-xs font-bold rounded transition-colors ${language === 'ru' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>RU</button>
          </div>
          <button onClick={() => setIsHelpModalOpen(true)} className="text-gray-400 hover:text-white transition-colors" aria-label={t('help')}>
            <HelpIcon />
          </button>
          <a href="https://github.com/google/generative-ai-docs" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
            <GithubIcon />
          </a>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto p-4 md:p-8 flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/3 flex flex-col gap-6">
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{t('libraryProjectTitle')}</h2>
                {libraryFiles.length > 0 && (
                  <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {libraryFiles.length}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {t('libraryProjectDescription')}
              </div>
            </div>
            {libraryFiles.length === 0 ? (
              <FileUpload onFilesUploaded={handleLibraryFilesUploaded} setError={setError} />
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
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white p-1" aria-label={t('download', {fileName: file.name})}>
                          <DownloadIcon />
                        </button>
                        <button onClick={() => handleRemoveLibraryFile(index)} className="text-gray-400 hover:text-red-400 p-1" aria-label={t('remove', {fileName: file.name})}>
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
                  {t('clearFiles')}
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{t('frontendProjectTitle')}</h2>
                {frontendFiles.length > 0 && (
                  <span className="bg-gray-700 text-gray-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {frontendFiles.length}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {t('frontendProjectDescription')}
              </div>
            </div>
             {frontendFiles.length === 0 ? (
              <FileUpload onFilesUploaded={handleFrontendFilesUploaded} setError={setError} />
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
                        <button onClick={() => handleDownloadFile(file)} className="text-gray-400 hover:text-white p-1" aria-label={t('download', {fileName: file.name})}>
                          <DownloadIcon />
                        </button>
                        <button onClick={() => handleRemoveFrontendFile(index)} className="text-gray-400 hover:text-red-400 p-1" aria-label={t('remove', {fileName: file.name})}>
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
                  {t('clearFiles')}
                </button>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
             <h2 className="text-lg font-semibold text-white">{t('analysisTitle')}</h2>
              <div className="flex flex-col gap-4 mt-4">
                  <textarea
                      value={userQuestion}
                      onChange={(e) => setUserQuestion(e.target.value)}
                      placeholder={t('questionPlaceholder')}
                      className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:ring-indigo-500 focus:border-indigo-500 transition"
                      rows={3}
                      aria-label={t('questionPlaceholder')}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                            {t('analyzing')}
                          </>
                        ) : (
                           analysisResult ? t('reanalyze') : t('analyze')
                        )}
                      </button>
                       <button
                        onClick={handleTest}
                        disabled={isAnalyzing || isAnswering}
                        className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white font-semibold px-4 py-3 rounded-md transition-all hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        <BeakerIcon />
                        {t('test')}
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
                            {t('answering')}
                          </>
                        ) : (
                          t('ask')
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
                          {t('autoReanalyze')}
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <div />
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <label htmlFor="model-name">{t('geminiModel')}</label>
                            <select 
                              id="model-name"
                              value={modelName}
                              onChange={(e) => setModelName(e.target.value as ModelName)}
                              className="w-full bg-gray-700 border-gray-600 rounded text-white text-xs p-1 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="gemini-2.5-flash">{t('flashModel')}</option>
                              <option value="gemini-2.5-pro">{t('proModel')}</option>
                            </select>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
        </div>

        <div className="lg:w-2/3 flex flex-col gap-8">
           <div className="bg-gray-800 rounded-lg border border-gray-700 flex-grow flex flex-col min-h-0">
            
            {error && (
              <div className="p-4 m-4 bg-red-900/50 border border-red-700 text-red-300 rounded-md whitespace-pre-wrap">
                <strong>{t('errorTitle')}</strong> {error}
              </div>
            )}
             <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2" role="tablist" aria-label="Results">
                    <button
                    onClick={() => setActiveTab('analysis')}
                    role="tab"
                    aria-selected={activeTab === 'analysis'}
                    className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'analysis' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                    >
                    {t('analysisTab')}
                    </button>
                    <button
                    onClick={() => setActiveTab('chat')}
                    role="tab"
                    aria-selected={activeTab === 'chat'}
                    className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === 'chat' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                    >
                    {t('chatTab')}
                    </button>
                </div>
            </div>
             <div className="flex-grow overflow-y-auto">
                {activeTab === 'analysis' ? (
                    <AnalysisResult 
                        analysis={analysisResult} 
                        isLoading={isAnalyzing} 
                        hasFiles={hasCodeFiles}
                        onApplyFix={handleApplyFix}
                        notification={notification}
                        onDismissNotification={handleDismissNotification}
                        analysisStats={analysisStats}
                        onUndo={handleUndo}
                        canUndo={undoStack.length > 0}
                        selectedFixes={selectedFixes}
                        onToggleFixSelection={handleToggleFixSelection}
                        onApplySelectedFixes={handleApplySelectedFixes}
                        isApplyingChanges={isApplyingChanges}
                        setSelectedFixes={setSelectedFixes}
                    />
                ) : (
                    <ChatView
                        conversationHistory={conversationHistory}
                        isAnswering={isAnswering}
                    />
                )}
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
    </div>
  );
}