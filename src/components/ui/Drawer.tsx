import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  position?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  preventCloseOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  position = 'right',
  size = 'md',
  showCloseButton = true,
  preventCloseOnOverlayClick = false,
  closeOnEscape = true,
  className = '',
}: DrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, closeOnEscape]);

  const sizes = {
    sm: 'w-full sm:w-[380px]',
    md: 'w-full sm:w-[460px]',
    lg: 'w-full sm:w-[560px]',
    xl: 'w-full sm:w-[680px]',
  };

  const slideDirection =
    position === 'right'
      ? { initial: { x: '100%' }, exit: { x: '100%' } }
      : { initial: { x: '-100%' }, exit: { x: '-100%' } };

  const edgeRadius = position === 'right' ? 'sm:rounded-l-3xl' : 'sm:rounded-r-3xl';
  const alignment = position === 'right' ? 'ml-auto' : 'mr-auto';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-gray-950/55 backdrop-blur-[3px]"
            onClick={preventCloseOnOverlayClick ? undefined : onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, ...slideDirection.initial }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, ...slideDirection.exit }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`relative h-full ${sizes[size]} bg-white flex flex-col ${alignment} ${edgeRadius} border border-gray-100 ${className}`}
            style={{ boxShadow: '0 24px 64px -16px rgba(10,10,12,0.28)' }}
            role="document"
          >
            {title && (
              <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-2xl text-gray-900 leading-tight">{title}</h2>
                  {description && (
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">{description}</p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
                    aria-label="Close drawer"
                  >
                    <X size={18} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 text-gray-700 text-sm leading-relaxed">
              {children}
            </div>

            {footer && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end gap-2 flex-shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
