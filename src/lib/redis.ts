// src/lib/redis.ts
// Upstash Redis 클라이언트 — Vercel 연결 시 자동 주입되는 환경변수 사용(네이밍 2종 모두 지원).
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redisReady = Boolean(url && token);

export const redis = redisReady
  ? new Redis({ url: url as string, token: token as string })
  : null;
