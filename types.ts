
export type ModelName = 'gemini-2.5-flash';

export interface UploadedFile {
  name: string;
  content: string;
  changesCount?: number;
}

export interface SuggestedFix {
  title: string;
  description: string;
  correctedCodeSnippet: string;
}

export interface Recommendation {
  description: string;
  originalCodeSnippet: string | null;
  suggestions: SuggestedFix[];
  appliedSuggestionIndex?: number;
  appliedRefactorResult?: RefactorResult;
}

export interface FileAnalysis {
  fileName: string;
  recommendations: Recommendation[];
}

export interface Analysis {
  libraryProject: FileAnalysis[];
  frontendProject: FileAnalysis[];
  overallSummary: string;
}

export interface RefactorChange {
  fileName: string;
  description?: string;
  originalCodeSnippet: string;
  correctedCodeSnippet: string;
}

export interface ManualStep {
  title: string;
  description: string;
  fileName?: string;
}

export interface RefactorResult {
  mainChange: RefactorChange;
  relatedChanges: RefactorChange[];
  manualSteps: ManualStep[];
}

export interface AnalysisStats {
  startTime: string | null;
  endTime: string | null;
  duration: number | null; // in seconds
  totalLines: number | null;
  analysisRate: number | null; // lines per minute
}

export interface ConversationTurn {
  question: string;
  answer: string;
  analysis?: Analysis | null;
}

export interface BatchInstruction {
  fileName: string;
  code: string | null;
  instruction: string;
}

export interface BatchRefactorResult {
  changes: RefactorChange[];
  manualSteps: ManualStep[];
}

export interface FailedChange {
  change: RefactorChange;
  reason: 'SNIPPET_NOT_FOUND';
}

export interface ProgressUpdate {
  progress?: {
    completed: number;
    total: number;
    currentFile: string;
  };
  analysis?: {
    libraryProject?: FileAnalysis[];
    frontendProject?: FileAnalysis[];
  };
  summary?: string;
}
