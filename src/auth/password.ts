import bcrypt from "bcryptjs";

// 12 rounds ≈ 200–300 ms per hash: slow for attackers, fine for logins.
const ROUNDS = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
