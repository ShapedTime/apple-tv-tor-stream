import { NextRequest, NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/api/tmdb';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, parseNumericId } from '@/lib/api/route-utils';
import type { MovieDetails } from '@/types/tmdb';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<MovieDetails | { error: string }>> {
  try {
    const { id } = await params;
    const movieId = parseNumericId(id);

    if (!movieId) {
      throw new ValidationError('Invalid movie ID');
    }

    const movie = await tmdbClient.getMovie(movieId);
    return NextResponse.json(movie);
  } catch (error) {
    return handleRouteError(error, 'TMDB movie', 'Failed to fetch movie details');
  }
}
