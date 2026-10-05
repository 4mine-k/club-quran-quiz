// google.js — verify Google Identity Services ID tokens (pure Node, no packages).
// Fetches Google's public JWKS and verifies the RS256 JWT signature + claims.

const https = require("https");
const crypto = require("crypto");

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let cachedKeys = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1 hour

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function getKeys() {
  if (cachedKeys && Date.now() - cachedAt < CACHE_MS) return cachedKeys;
  const jwks = await fetchJson(JWKS_URL);
  cachedKeys = {};
  for (const k of jwks.keys) cachedKeys[k.kid] = k;
  cachedAt = Date.now();
  return cachedKeys;
}

function b64urlToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function jwkToPem(jwk) {
  // Build a public key from the JWK (n, e) using Node's KeyObject
  const keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return keyObject;
}

// Verify an ID token. Returns the payload { sub, email, name, ... } if valid.
async function verifyIdToken(idToken, clientId) {
  const parts = String(idToken).split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlToBuf(headerB64).toString("utf8"));
  const payload = JSON.parse(b64urlToBuf(payloadB64).toString("utf8"));

  if (header.alg !== "RS256") throw new Error("unexpected alg");

  const keys = await getKeys();
  const jwk = keys[header.kid];
  if (!jwk) throw new Error("signing key not found");

  const pubKey = jwkToPem(jwk);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(headerB64 + "." + payloadB64);
  verifier.end();
  const ok = verifier.verify(pubKey, b64urlToBuf(sigB64));
  if (!ok) throw new Error("invalid signature");

  // Validate claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error("token expired");
  const validIss = ["accounts.google.com", "https://accounts.google.com"];
  if (!validIss.includes(payload.iss)) throw new Error("bad issuer");
  if (clientId && payload.aud !== clientId) throw new Error("bad audience");

  return payload;
}

module.exports = { verifyIdToken };
