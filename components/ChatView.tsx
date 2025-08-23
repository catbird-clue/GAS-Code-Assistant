import React from 'react';
import { ConversationTurn } from '../types';
import AnswerBlock from './AnswerBlock';
import { DownloadIcon } from './icons';

interface ChatViewProps {
  conversationHistory: ConversationTurn[];
  isAnswering: boolean;
}

const ChatView: React.FC<ChatViewProps> = ({ conversationHistory, isAnswering }) => {

  const handleExportChat = () => {
    if (conversationHistory.length === 0) return;

    const formattedChat = conversationHistory.map(turn => 
      `**Пользователь:**\n\n> ${turn.question}\n\n**Ассистент:**\n\n${turn.answer}`
    ).join('\n\n---\n\n');

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `chat-export-${timestamp}.md`;

    const blob = new Blob([`# Экспорт чата\n\n${formattedChat}`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (conversationHistory.length === 0 && !isAnswering) {
    return (
      <div className="p-6 text-center text-gray-500 h-full flex items-center justify-center">
        <div>Задайте вопрос по загруженному коду, чтобы начать чат с ассистентом.</div>
      </div>
    );
  }
  
  return (
    <div className="p-4 md:p-6">
       {conversationHistory.length > 0 && (
        <div className="mb-6 pb-4 border-b border-gray-700 flex justify-end">
          <button
            onClick={handleExportChat}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors"
          >
            <DownloadIcon />
            Экспорт чата
          </button>
        </div>
      )}
      <div className="space-y-6">
        {conversationHistory.map((turn, index) => (
          <div key={index}>
            <div className="flex items-start gap-3">
              <div className="bg-gray-700 p-2 rounded-full flex-shrink-0 text-gray-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-gray-200">
                {turn.question}
              </div>
            </div>
            <div className="flex items-start gap-3 mt-4">
              <div className="bg-indigo-600/30 p-2 rounded-full flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300"><path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path><path d="m5 12-2 2 9-9"></path><path d="M19 21h2"></path><path d="M4 3h2"></path><path d="M21 15h-2"></path><path d="M3 4v2"></path><path d="M21 20v-2"></path></svg>
              </div>
              <div className="flex-1 min-w-0">
                  <AnswerBlock answer={turn.answer} />
              </div>
            </div>
          </div>
        ))}
          {isAnswering && (
            <div className="flex items-start gap-3 mt-4">
              <div className="bg-indigo-600/30 p-2 rounded-full flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300 animate-pulse"><path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path><path d="m5 12-2 2 9-9"></path><path d="M19 21h2"></path><path d="M4 3h2"></path><path d="M21 15h-2"></path><path d="M3 4v2"></path><path d="M21 20v-2"></path></svg>
              </div>
                <div className="text-gray-400 pt-1">Ассистент печатает...</div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ChatView;
