import React, { useState, useCallback } from 'react';
import { UploadedFile } from '../types';
import { UploadIcon } from './icons';

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesUploaded }) => {
  const [isDragging, setIsDragging] = useState(false);

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
    try {
      const uploadedFiles = await Promise.all(fileArray.map(handleFileRead));
      onFilesUploaded(uploadedFiles);
    } catch (error) {
      console.error("Error reading files:", error);
      // Handle error display to the user if needed
    }
  }, [onFilesUploaded]);

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
    e.stopPropagation(); // Necessary to allow drop
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

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
        isDragging ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-500'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        multiple
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleFileChange}
        accept=".gs,.js,.html,.json,.md"
      />
      <div className="flex flex-col items-center justify-center space-y-2 text-gray-400">
        <UploadIcon />
        <p className="text-gray-300">
          <span className="font-semibold text-indigo-400">Нажмите для загрузки</span> или перетащите
        </p>
        <p className="text-xs">Поддерживаются .gs, .js, .html, .json, .md</p>
      </div>
    </div>
  );
};

export default FileUpload;