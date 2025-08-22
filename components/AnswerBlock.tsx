import React, { useState } from 'react';
import { marked } from 'marked';
import { CopyIcon, CheckIcon } from './icons';

interface AnswerBlockProps {
  answer: string;
}

const AnswerBlock: React.FC<AnswerBlockProps> = ({ answer }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 bg-gray-900/80 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 z-10"
        aria-label="Copy response"
        disabled={isCopied}
      >
        {isCopied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <div
        className="prose prose-invert text-gray-300 max-w-none prose-ul:list-disc prose-ul:ml-5 prose-li:my-1 prose-strong:text-white leading-relaxed prose-pre:bg-gray-900 prose-pre:p-4 prose-pre:rounded-md"
        dangerouslySetInnerHTML={{ __html: marked.parse(answer) }}
      />
    </div>
  );
};

export default AnswerBlock;
