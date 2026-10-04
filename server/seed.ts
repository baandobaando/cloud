// Starter catalog inserted into an empty database on first run.
import type { Genre, Rating } from '../shared/types.ts'

interface SeedEpisode {
  number: number
  title: string
  durationSec: number
  videoUrl: string
}

interface SeedSeries {
  id: string
  title: string
  tagline: string
  synopsis: string
  genres: Genre[]
  year: number
  rating: Rating
  palette: [string, string]
  emoji: string
  isNew?: boolean
  trendingRank?: number
  episodes: SeedEpisode[]
}

// Public sample clips stand in for real episode footage.
const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
]

const EPISODE_BEATS = [
  'The Contract',
  'A Slap at the Gala',
  'Who Is She Really?',
  'The Ring Goes Missing',
  'Betrayed at the Altar',
  'Three Years Later',
  'The DNA Test',
  'His Mother Knows',
  'Fired in Front of Everyone',
  'The Helicopter Arrives',
  'Secret in the Will',
  'Kneel and Apologize',
  'The Twin Appears',
  'Blackmail',
  'The Truth Comes Out',
  'One Last Chance',
  'The Wedding, Again',
  'Checkmate',
]

function makeEpisodes(count: number): SeedEpisode[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: EPISODE_BEATS[i % EPISODE_BEATS.length],
    durationSec: 70 + ((i * 37) % 60),
    videoUrl: SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length],
  }))
}



const SEEDS: (Omit<SeedSeries, 'episodes'> & { episodeCount: number })[] = [
  {
    id: 'ceo-secret-wife',
    title: "The CEO's Secret Wife",
    tagline: 'She signed the contract. He never read the fine print.',
    synopsis:
      'Broke and desperate, Lena agrees to a one-year marriage with the coldest CEO in the city. Nobody — not even him — knows she is the heiress his family ruined.',
    genres: ['Billionaire Romance', 'Hidden Identity'],
    year: 2026,
    rating: 'TV-14',
    palette: ['#7a0f2e', '#1a0b2e'],
    emoji: '💍',
    trendingRank: 1,
    episodeCount: 80,
  },
  {
    id: 'reborn-revenge',
    title: 'Reborn to Ruin Them',
    tagline: 'They buried her once. She came back for all of them.',
    synopsis:
      'Betrayed by her husband and best friend, Mara wakes up five years in the past with every memory intact — and a list.',
    genres: ['Revenge', 'Family Secrets'],
    year: 2026,
    rating: 'TV-MA',
    palette: ['#3b0a0a', '#c2410c'],
    emoji: '🔥',
    trendingRank: 2,
    isNew: true,
    episodeCount: 72,
  },
  {
    id: 'alpha-rejected-mate',
    title: "The Alpha's Rejected Mate",
    tagline: 'He rejected her under the full moon. Now he needs her to survive.',
    synopsis:
      'Cast out of her pack, Ivy discovers the power she was born with — just as the Alpha who rejected her begins to fall.',
    genres: ['Werewolf & Fantasy'],
    year: 2025,
    rating: 'TV-14',
    palette: ['#0f172a', '#4338ca'],
    emoji: '🐺',
    trendingRank: 3,
    episodeCount: 90,
  },
  {
    id: 'don-of-the-docks',
    title: 'Don of the Docks',
    tagline: 'One wrong delivery. One deadly marriage.',
    synopsis:
      'A florist accidentally witnesses a mafia deal. To keep her alive, the youngest Don in the city makes her his wife.',
    genres: ['Mafia', 'Billionaire Romance'],
    year: 2026,
    rating: 'TV-MA',
    palette: ['#111111', '#7f1d1d'],
    emoji: '🌹',
    isNew: true,
    episodeCount: 64,
  },
  {
    id: 'janitor-heir',
    title: 'The Janitor Is the Heir',
    tagline: 'They laughed at the mop. Then the chairman bowed.',
    synopsis:
      'Mocked every day at the company his grandfather secretly owns, Daniel has 30 days to prove himself before he inherits it all.',
    genres: ['Hidden Identity', 'Revenge'],
    year: 2025,
    rating: 'TV-PG',
    palette: ['#064e3b', '#a3e635'],
    emoji: '🧹',
    trendingRank: 4,
    episodeCount: 60,
  },
  {
    id: 'twins-swapped',
    title: 'Swapped at Birth',
    tagline: 'One sister got the mansion. The other got the truth.',
    synopsis:
      'A DNA test at a charity gala reveals the billionaire daughter and the waitress serving her were switched 24 years ago.',
    genres: ['Family Secrets', 'Hidden Identity'],
    year: 2026,
    rating: 'TV-14',
    palette: ['#831843', '#f9a8d4'],
    emoji: '👯',
    episodeCount: 70,
  },
  {
    id: 'divorce-day',
    title: 'Happy Divorce Day',
    tagline: 'He thought she would cry. She brought champagne.',
    synopsis:
      'After seven years of being ignored, Claire hands her husband divorce papers — and walks straight into the life he never knew she had.',
    genres: ['Revenge', 'Billionaire Romance'],
    year: 2026,
    rating: 'TV-14',
    palette: ['#1e3a8a', '#fbbf24'],
    emoji: '🥂',
    isNew: true,
    trendingRank: 5,
    episodeCount: 68,
  },
  {
    id: 'vampire-contract',
    title: 'Bound by Blood',
    tagline: 'A loan from a vampire always comes due.',
    synopsis:
      "To pay her father's debts, Nora signs a contract with an immortal banker. The interest is her heart.",
    genres: ['Werewolf & Fantasy', 'Billionaire Romance'],
    year: 2025,
    rating: 'TV-MA',
    palette: ['#450a0a', '#1c1917'],
    emoji: '🦇',
    episodeCount: 75,
  },
  {
    id: 'mafia-princess',
    title: 'The Mafia Princess Returns',
    tagline: 'Sent away as a child. Back to take the throne.',
    synopsis:
      "Raised in secret overseas, Sofia returns home the night her father is shot — and every family wants her dead or married.",
    genres: ['Mafia', 'Revenge'],
    year: 2026,
    rating: 'TV-MA',
    palette: ['#18181b', '#ca8a04'],
    emoji: '👑',
    episodeCount: 66,
  },
  {
    id: 'grandma-billionaire',
    title: 'Grandma Owns the Bank',
    tagline: "They kicked out the old lady. Big mistake.",
    synopsis:
      "Disowned by her greedy children, a quiet grandmother reveals the fortune she has been hiding for forty years.",
    genres: ['Family Secrets', 'Hidden Identity'],
    year: 2025,
    rating: 'TV-PG',
    palette: ['#3f2a14', '#d97706'],
    emoji: '👵',
    episodeCount: 50,
  },
  {
    id: 'moon-goddess',
    title: "The Moon Goddess's Daughter",
    tagline: 'The weakest wolf in the pack was never weak.',
    synopsis:
      'On her eighteenth birthday, the pack omega learns she is the last descendant of the Moon Goddess — and the hunters have found her.',
    genres: ['Werewolf & Fantasy'],
    year: 2026,
    rating: 'TV-14',
    palette: ['#1e1b4b', '#c4b5fd'],
    emoji: '🌕',
    isNew: true,
    episodeCount: 85,
  },
  {
    id: 'bodyguard-boss',
    title: 'My Bodyguard Is a Billionaire',
    tagline: 'She hired him to protect her. He bought her company.',
    synopsis:
      "A pop star's new bodyguard is suspiciously good at everything — because he is the tech mogul who owns her record label.",
    genres: ['Billionaire Romance', 'Hidden Identity'],
    year: 2026,
    rating: 'TV-14',
    palette: ['#0c4a6e', '#22d3ee'],
    emoji: '🕶️',
    episodeCount: 62,
  },
]

export const SEED_SERIES: SeedSeries[] = SEEDS.map(({ episodeCount, ...seed }) => ({
  ...seed,
  episodes: makeEpisodes(episodeCount),
}))
