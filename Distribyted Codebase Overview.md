Distribyted Codebase Overview
Based on my thorough exploration, here's a comprehensive explanation of the distribyted codebase:
1. Storage, Directories, and Routes
What are Routes?
Routes are the top-level organizational units that group torrents together. Each route becomes a virtual directory in the exposed filesystem. Configuration (config/model.go):
routes:
  - name: movies
    torrents:
      - magnet_uri: "magnet:?xt=urn:btih:..."
    torrent_folder: "/path/to/torrents"  # Auto-discover .torrent files
Resulting filesystem structure:
/
├── movies/
│   ├── inception/
│   │   └── inception.mkv
│   └── matrix/
│       └── matrix.mp4
└── tv-shows/
    └── breaking-bad/
        └── S01E01.mkv
Storage Architecture
The system uses four storage backends:
Storage	Location	Purpose
File Cache	metadata/cache/	LRU cache for downloaded pieces (default 2GB)
BoltDB	metadata/piece-completion/	Tracks which pieces are downloaded
BadgerDB	metadata/magnetdb/	Stores dynamically added magnets (via API)
BadgerDB	metadata/items/	DHT peer discovery data (2hr TTL)
Filesystem Abstraction Layer
The core is in fs/fs.go with two key interfaces:
type File interface {
    IsDir() bool
    Size() int64
    ReadAt(p []byte, off int64) (n int, err error)
    Read(p []byte) (n int, err error)
    Close() error
}

type Filesystem interface {
    Open(filename string) (File, error)
    ReadDir(path string) (map[string]File, error)
}
Key implementations:
Torrent (fs/torrent.go) - Wraps torrent files, lazy-loads on access
Archive (fs/archive.go) - Transparent ZIP/RAR/7Z extraction
ContainerFs (fs/container.go) - Combines multiple filesystems
Memory (fs/memory.go) - In-memory file storage
How Torrents are Loaded
Three loaders work together (torrent/loader/):
Config Loader - Reads from YAML Route.Torrents list
Folder Loader - Scans Route.TorrentFolder for .torrent files
DB Loader - Reads from BadgerDB (for API-added torrents)
When you call POST /api/routes/movies/torrent with a magnet, it:
Stores in BadgerDB at key /route/{hash}/movies
Adds to anacrolix torrent client
Registers in the route's Torrent filesystem
Becomes accessible at /movies/torrent-name/
2. Sequential Downloads for Media Streaming
The Short Answer: Distribyted does NOT implement explicit piece prioritization
It relies entirely on the anacrolix/torrent library to handle piece fetching on-demand.
How Streaming Works
The critical code is in fs/torrent.go:110-136:
func readAtLeast(r missinggo.ReadContexter, timeout int, buf []byte, min int) (n int, err error) {
    for n < min && err == nil {
        ctx, cancel := context.WithCancel(context.Background())
        timer := time.AfterFunc(time.Duration(timeout)*time.Second, func() {
            cancel()
        })
        nn, err = r.ReadContext(ctx, buf[n:])
        n += nn
        timer.Stop()
    }
    return
}
Key behaviors:
Reads block until data arrives or timeout expires (default 120 seconds)
Each read chunk has its own timeout
No prefetch/read-ahead mechanism
No piece priority management
Buffer Management
The iio/disk.go provides DiskTeeReader:
Creates temporary files to cache streamed data
Enables ReadAt() (random access) while streaming sequentially
Cleans up temp files on close
Edge Cases: Video/Audio Sync
There is no explicit A/V sync handling. The system relies on:
Video player's internal buffering - Players like VLC/Infuse handle buffering
120-second read timeout - Acts as an implicit "wait for data" mechanism
HTTP Range request support - WebDAV and HTTP support seeking
Potential issues:
If pieces arrive out of order, playback may stutter
No adaptive bitrate or quality switching
Large files with slow seeds could timeout
Configuration Tuning (config/model.go)
torrent:
  read_timeout: 120        # Seconds to wait for piece data
  add_timeout: 60          # Seconds to wait for torrent metadata
  global_cache_size: 2048  # MB for piece cache
3. Subtitle Support
Current State: No Special Subtitle Handling
I searched for .srt, .vtt, .sub, .ass patterns - zero matches. Subtitles are treated as regular files with no special processing.
How Subtitles Would Work Today
If a torrent contains subtitles:
/movies/inception/
├── inception.mkv
├── inception.eng.srt    ← Served as regular file
└── inception.spa.srt    ← Served as regular file
AppleTV/VLC clients must discover subtitles by filename convention.
Adding External Subtitles: Implementation Options
The architecture makes this very feasible through the Filesystem interface:
Option 1: Add Memory Filesystem to Route
Modify torrent/service.go Load() method:
func (s *Service) Load() (map[string]fs.Filesystem, error) {
    // ... existing torrent loading ...
    
    // Create composite filesystem per route
    for routeName, torrentFS := range s.fss {
        subtitleFS := fs.NewMemory()
        // Load subtitles from external source
        subtitleFS.Add(subtitleFile, "/movie.srt")
        
        // Combine into single filesystem
        s.fss[routeName] = NewCompositeFS(torrentFS, subtitleFS)
    }
    return s.fss, nil
}
Option 2: Create Wrapper Filesystem
type TorrentWithSubtitles struct {
    torrentFS  *fs.Torrent
    subtitleFS *fs.Memory
}

func (t *TorrentWithSubtitles) Open(path string) (fs.File, error) {
    // Try torrent first
    if f, err := t.torrentFS.Open(path); err == nil {
        return f, nil
    }
    // Fall back to subtitles
    return t.subtitleFS.Open(path)
}
Option 3: API Endpoint for Subtitle Upload
Add to http/api.go:
// POST /api/routes/:route/torrent/:hash/subtitle
func apiAddSubtitleHandler(c *gin.Context) {
    route := c.Param("route")
    hash := c.Param("hash")
    file, _ := c.FormFile("subtitle")
    // Store in memory filesystem alongside torrent
}
Where to Fetch Subtitles From
You could integrate with:
OpenSubtitles API - Largest subtitle database
Subscene - Alternative source
Embedded in torrent - Many releases include .srt files
Architecture Diagram
┌─────────────────────────────────────────────────────────────┐
│                    Exposure Layers                          │
├──────────────────┬──────────────────┬──────────────────────┤
│  WebDAV :36911   │  FUSE /mount     │  HTTP :4444          │
│  (AppleTV)       │  (OS native)     │  (Browser/API)       │
└────────┬─────────┴────────┬─────────┴──────────┬───────────┘
         └──────────────────┼─────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │    ContainerFs            │
              │  (combines all routes)    │
              └─────────────┬─────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐       ┌─────▼─────┐      ┌─────▼─────┐
    │ Torrent │       │  Archive  │      │  Memory   │
    │   FS    │       │ (ZIP/RAR) │      │   FS      │
    └────┬────┘       └─────┬─────┘      └─────┬─────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │   anacrolix/torrent       │
              │   (piece downloading)     │
              └─────────────┬─────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐       ┌─────▼─────┐      ┌─────▼─────┐
    │  Cache  │       │  BoltDB   │      │ BadgerDB  │
    │  (LRU)  │       │ (pieces)  │      │ (magnets) │
    └─────────┘       └───────────┘      └───────────┘
Key Files Reference
Purpose	File
Entry point	cmd/distribyted/main.go
Config model	config/model.go
Core FS interfaces	fs/fs.go
Torrent filesystem	fs/torrent.go
Storage layer	fs/storage.go
Route/torrent service	torrent/service.go
HTTP API	http/api.go
WebDAV	webdav/fs.go
Let me know which area you'd like to dive deeper into for your planned changes!
