import { createHmac } from 'node:crypto';
const [,, role, sub, email] = process.argv;
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const p = { role, aud: 'authenticated', iat: now, exp: now + 3600 * 8, ...(sub ? { sub, email } : {}) };
const data = `${b({ alg: 'HS256', typ: 'JWT' })}.${b(p)}`;
console.log(`${data}.${createHmac('sha256', process.env.JWT_SECRET).update(data).digest('base64url')}`);
