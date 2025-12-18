import { NextResponse } from 'next/server';
import { isAppError } from '@/lib/errors';

/**
 * Standard error response type for API routes.
 */
export interface ErrorResponse {
  error: string;
}

/**
 * Handle errors in API routes with consistent logging and response format.
 *
 * @param error - The caught error
 * @param context - Context string for logging (e.g., 'TMDB movie', 'Jackett search')
 * @param fallbackMessage - User-facing message when error is not an AppError
 * @returns NextResponse with appropriate status code and error message
 */
export function handleRouteError(
  error: unknown,
  context: string,
  fallbackMessage: string
): NextResponse<ErrorResponse> {
  console.error(`${context} error:`, error);

  if (isAppError(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }

  return NextResponse.json(
    { error: fallbackMessage },
    { status: 500 }
  );
}

/**
 * Parse and validate a numeric ID from route params.
 * Returns the parsed number or null if invalid.
 */
export function parseNumericId(id: string): number | null {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}
