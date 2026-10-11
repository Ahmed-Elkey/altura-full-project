import * as Joi from 'joi';

const requiredFor = (mode: 'stripe' | 'paymob', schema: Joi.Schema) =>
  schema.when('PAYMENT_MODE', {
    is: mode,
    then: schema.required(),
    otherwise: schema.allow('').optional(),
  });

const rejectKnownPlaceholder = (value: string, helpers: Joi.CustomHelpers) => {
  const normalized = value.trim().toLowerCase();
  const placeholder =
    normalized.includes('change-this') ||
    normalized.includes('replace-this') ||
    normalized.includes('before-real-use') ||
    normalized.includes('your-secret') ||
    normalized.includes('example-secret');
  return placeholder ? helpers.error('any.invalid') : value;
};

const jwtSecret = Joi.string().min(32).required();
const productionJwtSecret = Joi.string().min(32).custom(rejectKnownPlaceholder).required();

const frontendOrigin = Joi.string()
  .custom((value: string, helpers: Joi.CustomHelpers) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!origins.length) {
      return helpers.error('any.invalid');
    }
    const singleOrigin = Joi.string().uri({ scheme: ['http', 'https'] });
    for (const origin of origins) {
      const { error } = singleOrigin.validate(origin);
      if (error) {
        return helpers.error('any.invalid');
      }
    }
    return value;
  })
  .default('http://127.0.0.1:3100');

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  HOST: Joi.string().hostname().default('127.0.0.1'),
  TRUST_PROXY: Joi.alternatives().try(
    Joi.boolean().valid(false),
    Joi.number().integer().min(0).max(10),
  ).default(false),
  RESEND_API_KEY: Joi.string().allow('').optional(),
  MAIL_PROVIDER: Joi.string().valid('resend', 'smtp').default('resend'),
  SMTP_HOST: Joi.string().hostname().allow('').optional(),
  SMTP_PORT: Joi.number().valid(465, 587).default(465),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),
  PASSWORD_RESET_FROM: Joi.string().allow('').optional(),
  PASSWORD_RESET_ORIGIN: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  SUPPORT_EMAIL_WORKER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SUPPORT_EMAIL_POLL_MS: Joi.number().integer().min(1000).max(60000).default(5000),
  SUPPORT_EMAIL_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  SUPPORT_ADMIN_EMAIL: Joi.string().email({ tlds: { allow: false } }).allow('').optional(),
  SUPPORT_ORIGIN: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),
  SUPPORT_ENCRYPTION_SECRET: Joi.string().min(32).optional(),
  RATE_LIMIT_SUPPORT_READ_LIMIT: Joi.number().integer().min(1).max(1000).default(180),
  RATE_LIMIT_SUPPORT_READ_WINDOW_MS: Joi.number().integer().min(1000).max(86400000).default(900000),
  RATE_LIMIT_SUPPORT_CREATE_LIMIT: Joi.number().integer().min(1).max(1000).default(5),
  RATE_LIMIT_SUPPORT_CREATE_WINDOW_MS: Joi.number().integer().min(1000).max(86400000).default(900000),
  RATE_LIMIT_SUPPORT_ACCESS_LIMIT: Joi.number().integer().min(1).max(1000).default(20),
  RATE_LIMIT_SUPPORT_ACCESS_WINDOW_MS: Joi.number().integer().min(1000).max(86400000).default(900000),
  RATE_LIMIT_SUPPORT_REPLY_LIMIT: Joi.number().integer().min(1).max(1000).default(20),
  RATE_LIMIT_SUPPORT_REPLY_WINDOW_MS: Joi.number().integer().min(1000).max(86400000).default(900000),
  RATE_LIMIT_SUPPORT_RECOVER_LIMIT: Joi.number().integer().min(1).max(1000).default(5),
  RATE_LIMIT_SUPPORT_RECOVER_WINDOW_MS: Joi.number().integer().min(1000).max(86400000).default(900000),
  API_PREFIX: Joi.string().default('api/v1'),
  FRONTEND_ORIGIN: frontendOrigin,
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: jwtSecret.when('NODE_ENV', {
    is: 'production',
    then: productionJwtSecret,
  }),
  JWT_REFRESH_SECRET: jwtSecret.when('NODE_ENV', {
    is: 'production',
    then: productionJwtSecret,
  }),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  GUEST_SESSION_TTL: Joi.string().default('90d'),
  DEFAULT_CURRENCY: Joi.string().length(3).uppercase().default('EGP'),
  DEFAULT_COUNTRY: Joi.string().length(2).uppercase().default('EG'),
  FREE_SHIPPING_THRESHOLD: Joi.number().min(0).default(1500),
  DEFAULT_TAX_RATE: Joi.number().min(0).max(1).default(0),
  CHECKOUT_RESERVATION_TTL: Joi.string().default('30m'),
  STANDARD_SHIPPING_PRICE: Joi.number().min(0).default(12),
  EXPRESS_SHIPPING_PRICE: Joi.number().min(0).default(24),

  RATE_LIMIT_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  RATE_LIMIT_LOGIN_LIMIT: Joi.number().integer().min(1).max(1000).default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(300_000),
  RATE_LIMIT_REGISTER_LIMIT: Joi.number().integer().min(1).max(1000).default(3),
  RATE_LIMIT_REGISTER_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(3_600_000),
  RATE_LIMIT_REFRESH_LIMIT: Joi.number().integer().min(1).max(1000).default(20),
  RATE_LIMIT_REFRESH_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(600_000),
  RATE_LIMIT_GUEST_LOOKUP_LIMIT: Joi.number().integer().min(1).max(1000).default(5),
  RATE_LIMIT_GUEST_LOOKUP_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(300_000),
  RATE_LIMIT_PAYMENT_INIT_LIMIT: Joi.number().integer().min(1).max(1000).default(20),
  RATE_LIMIT_PAYMENT_INIT_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(600_000),
  RATE_LIMIT_MOCK_COMPLETE_LIMIT: Joi.number().integer().min(1).max(1000).default(10),
  RATE_LIMIT_MOCK_COMPLETE_WINDOW_MS: Joi.number().integer().min(1000).max(86_400_000).default(600_000),

  PAYMENT_MODE: Joi.string().valid('mock', 'stripe', 'paymob').default('mock'),

  STRIPE_SECRET_KEY: requiredFor('stripe', Joi.string().min(16)),
  STRIPE_PUBLISHABLE_KEY: requiredFor('stripe', Joi.string().min(8)),
  STRIPE_WEBHOOK_SECRET: requiredFor('stripe', Joi.string().min(16)),

  PAYMOB_BASE_URL: Joi.string().uri().default('https://accept.paymob.com'),
  PAYMOB_SECRET_KEY: requiredFor('paymob', Joi.string().min(8)),
  PAYMOB_PUBLIC_KEY: requiredFor('paymob', Joi.string().min(8)),
  PAYMOB_HMAC_SECRET: requiredFor('paymob', Joi.string().min(16)),
  PAYMOB_PAYMENT_METHOD_IDS: requiredFor('paymob', Joi.string().pattern(/^\d+(,\s*\d+)*$/)),
  PAYMOB_NOTIFICATION_URL: requiredFor('paymob', Joi.string().uri()),
  PAYMOB_REDIRECTION_URL: requiredFor('paymob', Joi.string().uri()),

  STORAGE_MODE: Joi.string().valid('local', 'cloudinary', 's3').default('local'),
  // TLD checking is disabled so private local-development domains (e.g. the
  // teammate package's *.friend.local seed accounts) pass validation.
  // Address format is still enforced; production deployments use real domains.
  ADMIN_SEED_EMAIL: Joi.string().email({ tlds: { allow: false } }).allow('').optional(),
  ADMIN_SEED_PASSWORD: Joi.string().min(12).allow('').optional(),
  CUSTOMER_SEED_EMAIL: Joi.string().email({ tlds: { allow: false } }).allow('').optional(),
  CUSTOMER_SEED_PASSWORD: Joi.string().min(12).allow('').optional(),
  DEMO_LOGIN_ENABLED: Joi.boolean().default(false),
  DEMO_LOGIN_MODE: Joi.string().valid('local', 'hosted').default('local'),
});
