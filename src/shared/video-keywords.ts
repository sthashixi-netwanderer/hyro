/**
 * Keywords and phrases commonly found in YouTube Music video titles that
 * indicate the content is a music video or visual media rather than a
 * pure audio track. Used to filter search/home results so only audio-
 * appropriate entries are shown to the user.
 *
 * Matching is case-insensitive. Each entry is tested as a substring
 * against the lowercased track title.
 */

/** Video-related keywords to match in track titles (lowercase). */
export const VIDEO_KEYWORDS: string[] = [
  // ── Official / label-released video content ──
  'official music video',
  'official video',
  'official lyric video',
  'official visualizer',
  'official live performance',
  'official cover',
  'official mv',
  'official vevo',
  'official art track',
  'clip officiel',
  'video musical oficial',
  'videoclipe oficial',
  'video oficial',

  // ── Video format descriptors ──
  'music video',
  'lyric video',
  'lyrics video',
  'visualizer',
  'music visualizer',
  'audio visualizer',
  'art track',
  'official audio',

  // ── Live / performance ──
  'live performance',
  'live acoustic',
  'acoustic session',
  'live session',
  'live at',
  'live in',
  'live from',
  'concert',
  'unplugged',
  'live cover',
  'performed live',
  'stage performance',
  'live show',
  'live stream',
  'live recording',
  'live version',
  'live on',
  'festival performance',
  'festival set',
  'tour performance',
  'tiny desk',
  'intimate performance',
  'living room session',
  'studio session',
  'studio live',
  'barefoot session',
  'acoustic live',
  'acoustic version',
  'stripped',
  'stripped down',
  'stripped session',
  'dance performance',
  'choreography',
  'dance video',
  'dance practice',
  'performance video',
  'tv performance',
  'award show performance',
  'medley',
  'mashup live',

  // ── Video production / extras ──
  'behind the scenes',
  'making of',
  'making the video',
  'music video teaser',
  'video teaser',
  'trailer',
  'teaser',
  'preview',
  'snippet',
  'first look',
  'premiere',
  'world premiere',
  'video premiere',
  'documentary',
  'docuseries',
  'recording session',
  'in the studio',
  'inside the studio',
  'recording process',
  'songwriting session',
  'writing session',
  'bts',

  // ── Remix / alternate video versions ──
  'official remix',
  'official video remix',
  'video remix',
  'remix video',
  'remix version',

  // ── Fan / unofficial ──
  'fan edit',
  'fan video',
  'fan made',
  'fan-made',
  'fan animation',
  'fan cover',
  'fancam',
  'unofficial video',
  'tribute video',
  'parody',
  'amv',
  'gmv',
  'reaction',

  // ── Cover / tribute content ──
  'cover version',
  'reimagined',
  'reworked',
  'bootleg',
  'cover by',

  // ── Video-specific suffixes ──
  'mv',
  'm/v',
  'official mv',
  'hd video',
  '4k video',
  'uhd video',
  'vevo',
  'official vevo',
  'vevo hd',

  // ── Visual format indicators ──
  'short film',
  'mini movie',
  'concept video',
  '360 video',
  '360 degree video',
  'vr video',
  'animated video',
  'animation',
  'lyric animation',
  'vertical video',
  'visual album',
  'video album',
  'concert film',
  'music documentary',
  'video collection',
  'compilation video',

  // ── Non-English video keywords ──
  'videoclip',
  'video clip',
  'cortometraje',           // Spanish: short film / music video
  'videointervista',        // Italian: video interview
  'auftritt',               // German: performance
  'konzert',                // German: concert
  'clipe musical',          // Portuguese: music video
  'teledysk',               // Polish: music video
  'musikkvideo',            // Norwegian/Danish: music video
  'musikvideo',             // German: music video
  'videoclip oficial',      // Spanish: official music video
  'offizielles video',      // German: official video
  'video ufficiale',        // Italian: official video
  'oficjalny teledysk',     // Polish: official music video
  'jkt',                    // Japanese abbreviation for music video
  'pv',                     // Promotional Video (Japanese/K-pop)

  // ── Audio-adjacent content (often paired with video) ──
  'instrumental version',
  'karaoke version',
  'sing-along',
  'singalong',
  'backing track',
  'isolated vocals',
  'vocal only',
  'acapella',
  'a cappella',
  'full album stream',

  // ── YouTube-specific patterns ──
  'youtube originals',
  'youtube premium',
  'exclusive video',
  'spotify canvas',
  'tidal exclusive',
  'apple music exclusive',
]

/**
 * Check whether a track title contains any video-related keyword.
 * Returns true if the title should be filtered out (it's a video, not audio).
 */
export function isVideoTitle(title: string): boolean {
  const lower = title.toLowerCase()
  return VIDEO_KEYWORDS.some((kw) => lower.includes(kw))
}
