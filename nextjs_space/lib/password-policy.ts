import { randomInt } from "crypto";

/**
 * Password rules for every place a password is set (account page, account scripts).
 * Length beats composition (NIST SP 800-63B), so the bar is mainly 12+ characters;
 * the upper bound exists because bcrypt ignores everything past 72 bytes.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

/** Returns a user-facing (Polish) reason, or null when the password is acceptable. */
export function passwordProblem(password: string, login: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return "Hasło jest za długie (maks. 72 bajty — ok. 70 znaków bez polskich liter).";
  }
  if (!/\p{L}/u.test(password) || !/[^\p{L}]/u.test(password)) {
    return "Hasło musi zawierać litery oraz co najmniej jedną cyfrę lub znak specjalny.";
  }
  if (/^(.)\1+$/u.test(password)) {
    return "Hasło nie może składać się z jednego powtórzonego znaku.";
  }
  if (login && password.toLowerCase().includes(login.toLowerCase())) {
    return "Hasło nie może zawierać loginu.";
  }
  return null;
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";

/**
 * Random initial password, e.g. `djisjadosjo123@!`-style but uniformly random.
 * Look-alike characters (l/1, O/0) are left out because these get read aloud or retyped.
 */
export function generatePassword(length = 16): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates with a CSPRNG, so the guaranteed classes are not always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
