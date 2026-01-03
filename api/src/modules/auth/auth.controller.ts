import { Request, Response } from "express";
import { sendSuccess } from "../../utils/response";
import {
  login as loginService,
  refreshAccessToken as refreshAccessTokenService,
  logout as logoutService,
  forgotPassword as forgotPasswordService,
  resetPassword as resetPasswordService,
} from "./auth.service";
import {
  generateAccessToken,
  generateRefreshToken,
  deleteAllRefreshTokensForUser,
  addRefreshTokenToDb,
} from "./token.utils";
import { catchAsync } from "../../utils/catchAsync";
import AppError from "../../utils/AppError";

export const oauthCallback = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user) {
    throw new AppError(401, "Authentication failed");
  }

  await deleteAllRefreshTokensForUser(user.id);

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await addRefreshTokenToDb(user.id, refreshToken);

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });

  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  res.redirect(`${clientUrl}/login?token=${accessToken}&userId=${user.id}`);
});

export const loginController = catchAsync(async (req: Request, res: Response) => {
  const user = await loginService(req.body);

  await deleteAllRefreshTokensForUser(user.id);

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  await addRefreshTokenToDb(user.id, refreshToken);

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });

  sendSuccess(res, { user, accessToken });
});

export const refreshTokenController = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refresh_token;
  const accessToken = await refreshAccessTokenService(refreshToken);
  sendSuccess(res, { accessToken });
});

export const logoutController = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refresh_token;
  
  if (!refreshToken) {
    throw new AppError(400, "Refresh token not found");
  }

  await logoutService(refreshToken);
  res.clearCookie("refresh_token", { path: "/api/auth" });
  sendSuccess(res, { message: "Logged out successfully" });
});

export const forgotPasswordController = catchAsync(async (req: Request, res: Response) => {
  await forgotPasswordService(req.body.email);
  sendSuccess(res, { message: "Password reset email sent" });
});

export const resetPasswordController = catchAsync(async (req: Request, res: Response) => {
  const { token, password } = req.body;
  await resetPasswordService(token, password);
  sendSuccess(res, { message: "Password reset successfully" });
});
