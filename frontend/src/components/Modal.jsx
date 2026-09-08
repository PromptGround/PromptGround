import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth = '640px' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-dialog" 
        style={{ maxWidth }} 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: '6px', borderRadius: '50%' }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
