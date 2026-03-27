import bangs from "./bangs-data.json";

export default function checkBang(string) {
	if (!string.includes("!")) return;

	const bang = Object.keys(bangs).find((b) =>
		string.split(" ").includes(`!${b.toLowerCase()}`),
	);
	if (bang) {
		return bangs[bang].replaceAll(
			"%s",
			encodeURIComponent(
				string.replace(`!${bang.toLowerCase()}`, "").trim(),
			),
		);
	}
}
