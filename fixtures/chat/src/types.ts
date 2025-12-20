export type ChatMessage = {
  type: "chat-message";
  id: string;
  content: string;
  sender: string;
};
