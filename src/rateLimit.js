import { SQL } from "bun";
import { Elysia } from "elysia";
import { jwtVerify, SignJWT } from "jose";
import cap from "./cap.js";

const secret = new TextEncoder().encode(Bun.randomUUIDv7());

const CHALLENGES_DISABLED = process.env.DISABLE_CHALLENGES === "true";

const POW_QUERIES = 100;
const POW_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000;

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

const cleanupOldTokens = async () => {
  const now = Date.now();
  await db`DELETE FROM pow_tokens WHERE expires_at < ${now}`;
};

setInterval(cleanupOldTokens, 5 * 60 * 1000);
setTimeout(cleanupOldTokens, 1000);

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

const issuePassToken = async () => {
  const now = Date.now();
  const token = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(15))),
  );
  const tokenExpiresAt = now + POW_EXPIRY_MS;

  await db`
		INSERT INTO pow_tokens (token, created_at, expires_at, queries_remaining)
		VALUES (${token}, ${now}, ${tokenExpiresAt}, ${POW_QUERIES})
	`;

  return token;
};

const checkRateLimit = async (powToken) => {
  if (CHALLENGES_DISABLED) {
    return { allowed: true, queriesRemaining: Infinity, expiresAt: Infinity };
  }

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
  if (CHALLENGES_DISABLED) {
    return { allowed: true, queriesRemaining: Infinity, expiresAt: Infinity };
  }

  const result = await checkRateLimit(powToken);

  if (result.allowed) {
    await decrementToken(powToken);
    result.queriesRemaining -= 1;
  }

  return result;
};

export const rateLimitElysia = new Elysia({ prefix: "/c" })
  .post("/cap/challenge", async () => {
    return await cap.createChallenge();
  })
  .post("/cap/redeem", async ({ body, set }) => {
    const { token, solutions } = body;
    if (!token || !solutions) {
      set.status = 400;
      return { success: false };
    }
    return await cap.redeemChallenge({ token, solutions });
  })
  .get("/:redirect", async ({ params, set, cookie, redirect }) => {
    const powToken = cookie?.galileo_pass?.value;

    const { payload } = await jwtVerify(params.redirect, secret);
    const qredirect = payload.url;

    const check = await checkRateLimit(powToken);
    if (check.allowed) {
      return redirect(qredirect || "/");
    }

    const html = await Bun.file("./public/challenge.html").text();
    const injectedHtml = html.replace("%%redirect%%", qredirect || "/");

    set.headers["content-type"] = "text/html";
    return injectedHtml;
  })
  .post("/:redirect", async ({ body, headers, set, cookie, params }) => {
    if (headers["x-galileo-csrf"] !== "1") {
      set.status = 400;
      return { error: "CSRF header missing" };
    }

    const { capToken, doCookie } = body;

    if (!capToken) {
      set.status = 400;
      return { error: "Cap token is required" };
    }

    const { success } = await cap.validateToken(capToken);

    if (!success) {
      set.status = 400;
      return { error: "Invalid cap token" };
    }

    const token = await issuePassToken();

    if (doCookie) {
      cookie.galileo_pass.set({
        value: token,
        maxAge: POW_EXPIRY_MS / 1000,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
      return { success: true };
    }

    return { success: true, pass: token };
  });
