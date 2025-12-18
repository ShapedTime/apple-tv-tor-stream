import { NextRequest, NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/api/tmdb';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, parseNumericId } from '@/lib/api/route-utils';
import type { TVShowDetails } from '@/types/tmdb';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<TVShowDetails | { error: string }>> {
  try {
    const { id } = await params;
    const showId = parseNumericId(id);

    if (!showId) {
      throw new ValidationError('Invalid TV show ID');
    }

    const show = await tmdbClient.getTVShow(showId);
    return NextResponse.json(show);
  } catch (error) {
    return handleRouteError(error, 'TMDB TV show', 'Failed to fetch TV show details');
  }
}
