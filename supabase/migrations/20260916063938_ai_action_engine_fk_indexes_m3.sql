create index if not exists ai_action_proposals_conversation_idx
  on public.ai_action_proposals(conversation_id);

create index if not exists ai_action_proposals_dispatched_task_idx
  on public.ai_action_proposals(dispatched_task_id);
