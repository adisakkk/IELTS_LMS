import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  preventCloseOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

/**
 * Dialog — refined modal primitive.
 *
 * Design: soft 20px radii, warm ink overlay with subtle blur,
 * layered shadow, optional serif-display title with description.
 * Respects prefers-reduced-motion via the global CSS cascade.
 */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  preventCloseOnOverlayClick = false,
  closeOnEscape = true,
  className = '',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      previousActiveElement.current = document.activeElement as HTMLElement;

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) as NodeListOf<HTMLElement>;

      if (focusableElements && focusableElements.length > 0) {
        focusableElements[0]?.focus();
      }

      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (focusableElements && focusableElements.length > 0) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];
          if (!firstElement || !lastElement) return;

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleTab);
      return () => {
        document.removeEventListener('keydown', handleTab);
      };
    } else {
      document.body.style.overflow = 'unset';
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
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
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    full: 'max-w-5xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
        >
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
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={`relative w-full ${sizes[size]} bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col ${className}`}
            style={{ boxShadow: '0 24px 48px -12px rgba(10,10,12,0.22), 0 0 0 1px rgba(10,10,12,0.04)' }}
            role="document"
          >
            {title && (
              <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 id={titleId} className="font-display text-2xl text-gray-900 leading-tight">
                    {title}
                  </h2>
                  {description && (
                    <p id={descriptionId} className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
                    aria-label="Close dialog"
                  >
                    <X size={18} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}

            <div className="px-6 pb-6 overflow-y-auto max-h-[70vh] text-gray-700 text-sm leading-relaxed">
              {children}
            </div>

            {footer && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
