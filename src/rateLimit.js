import argon2 from "argon2";
import { SQL } from "bun";
import { Elysia } from "elysia";
import { jwtVerify, SignJWT } from "jose";

const secret = new TextEncoder().encode(Bun.randomUUIDv7());

const POW_QUERIES = 100;
const POW_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000;
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;
const CHALLENGES_COUNT = 30;

const ARGON2_MEMORY = Math.round(1.5 * 1024);
const ARGON2_TIME = 1;
const ARGON2_HASH_LENGTH = 16;

const db = SQL("sqlite://.data/ratelimit.sqlite");

(async () => {
	await db`
		CREATE TABLE IF NOT EXISTS pow_tokens (
			token TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			queries_remaining INTEGER NOT NULL
		)
	`;

	await db`CREATE INDEX IF NOT EXISTS idx_pow_tokens_expires ON pow_tokens(expires_at)`;

	await db`
		CREATE TABLE IF NOT EXISTS challenge_seeds (
			seed_id TEXT PRIMARY KEY,
			seed TEXT NOT NULL,
			prefix TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		)
	`;

	await db`CREATE INDEX IF NOT EXISTS idx_challenge_seeds_expires ON challenge_seeds(expires_at)`;
})();

export const signRedirect = async (url) => {
	return await new SignJWT({
		url,
	})
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime("20m")
		.sign(secret);
};

export const signPass = async (pass) => {
	return await new SignJWT({
		pass,
	})
		.setProtectedHeader({ alg: `HS256` })
		.setIssuedAt()
		.setExpirationTime("12h")
		.sign(secret);
};

export const validatePass = async (jwt) => {
	const { payload } = await jwtVerify(jwt, secret);
	return  payload.pass;
};

const cleanupOldTokens = async () => {
	const now = Date.now();
	await db`DELETE FROM pow_tokens WHERE expires_at < ${now}`;
	await db`DELETE FROM challenge_seeds WHERE expires_at < ${now}`;
};

setInterval(cleanupOldTokens, 5 * 60 * 1000);
await cleanupOldTokens();

const getValidToken = async (token) => {
	if (!token) return null;

	const now = Date.now();
	const result = await db`
		SELECT * FROM pow_tokens
		WHERE token = ${token}
		AND expires_at > ${now}
		AND queries_remaining > 0
	`;

	return result[0] || null;
};

const decrementToken = async (token) => {
	await db`
		UPDATE pow_tokens
		SET queries_remaining = queries_remaining - 1
		WHERE token = ${token}
	`;
};

const createChallengeSeed = async () => {
	const seedId = Bun.randomUUIDv7();
	const seed = Bun.randomUUIDv7();
	const prefix = crypto.getRandomValues(new Uint8Array(1))[0].toString(16)[0];

	const now = Date.now();
	const expiresAt = now + CHALLENGE_EXPIRY_MS;

	await db`
		INSERT INTO challenge_seeds (seed_id, seed, prefix, created_at, expires_at)
		VALUES (${seedId}, ${seed}, ${prefix}, ${now}, ${expiresAt})
	`;

	return { seedId, seed, prefix };
};

const verifySolution = async (seedId, solution) => {
	const now = Date.now();

	const result = await db`
		SELECT * FROM challenge_seeds
		WHERE seed_id = ${seedId}
		AND expires_at > ${now}
	`;

	const challenge = result[0];

	if (!challenge) {
		return { valid: false, error: "Challenge expired or invalid" };
	}

	for (let i = 0; i < solution.length; i++) {
		const nonce = solution[i];
		const input = `${challenge.seed}:${i}:${nonce}`;

		const saltInput = `${challenge.seed}:${i}`;
		const saltHash = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(saltInput),
		);
		const salt = new Uint8Array(saltHash).slice(0, 16);

		try {
			const hash = await argon2.hash(input, {
				type: argon2.argon2d,
				memoryCost: ARGON2_MEMORY,
				timeCost: ARGON2_TIME,
				parallelism: 1,
				hashLength: ARGON2_HASH_LENGTH,
				salt: Buffer.from(salt),
				raw: true,
			});

			const hashHex = Buffer.from(hash).toString("hex");

			if (!hashHex.startsWith(challenge.prefix)) {
				return { valid: false, error: `Invalid solution for challenge ${i}` };
			}
		} catch (error) {
			console.error("Argon2 verification error:", error);
			return { valid: false, error: "Verification failed" };
		}
	}

	await db`DELETE FROM challenge_seeds WHERE seed_id = ${seedId}`;

	const token = Bun.randomUUIDv7();
	const expiresAt = now + POW_EXPIRY_MS;

	await db`
		INSERT INTO pow_tokens (token, created_at, expires_at, queries_remaining)
		VALUES (${token}, ${now}, ${expiresAt}, ${POW_QUERIES})
	`;

	return { valid: true, token };
};

const checkRateLimit = async (powToken) => {
	const validToken = await getValidToken(powToken);

	if (validToken) {
		return {
			allowed: true,
			queriesRemaining: validToken.queries_remaining,
			expiresAt: validToken.expires_at,
		};
	}

	return { allowed: false };
};

export const recordAndCheck = async (powToken) => {
	const result = await checkRateLimit(powToken);

	if (result.allowed) {
		await decrementToken(powToken);
		result.queriesRemaining -= 1;
	}

	return result;
};

export const rateLimitElysia = new Elysia({ prefix: "/challenge" })
	.get("/", async ({ query, set, cookie, redirect }) => {
		const powToken = cookie?.galileo_pass?.value;

		const { payload } = await jwtVerify(query.redirect, secret);
		const qredirect = payload.url;

		const check = await checkRateLimit(powToken);
		if (check.allowed) {
			return redirect(qredirect || "/");
		}

		const challengeSeed = await createChallengeSeed();

		const html = await Bun.file("./public/challenge.html").text();
		const injectedHtml = html
			.replaceAll("%%seedId%%", challengeSeed.seedId)
			.replaceAll("%%seed%%", challengeSeed.seed)
			.replace("%%prefix%%", challengeSeed.prefix)
			.replaceAll("__jobs__", CHALLENGES_COUNT.toString())
			.replace("__mem__", ARGON2_MEMORY.toString())
			.replace("__time__", ARGON2_TIME.toString())
			.replaceAll("__hashLen__", ARGON2_HASH_LENGTH.toString())
			.replace("%%redirect%%", qredirect || "/");

		set.headers["content-type"] = "text/html";
		return injectedHtml;
	})
	.post("/", async ({ body, headers, set, cookie }) => {
		if (headers["x-galileo-csrf"] !== "1") {
			set.status = 400;
			return { error: "CSRF header missing" };
		}

		const [seedId, solution, doCookie] = body;

		if (
			!seedId ||
			!Array.isArray(solution) ||
			solution.length !== CHALLENGES_COUNT
		) {
			set.status = 400;
			return { error: `expected seedId and ${CHALLENGES_COUNT} solutions` };
		}

		const result = await verifySolution(seedId, solution);

		if (!result.valid) {
			set.status = 400;
			return { error: result.error };
		}

    if (doCookie) {
      cookie.galileo_pass.set({
			  value: result.token,
			  maxAge: POW_EXPIRY_MS / 1000,
			  path: "/",
			  httpOnly: true,
			  sameSite: "lax",
      });
      return { success: true };
    }

		return { success: true, pass: await signPass(result.token) };
	});
