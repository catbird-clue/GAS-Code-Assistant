import React from 'react';
import { UploadedFile } from '../types';
import { XIcon } from './icons';
import CodeBlock from './CodeBlock';
import { useTranslation } from '../I18nContext';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: UploadedFile | null;
}

const FileViewerModal: React.FC<FileViewerModalProps> = ({ isOpen, onClose, file }) => {
  const { t } = useTranslation();
  if (!isOpen || !file) return null;

  const getLanguage = (fileName: string) => {
    const extension = fileName.split('.').pop();
    switch (extension) {
      case 'js':
      case 'gs':
        return 'javascript';
      case 'html':
        return 'html';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      default:
        return 'plaintext';
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-viewer-title"
    >
      <div 
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 id="file-viewer-title" className="text-lg font-semibold text-white truncate pr-4">{t('fileContentTitle', { fileName: file.name })}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label={t('cancel')}>
            <XIcon />
          </button>
        </header>
        <main className="flex-grow p-4 overflow-y-auto">
            <CodeBlock language={getLanguage(file.name)}>{file.content}</CodeBlock>
        </main>
         <footer className="p-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 transition-colors text-white font-semibold">
                {t('cancel')}
            </button>
        </footer>
      </div>
    </div>
  );
};

export default FileViewerModal;
