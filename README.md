# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## OpenAI Worker Setup

This project sends chat requests to a Cloudflare Worker instead of calling OpenAI from the browser.

1. Open the Cloudflare dashboard and create a new Worker.
2. Paste the code from [worker.js](worker.js) into the Worker editor.
3. Add `OPENAI_API_KEY` in the Worker settings as a secret.
4. Deploy the Worker and copy the Worker URL into [config.js](config.js).
