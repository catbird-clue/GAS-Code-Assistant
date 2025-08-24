

import { GoogleGenAI, Type, Chat } from "@google/genai";
import { UploadedFile, Analysis, RefactorResult, BatchInstruction, BatchRefactorResult, Recommendation, FailedChange, ModelName } from '../types';
import { Language } from "../I18nContext";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({
  apiKey: API_KEY,
});

const hasChangelogFile = (libraryFiles: UploadedFile[], frontendFiles: UploadedFile[]): boolean => {
  return [...libraryFiles, ...frontendFiles].some(f => f.name.toUpperCase() === 'CHANGELOG.MD');
};

const createProjectSection = (title: string, files: UploadedFile[]): string => {
  if (files.length === 0) return "";
  const fileContents = files.map(file => 
    `--- FILE: ${file.name} ---\n\`\`\`\n${file.content}\n\`\`\``
  ).join('\n\n');
  return `## ${title}\n\n${fileContents}`;
};

const getSchemas = (language: Language) => {
    const isRussian = language === 'ru';
    
    const analysisSchema = {
      type: Type.OBJECT,
      properties: {
        libraryProject: {
          type: Type.ARRAY,
          description: isRussian ? "Анализ для каждого файла в проекте-библиотеке." : "Analysis for each file in the library project.",
          items: {
            type: Type.OBJECT,
            properties: {
              fileName: { type: Type.STRING, description: isRussian ? "Имя файла." : "The file name." },
              recommendations: {
                type: Type.ARRAY,
                description: isRussian ? "Список рекомендаций для этого файла." : "A list of recommendations for this file.",
                items: {
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
                }
              }
            },
            required: ['fileName', 'recommendations']
          }
        },
        frontendProject: {
          type: Type.ARRAY,
          description: isRussian ? "Анализ для каждого файла во фронтенд-проекте." : "Analysis for each file in the frontend project.",
          items: {
            type: Type.OBJECT,
            properties: {
              fileName: { type: Type.STRING, description: isRussian ? "Имя файла." : "The file name." },
              recommendations: {
                type: Type.ARRAY,
                description: isRussian ? "Список рекомендаций для этого файла." : "A list of recommendations for this file.",
                items: {
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
                }
              }
            },
            required: ['fileName', 'recommendations']
          }
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
        required: ['fileName', 'description', 'originalCodeSnippet', 'correctedCodeSnippet']
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

    return { analysisSchema, refactorSchema, batchRefactorSchema };
}


function buildAnalysisPrompt({ libraryFiles, frontendFiles, language }: { libraryFiles: UploadedFile[], frontendFiles: UploadedFile[], language: Language }): string {
  const isRussian = language === 'ru';
  const librarySection = createProjectSection(isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)", libraryFiles);
  const frontendSection = createProjectSection(isRussian ? "Фронтенд-проект (Использует библиотеку)" : "Frontend Project (Consumes Library)", frontendFiles);
  
  const langInstruction = isRussian 
    ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, suggestions, and summaries, must be in Russian."
    : "You MUST respond exclusively in English. All text, including descriptions, titles, suggestions, and summaries, must be in English.";

  const hasChangelog = hasChangelogFile(libraryFiles, frontendFiles);

  const changelogPolicyInstruction = hasChangelog
    ? (isRussian
      ? `
**Интеграция с политикой Changelog:**
Для каждого предлагаемого исправления ты должен определить, подпадает ли оно под критерии для записи в журнал изменений согласно стандарту "Keep a Changelog" (т.е. является ли оно видимым для пользователя изменением типа 'Fixed', 'Added', 'Changed', а не внутренним 'refactor' или 'chore').
- Если изменение **БУДЕТ** добавлено в журнал, ты ОБЯЗАН добавить следующее примечание в формате Markdown в конец поля \`description\` этого предложения:
  > **Примечание:** Применение этого исправления автоматически добавит запись в ваш \`CHANGELOG.md\`.
- Если изменение **НЕ БУДЕТ** добавлено в журнал (например, это рефакторинг), ты ОБЯЗАН добавить следующее примечание в формате Markdown в конец поля \`description\` этого предложения:
  > **Примечание:** Это внутреннее улучшение и оно не будет добавлено в \`CHANGELOG.md\`.
Это примечание является обязательным для каждого предложения.
`
      : `
**Changelog Policy Integration:**
For each suggestion you provide, you must determine if the change qualifies for a changelog entry according to the "Keep a Changelog" standard (i.e., it's a user-visible 'Fixed', 'Added', 'Changed', etc., and not an internal 'refactor' or 'chore').
- If the change **WILL** be logged, you MUST append the following Markdown note to the end of the suggestion's \`description\`:
  > **Note:** Applying this fix will automatically add an entry to your \`CHANGELOG.md\`.
- If the change **WILL NOT** be logged (e.g., it's a refactor), you MUST append the following Markdown note to the end of the suggestion's \`description\`:
  > **Note:** This is an internal improvement and will not be added to \`CHANGELOG.md\`.
This note is mandatory for every suggestion.
`)
    : (isRussian
      ? `**Политика Changelog:** В проекте отсутствует файл \`CHANGELOG.md\`. НЕ добавляйте никаких примечаний о журнале изменений в ваши ответы.`
      : `**Changelog Policy:** The project does not contain a \`CHANGELOG.md\` file. DO NOT add any notes about a changelog to your responses.`);


  return `
You are an expert Google Apps Script (GAS) developer and code reviewer. Your task is to analyze the provided GAS project files and return your analysis in a structured JSON format.
${langInstruction}

**Project Structure:**
This project consists of two parts:
1.  **${isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)"}:** The core logic, intended to be used as a library.
2.  **${isRussian ? "Фронтенд-проект" : "Frontend Project"}:** A project that consumes the main project as a library.

Analyze them with this relationship in mind.

**Instructions:**
1.  **Analyze Holistically:** Review all files to understand the project's overall purpose and architecture.
2.  **File-by-File Analysis:** For each file in both the library and frontend projects, provide a list of actionable recommendations.
3.  **Provide Actionable Suggestions:** For each recommendation involving code changes, you MUST extract the \`originalCodeSnippet\` from the user's file.
    - **CRITICAL:** The \`originalCodeSnippet\` must be a complete, self-contained block of code (e.g., a full function definition from \`function\` to its closing \`}\`).
    - **CRITICAL:** It must be an **exact, character-for-character copy** from the user's file. Do not change anything, including indentation, whitespace, or comments.
    - **CRITICAL:** The \`originalCodeSnippet\` **MUST NOT** contain any of your suggested changes or new code. It is only for identifying the code to be replaced.
4.  **Handle Multiple Solutions:** If a problem has multiple valid solutions (e.g., 'do A or do B'), list each one as a separate suggestion object in the \`suggestions\` array. Each suggestion must have a clear \`title\`, a \`description\` of the approach, and the corresponding \`correctedCodeSnippet\`. If there is only one solution, the \`suggestions\` array should still contain one object.
5.  **Handle General Advice:** If a recommendation is general and doesn't apply to a specific block of code, the \`originalCodeSnippet\` field should be null, and the \`suggestions\` array should be empty.
6.  **${isRussian ? "Обработка унаследованных проблем" : "Handle Inherited Issues"}:** ${isRussian ? "Если ты обнаружил проблему во **Фронтенд-проекте**, которая вызвана функцией или зависимостью из **Основного проекта (Библиотеки)** (например, фронтенд вызывает неэффективную функцию библиотеки), ты **ОБЯЗАН** создать рекомендацию." : "If you find an issue in the **Frontend Project** that is caused by a function or dependency from the **Main Project (Library)** (e.g., the frontend calls an inefficient library function), you **MUST** create a recommendation."}
    - ${isRussian ? "В поле `description` должно быть четко указано, что первопричина находится в библиотеке, и исправление должно быть применено там." : "The `description` should clearly state that the root cause is in the library and the fix should be applied there."}
    - ${isRussian ? "Ты **ОБЯЗАН** предоставить `originalCodeSnippet` и как минимум одно `suggestion` в массиве `suggestions`." : "You **MUST** still provide an `originalCodeSnippet` and at least one `suggestion` in the `suggestions` array."}
    - ${isRussian ? "Для этого предложения создай \"исправление-заглушку\". `title` должен быть примерно таким: \"Принять к сведению\", а `description` должен повторять, что исправление находится в библиотеке. `correctedCodeSnippet` **ОБЯЗАН** быть идентичным `originalCodeSnippet`. Это гарантирует, что пользователь будет проинформирован о проблеме в интерфейсе, даже если код в этом конкретном файле не изменится." : "For the suggestion, create a \"placeholder\" fix. The `title` should be something like \"Acknowledge Issue\" and the `description` should reiterate that the fix is in the library. The `correctedCodeSnippet` **MUST** be identical to the `originalCodeSnippet`. This ensures the user is informed of the issue within the UI, even though the code in this specific file won't change."}
7.  **W3C Standards for HTML:** ${isRussian ? "Для HTML-файлов (`.html`) уделите особое внимание соответствию стандартам W3C (например, правильная вложенность тегов, валидные атрибуты, доступность). Учитывайте, что Google Apps Script может добавлять свой код, но код, написанный пользователем, должен соответствовать стандартам." : "For any HTML files (`.html`), pay special attention to compliance with W3C standards (e.g., proper tag nesting, valid attributes, accessibility). Acknowledge that Google Apps Script may inject its own code, but the user-written code should be standard-compliant."}
8.  **Overall Summary:** Provide a concluding summary with overarching recommendations.
9.  **JSON Output:** Structure your entire output according to the provided JSON schema. Do not include any text or markdown outside of the JSON structure.

${changelogPolicyInstruction}

Here are the project files:

${librarySection}

${frontendSection}
`;
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
        contents: prompt,
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

      if (schema) {
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
      }
      return response.text.trim();

    } catch (e) {
      console.error(`Gemini API call attempt ${i + 1} failed:`, e);
      
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
}


export async function analyzeGasProject({ libraryFiles, frontendFiles, modelName, language }: { libraryFiles: UploadedFile[], frontendFiles: UploadedFile[], modelName: ModelName, language: Language }): Promise<Analysis> {
  const prompt = buildAnalysisPrompt({ libraryFiles, frontendFiles, language });
  const { analysisSchema } = getSchemas(language);
  return handleGeminiCallWithRetry(prompt, analysisSchema, modelName, language);
}

interface AskQuestionParams {
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  question: string;
  chatSession?: Chat | null;
  analysis?: Analysis | null;
  modelName: ModelName;
  language: Language;
}

function buildInitialQuestionPrompt({ libraryFiles, frontendFiles, question, analysis, language }: Omit<AskQuestionParams, 'chatSession' | 'modelName'>): string {
  const isRussian = language === 'ru';
  const librarySection = createProjectSection(isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)", libraryFiles);
  const frontendSection = createProjectSection(isRussian ? "Фронтенд-проект (Использует библиотеку)" : "Frontend Project (Consumes Library)", frontendFiles);

  let analysisContext = '';

  if (analysis) {
      const appliedFixes = [...analysis.libraryProject, ...analysis.frontendProject]
        .flatMap(file => (file.recommendations || []).map(rec => ({ ...rec, fileName: file.fileName })))
        .filter(rec => rec.appliedSuggestionIndex !== undefined);

      if (appliedFixes.length > 0) {
          const fixesList = appliedFixes.map(rec => 
              isRussian 
                ? `- В файле \`${rec.fileName}\`: "${rec.suggestions[rec.appliedSuggestionIndex!].title}"`
                : `- In file \`${rec.fileName}\`: "${rec.suggestions[rec.appliedSuggestionIndex!].title}"`
          ).join('\n');
          
          analysisContext = isRussian
            ? `
**КРИТИЧЕСКИ ВАЖНЫЙ КОНТЕКСТ:**
Ты ранее провел анализ этого проекта. С тех пор пользователь **применил следующие исправления**:\n${fixesList}
Код, который предоставлен ниже, является **АКТУАЛЬНОЙ ВЕРСИЕЙ**. Твой предыдущий анализ теперь частично устарел.
Твоя задача — отвечать на вопросы, основываясь ИСКЛЮЧИТЕЛЬНО на **ТЕКУЩЕМ СОСТОЯНИИ КОДА**. Не ссылайся на рекомендации из старого анализа, которые уже были применены.
`
            : `
**CRITICALLY IMPORTANT CONTEXT:**
You previously analyzed this project. Since then, the user has **applied the following fixes**:\n${fixesList}
The code provided below is the **CURRENT VERSION**. Your previous analysis is now partially outdated.
Your task is to answer questions based ONLY on the **CURRENT STATE OF THE CODE**. Do not refer to recommendations from the old analysis that have already been applied.
`;
      } else {
        analysisContext = isRussian
            ? `
**КОНТЕКСТ:**
Ты уже провел анализ этого проекта. Вот его результаты. Используй их как основной контекст для ответов.
<analysis_results>
${JSON.stringify({ overallSummary: analysis.overallSummary, libraryProject: analysis.libraryProject, frontendProject: analysis.frontendProject }, null, 2)}
</analysis_results>
`
            : `
**CONTEXT:**
You have already analyzed this project. Here are the results. Use them as the primary context for your answers.
<analysis_results>
${JSON.stringify({ overallSummary: analysis.overallSummary, libraryProject: analysis.libraryProject, frontendProject: analysis.frontendProject }, null, 2)}
</analysis_results>
`;
      }
  } else {
    analysisContext = isRussian 
        ? `Это начало нашего разговора. Я предоставляю тебе полный код проекта. Пожалуйста, проанализируй его и ответь на мой первый вопрос.`
        : `This is the beginning of our conversation. I am providing you with the full project code. Please analyze it and answer my first question.`;
  }
  
  const langInstruction = isRussian 
    ? "You MUST respond exclusively in Russian. Format your responses using Markdown for readability.\n**Отвечай лаконично и по существу, если пользователь не просит предоставить больше деталей.**"
    : "You MUST respond exclusively in English. Format your responses using Markdown for readability.\n**Answer concisely and to the point, unless the user asks for more details.**";
  
  const hasChangelog = hasChangelogFile(libraryFiles, frontendFiles);
  const changelogNote = hasChangelog
    ? (isRussian
      ? "**ВАЖНОЕ ЗАМЕЧАНИЕ О ПОВЕДЕНИИ:** Когда пользователь применяет предложенное тобой исправление, ты автоматически пытаешься найти и обновить файл `CHANGELOG.md`, добавляя в него описание изменения. Если тебя спросят об этом процессе, ты ДОЛЖЕН подтвердить, что это автоматическая функция. Не говори пользователю, что ему нужно обновлять журнал изменений вручную."
      : "**IMPORTANT BEHAVIOR NOTE:** When a user applies a fix you suggested, you will automatically attempt to find and update a `CHANGELOG.md` file with a summary of the change. When asked about this process, you MUST confirm that this is an automated feature. Do not tell the user they need to update the changelog manually.")
    : "";

  return `
You are an expert Google Apps Script (GAS) developer and a helpful code assistant. Your memory of the project state is updated with each question.
${changelogNote}

${analysisContext}
${langInstruction}

**Here are the project files (this is their CURRENT state):**

${librarySection}

${frontendSection}

---

**My question:**
"${question}"
`;
}



export async function askQuestionAboutCode({ libraryFiles, frontendFiles, question, chatSession, analysis, modelName, language }: AskQuestionParams): Promise<{ answer: string; chatSession: Chat }> {
  const isRussian = language === 'ru';
  try {
    if (chatSession) {
      const response = await chatSession.sendMessage({ message: question });
      return { answer: response.text.trim(), chatSession };
    } else {
      const chat = ai.chats.create({ model: modelName });
      const initialPrompt = buildInitialQuestionPrompt({ libraryFiles, frontendFiles, question, analysis, language });
      const response = await chat.sendMessage({ message: initialPrompt });
      return { answer: response.text.trim(), chatSession: chat };
    }
  } catch (e) {
    console.error("Gemini API call for question failed:", e);
    if (e instanceof Error) {
        if (e.message.includes('429')) {
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
    }
    throw new Error(isRussian
        ? `Произошла неизвестная ошибка при вызове API: ${e instanceof Error ? e.message : String(e)}`
        : `An unknown error occurred during an API call: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

interface RefactorCodeParams {
  code: string;
  instruction: string;
  fileName: string;
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  modelName: ModelName;
  language: Language;
}

export async function refactorCode({ code, instruction, fileName, libraryFiles, frontendFiles, modelName, language }: RefactorCodeParams): Promise<RefactorResult> {
  const isRussian = language === 'ru';
  const librarySection = createProjectSection(isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)", libraryFiles);
  const frontendSection = createProjectSection(isRussian ? "Фронтенд-проект (Использует библиотеку)" : "Frontend Project (Consumes Library)", frontendFiles);
  
  const langInstruction = isRussian
    ? "You MUST respond exclusively in Russian. All text, including descriptions, titles, and manual steps, must be in Russian."
    : "You MUST respond exclusively in English. All text, including descriptions, titles, and manual steps, must be in English.";

  const changelogInstruction = isRussian 
    ? `**КРИТИЧЕСКИ ВАЖНОЕ ЗАМЕЧАНИЕ О CHANGELOG:**
Вы НЕ ДОЛЖНЫ изменять или создавать файл CHANGELOG.md. Не включайте в свой ответ никаких изменений для файла с именем 'CHANGELOG.md'. Приложение обрабатывает обновления журнала изменений отдельно. Ваша единственная обязанность — предоставить изменения кода для исходных файлов (.gs, .js, .html и т. д.).`
    : `**CRITICAL NOTE ON CHANGELOG:**
You MUST NOT modify or create a CHANGELOG.md file. Do not include any changes for a file named 'CHANGELOG.md' in your response. The application handles changelog updates separately. Your sole responsibility is to provide the code changes for the actual source files (.gs, .js, .html, etc.).`;

  const prompt = `
You are an expert Google Apps Script (GAS) developer specializing in context-aware code refactoring.
Your task is to refactor a specific code snippet based on the provided instruction and return a structured JSON object detailing all necessary changes. 
${langInstruction}

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

${changelogInstruction}

---

**Your Task & JSON Output:**
1.  **Refactor the Main Snippet:** Create the corrected version of the code snippet for the 'mainChange'. The \`originalCodeSnippet\` for the main change should be the one provided to you above.
2.  **Analyze Project-Wide Impact:** Based on the full context, identify ALL other files and code snippets that need to be updated as a direct consequence of the main change. These are the 'relatedChanges'.
3.  **Provide Snippets for All Changes:** For every main and related change, you MUST provide the \`originalCodeSnippet\` to be replaced and the new, \`correctedCodeSnippet\`.
    - **CRITICAL:** The \`fileName\` for every change MUST exactly match one of the files provided in the 'Full Project Context'.
    - **CRITICAL:** The \`fileName\` must be the base name of the file ONLY (e.g., \`Code.gs\`, \`utils.js\`). It MUST NOT include any prefixes, paths, or section titles (e.g., DO NOT use \`Основной проект/Code.gs\` or \`Frontend/utils.js\`).
    - **CRITICAL:** The \`originalCodeSnippet\` for every change MUST be a complete, self-contained block of code.
    - **CRITICAL:** It MUST be an **exact, verbatim, character-for-character copy** of the code from the source file, including all whitespace, indentation, and comments.
    - **CRITICAL:** This is the most common point of failure. Do not hallucinate or modify the \`originalCodeSnippet\` in any way. It must be a direct copy from the files provided in the context. This is critical for the replacement logic to work.
4.  **Format as JSON:** Return a single JSON object matching the provided schema. Do not include any text outside the JSON structure.
5.  **Identify Manual Follow-up Actions:** Critically, determine if the automated code change requires the user to perform any manual actions *outside* of the code editor to make the application functional. Examples include:
    *   Setting a Script Property in the GAS project settings.
    *   Creating or updating a specific named range in a Google Sheet.
    *   Adding a specific value to a configuration sheet.
    *   Manually authorizing a new OAuth scope.
6.  **Populate 'manualSteps':** If any such actions are required, populate the \`manualSteps\` array with clear, step-by-step instructions. If no manual steps are needed, this array MUST be empty.
`;
  const { refactorSchema } = getSchemas(language);
  return handleGeminiCallWithRetry(prompt, refactorSchema, modelName, language);
}

interface CorrectRefactorParams {
  originalResult: RefactorResult;
  failedChanges: FailedChange[];
  libraryFiles: UploadedFile[];
  frontendFiles: UploadedFile[];
  instruction: string;
  modelName: ModelName;
  language: Language;
}

export async function correctRefactorResult({ failedChanges, libraryFiles, frontendFiles, instruction, modelName, language }: CorrectRefactorParams): Promise<RefactorResult> {
  const isRussian = language === 'ru';
  const librarySection = createProjectSection(isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)", libraryFiles);
  const frontendSection = createProjectSection(isRussian ? "Фронтенд-проект (Использует библиотеку)" : "Frontend Project (Consumes Library)", frontendFiles);

  const failedSnippetsText = failedChanges
    .map(f => isRussian 
        ? `- В файле \`${f.change.fileName}\`, не удалось найти следующий фрагмент:\n\`\`\`\n${f.change.originalCodeSnippet}\n\`\`\``
        : `- In file \`${f.change.fileName}\`, the following snippet was not found:\n\`\`\`\n${f.change.originalCodeSnippet}\n\`\`\``
    ).join('\n');
    
  const langInstruction = isRussian
    ? "Your task is to try again and fix your mistake. You MUST respond exclusively in Russian."
    : "Your task is to try again and fix your mistake. You MUST respond exclusively in English.";

  const prompt = `
You are a self-correcting AI assistant for Google Apps Script. Your previous attempt to refactor code failed because you provided incorrect \`originalCodeSnippet\` values that were not found in the source files. ${langInstruction}

**Original Refactoring Goal:**
${instruction}

---

**Your Previous Incorrect Snippets:**
You made mistakes in the following snippets. The user's code does not contain them exactly as you wrote them.
${failedSnippetsText}

---

**Full Project Context (The user's current code):**
${librarySection}
${frontendSection}

---

**CRITICAL INSTRUCTIONS FOR YOUR SECOND ATTEMPT:**
1.  **Re-analyze the Goal:** Carefully re-read the original refactoring goal.
2.  **Generate a New Plan:** Create a new, complete refactoring plan. Do not just fix the broken parts; regenerate the entire plan to ensure consistency.
3.  **FIX THE SNIPPETS AND FILE NAMES:** The most important task is to fix your previous mistake. Your previous attempt may have failed because you provided incorrect \`originalCodeSnippet\` values or invented file names that do not exist.
    - In your new plan, the \`fileName\` for every change **MUST** exactly match one of the files provided in the 'Full Project Context'.
    - **CRITICAL:** The \`fileName\` must be the base name of the file ONLY (e.g., \`Code.gs\`, \`utils.js\`). It MUST NOT include any prefixes, paths, or section titles (e.g., DO NOT use \`Основной проект/Code.gs\` or \`Frontend/utils.js\`).
    - The \`originalCodeSnippet\` for every change **MUST** be a perfect, verbatim, character-for-character copy from the project files provided above. Check indentation, comments, and whitespace. This is the only way the automated tool can apply your changes.
4.  **Format as JSON:** Return a single JSON object matching the provided schema. Do not include any text outside the JSON structure.
`;
  const { refactorSchema } = getSchemas(language);
  return handleGeminiCallWithRetry(prompt, refactorSchema, modelName, language);
}


export async function batchRefactorCode({ instructions, libraryFiles, frontendFiles, modelName, language }: { instructions: BatchInstruction[], libraryFiles: UploadedFile[], frontendFiles: UploadedFile[], modelName: ModelName, language: Language }): Promise<BatchRefactorResult> {
  const isRussian = language === 'ru';
  const librarySection = createProjectSection(isRussian ? "Основной проект (Библиотека)" : "Main Project (Library)", libraryFiles);
  const frontendSection = createProjectSection(isRussian ? "Фронтенд-проект (Использует библиотеку)" : "Frontend Project (Consumes Library)", frontendFiles);
  
  const langInstruction = isRussian
    ? "You MUST respond exclusively in Russian."
    : "You MUST respond exclusively in English.";

  const instructionsText = instructions.map((instr, index) => `
    **Task ${index + 1}:**
    - **File:** \`${instr.fileName}\`
    - **Instruction:** ${instr.instruction}
    - **Original Code Snippet to Refactor:**
      \`\`\`
      ${instr.code}
      \`\`\`
  `).join('\n---\n');
  
  const changelogInstruction = isRussian 
    ? `**КРИТИЧЕСКИ ВАЖНОЕ ЗАМЕЧАНИЕ О CHANGELOG:**
Вы НЕ ДОЛЖНЫ изменять или создавать файл CHANGELOG.md. Не включайте в свой ответ никаких изменений для файла с именем 'CHANGELOG.md'. Приложение обрабатывает обновления журнала изменений отдельно. Ваша единственная обязанность — предоставить изменения кода для исходных файлов (.gs, .js, .html и т. д.).`
    : `**CRITICAL NOTE ON CHANGELOG:**
You MUST NOT modify or create a CHANGELOG.md file. Do not include any changes for a file named 'CHANGELOG.md' in your response. The application handles changelog updates separately. Your sole responsibility is to provide the code changes for the actual source files (.gs, .js, .html, etc.).`;

  const prompt = `
You are an expert Google Apps Script (GAS) developer specializing in context-aware, batch code refactoring.
Your task is to perform multiple refactoring tasks across the entire project simultaneously. You will receive a list of tasks. You must analyze their combined impact and produce a single, consolidated list of changes in a JSON object.
${langInstruction}

**Full Project Context:**
${librarySection}
${frontendSection}

---

**Refactoring Tasks:**
You must perform all of the following tasks. Consider how they might interact with each other.
${instructionsText}

---

${changelogInstruction}

---

**Your Task & JSON Output:**
1.  **Consolidate All Changes:** Analyze all tasks and their project-wide impact. Generate a single, flat list of all unique code changes required. Each change object in the 'changes' array must contain the file name, a description, the exact original code snippet, and the corrected code snippet.
2.  **Ensure Exact Snippets and File Names:** For each change, the \`originalCodeSnippet\` and \`fileName\` are the most critical parts.
    - **CRITICAL:** The \`fileName\` for every change MUST exactly match one of the files provided in the 'Full Project Context'.
    - **CRITICAL:** The \`fileName\` must be the base name of the file ONLY (e.g., \`Code.gs\`, \`utils.js\`). It MUST NOT include any prefixes, paths, or section titles (e.g., DO NOT use \`Основной проект/Code.gs\` or \`Frontend/utils.js\`).
    - **CRITICAL:** The \`originalCodeSnippet\` MUST be a complete, self-contained block of code.
    - **CRITICAL:** It MUST be an **exact, verbatim, character-for-character copy** from the source files. Do not change indentation, whitespace, or comments.
    - **CRITICAL:** You must not invent or modify the \`originalCodeSnippet\`. It is only used to find and replace code. An incorrect snippet will cause the entire process to fail.
3.  **Consolidate Manual Steps:** Review all changes and create a consolidated, de-duplicated list of any manual follow-up actions required.
4.  **Format as JSON:** Return a single JSON object matching the provided schema. Do not include any text outside the JSON structure.
`;
  const { batchRefactorSchema } = getSchemas(language);
  return handleGeminiCallWithRetry(prompt, batchRefactorSchema, modelName, language);
}


function buildChangelogPrompt(currentChangelog: string, changeDescription: string, language: Language): string {
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

export async function updateChangelog({ currentChangelog, changeDescription, language, modelName }: { currentChangelog: string, changeDescription: string, language: Language, modelName: ModelName }): Promise<string> {
  const prompt = buildChangelogPrompt(currentChangelog, changeDescription, language);
  
  let text = await handleGeminiCallWithRetry(prompt, null, modelName, language) as string;
  
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