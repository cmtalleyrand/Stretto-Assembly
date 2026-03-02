import React from 'react';
import { CloseIcon } from './Icons';

interface NotificationProps {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}

const typeClasses = {
  success: 'bg-green-900/50 border-green-700 text-green-300',
  error: 'bg-red-900/50 border-red-700 text-red-300',
};

export default function Notification({ message, type, onDismiss }: NotificationProps) {
  if (!message) return null;

  return (
    <div className={`relative flex items-center justify-between p-4 border rounded-lg animate-fade-in ${typeClasses[type]}`}>
      <p>{message}</p>
      <button 
        onClick={onDismiss} 
        className="ml-4 p-1 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
