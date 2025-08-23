
import React, { useState, useCallback, useRef } from 'react';
import { UploadedFile } from '../types';
import { UploadIcon } from './icons';
import { useTranslation } from '../I18nContext';

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  setError: (error: string | null) => void;
}

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

const FileUpload: React.FC<FileUploadProps> = ({ onFilesUploaded, setError }) => {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileRead = (file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve({ name: file.name, content });
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const processFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    
    setError(null);

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(t('fileTooLargeError', { fileName: file.name }));
        // We show the error but continue processing other valid files.
      } else {
        validFiles.push(file);
      }
    }
    
    if (validFiles.length === 0) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    try {
      const uploadedFiles = await Promise.all(validFiles.map(handleFileRead));
      onFilesUploaded(uploadedFiles);
    } catch (error) {
      console.error("Error reading files:", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onFilesUploaded, setError, t]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative cursor-pointer border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 block ${
        isDragging ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-500'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      role="button"
      tabIndex={0}
      aria-label={t('uploadAria')}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
        accept=".gs,.js,.html,.json,.md"
        tabIndex={-1}
      />
      <div className="flex flex-col items-center justify-center space-y-2 text-gray-400 pointer-events-none">
        <UploadIcon />
        <div className="text-gray-300">
          <span className="font-semibold text-indigo-400">{t('clickToUpload')}</span> {t('orDragAndDrop')}
        </div>
        <div className="text-xs">{t('supportedFiles')}</div>
      </div>
    </div>
  );
};

export default FileUpload;