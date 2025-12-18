'use client';

import { Button } from './Button';
import { AlertCircleIcon } from './Icons';

interface ErrorStateProps {
  /** The title displayed in the error state */
  title: string;
  /** The error message or description */
  message: string;
  /** Optional custom action button text (defaults to "Go Back") */
  actionText?: string;
  /** Optional custom action handler (defaults to window.history.back) */
  onAction?: () => void;
}

/**
 * Reusable error state component for displaying errors with a consistent UI.
 * Includes an icon, title, message, and action button.
 */
export function ErrorState({
  title,
  message,
  actionText = 'Go Back',
  onAction,
}: ErrorStateProps) {
  const handleAction = onAction ?? (() => window.history.back());

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
      <div className="text-center max-w-md">
        <AlertCircleIcon size={48} className="mx-auto mb-4 text-text-muted" />
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-text-secondary mb-6">{message}</p>
        <Button variant="secondary" onClick={handleAction}>
          {actionText}
        </Button>
      </div>
    </div>
  );
}
