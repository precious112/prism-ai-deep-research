import { Router } from "express";
import passport from "passport";
import {
  loginController,
  oauthCallback,
  refreshTokenController,
  logoutController,
  forgotPasswordController,
  resetPasswordController,
} from "./auth.controller";
import { validate } from "../../middleware/validate";
import { loginSchema } from "./auth.validation";

const router = Router();

// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  oauthCallback
);

// GitHub OAuth
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);
router.get(
  "/github/callback",
  passport.authenticate("github", { session: false }),
  oauthCallback
);

router.post("/login", validate(loginSchema), loginController);
router.post("/refresh", refreshTokenController);
router.post("/logout", logoutController);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);

export { router as authRouter };
