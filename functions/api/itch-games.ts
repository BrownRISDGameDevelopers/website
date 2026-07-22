interface Env {
	ITCH_API_KEY?: string;
}

interface PagesContext {
	request: Request;
	env: Env;
	waitUntil(promise: Promise<unknown>): void;
}

interface ItchApiGame {
	id: number;
	title: string;
	url: string;
	cover_url?: string;
	created_at?: string;
	published?: boolean;
	published_at?: string;
	views_count?: number;
	user?: {
		username?: string;
	};
}

interface ItchApiResponse {
	games?: ItchApiGame[];
	errors?: string[];
}

interface MarqueeGame {
	title: string;
	image: string;
	imageAlt: string;
	season: string;
	href: string;
}

const ITCH_GAMES_URL = 'https://itch.io/api/1/key/my-games';
const FALLBACK_IMAGE = '/assets/pickleball-violence.png';
const ITCH_COVER_PROXY = '/api/itch-cover';
const CACHE_TTL_SECONDS = 60 * 60;
const CACHE_VERSION = 'cover-proxy-v8';
const MINIMUM_VIEWS_COUNT = 100;
const ALLOWED_ITCH_USERNAMES = new Set(['brownrisdgames', 'brgd']);
const cloudflareCaches = caches as CacheStorage & { default: Cache };

const parseItchTimestamp = (value?: string) => {
	if (!value) {
		return null;
	}

	const match = value.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
	);

	if (!match) {
		return null;
	}

	const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] =
		match;

	return {
		year: Number(year),
		month: Number(month),
		sortKey: Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hours),
			Number(minutes),
			Number(seconds),
		),
	};
};

const getGameTimestamp = (game: ItchApiGame) =>
	parseItchTimestamp(game.created_at) ??
	parseItchTimestamp(game.published_at);

const isPublishedGame = (game: ItchApiGame) =>
	game.published === true &&
	typeof game.url === 'string' &&
	game.url.length > 0 &&
	ALLOWED_ITCH_USERNAMES.has(game.user?.username?.toLowerCase() ?? '') &&
	typeof game.views_count === 'number' &&
	game.views_count > MINIMUM_VIEWS_COUNT &&
	parseItchTimestamp(game.published_at) !== null;

const formatAcademicSeason = (game: ItchApiGame) => {
	const parsedTimestamp = getGameTimestamp(game);

	if (!parsedTimestamp) {
		return 'ITCH.IO';
	}

	if (parsedTimestamp.month >= 3 && parsedTimestamp.month <= 8) {
		return `SPRING ${parsedTimestamp.year}`;
	}

	const fallYear =
		parsedTimestamp.month >= 9
			? parsedTimestamp.year
			: parsedTimestamp.year - 1;

	return `FALL ${fallYear}`;
};

const normalizeGame = (game: ItchApiGame): MarqueeGame => ({
	title: game.title,
	image: game.cover_url
		? `${ITCH_COVER_PROXY}?url=${encodeURIComponent(game.cover_url)}`
		: FALLBACK_IMAGE,
	imageAlt: `${game.title} cover art`,
	season: formatAcademicSeason(game),
	href: game.url,
});

export const onRequestGet = async ({
	request,
	env,
	waitUntil,
}: PagesContext) => {
	if (!env.ITCH_API_KEY) {
		return Response.json(
			{ error: 'ITCH_API_KEY is not configured' },
			{ status: 500 },
		);
	}

	const requestUrl = new URL(request.url);
	const shouldRefresh = requestUrl.searchParams.get('refresh') === '1';
	requestUrl.searchParams.delete('refresh');
	requestUrl.searchParams.set('cache_version', CACHE_VERSION);

	const cacheKey = new Request(requestUrl.toString(), { method: 'GET' });
	const cachedResponse = shouldRefresh
		? undefined
		: await cloudflareCaches.default.match(cacheKey);

	if (cachedResponse) {
		return cachedResponse;
	}

	const itchResponse = await fetch(ITCH_GAMES_URL, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${env.ITCH_API_KEY}`,
		},
	});

	if (!itchResponse.ok) {
		return Response.json(
			{ error: 'Failed to fetch games from itch.io' },
			{ status: 502 },
		);
	}

	const data = (await itchResponse.json()) as ItchApiResponse;

	if (Array.isArray(data.errors) && data.errors.length > 0) {
		return Response.json(
			{ error: 'itch.io returned an error', details: data.errors },
			{ status: 502 },
		);
	}

	const games = (data.games ?? [])
		.filter(isPublishedGame)
		.sort((left, right) => {
			const leftTime = getGameTimestamp(left)?.sortKey ?? 0;
			const rightTime = getGameTimestamp(right)?.sortKey ?? 0;
			return rightTime - leftTime;
		})
		.map(normalizeGame);

	const response = Response.json(
		{
			cachedAt: new Date().toISOString(),
			games,
		},
		{
			headers: {
				'Cache-Control': `public, max-age=0, must-revalidate, s-maxage=${CACHE_TTL_SECONDS}`,
				'X-Itch-Cache-Version': CACHE_VERSION,
			},
		},
	);

	waitUntil(cloudflareCaches.default.put(cacheKey, response.clone()));
	return response;
};
