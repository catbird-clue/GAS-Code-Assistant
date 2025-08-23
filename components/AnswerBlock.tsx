import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface AnswerBlockProps {
  answer: string;
}

const AnswerBlock: React.FC<AnswerBlockProps> = ({ answer }) => {
  const sanitizedHtml = DOMPurify.sanitize(marked.parse(answer) as string);

  return (
    <div className="relative group">
      <div
        className="text-gray-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
};

export default AnswerBlock;
