import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { asyncHandler } from '../../common/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './auth.controller';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas';

/** 20 requests per 15 minutes per IP on register/login. Disabled under Jest. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } });
  },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(controller.register));
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
authRouter.get('/me', authenticate, asyncHandler(controller.me));
authRouter.patch('/me/password', validate({ body: changePasswordSchema }), authenticate, asyncHandler(controller.changePassword));
