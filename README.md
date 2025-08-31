# GAS Code Analyzer

An intelligent assistant powered by the Google Gemini API to analyze, refactor, and improve your Google Apps Script (GAS) projects. This tool provides in-depth code analysis, offers actionable recommendations, applies automatic fixes, and allows you to chat with an AI about your codebase.

![GAS Code Analyzer Screenshot](https://storage.googleapis.com/generative-ai-docs/images/gas-code-analyzer-screenshot.png)

## ✨ Key Features

-   **Deep Code Analysis**: Leverages the Gemini API to understand the semantics, structure, and interdependencies within your GAS project.
-   **Context-Aware Refactoring**: Generates improvement suggestions based on how code is used throughout the entire project, not just in isolation.
-   **Automatic Fix Application**: Apply suggested improvements with a single click. The system intelligently modifies the primary code snippet and updates all related function calls or variable references across other files.
-   **Batch-Fixing**: Select multiple recommendations and apply them all at once for maximum efficiency.
-   **Self-Correction Mechanism**: If a refactoring attempt fails because the model generated a slightly incorrect code snippet to replace, it automatically retries with a corrected context, significantly improving reliability.
-   **Automated `CHANGELOG.md` Updates**: When you apply fixes, the assistant automatically finds your `CHANGELOG.md` file and adds a new entry under the `[Unreleased]` section.
-   **Interactive Q&A Chat**: Have a conversation with the AI about your code. Ask for explanations, alternative approaches, or clarification on recommendations.
-   **Demo Project**: Load a pre-configured sample project to immediately test the analyzer's capabilities.
-   **Multi-Language Support**: The entire interface and all AI interactions are available in English and Russian.
-   **Export Functionality**: Download detailed analysis reports and chat history in Markdown format for documentation or sharing.

## 🚀 How to Use

1.  **Upload Files**: The application is divided into two sections for a typical library-consumer structure:
    *   **Main Project (Library)**: Upload the `.gs`, `.js`, and `.html` files for your main script, which is intended to be used as a library.
    *   **Frontend Project**: Upload the project files that consume your library.
2.  **Click "Analyze"**: Once your files are uploaded, start the analysis. The assistant will perform a comprehensive review of the entire codebase.
3.  **Review Recommendations**: The results are presented in a detailed report, broken down by file. Recommendations cover performance, security, best practices, and code style.
4.  **Apply Fixes**: For many recommendations, automatic fixes are provided. You can review the proposed changes in a diff view and apply them individually or select several to apply in a batch.
5.  **Ask a Question**: Use the integrated chat to ask specific questions about your code. The AI assistant will provide answers based on the context of your uploaded project and the previous analysis.

## 🛠️ Technology Stack

-   **Frontend**: React, TypeScript, Tailwind CSS
-   **AI**: Google Gemini API (`gemini-2.5-flash`) via `@google/genai` SDK
-   **Dependencies**: `marked` for Markdown rendering, `react-diff-viewer-continued` for code comparisons.

## ⚙️ Setup and Running Locally

To run this project on your own machine, you'll need a Google Gemini API key.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/google/generative-ai-docs.git
    cd generative-ai-docs/apps/gas-code-analyzer
    ```

2.  **Set up your API Key:**
    The application expects the API key to be available as an environment variable. When running locally with a simple web server, you'll need to manually replace `process.env.API_KEY` in the code with your actual key, or use a tool that can inject environment variables.

    *Note: For security reasons, never hardcode your API key in production code or commit it to your repository.*

3.  **Serve the application:**
    You can use any simple static file server. For example, using Python:
    ```bash
    python -m http.server
    ```
    Or with Node.js `serve`:
    ```bash
    npx serve .
    ```
    Then open your browser to the provided local address (e.g., `http://localhost:8000`).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request with any bug fixes, improvements, or new features.

## 📄 License

This project is licensed under the Apache 2.0 License.
