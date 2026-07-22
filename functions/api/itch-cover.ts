interface PagesContext {
	request: Request;
	waitUntil(promise: Promise<unknown>): void;
}

const FALLBACK_IMAGE = '/assets/pickleball-violence.png';
const BROWSER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const EDGE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALLOWED_IMAGE_HOSTS = new Set(['img.itch.zone']);
const cloudflareCaches = caches as CacheStorage & { default: Cache };

const getItchImageUrl = (requestUrl: URL) => {
	const value = requestUrl.searchParams.get('url');

	if (!value) {
		return null;
	}

	try {
		const imageUrl = new URL(value);

		if (
			imageUrl.protocol !== 'https:' ||
			!ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname)
		) {
			return null;
		}

		return imageUrl;
	} catch {
		return null;
	}
};

export const onRequestGet = async ({ request, waitUntil }: PagesContext) => {
	const requestUrl = new URL(request.url);
	const imageUrl = getItchImageUrl(requestUrl);

	if (!imageUrl) {
		return Response.json(
			{ error: 'A valid itch.io cover URL is required' },
			{ status: 400 },
		);
	}

	const canonicalCacheUrl = new URL('/api/itch-cover', requestUrl.origin);
	canonicalCacheUrl.searchParams.set('url', imageUrl.toString());
	const cacheKey = new Request(canonicalCacheUrl, { method: 'GET' });
	const cachedResponse = await cloudflareCaches.default.match(cacheKey);

	if (cachedResponse) {
		return cachedResponse;
	}

	const itchResponse = await fetch(imageUrl, {
		headers: { Accept: 'image/*' },
	});
	const contentType = itchResponse.headers.get('Content-Type') ?? '';

	if (!itchResponse.ok || !contentType.startsWith('image/')) {
		return Response.redirect(new URL(FALLBACK_IMAGE, requestUrl), 302);
	}

	const headers = new Headers({
		'Cache-Control': `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${EDGE_CACHE_TTL_SECONDS}, immutable`,
		'Content-Type': contentType,
		'X-Content-Type-Options': 'nosniff',
	});

	for (const header of ['ETag', 'Last-Modified']) {
		const value = itchResponse.headers.get(header);

		if (value) {
			headers.set(header, value);
		}
	}

	const response = new Response(itchResponse.body, {
		status: 200,
		headers,
	});

	waitUntil(cloudflareCaches.default.put(cacheKey, response.clone()));
	return response;
};
