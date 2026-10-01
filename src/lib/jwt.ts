import jwt from "jsonwebtoken";

// Wajib: JWT_SECRET harus di-set di environment variables
if (!process.env.JWT_SECRET) {
  throw new Error(
    "FATAL: Environment variable JWT_SECRET tidak di-set! " +
    "Harap tambahkan JWT_SECRET ke file .env Anda sebelum menjalankan aplikasi."
  );
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export interface JwtPayload {
  userId: string;
  /**
   * Organisasi pemilik akun. Token tanpa field ini (format sebelum
   * multi-tenant) dianggap tidak valid oleh middleware — pengguna login ulang.
   */
  organizationId: string;
  username: string;
  role: string;
  name: string;
}

/**
 * Sign a JWT token with user payload
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verify and decode a JWT token
 * Returns null if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
