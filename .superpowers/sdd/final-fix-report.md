# Final Fix Report

- Added a ReplyDesk “+ New chat” control that prompts for a customer name, creates a thread for the active bot, refreshes the conversation list, and opens the new conversation.
- Added the frontend `createThread` API client and coverage for its request contract.
- Replaced silent FAISS rebuild failures with a warning that includes the bot ID and exception; blank customer names now receive validation errors.
- Verified: backend `.venv/bin/pytest -q` (28 passed); frontend `npx vitest run` (7 passed); `npm run build` completed successfully.
