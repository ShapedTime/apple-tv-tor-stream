import { NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/api/tmdb';
import { handleRouteError } from '@/lib/api/route-utils';
import type { TrendingResults } from '@/types/tmdb';

export async function GET(): Promise<NextResponse<TrendingResults | { error: string }>> {
  try {
    const trending = await tmdbClient.getTrending();
    return NextResponse.json(trending);
  } catch (error) {
    return handleRouteError(error, 'TMDB trending', 'Failed to fetch trending content');
  }
}
