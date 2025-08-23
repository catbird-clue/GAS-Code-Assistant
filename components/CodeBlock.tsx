

import React, { useState } from 'react';
import { CopyIcon, CheckIcon } from './icons';

interface CodeBlockProps {
  children: React.ReactNode;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ children, language = 'javascript' }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        if (typeof children === 'string') {
            navigator.clipboard.writeText(children);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    return (
        <div className="bg-gray-900 rounded-md my-2 relative group">
            <div className="bg-gray-700/50 px-4 py-2 text-xs text-gray-400 rounded-t-md flex justify-between items-center">
                <span className="capitalize">{language}</span>
                <button 
                    onClick={handleCopy} 
                    className="text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    aria-label="Copy code"
                    disabled={isCopied}
                >
                    {isCopied ? <CheckIcon /> : <CopyIcon />}
                </button>
            </div>
            <pre className="p-4 text-sm overflow-x-auto text-white"><code>{children}</code></pre>
        </div>
    );
};

export default CodeBlock;