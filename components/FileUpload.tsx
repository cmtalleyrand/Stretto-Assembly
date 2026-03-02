import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon, Spinner } from './Icons';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isLoading: boolean;
}

export default function FileUpload({ onFileUpload, isLoading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onFileUpload(event.target.files[0]);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    handleDrag(e);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [handleDrag]);
  
  const handleDragOut = useCallback((e: React.DragEvent) => {
    handleDrag(e);
    setIsDragging(false);
  }, [handleDrag]);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    handleDrag(e);
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileUpload(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleDrag, onFileUpload]);
  
  const handleClick = () => {
    inputRef.current?.click();
  };

  const dragOverClass = isDragging ? 'border-brand-primary bg-gray-dark' : 'border-gray-medium';

  return (
    <div
      className={`relative w-full p-8 sm:p-12 border-2 border-dashed ${dragOverClass} rounded-2xl cursor-pointer transition-all duration-300 ease-in-out hover:border-brand-primary hover:bg-gray-dark/50 animate-fade-in`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={handleFileChange}
        disabled={isLoading}
      />
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        {isLoading ? (
          <>
            <Spinner className="w-12 h-12 text-brand-primary" />
            <p className="text-lg font-semibold text-gray-300">Parsing MIDI...</p>
          </>
        ) : (
          <>
            <UploadIcon className="w-12 h-12 text-gray-medium group-hover:text-brand-primary transition-colors" />
            <p className="text-lg font-semibold text-gray-300">
              Drag & drop a MIDI file here
            </p>
            <p className="text-gray-400">or click to select a file</p>
            <p className="text-xs text-gray-500 mt-2">.mid or .midi files only</p>
          </>
        )}
      </div>
    </div>
  );
}
