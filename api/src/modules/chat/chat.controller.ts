import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendSuccess } from "../../utils/response";
import { getChatById, updateChat, deleteChat, addMessage, getMessages } from "./chat.service";

export const getChatController = catchAsync(async (req: Request, res: Response) => {
  // req.user is guaranteed by authHandler
  const chat = await getChatById(req.params.id, req.user!.id);
  sendSuccess(res, { chat });
});

export const updateChatController = catchAsync(async (req: Request, res: Response) => {
  const chat = await updateChat(req.params.id, req.user!.id, req.body);
  sendSuccess(res, { chat });
});

export const deleteChatController = catchAsync(async (req: Request, res: Response) => {
  await deleteChat(req.params.id, req.user!.id);
  sendSuccess(res, { message: "Chat deleted" });
});

export const addMessageController = catchAsync(async (req: Request, res: Response) => {
  const message = await addMessage(
    req.params.id,
    req.user!.id,
    req.body.content,
    req.body.role,
    {
      model: req.body.model,
      provider: req.body.provider,
      apiKey: req.body.apiKey,
      includeIllustrations: req.body.includeIllustrations,
    }
  );
  sendSuccess(res, { message }, 201);
});

export const getMessagesController = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const { messages, total } = await getMessages(req.params.id, req.user!.id, page, limit);
  
  sendSuccess(res, { messages }, 200, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export const addWorkerMessageController = catchAsync(async (req: Request, res: Response) => {
  const message = await addMessage(req.params.id, null, req.body.content, req.body.role);
  sendSuccess(res, { message }, 201);
});
