import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});

export const subtitleQueue = new Queue('subtitle-jobs', { connection });
export { connection };
