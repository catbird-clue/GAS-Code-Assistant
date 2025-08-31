import { GoogleGenAI, Type, Chat } from "@google/genai";
import { UploadedFile, Analysis, RefactorResult, BatchInstruction, BatchRefactorResult, Recommendation, FailedChange, ModelName, FileAnalysis, ProgressUpdate, ConversationTurn } from '../types';
import { Language } from "../I18nContext";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
});

const createProjectSection = (title: string, files: UploadedFile[]): string => {
  if (files.length === 0) return "";
  const fileContents = files.map(file => 
    `--- FILE: ${file.name} ---\n\`\`\`\n${file.content}\n\`\`\``
  ).join('\n\n');
  return `## ${title}\n\n${fileContents}`;
};

const getSchemas = (language: Language) => {
    const isRussian = language === 'ru';

    const recommendationSchemaItem = {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: isRussian ? "Общее описание проблемы." : "A general description of the issue." },
          originalCodeSnippet: { type: Type.STRING, description: isRussian ? "Оригинальный фрагмент кода, который нужно исправить. Null, если не применимо." : "The original code snippet to be fixed. Null if not applicable." },
          suggestions: {
            type: Type.ARRAY,
            description: isRussian ? "Список из одного или нескольких предлагаемых исправлений проблемы." : "A list of one or more suggested fixes for the issue.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: isRussian ? "Короткий, понятный заголовок для этого конкретного исправления. Например, 'Использовать PropertiesService'." : "A short, clear title for this specific fix. E.g., 'Use PropertiesService'." },
                description: { type: Type.STRING, description: isRussian ? "Подробное объяснение этого конкретного предлагаемого подхода." : "A detailed explanation of this specific suggested approach." },
                correctedCodeSnippet: { type: Type.STRING, description: isRussian ? "Исправленный фрагмент кода для этого конкретного предложения." : "The corrected code snippet for this specific suggestion." },
              },
              required: ['title', 'description', 'correctedCodeSnippet']
            }
          }
        },
        required: ['description', 'originalCodeSnippet', 'suggestions']
      };

    const fileAnalysisSchema = {
        type: Type.OBJECT,
        properties: {
            fileName: { type: Type.STRING, description: isRussian ? "Имя файла." : "The file name." },
            recommendations: {
            type: Type.ARRAY,
            description: isRussian ? "Список рекомендаций для этого файла." : "A list of recommendations for this file.",
            items: recommendationSchemaItem
            }
        },
        required: ['fileName', 'recommendations']
    };
    
    const analysisSchema = {
      type: Type.OBJECT,
      properties: {
        libraryProject: {
          type: Type.ARRAY,
          description: isRussian ? "Анализ для каждого файла в проекте-библиотеке." : "Analysis for each file in the library project.",
          items: fileAnalysisSchema
        },
        frontendProject: {
          type: Type.ARRAY,
          description: isRussian ? "Анализ для каждого файла во фронтенд-проекте." : "Analysis for each file in the frontend project.",
          items: fileAnalysisSchema
        },
        overallSummary: { type: Type.STRING, description: isRussian ? "Общий вывод и рекомендации по всему проекту." : "An overall summary and recommendations for the entire project." }
      },
      required: ['libraryProject', 'frontendProject', 'overallSummary']
    };

    const refactorChangeSchema = {
        type: Type.OBJECT,
        properties: {
            fileName: { type: Type.STRING },
            description: { type: Type.STRING },
            originalCodeSnippet: { type: Type.STRING },
            correctedCodeSnippet: { type: Type.STRING },
        },
        required: ['fileName', 'originalCodeSnippet', 'correctedCodeSnippet']
    };

    const manualStepSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: isRussian ? "Короткий, ясный заголовок для ручного действия. Например, 'Обновить электронную таблицу'." : "A short, clear title for the manual action. E.g., 'Update Spreadsheet'." },
            description: { type: Type.STRING, description: isRussian ? "Подробное, пошаговое описание того, что пользователь должен сделать вручную. Включите любые конкретные значения или имена, которые он должен использовать." : "A detailed, step-by-step description of what the user needs to do manually. Include any specific values or names they should use." },
            fileName: { type: Type.STRING, description: isRussian ? "Имя соответствующего файла для этого ручного шага, если применимо." : "The name of the relevant file for this manual step, if applicable." }
        },
        required: ['title', 'description']
    };

    const refactorSchema = {
        type: Type.OBJECT,
        properties: {
            mainChange: {
                type: Type.OBJECT,
                properties: {
                    fileName: { type: Type.STRING, description: isRussian ? "Имя файла основного изменения." : "The filename of the main change." },
                    originalCodeSnippet: { type: Type.STRING },
                    correctedCodeSnippet: { type: Type.STRING },
                },
                required: ['fileName', 'originalCodeSnippet', 'correctedCodeSnippet']
            },
            relatedChanges: {
                type: Type.ARRAY,
                description: isRussian ? "Список связанных изменений в других файлах." : "A list of related changes in other files.",
                items: refactorChangeSchema
            },
            manualSteps: {
                type: Type.ARRAY,
                description: isRussian ? "Список ручных действий, которые пользователь ДОЛЖЕН выполнить после применения изменений в коде. Например, установка свойства скрипта или обновление электронной таблицы. Если ручные шаги не требуются, верните пустой массив." : "A list of manual actions the user MUST perform after applying the code changes. E.g., setting a script property or updating a spreadsheet. Return an empty array if no manual steps are required.",
                items: manualStepSchema
            }
        },
        required: ['mainChange', 'relatedChanges', 'manualSteps']
    };

    const batchRefactorSchema = {
        type: Type.OBJECT,
        properties: {
            changes: {
                type: Type.ARRAY,
                description: isRussian ? "Консолидированный список всех изменений кода, необходимых во всех файлах." : "A consolidated list of all code changes required across all files.",
                items: refactorChangeSchema
            },
            manualSteps: {
                type: Type.ARRAY,
                description: isRussian ? "Консолидированный список уникальных ручных шагов, необходимых после применения всех изменений." : "A consolidated list of unique manual steps required after all changes are applied.",
                items: manualStepSchema
            }
        },
        required: ['changes', 'manualSteps']
    };

    return { analysisSchema, fileAnalysisSchema, refactorSchema, batchRefactorSchema };
}


function buildSingleFileAnalysisPrompt(fileToAnalyze: UploadedFile, allFiles: UploadedFile[], language: Language, conversationHistory: ConversationTurn[]): string {
  const isRussian = language === 'ru';
  const fileNames = allFiles.map(f => f.name).join(', ');
  const langInstruction = isRussian 
    ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, and suggestions, must be in Russian."
    : "You MUST respond exclusively in English. All text, including descriptions, titles, and suggestions, must be in English.";
    
  let conversationContext = '';
  if (conversationHistory && conversationHistory.length > 0) {
    const historyText = conversationHistory.map(turn => 
        `User: ${turn.question}\nAssistant: ${turn.answer}`
    ).join('\n\n');

    conversationContext = isRussian 
      ? `\n**Контекст из предыдущего чата:**\nВо время предыдущего анализа пользователь вел с вами диалог. Учтите эту переписку, чтобы улучшить текущий анализ. Возможно, пользователь указал на недостатки, которые вы пропустили.\n\n---\n${historyText}\n---\n`
      : `\n**Context from Previous Chat:**\nA conversation occurred during the previous analysis. You MUST consider this chat history to improve the current analysis. The user may have pointed out flaws you missed.\n\n---\n${historyText}\n---\n`;
  }

  return `
You are an expert Google Apps Script (GAS) developer and code reviewer. Your task is to analyze a single provided GAS project file and return your analysis in a structured JSON format.
${langInstruction}
${conversationContext}
**Project Context:**
You are analyzing the file \`${fileToAnalyze.name}\`.
This file is part of a larger project that also contains the following files: ${fileNames}.
Keep this context in mind when identifying issues, especially potential integration problems or incorrect usage of functions from other files. However, your response should only contain recommendations for the file provided below.

**Instructions:**
1.  **Analyze the File:** Review the file content below.
2.  **Provide Actionable Suggestions:** For each recommendation involving code changes, you MUST extract the \`originalCodeSnippet\` from the user's file.
    - **CRITICAL:** The \`originalCodeSnippet\` must be a complete, self-contained block of code (e.g., a full function definition from \`function\` to its closing \`}\`).
    - **CRITICAL:** It must be an **exact, character-for-character copy** from the user's file. Do not change anything.
3.  **Handle Multiple Solutions:** If a problem has multiple valid solutions, list each as a separate suggestion.
4.  **Handle General Advice:** If a recommendation is general (e.g., "Add comments"), \`originalCodeSnippet\` can be null.
5.  **JSON Output:** Structure your entire output according to the provided JSON schema. Do not include any text or markdown outside of the JSON structure.

**File to Analyze: ${fileToAnalyze.name}**
\`\`\`
${fileToAnalyze.content}
\`\`\`
`;
}

function buildSummaryPrompt(analysis: Analysis, language: Language, conversationHistory: ConversationTurn[]): string {
    const isRussian = language === 'ru';
    const langInstruction = isRussian 
        ? "You MUST respond exclusively in Russian. Your summary must be in Russian."
        : "You MUST respond exclusively in English. Your summary must be in English.";
        
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const historyText = conversationHistory.map(turn => 
          `User: ${turn.question}\nAssistant: ${turn.answer}`
      ).join('\n\n');
  
      conversationContext = isRussian 
        ? `\n**Контекст из предыдущего чата:**\nВо время предыдущего анализа пользователь вел с вами диалог. Учтите эту переписку, чтобы улучшить итоговый вывод. Возможно, пользователь указал на общие архитектурные проблемы, которые стоит подчеркнуть.\n\n---\n${historyText}\n---\n`
        : `\n**Context from Previous Chat:**\nA conversation occurred during the previous analysis. You MUST consider this chat history to improve your overall summary. The user may have pointed out overarching architectural issues that you should emphasize.\n\n---\n${historyText}\n---\n`;
    }

    return `
You are an expert Google Apps Script (GAS) developer and code reviewer.
Below is a series of file-by-file analyses for a GAS project. Your task is to synthesize this information into a high-level "Overall Summary".
${conversationContext}
**Instructions:**
1. Review all the provided recommendations across all files.
2. Identify any overarching themes, architectural problems, or critical issues that affect multiple parts of the project.
3. Write a concise, high-level summary. Do not repeat the individual recommendations. Instead, focus on the big picture. For example, mention things like "The project relies heavily on hardcoded IDs, which should be moved to Script Properties" or "There are several inefficient loops that could be optimized by using object lookups."
4. Format your response as a single markdown string.

${langInstruction}

**Individual File Analyses:**
\`\`\`json
${JSON.stringify(analysis, null, 2)}
\`\`\`
`;
}

async function callGeminiWithFetch(prompt: string, schema: object | null, modelName: ModelName) {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
  
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const generationConfig: any = {};
    if (schema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = schema;
    }

    const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, ...(Object.keys(generationConfig).length > 0 && { generationConfig }) })
    });

    if (!res.ok) {
        const errorData = await res.json();
        console.error("Fallback API error response:", errorData);
        throw new Error(`Fallback API error: ${errorData.error?.message || 'Unknown fallback error'}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text === undefined) {
         if (data.promptFeedback && data.promptFeedback.blockReason) {
            throw new Error(`Response blocked due to ${data.promptFeedback.blockReason}.`);
        }
        console.error("Invalid response structure from fallback API:", data);
        throw new Error("Invalid response structure from fallback API.");
    }

    if (schema) {
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse JSON from fallback API:", text);
            throw new Error("Fallback API returned invalid JSON.");
        }
    }
    return text;
}


async function handleGeminiCallWithRetry(prompt: string, schema: object | null, modelName: ModelName, language: Language, retries = 3) {
  const isRussian = language === 'ru';
  for (let i = 0; i < retries; i++) {
    try {
      const config: any = {};
      if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: config,
      });

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
          let reasonText = '';
          switch(finishReason) {
              case 'MAX_TOKENS':
                  reasonText = isRussian 
                      ? "ответ был обрезан из-за достижения максимального количества токенов."
                      : "the response was cut off due to reaching the maximum token limit.";
                  break;
              case 'SAFETY':
                  reasonText = isRussian
                      ? "ответ был заблокирован из-за настроек безопасности."
                      : "the response was blocked due to safety settings.";
                  break;
              default:
                  reasonText = isRussian
                      ? `ответ был прерван по причине: ${finishReason}.`
                      : `the response was interrupted for the following reason: ${finishReason}.`;
                  break;
          }
          throw new Error(isRussian
              ? `Анализ был завершен не полностью: ${reasonText} Это часто происходит при использовании бесплатного API-ключа с низкими лимитами. Проверьте квоты вашего API-ключа в Google AI Studio.`
              : `The analysis was not completed successfully: ${reasonText} This often happens when using a free API key with low rate limits. Please check your API key quotas in Google AI Studio.`
          );
      }
      
      const jsonText = response.text.trim();

      if (schema) {
        return JSON.parse(jsonText);
      }
      return jsonText;

    } catch (e) {
      console.error(`Gemini API call attempt ${i + 1} failed:`, e);

      if (e instanceof Error && e.message.includes('Rpc failed')) {
          console.warn(`SDK call failed with RPC error on attempt ${i + 1}. Attempting fallback with public REST API.`);
          try {
              return await callGeminiWithFetch(prompt, schema, modelName);
          } catch (fallbackError) {
              console.error("Fallback API call also failed:", fallbackError);
          }
      }
      
      if (e instanceof Error && e.message.includes('The analysis was not completed successfully')) {
          throw e;
      }

      if (i === retries - 1) { // Last attempt
        if (e instanceof Error) {
          if (e.message.includes('429')) { // HTTP 429: Too Many Requests / Rate Limit Exceeded
            throw new Error(isRussian 
                ? `Достигнут дневной лимит запросов к API Gemini (модель '${modelName}'). Пожалуйста, попробуйте снова завтра. Для снятия ограничений рассмотрите возможность перехода на тарифный план с оплатой по мере использования (Pay-as-you-go) в Google AI Studio.`
                : `Daily request limit for Gemini API (model '${modelName}') has been reached. Please try again tomorrow. To lift these limits, consider upgrading to a Pay-as-you-go plan in Google AI Studio.`
            );
          }
          if (e.message.includes('Rpc failed')) {
            throw new Error(isRussian
                ? "Не удалось подключиться к API Gemini. Это может быть связано с сетевыми ограничениями в вашей среде. Убедитесь, что у вас есть прямое подключение к generativelanguage.googleapis.com."
                : "Failed to connect to the Gemini API. This may be due to network restrictions in your environment. Ensure you have a direct connection to generativelanguage.googleapis.com."
            );
          }
          if (e.message.includes('JSON')) {
            throw new Error(isRussian 
                ? "API вернул ответ в неправильном формате JSON. Проверьте консоль для деталей."
                : "The API returned an incorrectly formatted JSON response. Check the console for details."
            );
          }
        }
        throw new Error(isRussian
            ? `Произошла неизвестная ошибка при вызове API после ${retries} попыток: ${e instanceof Error ? e.message : String(e)}`
            : `An unknown error occurred after ${retries} API call attempts: ${e instanceof Error ? e.message : String(e)}`
        );
      }
      await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
    }
  }
  throw new Error("API call failed after all retries.");
}

interface AnalyzeProjectParams {
    libraryFiles: UploadedFile[];
    frontendFiles: UploadedFile[];
    modelName: ModelName;
    language: Language;
    onProgress: (update: ProgressUpdate) => void;
    conversationHistory: ConversationTurn[];
}

export async function analyzeGasProject({ libraryFiles, frontendFiles, modelName, language, onProgress, conversationHistory }: AnalyzeProjectParams): Promise<Analysis> {
    const allFiles = [...libraryFiles, ...frontendFiles];
    const totalFiles = allFiles.length;
    const finalAnalysis: Analysis = {
        libraryProject: [],
        frontendProject: [],
        overallSummary: '',
    };
    const { fileAnalysisSchema } = getSchemas(language);

    for (let i = 0; i < totalFiles; i++) {
        const file = allFiles[i];
        onProgress({
            progress: {
                completed: i,
                total: totalFiles,
                currentFile: file.name
            }
        });

        const prompt = buildSingleFileAnalysisPrompt(file, allFiles, language, conversationHistory);
        const fileAnalysisResult = await handleGeminiCallWithRetry(prompt, fileAnalysisSchema, modelName, language) as FileAnalysis;

        const isLibraryFile = libraryFiles.some(f => f.name === file.name);
        if (isLibraryFile) {
            finalAnalysis.libraryProject.push(fileAnalysisResult);
        } else {
            finalAnalysis.frontendProject.push(fileAnalysisResult);
        }
    }

    onProgress({
        progress: {
            completed: totalFiles,
            total: totalFiles,
            currentFile: '' 
        },
    });

    if (totalFiles > 0) {
        onProgress({ summary: 'Generating summary...' });
        const summaryPrompt = buildSummaryPrompt(finalAnalysis, language, conversationHistory);
        const summary = await handleGeminiCallWithRetry(summaryPrompt, null, modelName, language) as string;
        finalAnalysis.overallSummary = summary;
    }
    
    return finalAnalysis;
}

interface RefactorParams {
  code: string;
  instruction: string;
  fileName: string;
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  modelName: ModelName;
  language: Language;
}

export async function refactorCode({ code, instruction, fileName, libraryFiles, frontendFiles, modelName, language }: RefactorParams): Promise<RefactorResult> {
  const isRussian = language === 'ru';
  const allFilesContext = 
    createProjectSection('Library Project Files', libraryFiles) + '\n' +
    createProjectSection('Frontend Project Files', frontendFiles);

  const langInstruction = isRussian 
    ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, and suggestions, must be in Russian."
    : "You MUST respond exclusively in English. All text, including descriptions, titles, and suggestions, must be in English.";
    
  const prompt = `
You are an expert Google Apps Script (GAS) developer specializing in code refactoring.
${langInstruction}

**Task:**
Apply the following instruction to the provided code snippet from the file \`${fileName}\`.
Your goal is to not only correct the main snippet but also to identify and provide corrections for any related code in other project files that would be affected by this change (e.g., function calls that need updating).

**Full Project Context:**
${allFilesContext}

**File to Refactor:** \`${fileName}\`

**Original Code Snippet to Refactor:**
\`\`\`
${code}
\`\`\`

**Instruction:**
${instruction}

**Output Requirements:**
-   **CRITICAL:** The \`originalCodeSnippet\` in your response (for both main and related changes) MUST be an **exact, character-for-character match** of a snippet from the user's provided files. It must be a complete, self-contained block (like a full function).
-   If the change in one file requires changes in another (e.g., renaming a function means updating all calls to it), list these as 'relatedChanges'.
-   If the user must perform an action outside of the code editor (e.g., update a spreadsheet, set a script property), list these as 'manualSteps'. Provide clear, step-by-step instructions. If no manual steps are needed, return an empty array.
-   Provide your response in the specified JSON format. Do not include any text or markdown outside of the JSON structure.
`;
  const { refactorSchema } = getSchemas(language);
  return await handleGeminiCallWithRetry(prompt, refactorSchema, modelName, language) as RefactorResult;
}

interface UpdateChangelogParams {
    currentChangelog: string;
    changeDescription: string;
    modelName: ModelName;
    language: Language;
}

export async function updateChangelog({ currentChangelog, changeDescription, modelName, language }: UpdateChangelogParams): Promise<string> {
  const isRussian = language === 'ru';
  const langInstruction = isRussian ? "Ответь на русском." : "Answer in English.";
  const prompt = `
You are an expert in maintaining changelogs according to the "Keep a Changelog" format.
Your task is to add a new entry under the "[Unreleased]" section of the provided CHANGELOG.md file.

**Instructions:**
1.  Locate the \`## [Unreleased]\` section.
2.  Add a new "### Fixed" or "### Changed" subsection if it doesn't exist.
3.  Add the new change description as a new line item.
4.  Do not modify any other part of the file.
5.  Return the **entire, updated content** of the CHANGELOG.md file.

**Current CHANGELOG.md content:**
\`\`\`markdown
${currentChangelog}
\`\`\`

**New change to add:**
- ${changeDescription}

${langInstruction}
`;

  return await handleGeminiCallWithRetry(prompt, null, modelName, language) as string;
}

interface BatchRefactorParams {
    instructions: BatchInstruction[];
    libraryFiles: UploadedFile[];
    frontendFiles: UploadedFile[];
    modelName: ModelName;
    language: Language;
}

export async function batchRefactorCode({ instructions, libraryFiles, frontendFiles, modelName, language }: BatchRefactorParams): Promise<BatchRefactorResult> {
    const isRussian = language === 'ru';
    const allFilesContext = 
        createProjectSection('Library Project Files', libraryFiles) + '\n' +
        createProjectSection('Frontend Project Files', frontendFiles);

    const formattedInstructions = instructions.map(instr => `
---
**File:** \`${instr.fileName}\`
**Instruction:** ${instr.instruction}
**Original Code Snippet:**
\`\`\`
${instr.code}
\`\`\`
---
`).join('\n');

    const langInstruction = isRussian 
    ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, and suggestions, must be in Russian."
    : "You MUST respond exclusively in English. All text, including descriptions, titles, and suggestions, must be in English.";

    const prompt = `
You are an expert Google Apps Script (GAS) developer tasked with performing a batch refactoring operation on a project.
${langInstruction}

**Task:**
Apply all the instructions listed below. Consolidate all required code modifications into a single list of changes and all required manual actions into a single list of unique manual steps.

**Full Project Context:**
${allFilesContext}

**Batch Instructions:**
${formattedInstructions}

**Output Requirements:**
-   **Consolidate Changes:** Produce a single, flat list of all code changes across all files.
-   **CRITICAL:** The \`originalCodeSnippet\` in your response MUST be an **exact, character-for-character match** of a snippet from the user's provided files.
-   **Consolidate Manual Steps:** Produce a single, de-duplicated list of all manual steps required after all code changes are applied.
-   Provide your response in the specified JSON format. Do not include any text or markdown outside of the JSON structure.
`;
    const { batchRefactorSchema } = getSchemas(language);
    return await handleGeminiCallWithRetry(prompt, batchRefactorSchema, modelName, language) as BatchRefactorResult;
}

interface CorrectRefactorParams {
    originalResult: RefactorResult;
    failedChanges: FailedChange[];
    instruction: string;
    libraryFiles: UploadedFile[];
    frontendFiles: UploadedFile[];
    modelName: ModelName;
    language: Language;
}

export async function correctRefactorResult({ originalResult, failedChanges, instruction, libraryFiles, frontendFiles, modelName, language }: CorrectRefactorParams): Promise<RefactorResult> {
    const isRussian = language === 'ru';
    const langInstruction = isRussian 
        ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, and suggestions, must be in Russian."
        : "You MUST respond exclusively in English. All text, including descriptions, titles, and suggestions, must be in English.";

    const allFilesContext = 
        createProjectSection('Library Project Files', libraryFiles) + '\n' +
        createProjectSection('Frontend Project Files', frontendFiles);

    const failedChangesDescription = failedChanges.map(f => `- In file \`${f.change.fileName}\`, the snippet \`\`\`${f.change.originalCodeSnippet}\`\`\` was not found.`).join('\n');

    const prompt = `
You are a self-correcting AI assistant. Your previous attempt to refactor code failed because you used an incorrect \`originalCodeSnippet\` that could not be found in the user's files.
${langInstruction}

**Your Task:**
Re-generate the refactoring plan, but this time, you **MUST** find the correct, exact code snippets from the full project context provided below to use as the \`originalCodeSnippet\` for each change.

**Original Failed Attempt (for context):**
\`\`\`json
${JSON.stringify(originalResult, null, 2)}
\`\`\`

**Reason for Failure:**
The following snippets were not found:
${failedChangesDescription}

**Original High-Level Instruction:**
${instruction}

**Full, Correct Project Context:**
${allFilesContext}

**Correction Instructions:**
1.  Re-read the **Original High-Level Instruction**.
2.  Carefully examine the **Full, Correct Project Context** to find the actual code that needs to be changed.
3.  Generate a new, corrected refactoring plan.
4.  **CRITICAL:** Ensure every \`originalCodeSnippet\` in your new response is an **exact, character-for-character copy** from the provided project files.
5.  Provide your response in the specified JSON format.
`;
    const { refactorSchema } = getSchemas(language);
    return await handleGeminiCallWithRetry(prompt, refactorSchema, modelName, language) as RefactorResult;
}

interface AskQuestionParams {
    libraryFiles: UploadedFile[];
    frontendFiles: UploadedFile[];
    question: string;
    chatSession: Chat | null;
    analysis: Analysis | null;
    modelName: ModelName;
    language: Language;
    conversationHistory: ConversationTurn[];
}

function buildChatFallbackPrompt(params: AskQuestionParams): string {
    const { libraryFiles, frontendFiles, question, analysis, language, conversationHistory } = params;
    const isRussian = language === 'ru';
    const langInstruction = isRussian 
        ? "You MUST respond exclusively in Russian."
        : "You MUST respond exclusively in English.";

    let historyText = "";
    if (conversationHistory && conversationHistory.length > 0) {
        historyText = "Here is the previous conversation history for context:\n" + conversationHistory.map(turn => 
            `User: ${turn.question}\nAssistant: ${turn.answer}`
        ).join('\n\n');
    }

    const libraryProjectSection = createProjectSection('Library Project Files', libraryFiles);
    const frontendProjectSection = createProjectSection('Frontend Project Files', frontendFiles);
    const analysisSection = analysis ? `## Previous Code Analysis Summary\n\n${analysis.overallSummary}` : '';

    return `
You are an intelligent Google Apps Script (GAS) code assistant. Your task is to answer a user's question about their project.
${langInstruction}

**Project Context:**
The user has provided the following project files.

${libraryProjectSection}
${frontendProjectSection}
${analysisSection}

**Conversation History:**
${historyText}

**User's New Question:**
${question}

Based on all the provided context (project files, analysis summary, and conversation history), provide a comprehensive and helpful answer to the user's question. Format your response using Markdown.
`;
}


export async function askQuestionAboutCode(params: AskQuestionParams): Promise<{ answer: string, chatSession: Chat | null }> {
    const { question, chatSession, modelName, language, conversationHistory } = params;
    const isRussian = language === 'ru';

    let prompt;
    if (conversationHistory.length <= 1) { // First question
        const libraryProjectSection = createProjectSection('Library Project Files', params.libraryFiles);
        const frontendProjectSection = createProjectSection('Frontend Project Files', params.frontendFiles);
        const analysisSection = params.analysis ? `## Previous Code Analysis Summary\n\n${params.analysis.overallSummary}` : '';
        const langInstruction = isRussian ? "Отвечай на русском." : "Answer in English.";
        prompt = `Context:\n${libraryProjectSection}\n${frontendProjectSection}\n${analysisSection}\n\nMy question is: ${question}\n\n${langInstruction}`;
    } else {
        prompt = question;
    }
    
    let currentChat = chatSession;

    try {
        if (!currentChat) {
             const history = conversationHistory.slice(0, -1).map(turn => ([
                { role: 'user' as const, parts: [{ text: turn.question }] },
                { role: 'model' as const, parts: [{ text: turn.answer }] }
            ])).flat();

            currentChat = ai.chats.create({ 
                model: modelName, 
                history
            });
        }
        
        const response = await currentChat.sendMessage({ message: prompt });
        return { answer: response.text, chatSession: currentChat };

    } catch (e) {
        if (e instanceof Error && (e.message.includes('Rpc failed') || e.message.includes('API key not valid'))) {
            console.warn(`Chat SDK call failed (${e.message}). Using stateless public API fallback.`);
            
            const fallbackPrompt = buildChatFallbackPrompt(params);
            
            // Use the fetch-based fallback directly for chat
            const answer = await callGeminiWithFetch(fallbackPrompt, null, modelName) as string;

            // Invalidate the SDK session to ensure we use the fallback next time too if the network issue persists.
            return { answer, chatSession: null };
        }
        
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : (isRussian ? 'Произошла неизвестная ошибка при обработке вопроса.' : 'An unknown error occurred while processing the question.');
        throw new Error(errorMessage);
    }
}