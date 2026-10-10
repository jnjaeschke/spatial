import { useContext } from "react";
import { type HostedThread, ChatActionsContext, ClosedContext, Box, Conversation, closeChat } from "../../../../web/plugin-api.ts";

/** A chat thread hosted inside a node. */
export function HostedThreadBox({ thread }: { thread: HostedThread }) {
  const actions = useContext(ChatActionsContext);
  const closer = useContext(ClosedContext);
  const id = thread.threadId ?? thread.draftId!;
  const lastMessage = thread.messages.at(-1)?.data.text ?? "";
  return <Box kind="chat" nested className="hosted-chat" data={{ "data-thread-boundary": "" }} testId={`chat-${id}`} title={`Chat · ${thread.messages.length}`} collapse={thread.threadId ? { key: thread.threadId } : undefined} stub={<div className="thread-stub">{lastMessage.slice(0, 100)}</div>} onClose={closer ? () => closeChat(thread.threadId, thread.draftId, actions, closer) : undefined}>
    {thread.quote && <blockquote className="chat-quote">{thread.quote.length > 300 ? `${thread.quote.slice(0, 300)}…` : thread.quote}</blockquote>}<Conversation {...thread} />
  </Box>;
}
