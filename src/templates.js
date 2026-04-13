import { env } from "cloudflare:workers";

let cssCache,
	webCache,
	webJsCache,
	imagesCache,
	imagesJsCache,
	newsCache,
	newsJsCache,
	mapsCache,
	mapsJsCache;

async function readAsset(path) {
	let resp = await env.ASSETS.fetch(
		new Request(`https://assets${path}`),
	);
	if (resp.status >= 300 && resp.status < 400) {
		const location = resp.headers.get("location");
		if (location) {
			resp = await env.ASSETS.fetch(
				new Request(new URL(location, `https://assets${path}`)),
			);
		}
	}
	return resp.text();
}

export const css = async () => {
	if (cssCache) return cssCache;
	cssCache = await readAsset("/search.css");
	return cssCache;
};

export const web = async () => {
	if (webCache) return webCache;
	webCache = (await readAsset("/web/index.html")).replace(
		"/**css**/",
		await css(),
	);
	return webCache;
};

export const webJs = async () => {
	if (webJsCache) return webJsCache;
	webJsCache = await readAsset("/web/index.js");
	return webJsCache;
};

export const images = async () => {
	if (imagesCache) return imagesCache;
	imagesCache = (await readAsset("/images/index.html")).replace(
		"/**css**/",
		await css(),
	);
	return imagesCache;
};

export const imagesJs = async () => {
	if (imagesJsCache) return imagesJsCache;
	imagesJsCache = await readAsset("/images/index.js");
	return imagesJsCache;
};

export const news = async () => {
	if (newsCache) return newsCache;
	newsCache = (await readAsset("/news/index.html")).replace(
		"/**css**/",
		await css(),
	);
	return newsCache;
};

export const newsJs = async () => {
	if (newsJsCache) return newsJsCache;
	newsJsCache = await readAsset("/news/index.js");
	return newsJsCache;
};

export const maps = async () => {
	if (mapsCache) return mapsCache;
	mapsCache = (await readAsset("/maps/index.html")).replace(
		"/**css**/",
		await css(),
	);
	return mapsCache;
};

export const mapsJs = async () => {
	if (mapsJsCache) return mapsJsCache;
	mapsJsCache = await readAsset("/maps/index.js");
	return mapsJsCache;
};
