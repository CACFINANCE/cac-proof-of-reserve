require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN,
  tls: {},
});

async function testRedis() {
  try {
    const testKey = 'test_key';
    const testValue = `hello at ${new Date().toISOString()}`;

    // Write test key
    await redis.set(testKey, testValue, 'EX', 30);
    console.log(`Set key '${testKey}' with value:`, testValue);

    // Read test key
    const value = await redis.get(testKey);
    console.log(`Got key '${testKey}' with value:`, value);

    if (value === testValue) {
      console.log('✅ Redis connectivity test successful');
    } else {
      console.log('❌ Redis value mismatch');
    }

    await redis.quit();
  } catch (err) {
    console.error('Redis test error:', err);
  }
}

testRedis();
