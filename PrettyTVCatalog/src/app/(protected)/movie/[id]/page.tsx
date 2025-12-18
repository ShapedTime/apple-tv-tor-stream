'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useMovie } from '@/hooks/useTMDB';
import { TorrentSearchModal } from '@/components/torrent';
import type { TorrentSearchContext } from '@/types/jackett';
import { formatRuntime, extractYear, formatReleaseDate } from '@/lib/utils';
import {
  MediaDetails,
  MediaDetailsSkeleton,
  CastCarousel,
  CastCarouselSkeleton,
} from '@/components/media';
import { ErrorState } from '@/components/ui';

function LoadingState() {
  return (
    <>
      <MediaDetailsSkeleton />
      <CastCarouselSkeleton />
    </>
  );
}

export default function MoviePage() {
  const params = useParams();
  const movieId = params.id ? parseInt(params.id as string, 10) : null;

  const { data: movie, isLoading, error } = useMovie(movieId);

  // Torrent search modal state
  const [isTorrentModalOpen, setIsTorrentModalOpen] = useState(false);
  const [torrentContext, setTorrentContext] = useState<TorrentSearchContext | null>(null);

  // Handler for "Search Torrents" button
  const handleSearchTorrents = useCallback(() => {
    if (!movie || !movieId) return;

    const year = extractYear(movie.releaseDate) ?? undefined;
    const query = year ? `${movie.title} ${year}` : movie.title;

    setTorrentContext({
      mediaType: 'movie',
      query,
      title: movie.title,
      tmdbId: movieId,
      year,
    });
    setIsTorrentModalOpen(true);
  }, [movie, movieId]);

  // Invalid ID state
  if (!movieId || isNaN(movieId)) {
    return <ErrorState title="Unable to load movie" message="Invalid movie ID" />;
  }

  // Loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Error state
  if (error) {
    return <ErrorState title="Unable to load movie" message={error} />;
  }

  // No data state
  if (!movie) {
    return <ErrorState title="Unable to load movie" message="Movie not found" />;
  }

  // Format metadata
  const runtime = formatRuntime(movie.runtime);
  const releaseYear = extractYear(movie.releaseDate);
  const releaseDate = formatReleaseDate(movie.releaseDate);

  return (
    <>
      {/* Movie Details Hero */}
      <MediaDetails
        title={movie.title}
        tagline={movie.tagline}
        overview={movie.overview}
        backdropPath={movie.backdropPath}
        posterPath={movie.posterPath}
        rating={movie.voteAverage}
        releaseYear={releaseYear}
        runtime={runtime}
        releaseDate={releaseDate}
        genres={movie.genres}
        mediaType="movie"
        onSearchTorrents={handleSearchTorrents}
      />

      {/* Cast Carousel */}
      {movie.credits.cast.length > 0 && (
        <CastCarousel cast={movie.credits.cast} maxItems={10} />
      )}

      {/* Torrent Search Modal */}
      {torrentContext && (
        <TorrentSearchModal
          isOpen={isTorrentModalOpen}
          onClose={() => setIsTorrentModalOpen(false)}
          context={torrentContext}
        />
      )}
    </>
  );
}
