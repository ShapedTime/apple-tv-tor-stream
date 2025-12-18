import { NextRequest, NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/api/tmdb';
import { ValidationError } from '@/lib/errors';
import { handleRouteError } from '@/lib/api/route-utils';
import type { SearchResult } from '@/types/tmdb';

export async function GET(
  request: NextRequest
): Promise<NextResponse<SearchResult[] | { error: string }>> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || !query.trim()) {
      throw new ValidationError('Search query is required');
    }

    const results = await tmdbClient.search(query);
    return NextResponse.json(results);
  } catch (error) {
    return handleRouteError(error, 'TMDB search', 'Search failed');
  }
}
