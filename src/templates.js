import { transform } from "lightningcss";
import { minify } from "terser";

let cssTemplate,
	searchTemplate,
	searchJavaScript,
	imagesTemplate,
	imagesJavaScript,
	newsTemplate,
	newsJavaScript;

export const css = async () => {
	if (process.env.NODE_END !== "development" && cssTemplate) return cssTemplate;

	const css = transform({
		filename: "style.css",
		code: Buffer.from(await Bun.file("./public/search.css").text()),
		minify: true,
		sourceMap: false,
	}).code;

	cssTemplate = css.toString();
	return cssTemplate;
};

export const web = async () => {
	if (process.env.NODE_END !== "development" && searchTemplate)
		return searchTemplate;

	const code = (await Bun.file("./public/web/index.html").text()).replace(
		"/**css**/",
		await css(),
	);

	searchTemplate = code;
	return code;
};

export const webJs = async () => {
	if (process.env.NODE_END !== "development" && searchJavaScript)
		return searchJavaScript;

	const { code } = await minify(
		await Bun.file("./public/web/index.js").text(),
		{ sourceMap: false, mangle: true },
	);

	searchJavaScript = code;
	return code;
};

export const images = async () => {
	if (process.env.NODE_END !== "development" && imagesTemplate)
		return imagesTemplate;

	const code = (await Bun.file("./public/images/index.html").text()).replace(
		"/**css**/",
		await css(),
	);

	imagesTemplate = code;
	return code;
};

export const imagesJs = async () => {
	if (process.env.NODE_END !== "development" && imagesJavaScript)
		return imagesJavaScript;

	const { code } = await minify(
		await Bun.file("./public/images/index.js").text(),
		{ sourceMap: false, mangle: true },
	);

	imagesJavaScript = code;
	return code;
};

export const news = async () => {
	if (process.env.NODE_END !== "development" && newsTemplate)
		return newsTemplate;

	const code = (await Bun.file("./public/news/index.html").text()).replace(
		"/**css**/",
		await css(),
	);

	newsTemplate = code;
	return code;
};

export const newsJs = async () => {
	if (process.env.NODE_END !== "development" && newsJavaScript)
		return newsJavaScript;

	const { code } = await minify(
		await Bun.file("./public/news/index.js").text(),
		{ sourceMap: false, mangle: true },
	);

	newsJavaScript = code;
	return code;
};
