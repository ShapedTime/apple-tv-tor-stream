import { NextRequest, NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/api/tmdb';
import { ValidationError } from '@/lib/errors';
import { handleRouteError, parseNumericId } from '@/lib/api/route-utils';
import type { SeasonDetails } from '@/types/tmdb';

interface RouteParams {
  params: Promise<{ id: string; season: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<SeasonDetails | { error: string }>> {
  try {
    const { id, season } = await params;
    const showId = parseNumericId(id);

    if (!showId) {
      throw new ValidationError('Invalid TV show ID');
    }

    const seasonNumber = parseInt(season, 10);
    if (isNaN(seasonNumber) || seasonNumber < 0) {
      throw new ValidationError('Invalid season number');
    }

    const seasonDetails = await tmdbClient.getSeason(showId, seasonNumber);
    return NextResponse.json(seasonDetails);
  } catch (error) {
    return handleRouteError(error, 'TMDB season', 'Failed to fetch season details');
  }
}
