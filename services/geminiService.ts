import { GoogleGenAI, Type, Chat } from "@google/genai";
import { UploadedFile, Analysis, RefactorResult, BatchInstruction, BatchRefactorResult, Recommendation } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
});

const model = 'gemini-2.5-flash';

const createProjectSection = (title: string, files: UploadedFile[]): string => {
  if (files.length === 0) return "";
  const fileContents = files.map(file => 
    `--- FILE: ${file.name} ---\n\`\`\`\n${file.content}\n\`\`\``
  ).join('\n\n');
  return `## ${title}\n\n${fileContents}`;
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    libraryProject: {
      type: Type.ARRAY,
      description: "Анализ для каждого файла в проекте-библиотеке.",
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING, description: "Имя файла." },
          recommendations: {
            type: Type.ARRAY,
            description: "Список рекомендаций для этого файла.",
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: "Общее описание проблемы." },
                originalCodeSnippet: { type: Type.STRING, description: "Оригинальный фрагмент кода, который нужно исправить. Null, если не применимо." },
                suggestions: {
                  type: Type.ARRAY,
                  description: "Список из одного или нескольких предлагаемых исправлений проблемы.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Короткий, понятный заголовок для этого конкретного исправления. Например, 'Использовать PropertiesService'." },
                      description: { type: Type.STRING, description: "Подробное объяснение этого конкретного предлагаемого подхода." },
                      correctedCodeSnippet: { type: Type.STRING, description: "Исправленный фрагмент кода для этого конкретного предложения." },
                    },
                    required: ['title', 'description', 'correctedCodeSnippet']
                  }
                }
              },
              required: ['description', 'originalCodeSnippet', 'suggestions']
            }
          }
        },
        required: ['fileName', 'recommendations']
      }
    },
    frontendProject: {
      type: Type.ARRAY,
      description: "Анализ для каждого файла во фронтенд-проекте.",
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING, description: "Имя файла." },
          recommendations: {
            type: Type.ARRAY,
            description: "Список рекомендаций для этого файла.",
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: "Общее описание проблемы." },
                originalCodeSnippet: { type: Type.STRING, description: "Оригинальный фрагмент кода, который нужно исправить. Null, если не применимо." },
                suggestions: {
                  type: Type.ARRAY,
                  description: "Список из одного или нескольких предлагаемых исправлений проблемы.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Короткий, понятный заголовок для этого конкретного исправления. Например, 'Использовать PropertiesService'." },
                      description: { type: Type.STRING, description: "Подробное объяснение этого конкретного предлагаемого подхода." },
                      correctedCodeSnippet: { type: Type.STRING, description: "Исправленный фрагмент кода для этого конкретного предложения." },
                    },
                    required: ['title', 'description', 'correctedCodeSnippet']
                  }
                }
              },
              required: ['description', 'originalCodeSnippet', 'suggestions']
            }
          }
        },
        required: ['fileName', 'recommendations']
      }
    },
    overallSummary: { type: Type.STRING, description: "Общий вывод и рекомендации по всему проекту." }
  },
  required: ['libraryProject', 'frontendProject', 'overallSummary']
};


function buildAnalysisPrompt({ libraryFiles, frontendFiles }: { libraryFiles: UploadedFile[], frontendFiles: UploadedFile[] }): string {
  const librarySection = createProjectSection("Основной проект (Библиотека)", libraryFiles);
  const frontendSection = createProjectSection("Фронтенд-проект (Использует библиотеку)", frontendFiles);

  return `
You are an expert Google Apps Script (GAS) developer and code reviewer. Your task is to analyze the provided GAS project files and return your analysis in a structured JSON format.
You MUST respond exclusively in Russian. All text, including descriptions, titles, suggestions, and summaries, must be in Russian.

**Project Structure:**
This project consists of two parts:
1.  **Основной проект (Библиотека):** The core logic, intended to be used as a library.
2.  **Фронтенд-проект:** A project that consumes the main project as a library.

Analyze them with this relationship in mind.

**Instructions:**
1.  **Analyze Holistically:** Review all files to understand the project's overall purpose and architecture.
2.  **File-by-File Analysis:** For each file in both the library and frontend projects, provide a list of actionable recommendations.
3.  **Provide Actionable Suggestions:** For each recommendation involving code changes, you MUST extract the *original code snippet* from the user's file. The original code snippet must be a complete, self-contained block of code (e.g., a full for-loop including its body and closing brace, a full function definition). It must also be an exact, character-for-character match from the user's file, including all original indentation and whitespace. After extracting the snippet, provide one or more concrete \`suggestions\` in an array.
4.  **Handle Multiple Solutions:** If a problem has multiple valid solutions (e.g., 'do A or do B'), list each one as a separate suggestion object in the \`suggestions\` array. Each suggestion must have a clear \`title\`, a \`description\` of the approach, and the corresponding \`correctedCodeSnippet\`. If there is only one solution, the \`suggestions\` array should still contain one object.
5.  **Handle General Advice:** If a recommendation is general and doesn't apply to a specific block of code, the \`originalCodeSnippet\` field should be null, and the \`suggestions\` array should be empty.
6.  **Overall Summary:** Provide a concluding summary with overarching recommendations.
7.  **JSON Output:** Structure your entire output according to the provided JSON schema. Do not include any text or markdown outside of the JSON structure.

Here are the project files:

${librarySection}

${frontendSection}
`;
}

async function handleGeminiCallWithRetry(prompt: string, schema: object | null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const config: any = {};
      if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
      }

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: config,
      });

      if (schema) {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
      }
      return response.text.trim();

    } catch (e) {
      console.error(`Gemini API call attempt ${i + 1} failed:`, e);
      if (i === retries - 1) { // Last attempt
        if (e instanceof Error) {
          if (e.message.includes('Rpc failed')) {
            throw new Error("Не удалось подключиться к API Gemini. Это может быть связано с сетевыми ограничениями в вашей среде. Убедитесь, что у вас есть прямое подключение к generativelanguage.googleapis.com.");
          }
          if (e.message.includes('JSON')) {
            throw new Error("API вернул ответ в неправильном формате JSON. Проверьте консоль для деталей.");
          }
        }
        throw new Error(`Произошла неизвестная ошибка при вызове API после ${retries} попыток: ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
    }
  }
}


export async function analyzeGasProject({ libraryFiles, frontendFiles }: { libraryFiles: UploadedFile[], frontendFiles: UploadedFile[] }): Promise<Analysis> {
  const prompt = buildAnalysisPrompt({ libraryFiles, frontendFiles });
  return handleGeminiCallWithRetry(prompt, analysisSchema);
}

interface AskQuestionParams {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  question: string;
  chatSession?: Chat | null;
  analysis?: Analysis | null;
}

function buildInitialQuestionPrompt({ libraryFiles, frontendFiles, question, analysis }: Omit<AskQuestionParams, 'chatSession'>): string {
  const librarySection = createProjectSection("Основной проект (Библиотека)", libraryFiles);
  const frontendSection = createProjectSection("Фронтенд-проект (Использует библиотеку)", frontendFiles);

  let analysisContext = '';

  if (analysis) {
      const appliedFixes = [...analysis.libraryProject, ...analysis.frontendProject]
        .flatMap(file => (file.recommendations || []).map(rec => ({ ...rec, fileName: file.fileName })))
        .filter(rec => rec.appliedSuggestionIndex !== undefined);

      if (appliedFixes.length > 0) {
          const fixesList = appliedFixes.map(rec => 
              `- В файле \`${rec.fileName}\`: "${rec.suggestions[rec.appliedSuggestionIndex!].title}"`
          ).join('\n');

          analysisContext = `
**КРИТИЧЕСКИ ВАЖНЫЙ КОНТЕКСТ:**
Ты ранее провел анализ этого проекта. С тех пор пользователь **применил следующие исправления**:\n${fixesList}
Код, который предоставлен ниже, является **АКТУАЛЬНОЙ ВЕРСИЕЙ**. Твой предыдущий анализ теперь частично устарел.
Твоя задача — отвечать на вопросы, основываясь ИСКЛЮЧИТЕЛЬНО на **ТЕКУЩЕМ СОСТОЯНИИ КОДА**. Не ссылайся на рекомендации из старого анализа, которые уже были применены.
`;
      } else {
        analysisContext = `
**КОНТЕКСТ:**
Ты уже провел анализ этого проекта. Вот его результаты. Используй их как основной контекст для ответов.
<analysis_results>
${JSON.stringify({ overallSummary: analysis.overallSummary, libraryProject: analysis.libraryProject, frontendProject: analysis.frontendProject }, null, 2)}
</analysis_results>
`;
      }
  } else {
    analysisContext = `Это начало нашего разговора. Я предоставляю тебе полный код проекта. Пожалуйста, проанализируй его и ответь на мой первый вопрос.`;
  }

  return `
You are an expert Google Apps Script (GAS) developer and a helpful code assistant. Your memory of the project state is updated with each question.
${analysisContext}
You MUST respond exclusively in Russian. Format your responses using Markdown for readability.
**Отвечай лаконично и по существу, если пользователь не просит предоставить больше деталей.**

**Вот файлы проекта (это их АКТУАЛЬНОЕ состояние):**

${librarySection}

${frontendSection}

---

**Мой вопрос:**
"${question}"
`;
}



export async function askQuestionAboutCode({ libraryFiles, frontendFiles, question, chatSession, analysis }: AskQuestionParams): Promise<{ answer: string; chatSession: Chat }> {
  try {
    if (chatSession) {
      const response = await chatSession.sendMessage({ message: question });
      return { answer: response.text.trim(), chatSession };
    } else {
      const chat = ai.chats.create({ model });
      const initialPrompt = buildInitialQuestionPrompt({ libraryFiles, frontendFiles, question, analysis });
      const response = await chat.sendMessage({ message: initialPrompt });
      return { answer: response.text.trim(), chatSession: chat };
    }
  } catch (e) {
    console.error("Gemini API call for question failed:", e);
    if (e instanceof Error && e.message.includes('Rpc failed')) {
        throw new Error("Не удалось подключиться к API Gemini. Это может быть связано с сетевыми ограничениями в вашей среде. Убедитесь, что у вас есть прямое подключение к generativelanguage.googleapis.com.");
    }
    throw new Error(`Произошла неизвестная ошибка при вызове API: ${e instanceof Error ? e.message : String(e)}`);
  }
}

interface RefactorCodeParams {
  code: string;
  instruction: string;
  fileName: string;
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
}

const refactorChangeSchema = {
    type: Type.OBJECT,
    properties: {
        fileName: { type: Type.STRING },
        description: { type: Type.STRING },
        originalCodeSnippet: { type: Type.STRING },
        correctedCodeSnippet: { type: Type.STRING },
    },
    required: ['fileName', 'description', 'originalCodeSnippet', 'correctedCodeSnippet']
};

const manualStepSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "Короткий, ясный заголовок для ручного действия. Например, 'Обновить электронную таблицу'." },
        description: { type: Type.STRING, description: "Подробное, пошаговое описание того, что пользователь должен сделать вручную. Включите любые конкретные значения или имена, которые он должен использовать." },
        fileName: { type: Type.STRING, description: "Имя соответствующего файла для этого ручного шага, если применимо." }
    },
    required: ['title', 'description']
};

const refactorSchema = {
    type: Type.OBJECT,
    properties: {
        mainChange: {
            type: Type.OBJECT,
            properties: {
                fileName: { type: Type.STRING, description: "Имя файла основного изменения." },
                originalCodeSnippet: { type: Type.STRING },
                correctedCodeSnippet: { type: Type.STRING },
            },
            required: ['fileName', 'originalCodeSnippet', 'correctedCodeSnippet']
        },
        relatedChanges: {
            type: Type.ARRAY,
            description: "Список связанных изменений в других файлах.",
            items: refactorChangeSchema
        },
        manualSteps: {
            type: Type.ARRAY,
            description: "Список ручных действий, которые пользователь ДОЛЖЕН выполнить после применения изменений в коде. Например, установка свойства скрипта или обновление электронной таблицы. Если ручные шаги не требуются, верните пустой массив.",
            items: manualStepSchema
        }
    },
    required: ['mainChange', 'relatedChanges', 'manualSteps']
};


export async function refactorCode({ code, instruction, fileName, libraryFiles, frontendFiles }: RefactorCodeParams): Promise<RefactorResult> {
  const librarySection = createProjectSection("Основной проект (Библиотека)", libraryFiles);
  const frontendSection = createProjectSection("Фронтенд-проект (Использует библиотеку)", frontendFiles);
  
  const prompt = `
You are an expert Google Apps Script (GAS) developer specializing in context-aware code refactoring.
Your task is to refactor a specific code snippet based on the provided instruction and return a structured JSON object detailing all necessary changes. 
You MUST respond exclusively in Russian. All text, including descriptions, titles, and manual steps, must be in Russian.

**Instruction for refactoring:**
${instruction}

---

**Original Code Snippet to Refactor:**
This is the specific code you must change, located in the file \`${fileName}\`.
\`\`\`javascript
${code}
\`\`\`

---

**Full Project Context:**
Use these files to understand how the code snippet is used and to ensure your refactoring does not break other parts of the project.
${librarySection}
${frontendSection}

---

**Your Task & JSON Output:**
1.  **Refactor the Main Snippet:** Create the corrected version of the code snippet. This is the 'mainChange'.
2.  **Analyze Project-Wide Impact:** Based on the full context, identify ALL other files and code snippets that need to be updated as a direct consequence of the main change. These are the 'relatedChanges'.
3.  **Provide Snippets for All Changes:** For every main and related change, you MUST provide the \`originalCodeSnippet\` to be replaced and the new, \`correctedCodeSnippet\`. The \`originalCodeSnippet\` MUST be a complete, self-contained block of code and an *exact, verbatim, character-for-character match* of the code from the source file, including all whitespace, indentation, and comments. This is critical for the replacement logic to work.
4.  **Format as JSON:** Return a single JSON object matching the provided schema. Do not include any text outside the JSON structure.
5.  **Identify Manual Follow-up Actions:** Critically, determine if the automated code change requires the user to perform any manual actions *outside* of the code editor to make the application functional. Examples include:
    *   Setting a Script Property in the GAS project settings.
    *   Creating or updating a specific named range in a Google Sheet.
    *   Adding a specific value to a configuration sheet.
    *   Manually authorizing a new OAuth scope.
6.  **Populate 'manualSteps':** If any such actions are required, populate the \`manualSteps\` array with clear, step-by-step instructions. If no manual steps are needed, this array MUST be empty.
`;

  return handleGeminiCallWithRetry(prompt, refactorSchema);
}

const batchRefactorSchema = {
    type: Type.OBJECT,
    properties: {
        changes: {
            type: Type.ARRAY,
            description: "A consolidated list of all code changes required across all files.",
            items: refactorChangeSchema
        },
        manualSteps: {
            type: Type.ARRAY,
            description: "A consolidated list of unique manual steps required after all changes are applied.",
            items: manualStepSchema
        }
    },
    required: ['changes', 'manualSteps']
};


export async function batchRefactorCode({ instructions, libraryFiles, frontendFiles }: { instructions: BatchInstruction[], libraryFiles: UploadedFile[], frontendFiles: UploadedFile[] }): Promise<BatchRefactorResult> {
  const librarySection = createProjectSection("Основной проект (Библиотека)", libraryFiles);
  const frontendSection = createProjectSection("Фронтенд-проект (Использует библиотеку)", frontendFiles);

  const instructionsText = instructions.map((instr, index) => `
    **Task ${index + 1}:**
    - **File:** \`${instr.fileName}\`
    - **Instruction:** ${instr.instruction}
    - **Original Code Snippet to Refactor:**
      \`\`\`
      ${instr.code}
      \`\`\`
  `).join('\n---\n');
  
  const prompt = `
You are an expert Google Apps Script (GAS) developer specializing in context-aware, batch code refactoring.
Your task is to perform multiple refactoring tasks across the entire project simultaneously. You will receive a list of tasks. You must analyze their combined impact and produce a single, consolidated list of changes in a JSON object.
You MUST respond exclusively in Russian.

**Full Project Context:**
${librarySection}
${frontendSection}

---

**Refactoring Tasks:**
You must perform all of the following tasks. Consider how they might interact with each other.
${instructionsText}

---

**Your Task & JSON Output:**
1.  **Consolidate All Changes:** Analyze all tasks and their project-wide impact. Generate a single, flat list of all unique code changes required. Each change object in the 'changes' array must contain the file name, a description, the exact original code snippet, and the corrected code snippet.
2.  **Ensure Exact Snippets:** The \`originalCodeSnippet\` for each change MUST be a complete, self-contained block of code and an exact, verbatim match from the source files. This is critical.
3.  **Consolidate Manual Steps:** Review all changes and create a consolidated, de-duplicated list of any manual follow-up actions required.
4.  **Format as JSON:** Return a single JSON object matching the provided schema. Do not include any text outside the JSON structure.
`;

  return handleGeminiCallWithRetry(prompt, batchRefactorSchema);
}


function buildChangelogPrompt(currentChangelog: string, changeDescription: string, language: string): string {
  const langInstruction = language === 'en' 
    ? "You MUST respond exclusively in English. All changelog entries must be in English."
    : "You MUST respond exclusively in Russian. Все записи в журнале изменений должны быть на русском языке.";

  return `
You are a software engineer's assistant specializing in maintaining changelogs.
Your task is to update the provided CHANGELOG.md file content based on a description of a recent code change.
You MUST adhere strictly to the "Keep a Changelog" format.
${langInstruction}

**RULES:**
1.  Find the \`## [Unreleased]\` section. If it doesn't exist, create it at the top, below the header and any existing links.
2.  Infer the type of change from the description (e.g., 'Fixed', 'Changed', 'Added', 'Removed'). Create the appropriate subsection (e.g., \`### Fixed\`) under \`[Unreleased]\` if it's not already there. The subsections must be ordered: Added, Changed, Deprecated, Removed, Fixed, Security.
3.  Add the provided change description as a new bullet point under the appropriate subsection. Rephrase it if needed to fit the changelog style, but keep the core information.
4.  Maintain the existing structure and content of the file perfectly. Preserve all links, headers, and existing entries.
5.  Return ONLY the full, updated content of the changelog file. Do not add any extra text, explanations, or markdown formatting like \`\`\`markdown.

---
**Current CHANGELOG.md Content:**
---
${currentChangelog}
---
**Description of Change to Add:**
---
- ${changeDescription}
---

Now, provide the full updated CHANGELOG.md content.`;
}

export async function updateChangelog({ currentChangelog, changeDescription, language = 'ru' }: { currentChangelog: string, changeDescription: string, language: string }): Promise<string> {
  const prompt = buildChangelogPrompt(currentChangelog, changeDescription, language);
  
  let text = await handleGeminiCallWithRetry(prompt, null) as string;
  
  if (text.startsWith('```markdown')) {
      text = text.substring('```markdown'.length);
  }
  if (text.startsWith('```')) {
      text = text.substring(3);
  }
  if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
  }
  return text.trim();
}